/** @jsxRuntime classic */
import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { formatTokens } from "../lib/format";

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

type Range = "7d" | "30d" | "90d";
type ChartType = "tokens" | "jobs" | "duration";

export function MetricsChart() {
  const [data, setData] = useState<DailyMetric[]>([]);
  const [range, setRange] = useState<Range>("7d");
  const [chartType, setChartType] = useState<ChartType>("tokens");
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/metrics/history?range=${range}`)
      .then((r) => r.json())
      .then((json) => {
        setData(json.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [range]);

  useEffect(() => {
    if (!canvasRef.current || data.length === 0) return;
    drawChart(canvasRef.current, data, chartType);
  }, [data, chartType]);

  // Compute totals for summary cards
  const totals = data.reduce(
    (acc, d) => ({
      jobs: acc.jobs + d.jobs_started,
      completed: acc.completed + d.jobs_completed,
      failed: acc.failed + d.jobs_failed,
      inputTokens: acc.inputTokens + d.total_input_tokens,
      outputTokens: acc.outputTokens + d.total_output_tokens,
      elapsed: acc.elapsed + d.total_elapsed_ms,
      files: acc.files + d.files_modified_count,
    }),
    { jobs: 0, completed: 0, failed: 0, inputTokens: 0, outputTokens: 0, elapsed: 0, files: 0 }
  );

  return (
    <div class="analytics">
      <div class="analytics-header">
        <h3>Analytics</h3>
        <div class="analytics-controls">
          <div class="timeline-filters">
            {(["tokens", "jobs", "duration"] as ChartType[]).map((t) => (
              <button
                key={t}
                class={`timeline-filter-btn ${chartType === t ? "active" : ""}`}
                onClick={() => setChartType(t)}
              >
                {t === "tokens" ? "Tokens" : t === "jobs" ? "Jobs" : "Duration"}
              </button>
            ))}
          </div>
          <div class="timeline-filters">
            {(["7d", "30d", "90d"] as Range[]).map((r) => (
              <button
                key={r}
                class={`timeline-filter-btn ${range === r ? "active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div class="analytics-summary">
        <div class="status-metric">
          <span class="metric-value">{totals.jobs}</span>
          <span class="metric-label">Jobs Started</span>
        </div>
        <div class="status-metric">
          <span class="metric-value metric-complete">{totals.completed}</span>
          <span class="metric-label">Completed</span>
        </div>
        <div class="status-metric">
          <span class="metric-value metric-failed">{totals.failed}</span>
          <span class="metric-label">Failed</span>
        </div>
        <div class="status-metric">
          <span class="metric-value">{formatTokens(totals.inputTokens + totals.outputTokens)}</span>
          <span class="metric-label">Total Tokens</span>
        </div>
        <div class="status-metric">
          <span class="metric-value">{totals.files}</span>
          <span class="metric-label">Files Modified</span>
        </div>
      </div>

      <div class="chart-container">
        {loading ? (
          <div class="empty-state">Loading...</div>
        ) : data.length === 0 ? (
          <div class="empty-state">No historical data yet. Completed jobs will appear here.</div>
        ) : (
          <canvas ref={canvasRef} width={800} height={300} class="chart-canvas" />
        )}
      </div>
    </div>
  );
}

function drawChart(canvas: HTMLCanvasElement, data: DailyMetric[], type: ChartType) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Get values based on chart type
  let series1: number[] = [];
  let series2: number[] = [];
  let label1 = "";
  let label2 = "";
  let color1 = "";
  let color2 = "";

  if (type === "tokens") {
    series1 = data.map((d) => d.total_input_tokens);
    series2 = data.map((d) => d.total_output_tokens);
    label1 = "Input";
    label2 = "Output";
    color1 = "#58a6ff";
    color2 = "#bc8cff";
  } else if (type === "jobs") {
    series1 = data.map((d) => d.jobs_completed);
    series2 = data.map((d) => d.jobs_failed);
    label1 = "Completed";
    label2 = "Failed";
    color1 = "#3fb950";
    color2 = "#f85149";
  } else {
    series1 = data.map((d) => (d.jobs_completed > 0 ? d.total_elapsed_ms / d.jobs_completed / 60000 : 0));
    series2 = [];
    label1 = "Avg Duration (min)";
    label2 = "";
    color1 = "#d29922";
    color2 = "";
  }

  const allVals = [...series1, ...series2];
  const maxVal = Math.max(...allVals, 1);

  // Y axis
  ctx.strokeStyle = "#30363d";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#8b949e";
  ctx.font = "11px 'SF Mono', monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + chartH - (i / 4) * chartH;
    const val = (maxVal * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();
    const labelStr = type === "tokens" ? formatTokens(val) : type === "duration" ? val.toFixed(1) : String(Math.round(val));
    ctx.fillText(labelStr, pad.left - 8, y + 4);
  }

  // X axis labels
  ctx.textAlign = "center";
  const barW = chartW / data.length;
  for (let i = 0; i < data.length; i++) {
    const x = pad.left + i * barW + barW / 2;
    // Show label every N items depending on count
    const showEvery = data.length > 30 ? 7 : data.length > 14 ? 3 : 1;
    if (i % showEvery === 0) {
      const dateLabel = data[i].date.slice(5); // MM-DD
      ctx.fillText(dateLabel, x, h - pad.bottom + 20);
    }
  }

  if (series2.length > 0) {
    // Stacked bars
    for (let i = 0; i < data.length; i++) {
      const x = pad.left + i * barW + barW * 0.15;
      const bw = barW * 0.7;

      const h1 = (series1[i] / maxVal) * chartH;
      const h2 = (series2[i] / maxVal) * chartH;

      // Series 1 (bottom)
      ctx.fillStyle = color1;
      ctx.fillRect(x, pad.top + chartH - h1 - h2, bw / 2 - 1, h1);

      // Series 2
      ctx.fillStyle = color2;
      ctx.fillRect(x + bw / 2 + 1, pad.top + chartH - h2, bw / 2 - 1, h2);
    }
  } else {
    // Single series bars
    for (let i = 0; i < data.length; i++) {
      const x = pad.left + i * barW + barW * 0.2;
      const bw = barW * 0.6;
      const bh = (series1[i] / maxVal) * chartH;

      ctx.fillStyle = color1;
      ctx.fillRect(x, pad.top + chartH - bh, bw, bh);
    }
  }

  // Legend
  ctx.font = "12px -apple-system, sans-serif";
  const legendY = pad.top - 4;
  let legendX = pad.left;

  ctx.fillStyle = color1;
  ctx.fillRect(legendX, legendY - 8, 12, 12);
  ctx.fillStyle = "#c9d1d9";
  ctx.textAlign = "left";
  ctx.fillText(label1, legendX + 16, legendY + 2);
  legendX += ctx.measureText(label1).width + 32;

  if (label2) {
    ctx.fillStyle = color2;
    ctx.fillRect(legendX, legendY - 8, 12, 12);
    ctx.fillStyle = "#c9d1d9";
    ctx.fillText(label2, legendX + 16, legendY + 2);
  }
}
