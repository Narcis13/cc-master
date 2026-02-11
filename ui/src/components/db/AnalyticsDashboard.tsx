import { h } from "preact";
import { useState, useEffect } from "preact/hooks";

// --- Types ---
interface DailyMetric {
  date: string;
  jobs_started: number;
  jobs_completed: number;
  jobs_failed: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_elapsed_ms: number;
  files_modified_count: number;
}

interface AnalyticsData {
  headline: {
    jobs_started: number;
    jobs_completed: number;
    jobs_failed: number;
    total_cost: number;
    total_tokens: number;
  };
  daily: DailyMetric[];
  by_model: { model: string; reasoning: string; count: number; cost: number }[];
  by_cwd: { cwd: string; count: number }[];
  avg_duration_by_day: { date: string; avg_ms: number }[];
  success_rate_by_day: { date: string; rate: number }[];
}

// --- Colors ---
const COLORS = {
  completed: "#3fb950",
  failed: "#f85149",
  started: "#8b949e",
  inputTokens: "#79c0ff",
  outputTokens: "#d2a8ff",
  cost: "#58a6ff",
  grid: "#30363d",
  text: "#8b949e",
  textPrimary: "#e6edf3",
};

// --- Formatting helpers ---
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function fmtCost(n: number): string {
  return "$" + n.toFixed(2);
}

function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return mins + "m";
  return Math.floor(mins / 60) + "h " + (mins % 60) + "m";
}

function fmtDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// --- Shared SVG helpers ---
const CHART_H = 200;
const CHART_PAD = { top: 20, right: 16, bottom: 30, left: 50 };

function chartW(containerW: number): number {
  return Math.max(containerW, 300);
}

function gridLines(
  yMin: number,
  yMax: number,
  w: number,
  steps: number = 4
): h.JSX.Element[] {
  const els: h.JSX.Element[] = [];
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const innerW = w - CHART_PAD.left - CHART_PAD.right;
  for (let i = 0; i <= steps; i++) {
    const y = CHART_PAD.top + (innerH / steps) * i;
    const val = yMax - ((yMax - yMin) / steps) * i;
    els.push(
      <line
        key={"gl" + i}
        x1={CHART_PAD.left}
        y1={y}
        x2={CHART_PAD.left + innerW}
        y2={y}
        stroke={COLORS.grid}
        stroke-width="1"
      />
    );
    els.push(
      <text
        key={"gt" + i}
        x={CHART_PAD.left - 6}
        y={y + 4}
        fill={COLORS.text}
        font-size="10"
        text-anchor="end"
        font-family="'SF Mono', 'Fira Code', monospace"
      >
        {typeof val === "number" && val >= 1000 ? fmtNum(val) : Math.round(val)}
      </text>
    );
  }
  return els;
}

function xLabels(
  dates: string[],
  w: number,
  maxLabels: number = 7
): h.JSX.Element[] {
  const els: h.JSX.Element[] = [];
  const innerW = w - CHART_PAD.left - CHART_PAD.right;
  const step = Math.max(1, Math.ceil(dates.length / maxLabels));
  dates.forEach((d, i) => {
    if (i % step !== 0 && i !== dates.length - 1) return;
    const x = CHART_PAD.left + (innerW / Math.max(dates.length - 1, 1)) * i;
    els.push(
      <text
        key={"xl" + i}
        x={x}
        y={CHART_H - 4}
        fill={COLORS.text}
        font-size="10"
        text-anchor="middle"
        font-family="'SF Mono', 'Fira Code', monospace"
      >
        {fmtDateLabel(d)}
      </text>
    );
  });
  return els;
}

function scaleY(
  val: number,
  min: number,
  max: number
): number {
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  if (max === min) return CHART_PAD.top + innerH / 2;
  return CHART_PAD.top + innerH * (1 - (val - min) / (max - min));
}

function scaleX(
  i: number,
  total: number,
  w: number
): number {
  const innerW = w - CHART_PAD.left - CHART_PAD.right;
  return CHART_PAD.left + (innerW / Math.max(total - 1, 1)) * i;
}

// --- Tooltip state (module-level for simplicity) ---
interface TooltipInfo {
  x: number;
  y: number;
  lines: string[];
}

function Tooltip({ info }: { info: TooltipInfo | null }) {
  if (!info) return null;
  const tipW = Math.max(...info.lines.map((l) => l.length)) * 7 + 16;
  const tipH = info.lines.length * 16 + 12;
  const tx = Math.max(4, Math.min(info.x - tipW / 2, 600));
  const ty = Math.max(4, info.y - tipH - 8);
  return (
    <g>
      <rect
        x={tx}
        y={ty}
        width={tipW}
        height={tipH}
        rx="4"
        fill="#161b22"
        stroke={COLORS.grid}
        stroke-width="1"
      />
      {info.lines.map((line, i) => (
        <text
          key={i}
          x={tx + 8}
          y={ty + 14 + i * 16}
          fill={COLORS.textPrimary}
          font-size="11"
          font-family="'SF Mono', 'Fira Code', monospace"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

// --- 1. Jobs Per Day Chart (stacked bar) ---
function JobsPerDayChart({ daily, w }: { daily: DailyMetric[]; w: number }) {
  const [tip, setTip] = useState<TooltipInfo | null>(null);
  if (!daily.length) return <div class="db-chart-empty">No data</div>;

  const maxVal = Math.max(
    ...daily.map((d) => d.jobs_started + d.jobs_completed + d.jobs_failed),
    1
  );
  const yMax = Math.ceil(maxVal * 1.1);
  const innerW = w - CHART_PAD.left - CHART_PAD.right;
  const barW = Math.max(4, Math.min(30, innerW / daily.length - 2));

  return (
    <svg
      width={w}
      height={CHART_H}
      viewBox={`0 0 ${w} ${CHART_H}`}
      onMouseLeave={() => setTip(null)}
    >
      {gridLines(0, yMax, w)}
      {daily.map((d, i) => {
        const cx = CHART_PAD.left + (innerW / daily.length) * (i + 0.5);
        const completed = d.jobs_completed;
        const failed = d.jobs_failed;
        const started = Math.max(0, d.jobs_started - completed - failed);
        const total = completed + failed + started;

        const completedH = (completed / yMax) * (CHART_H - CHART_PAD.top - CHART_PAD.bottom);
        const failedH = (failed / yMax) * (CHART_H - CHART_PAD.top - CHART_PAD.bottom);
        const startedH = (started / yMax) * (CHART_H - CHART_PAD.top - CHART_PAD.bottom);

        const baseY = CHART_H - CHART_PAD.bottom;

        return (
          <g
            key={i}
            onMouseEnter={() =>
              setTip({
                x: cx,
                y: baseY - completedH - failedH - startedH,
                lines: [
                  fmtDateLabel(d.date),
                  `Done: ${completed}`,
                  `Failed: ${failed}`,
                  `Started: ${d.jobs_started}`,
                ],
              })
            }
            onMouseLeave={() => setTip(null)}
            style={{ cursor: "pointer" }}
          >
            <rect
              x={cx - barW / 2}
              y={baseY - completedH}
              width={barW}
              height={Math.max(completedH, 0)}
              fill={COLORS.completed}
              rx="1"
            />
            <rect
              x={cx - barW / 2}
              y={baseY - completedH - failedH}
              width={barW}
              height={Math.max(failedH, 0)}
              fill={COLORS.failed}
              rx="1"
            />
            <rect
              x={cx - barW / 2}
              y={baseY - completedH - failedH - startedH}
              width={barW}
              height={Math.max(startedH, 0)}
              fill={COLORS.started}
              rx="1"
            />
          </g>
        );
      })}
      {xLabels(
        daily.map((d) => d.date),
        w
      )}
      <Tooltip info={tip} />
    </svg>
  );
}

// --- 2. Token Usage Chart (area chart) ---
function TokenUsageChart({ daily, w }: { daily: DailyMetric[]; w: number }) {
  const [tip, setTip] = useState<TooltipInfo | null>(null);
  if (!daily.length) return <div class="db-chart-empty">No data</div>;

  const maxVal = Math.max(
    ...daily.map((d) => Math.max(d.total_input_tokens, d.total_output_tokens)),
    1
  );
  const yMax = Math.ceil(maxVal * 1.15);
  const dates = daily.map((d) => d.date);

  const inputPoints = daily.map((d, i) => ({
    x: scaleX(i, daily.length, w),
    y: scaleY(d.total_input_tokens, 0, yMax),
  }));

  const outputPoints = daily.map((d, i) => ({
    x: scaleX(i, daily.length, w),
    y: scaleY(d.total_output_tokens, 0, yMax),
  }));

  const baseY = CHART_H - CHART_PAD.bottom;

  function areaPath(points: { x: number; y: number }[]): string {
    if (!points.length) return "";
    let d = `M${points[0].x},${baseY}`;
    d += ` L${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L${points[i].x},${points[i].y}`;
    }
    d += ` L${points[points.length - 1].x},${baseY} Z`;
    return d;
  }

  function linePath(points: { x: number; y: number }[]): string {
    if (!points.length) return "";
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L${points[i].x},${points[i].y}`;
    }
    return d;
  }

  return (
    <svg
      width={w}
      height={CHART_H}
      viewBox={`0 0 ${w} ${CHART_H}`}
      onMouseLeave={() => setTip(null)}
    >
      {gridLines(0, yMax, w)}
      <path d={areaPath(inputPoints)} fill={COLORS.inputTokens} opacity="0.15" />
      <path d={linePath(inputPoints)} fill="none" stroke={COLORS.inputTokens} stroke-width="2" />
      <path d={areaPath(outputPoints)} fill={COLORS.outputTokens} opacity="0.15" />
      <path d={linePath(outputPoints)} fill="none" stroke={COLORS.outputTokens} stroke-width="2" />
      {daily.map((d, i) => (
        <rect
          key={i}
          x={scaleX(i, daily.length, w) - 8}
          y={CHART_PAD.top}
          width={16}
          height={CHART_H - CHART_PAD.top - CHART_PAD.bottom}
          fill="transparent"
          onMouseEnter={() =>
            setTip({
              x: inputPoints[i].x,
              y: Math.min(inputPoints[i].y, outputPoints[i].y),
              lines: [
                fmtDateLabel(d.date),
                `In: ${fmtNum(d.total_input_tokens)}`,
                `Out: ${fmtNum(d.total_output_tokens)}`,
              ],
            })
          }
          onMouseLeave={() => setTip(null)}
          style={{ cursor: "pointer" }}
        />
      ))}
      {xLabels(dates, w)}
      <Tooltip info={tip} />
    </svg>
  );
}

// --- 3. Cost Over Time Chart (line chart) ---
function CostOverTimeChart({ daily, w }: { daily: DailyMetric[]; w: number }) {
  const [tip, setTip] = useState<TooltipInfo | null>(null);
  if (!daily.length) return <div class="db-chart-empty">No data</div>;

  const costs = daily.map(
    (d) =>
      (d.total_input_tokens / 1_000_000) * 15 +
      (d.total_output_tokens / 1_000_000) * 75
  );
  const maxVal = Math.max(...costs, 1);
  const yMax = Math.ceil(maxVal * 1.15);
  const dates = daily.map((d) => d.date);

  const points = costs.map((c, i) => ({
    x: scaleX(i, daily.length, w),
    y: scaleY(c, 0, yMax),
  }));

  function linePath(pts: { x: number; y: number }[]): string {
    if (!pts.length) return "";
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L${pts[i].x},${pts[i].y}`;
    }
    return d;
  }

  return (
    <svg
      width={w}
      height={CHART_H}
      viewBox={`0 0 ${w} ${CHART_H}`}
      onMouseLeave={() => setTip(null)}
    >
      {gridLines(0, yMax, w).map((el) => {
        // Override label formatter for cost
        return el;
      })}
      <path d={linePath(points)} fill="none" stroke={COLORS.cost} stroke-width="2" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill={COLORS.cost}
          stroke="#161b22"
          stroke-width="1.5"
          onMouseEnter={() =>
            setTip({
              x: p.x,
              y: p.y,
              lines: [fmtDateLabel(dates[i]), fmtCost(costs[i])],
            })
          }
          onMouseLeave={() => setTip(null)}
          style={{ cursor: "pointer" }}
        />
      ))}
      {xLabels(dates, w)}
      <Tooltip info={tip} />
    </svg>
  );
}

// --- 4. Model Distribution (donut chart) ---
function ModelDistribution({
  byModel,
}: {
  byModel: { model: string; reasoning: string; count: number; cost: number }[];
}) {
  const [tip, setTip] = useState<TooltipInfo | null>(null);
  if (!byModel.length) return <div class="db-chart-empty">No data</div>;

  const total = byModel.reduce((s, m) => s + m.count, 0);
  const palette = ["#79c0ff", "#d2a8ff", "#3fb950", "#f85149", "#58a6ff", "#d29922", "#8b949e"];
  const cx = 100;
  const cy = 100;
  const outerR = 80;
  const innerR = 50;
  let startAngle = -Math.PI / 2;

  const arcs = byModel.map((m, i) => {
    const pct = m.count / total;
    const angle = pct * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1o = cx + outerR * Math.cos(startAngle);
    const y1o = cy + outerR * Math.sin(startAngle);
    const x2o = cx + outerR * Math.cos(endAngle);
    const y2o = cy + outerR * Math.sin(endAngle);
    const x1i = cx + innerR * Math.cos(endAngle);
    const y1i = cy + innerR * Math.sin(endAngle);
    const x2i = cx + innerR * Math.cos(startAngle);
    const y2i = cy + innerR * Math.sin(startAngle);

    const d = [
      `M${x1o},${y1o}`,
      `A${outerR},${outerR} 0 ${largeArc} 1 ${x2o},${y2o}`,
      `L${x1i},${y1i}`,
      `A${innerR},${innerR} 0 ${largeArc} 0 ${x2i},${y2i}`,
      "Z",
    ].join(" ");

    const midAngle = startAngle + angle / 2;
    const labelR = (outerR + innerR) / 2;
    const labelX = cx + labelR * Math.cos(midAngle);
    const labelY = cy + labelR * Math.sin(midAngle);

    startAngle = endAngle;

    return { d, color: palette[i % palette.length], m, pct, labelX, labelY, midAngle };
  });

  return (
    <div class="analytics-donut-wrap">
      <svg
        width="200"
        height="200"
        viewBox="0 0 200 200"
        onMouseLeave={() => setTip(null)}
      >
        {arcs.map((arc, i) => (
          <path
            key={i}
            d={arc.d}
            fill={arc.color}
            opacity="0.85"
            onMouseEnter={(e) => {
              const rect = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
              setTip({
                x: arc.labelX,
                y: arc.labelY,
                lines: [
                  `${arc.m.model}/${arc.m.reasoning}`,
                  `${arc.m.count} jobs (${Math.round(arc.pct * 100)}%)`,
                  fmtCost(arc.m.cost),
                ],
              });
            }}
            onMouseLeave={() => setTip(null)}
            style={{ cursor: "pointer" }}
          />
        ))}
        <Tooltip info={tip} />
      </svg>
      <div class="analytics-donut-legend">
        {arcs.map((arc, i) => (
          <div key={i} class="analytics-donut-legend-item">
            <span
              class="analytics-donut-swatch"
              style={{ background: arc.color }}
            />
            <span class="analytics-donut-label">
              {arc.m.model}/{arc.m.reasoning}
            </span>
            <span class="analytics-donut-pct">
              {Math.round(arc.pct * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- 5. Avg Duration Chart (line chart) ---
function AvgDurationChart({
  data,
  w,
}: {
  data: { date: string; avg_ms: number }[];
  w: number;
}) {
  const [tip, setTip] = useState<TooltipInfo | null>(null);
  if (!data.length) return <div class="db-chart-empty">No data</div>;

  const maxVal = Math.max(...data.map((d) => d.avg_ms), 1);
  const yMax = Math.ceil(maxVal * 1.15);
  const dates = data.map((d) => d.date);

  const points = data.map((d, i) => ({
    x: scaleX(i, data.length, w),
    y: scaleY(d.avg_ms, 0, yMax),
  }));

  function linePath(pts: { x: number; y: number }[]): string {
    if (!pts.length) return "";
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L${pts[i].x},${pts[i].y}`;
    }
    return d;
  }

  return (
    <svg
      width={w}
      height={CHART_H}
      viewBox={`0 0 ${w} ${CHART_H}`}
      onMouseLeave={() => setTip(null)}
    >
      {gridLines(0, yMax, w)}
      <path d={linePath(points)} fill="none" stroke={COLORS.outputTokens} stroke-width="2" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill={COLORS.outputTokens}
          stroke="#161b22"
          stroke-width="1.5"
          onMouseEnter={() =>
            setTip({
              x: p.x,
              y: p.y,
              lines: [fmtDateLabel(dates[i]), fmtDuration(data[i].avg_ms)],
            })
          }
          onMouseLeave={() => setTip(null)}
          style={{ cursor: "pointer" }}
        />
      ))}
      {xLabels(dates, w)}
      <Tooltip info={tip} />
    </svg>
  );
}

// --- 6. Success Rate Chart (line chart) ---
function SuccessRateChart({
  data,
  w,
}: {
  data: { date: string; rate: number }[];
  w: number;
}) {
  const [tip, setTip] = useState<TooltipInfo | null>(null);
  if (!data.length) return <div class="db-chart-empty">No data</div>;

  const dates = data.map((d) => d.date);

  const points = data.map((d, i) => ({
    x: scaleX(i, data.length, w),
    y: scaleY(d.rate, 0, 100),
  }));

  function linePath(pts: { x: number; y: number }[]): string {
    if (!pts.length) return "";
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L${pts[i].x},${pts[i].y}`;
    }
    return d;
  }

  return (
    <svg
      width={w}
      height={CHART_H}
      viewBox={`0 0 ${w} ${CHART_H}`}
      onMouseLeave={() => setTip(null)}
    >
      {gridLines(0, 100, w)}
      <path d={linePath(points)} fill="none" stroke={COLORS.completed} stroke-width="2" />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill={COLORS.completed}
          stroke="#161b22"
          stroke-width="1.5"
          onMouseEnter={() =>
            setTip({
              x: p.x,
              y: p.y,
              lines: [fmtDateLabel(dates[i]), `${data[i].rate}%`],
            })
          }
          onMouseLeave={() => setTip(null)}
          style={{ cursor: "pointer" }}
        />
      ))}
      {xLabels(dates, w)}
      <Tooltip info={tip} />
    </svg>
  );
}

// --- 7. Top Models (horizontal bar chart) ---
function TopModels({
  byModel,
}: {
  byModel: { model: string; reasoning: string; count: number; cost: number }[];
}) {
  if (!byModel.length) return <div class="db-chart-empty">No data</div>;
  const maxCount = Math.max(...byModel.map((m) => m.count), 1);
  const total = byModel.reduce((s, m) => s + m.count, 0);

  return (
    <div class="analytics-hbar-list">
      {byModel.slice(0, 6).map((m, i) => {
        const pct = (m.count / maxCount) * 100;
        const totalPct = Math.round((m.count / total) * 100);
        return (
          <div key={i} class="analytics-hbar-row">
            <span class="analytics-hbar-label">
              {m.model}/{m.reasoning}
            </span>
            <div class="analytics-hbar-track">
              <div
                class="analytics-hbar-fill"
                style={{ width: pct + "%", background: COLORS.inputTokens }}
              />
            </div>
            <span class="analytics-hbar-pct">{totalPct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// --- 8. Top Directories (horizontal bar chart) ---
function TopDirectories({
  byCwd,
}: {
  byCwd: { cwd: string; count: number }[];
}) {
  if (!byCwd.length) return <div class="db-chart-empty">No data</div>;
  const maxCount = Math.max(...byCwd.map((c) => c.count), 1);
  const total = byCwd.reduce((s, c) => s + c.count, 0);

  return (
    <div class="analytics-hbar-list">
      {byCwd.slice(0, 6).map((c, i) => {
        const pct = (c.count / maxCount) * 100;
        const totalPct = Math.round((c.count / total) * 100);
        const shortCwd = c.cwd.replace(/^\/Users\/[^/]+/, "~");
        return (
          <div key={i} class="analytics-hbar-row">
            <span class="analytics-hbar-label analytics-hbar-label--mono">
              {shortCwd}
            </span>
            <div class="analytics-hbar-track">
              <div
                class="analytics-hbar-fill"
                style={{ width: pct + "%", background: COLORS.outputTokens }}
              />
            </div>
            <span class="analytics-hbar-pct">{totalPct}%</span>
          </div>
        );
      })}
    </div>
  );
}

// --- Chart Legend ---
function ChartLegend({
  items,
}: {
  items: { color: string; label: string }[];
}) {
  return (
    <div class="analytics-chart-legend">
      {items.map((item, i) => (
        <span key={i} class="analytics-chart-legend-item">
          <span
            class="analytics-chart-legend-swatch"
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// --- Time Range Selector ---
function TimeRangeSelector({
  range,
  onChange,
}: {
  range: string;
  onChange: (r: string) => void;
}) {
  const ranges = [
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
    { value: "all", label: "All time" },
  ];
  return (
    <div class="db-time-range">
      {ranges.map((r) => (
        <button
          key={r.value}
          class={`db-time-range-btn ${range === r.value ? "active" : ""}`}
          onClick={() => onChange(r.value)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// --- Headline Stats ---
function HeadlineStats({
  headline,
}: {
  headline: AnalyticsData["headline"];
}) {
  const successPct =
    headline.jobs_started > 0
      ? Math.round(
          (headline.jobs_completed /
            (headline.jobs_completed + headline.jobs_failed || 1)) *
            100
        )
      : 0;
  const failPct =
    headline.jobs_started > 0
      ? Math.round(
          (headline.jobs_failed /
            (headline.jobs_completed + headline.jobs_failed || 1)) *
            100
        )
      : 0;

  return (
    <div class="db-stat-cards">
      <div class="db-stat-card">
        <span class="db-stat-value">{headline.jobs_started}</span>
        <span class="db-stat-label">Jobs Started</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value" style={{ color: COLORS.completed }}>
          {headline.jobs_completed}
        </span>
        <span class="db-stat-label">Completed ({successPct}%)</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value" style={{ color: COLORS.failed }}>
          {headline.jobs_failed}
        </span>
        <span class="db-stat-label">Failed ({failPct}%)</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value">{fmtCost(headline.total_cost)}</span>
        <span class="db-stat-label">Total Spent</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value">{fmtNum(headline.total_tokens)}</span>
        <span class="db-stat-label">Tokens Consumed</span>
      </div>
    </div>
  );
}

// --- Main Analytics Dashboard ---
export function AnalyticsDashboard() {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartWidth, setChartWidth] = useState(700);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/db/analytics?range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [range]);

  // Keyboard: [ / ] to cycle range
  useEffect(() => {
    const ranges = ["7d", "30d", "90d", "all"];
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "[") {
        e.preventDefault();
        const idx = ranges.indexOf(range);
        if (idx > 0) setRange(ranges[idx - 1]);
      } else if (e.key === "]") {
        e.preventDefault();
        const idx = ranges.indexOf(range);
        if (idx < ranges.length - 1) setRange(ranges[idx + 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [range]);

  // Measure container width
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector(".analytics-dashboard");
      if (el) setChartWidth(Math.max(el.clientWidth - 34, 300));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  if (loading && !data) {
    return (
      <div class="analytics-dashboard">
        <div class="db-breadcrumb">
          <a href="#/db">Database</a>
          <span class="db-breadcrumb-sep">&gt;</span>
          Analytics
        </div>
        <div class="db-chart-empty">Loading analytics...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div class="analytics-dashboard">
        <div class="db-breadcrumb">
          <a href="#/db">Database</a>
          <span class="db-breadcrumb-sep">&gt;</span>
          Analytics
        </div>
        <div class="db-chart-empty">Failed to load analytics data.</div>
      </div>
    );
  }

  const halfW = Math.max((chartWidth - 12) / 2, 200);

  return (
    <div class="analytics-dashboard">
      <div class="analytics-dashboard-header">
        <div class="db-breadcrumb">
          <a href="#/db">Database</a>
          <span class="db-breadcrumb-sep">&gt;</span>
          Analytics
        </div>
        <TimeRangeSelector range={range} onChange={setRange} />
      </div>

      <HeadlineStats headline={data.headline} />

      {/* Jobs Per Day */}
      <div class="db-chart" style={{ marginTop: "16px" }}>
        <div class="db-chart-title">Jobs Per Day</div>
        <JobsPerDayChart daily={data.daily} w={chartWidth - 32} />
        <ChartLegend
          items={[
            { color: COLORS.completed, label: "Completed" },
            { color: COLORS.failed, label: "Failed" },
            { color: COLORS.started, label: "Started" },
          ]}
        />
      </div>

      {/* Token Usage */}
      <div class="db-chart" style={{ marginTop: "12px" }}>
        <div class="db-chart-title">Token Usage Over Time</div>
        <TokenUsageChart daily={data.daily} w={chartWidth - 32} />
        <ChartLegend
          items={[
            { color: COLORS.inputTokens, label: "Input tokens" },
            { color: COLORS.outputTokens, label: "Output tokens" },
          ]}
        />
      </div>

      {/* Cost + Model Distribution */}
      <div class="db-charts-row">
        <div class="db-chart">
          <div class="db-chart-title">Cost Over Time</div>
          <CostOverTimeChart daily={data.daily} w={halfW - 32} />
        </div>
        <div class="db-chart">
          <div class="db-chart-title">Model Distribution</div>
          <ModelDistribution byModel={data.by_model} />
        </div>
      </div>

      {/* Avg Duration + Success Rate */}
      <div class="db-charts-row">
        <div class="db-chart">
          <div class="db-chart-title">Avg Job Duration</div>
          <AvgDurationChart data={data.avg_duration_by_day} w={halfW - 32} />
        </div>
        <div class="db-chart">
          <div class="db-chart-title">Success Rate</div>
          <SuccessRateChart data={data.success_rate_by_day} w={halfW - 32} />
        </div>
      </div>

      {/* Top Models + Top Directories */}
      <div class="db-charts-row">
        <div class="db-chart">
          <div class="db-chart-title">Top Models</div>
          <TopModels byModel={data.by_model} />
        </div>
        <div class="db-chart">
          <div class="db-chart-title">Top Working Directories</div>
          <TopDirectories byCwd={data.by_cwd} />
        </div>
      </div>
    </div>
  );
}
