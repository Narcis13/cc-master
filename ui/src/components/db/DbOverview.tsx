import { h, Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { formatTokens } from "../../lib/format";

interface DbOverviewData {
  tables: {
    job_history: { count: number; columns: number };
    tool_calls: { count: number; columns: number };
    job_subagents: { count: number; columns: number };
    events: { count: number; columns: number };
    daily_metrics: { count: number; columns: number };
  };
  db_size_bytes: number;
  db_path: string;
  top_statuses: { status: string; count: number }[];
  top_tools: { name: string; count: number }[];
  top_event_types: { event_type: string; count: number }[];
  jobs_with_subagents: number;
  avg_subagents_per_job: number;
  metrics_date_range: { min: string | null; max: string | null };
  metrics_totals: { total_input_tokens: number; total_output_tokens: number; total_cost: number };
  daily_sparkline: { date: string; jobs_started: number }[];
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function relativeFromNow(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Inline SVG sparkline — 30 data points
function Sparkline({ data }: { data: { date: string; jobs_started: number }[] }) {
  if (data.length === 0) return <span class="db-sparkline-empty">No data</span>;

  const svgW = 200;
  const svgH = 32;
  const pad = 2;
  const values = data.map((d) => d.jobs_started);
  const max = Math.max(...values, 1);
  const points = values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * (svgW - pad * 2);
    const y = svgH - pad - (v / max) * (svgH - pad * 2);
    return `${x},${y}`;
  });
  const polyline = points.join(" ");
  // area fill
  const firstX = pad;
  const lastX = pad + ((values.length - 1) / Math.max(values.length - 1, 1)) * (svgW - pad * 2);
  const areaPath = `M${firstX},${svgH} L${points.map((p) => p).join(" L")} L${lastX},${svgH} Z`;

  return (
    <svg class="db-sparkline-svg" viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none">
      <path d={areaPath} fill="rgba(188,140,255,0.12)" />
      <polyline points={polyline} fill="none" stroke="var(--accent)" stroke-width="1.5" />
    </svg>
  );
}

function BreakdownRows({
  items,
  total,
}: {
  items: { label: string; count: number }[];
  total: number;
}) {
  return (
    <div class="db-section-card-breakdown">
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        return (
          <div class="db-section-card-row" key={item.label}>
            <span class="cell-secondary">{item.label}</span>
            <div class="db-section-card-row-bar">
              <div class="db-section-card-row-fill" style={{ width: `${pct}%` }} />
            </div>
            <span class="cell-mono cell-secondary">
              {item.count} ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TableCard({
  title,
  rowCount,
  colCount,
  children,
  linkHash,
  linkLabel,
}: {
  title: string;
  rowCount: number;
  colCount: number;
  children: any;
  linkHash: string;
  linkLabel: string;
}) {
  return (
    <div class="db-section-card">
      <div class="db-section-card-title">{title}</div>
      <div class="db-section-card-meta">
        {rowCount.toLocaleString()} rows | {colCount} columns
      </div>
      {children}
      <a href={linkHash} class="db-section-card-link">
        {linkLabel} →
      </a>
    </div>
  );
}

function QuickSearch() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"file" | "tool">("file");

  const doSearch = () => {
    if (!query.trim()) return;
    const searchMode = mode === "tool" ? "tool" : "file";
    window.location.hash = `#/db/jobs?search=${encodeURIComponent(query)}&search_mode=${searchMode}`;
  };

  return (
    <div class="db-quick-search">
      <div class="db-quick-search-input">
        <select
          class="db-filter-select"
          value={mode}
          onChange={(e) => setMode((e.target as HTMLSelectElement).value as any)}
        >
          <option value="file">File Path</option>
          <option value="tool">Tool Name</option>
        </select>
        <input
          class="db-filter-search"
          type="text"
          placeholder={mode === "file" ? "Search by file path... e.g. src/auth/" : "Search by tool name... e.g. Read"}
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <button class="btn btn--primary btn--sm" onClick={doSearch}>
          Search
        </button>
      </div>
      <div class="db-quick-search-hint">
        Examples: "src/dashboard/" | "*.ts" | "Read" | "Bash"
      </div>
    </div>
  );
}

export function DbOverview() {
  const [data, setData] = useState<DbOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = () => {
    fetch("/api/db/overview")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // R key to refresh
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        fetchData();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (error) return <div class="db-placeholder">Error loading overview: {error}</div>;
  if (!data) return <div class="db-placeholder">Loading overview...</div>;

  const tables = data.tables;
  const dbName = data.db_path.split("/").pop() || "dashboard.db";
  const latestJob = data.daily_sparkline.length > 0 ? data.daily_sparkline[data.daily_sparkline.length - 1].date : null;

  return (
    <div class="db-overview">
      {/* Info bar */}
      <div class="db-stat-cards">
        <div class="db-stat-card">
          <span class="db-stat-value">{tables.job_history.count.toLocaleString()}</span>
          <span class="db-stat-label">Jobs Recorded</span>
        </div>
        <div class="db-stat-card">
          <span class="db-stat-value">{tables.tool_calls.count.toLocaleString()}</span>
          <span class="db-stat-label">Tool Calls</span>
        </div>
        <div class="db-stat-card">
          <span class="db-stat-value">{tables.job_subagents.count.toLocaleString()}</span>
          <span class="db-stat-label">Subagent Records</span>
        </div>
        <div class="db-stat-card">
          <span class="db-stat-value">{tables.events.count.toLocaleString()}</span>
          <span class="db-stat-label">Events Logged</span>
        </div>
        <div class="db-stat-card">
          <span class="db-stat-value">{formatBytes(data.db_size_bytes)}</span>
          <span class="db-stat-label">{dbName}</span>
        </div>
      </div>

      {/* Table cards */}
      <div class="db-cards-grid">
        {/* job_history */}
        <TableCard
          title="job_history"
          rowCount={tables.job_history.count}
          colCount={tables.job_history.columns}
          linkHash="#/db/jobs"
          linkLabel="Browse Jobs"
        >
          {latestJob && (
            <div class="db-section-card-meta">
              Latest: {relativeFromNow(latestJob)} | Oldest:{" "}
              {data.daily_sparkline.length > 0
                ? relativeFromNow(data.daily_sparkline[0].date)
                : "—"}
            </div>
          )}
          <BreakdownRows
            items={data.top_statuses.map((s) => ({ label: s.status, count: s.count }))}
            total={tables.job_history.count}
          />
        </TableCard>

        {/* tool_calls */}
        <TableCard
          title="tool_calls"
          rowCount={tables.tool_calls.count}
          colCount={tables.tool_calls.columns}
          linkHash="#/db/tools"
          linkLabel="Browse Tool Calls"
        >
          <BreakdownRows
            items={data.top_tools.map((t) => ({ label: t.name, count: t.count }))}
            total={tables.tool_calls.count}
          />
        </TableCard>

        {/* job_subagents */}
        <TableCard
          title="job_subagents"
          rowCount={tables.job_subagents.count}
          colCount={tables.job_subagents.columns}
          linkHash="#/db/jobs"
          linkLabel="Browse Subagents"
        >
          <div class="db-section-card-breakdown">
            <div class="db-section-card-row">
              <span class="cell-secondary">Jobs with subagents</span>
              <span class="cell-mono">{data.jobs_with_subagents}</span>
            </div>
            <div class="db-section-card-row">
              <span class="cell-secondary">Avg subagents per job</span>
              <span class="cell-mono">{data.avg_subagents_per_job}</span>
            </div>
          </div>
        </TableCard>

        {/* events */}
        <TableCard
          title="events"
          rowCount={tables.events.count}
          colCount={tables.events.columns}
          linkHash="#/db/events"
          linkLabel="Browse Events"
        >
          <BreakdownRows
            items={data.top_event_types.map((e) => ({
              label: e.event_type,
              count: e.count,
            }))}
            total={tables.events.count}
          />
        </TableCard>

        {/* daily_metrics */}
        <TableCard
          title="daily_metrics"
          rowCount={tables.daily_metrics.count}
          colCount={tables.daily_metrics.columns}
          linkHash="#/db/analytics"
          linkLabel="View Analytics"
        >
          <div class="db-section-card-breakdown">
            <div class="db-section-card-row">
              <span class="cell-secondary">Date range</span>
              <span class="cell-mono">
                {formatDateShort(data.metrics_date_range.min)} –{" "}
                {formatDateShort(data.metrics_date_range.max)}
              </span>
            </div>
            <div class="db-section-card-row">
              <span class="cell-secondary">Total tokens</span>
              <span class="cell-mono">
                {formatTokens(data.metrics_totals.total_input_tokens)} in /{" "}
                {formatTokens(data.metrics_totals.total_output_tokens)} out
              </span>
            </div>
            <div class="db-section-card-row">
              <span class="cell-secondary">Total cost</span>
              <span class="cell-mono">${data.metrics_totals.total_cost.toFixed(2)}</span>
            </div>
          </div>
          <Sparkline data={data.daily_sparkline} />
        </TableCard>
      </div>

      {/* Quick search */}
      <QuickSearch />
    </div>
  );
}
