import { h, Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { formatRelativeTime } from "../../lib/format";

interface ToolStat {
  name: string;
  total_calls: number;
  error_count: number;
  error_rate: number;
  avg_per_job: number;
  last_used: string | null;
}

interface ToolCallRecord {
  id: number;
  job_id: string;
  name: string;
  is_error: number;
  timestamp: string | null;
  input_preview: string | null;
  output_preview: string | null;
}

type SortKey = "name" | "total_calls" | "error_rate" | "avg_per_job" | "last_used";
type SortOrder = "asc" | "desc";

function ToolSummaryTable({
  stats,
  onFilterTool,
}: {
  stats: ToolStat[];
  onFilterTool: (tool: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("total_calls");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const sorted = [...stats].sort((a, b) => {
    let av: any = a[sortKey];
    let bv: any = b[sortKey];
    if (sortKey === "last_used") {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    }
    if (typeof av === "string") {
      const cmp = av.localeCompare(bv as string);
      return sortOrder === "asc" ? cmp : -cmp;
    }
    return sortOrder === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const indicator = (key: SortKey) =>
    sortKey === key ? (sortOrder === "asc" ? " \u25B2" : " \u25BC") : "";

  return (
    <div class="db-table-wrap">
      <table class="db-table">
        <thead>
          <tr>
            <th class="sortable" onClick={() => handleSort("name")}>
              Tool Name<span class="sort-indicator">{indicator("name")}</span>
            </th>
            <th class="sortable" onClick={() => handleSort("total_calls")}>
              Total Calls<span class="sort-indicator">{indicator("total_calls")}</span>
            </th>
            <th class="sortable" onClick={() => handleSort("error_rate")}>
              Error Rate<span class="sort-indicator">{indicator("error_rate")}</span>
            </th>
            <th class="sortable" onClick={() => handleSort("avg_per_job")}>
              Avg/Job<span class="sort-indicator">{indicator("avg_per_job")}</span>
            </th>
            <th class="sortable" onClick={() => handleSort("last_used")}>
              Last Used<span class="sort-indicator">{indicator("last_used")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr
              key={t.name}
              class="clickable"
              onClick={() => onFilterTool(t.name)}
            >
              <td class="cell-mono">{t.name}</td>
              <td>{t.total_calls.toLocaleString()}</td>
              <td>
                <span
                  style={{ color: t.error_rate > 5 ? "var(--status-failed)" : "var(--text-secondary)" }}
                >
                  {t.error_rate}%
                </span>
              </td>
              <td>{t.avg_per_job}</td>
              <td class="cell-secondary">
                {t.last_used ? formatRelativeTime(t.last_used) : "—"}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                No tool data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ErrorRateChart({ stats }: { stats: ToolStat[] }) {
  // Only show tools with at least some calls
  const filtered = stats.filter((t) => t.total_calls > 0);
  if (filtered.length === 0) return null;

  const maxCalls = Math.max(...filtered.map((t) => t.total_calls));
  const barHeight = 24;
  const labelWidth = 80;
  const pctWidth = 52;
  const gap = 4;
  const chartWidth = 600; // SVG internal width, scales via viewBox
  const barAreaWidth = chartWidth - labelWidth - pctWidth - 16;
  const totalHeight = filtered.length * (barHeight + gap);

  return (
    <div class="jd-section">
      <h3>Error Rate Visualization</h3>
      <svg
        viewBox={`0 0 ${chartWidth} ${totalHeight}`}
        style={{ width: "100%", display: "block" }}
      >
        {filtered.map((t, i) => {
          const y = i * (barHeight + gap);
          const totalW = (t.total_calls / maxCalls) * barAreaWidth;
          const errorW = t.error_count > 0 ? Math.max(2, (t.error_count / t.total_calls) * totalW) : 0;
          const successW = totalW - errorW;

          return (
            <g key={t.name}>
              <text
                x={labelWidth - 8}
                y={y + barHeight / 2 + 4}
                fill="#8b949e"
                font-size="11"
                font-family="'SF Mono', monospace"
                text-anchor="end"
              >
                {t.name}
              </text>
              <rect
                x={labelWidth}
                y={y + 2}
                width={Math.max(0, successW)}
                height={barHeight - 4}
                rx={3}
                fill="#3fb950"
              />
              {errorW > 0 && (
                <rect
                  x={labelWidth + successW}
                  y={y + 2}
                  width={errorW}
                  height={barHeight - 4}
                  rx={errorW === totalW ? 3 : 0}
                  fill="#f85149"
                />
              )}
              <text
                x={chartWidth - 4}
                y={y + barHeight / 2 + 4}
                fill="#8b949e"
                font-size="11"
                font-family="'SF Mono', monospace"
                text-anchor="end"
              >
                {t.error_rate}%
              </text>
            </g>
          );
        })}
      </svg>
      <div class="tu-legend">
        <span class="tu-legend-item">
          <span class="tu-legend-swatch" style={{ background: "#3fb950" }} /> Success
        </span>
        <span class="tu-legend-item">
          <span class="tu-legend-swatch" style={{ background: "#f85149" }} /> Error
        </span>
      </div>
    </div>
  );
}

function RecentToolCallRow({
  tc,
  expanded,
  onToggle,
}: {
  tc: ToolCallRecord;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div class={`tool-call-item ${tc.is_error ? "tool-call-item--error" : ""}`}>
      <div class="tool-call-row" onClick={onToggle}>
        <span class={`tool-call-icon ${tc.is_error ? "tool-call-icon--error" : ""}`}>
          {tc.name.slice(0, 2).toUpperCase()}
        </span>
        <span class="tool-call-name">{tc.name}</span>
        <a
          href={`#/db/jobs/${tc.job_id}`}
          class="tu-job-link"
          onClick={(e: Event) => e.stopPropagation()}
        >
          {tc.job_id}
        </a>
        {tc.is_error ? <span class="tool-call-error-badge">ERR</span> : null}
        {tc.timestamp && (
          <span class="tool-call-time">
            {new Date(tc.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        )}
        <span class="tool-call-preview">
          {tc.input_preview ? tc.input_preview.slice(0, 50) : ""}
        </span>
        <span class="tool-call-expand">{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>
      {expanded && (
        <div class="tool-call-detail">
          <div class="tu-detail-meta">
            Tool: <strong>{tc.name}</strong> | Job:{" "}
            <a href={`#/db/jobs/${tc.job_id}`}>{tc.job_id}</a>
            {tc.is_error ? (
              <span class="db-status-badge db-status-badge--error" style={{ marginLeft: 8 }}>
                ERROR
              </span>
            ) : null}
          </div>
          {tc.input_preview && (
            <div class="tool-call-block">
              <span class="tool-call-block-label">Input:</span>
              <div class="tool-call-block-content">{tc.input_preview}</div>
            </div>
          )}
          {tc.output_preview && (
            <div class="tool-call-block">
              <span class="tool-call-block-label">Output:</span>
              <div class="tool-call-block-content">{tc.output_preview}</div>
            </div>
          )}
          <div class="tu-detail-actions">
            <a href={`#/db/jobs/${tc.job_id}`} class="btn btn--ghost btn--sm">
              View Job →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export function ToolUsageExplorer() {
  const [stats, setStats] = useState<ToolStat[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [toolFilter, setToolFilter] = useState("");
  const [errorFilter, setErrorFilter] = useState<"" | "true" | "false">("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const limit = 50;

  // Fetch tool stats
  useEffect(() => {
    fetch("/api/db/tool-stats")
      .then((r) => r.json())
      .then((data) => setStats(data.by_tool || []))
      .catch(() => {});
  }, []);

  // Fetch tool calls with filters
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (toolFilter) params.set("tool", toolFilter);
    if (errorFilter) params.set("is_error", errorFilter);

    fetch(`/api/db/tool-calls?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setToolCalls(data.tool_calls || []);
        setTotal(data.total || 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, toolFilter, errorFilter]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const distinctTools = stats.map((t) => t.name);

  const handleFilterTool = (name: string) => {
    setToolFilter(name === toolFilter ? "" : name);
    setPage(1);
    setExpandedId(null);
  };

  return (
    <div class="tu-view">
      <div class="db-breadcrumb">
        <a href="#/db">Database</a>
        <span class="db-breadcrumb-sep">&gt;</span>
        <span>Tool Usage</span>
      </div>

      <ToolSummaryTable stats={stats} onFilterTool={handleFilterTool} />

      <ErrorRateChart stats={stats} />

      <div class="tu-recent-header">
        <h3 class="tu-recent-title">Recent Tool Calls</h3>
        <div class="tu-filters">
          <select
            class="db-filter-select"
            value={toolFilter}
            onChange={(e) => {
              setToolFilter((e.target as HTMLSelectElement).value);
              setPage(1);
              setExpandedId(null);
            }}
          >
            <option value="">All Tools</option>
            {distinctTools.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            class="db-filter-select"
            value={errorFilter}
            onChange={(e) => {
              setErrorFilter((e.target as HTMLSelectElement).value as any);
              setPage(1);
              setExpandedId(null);
            }}
          >
            <option value="">All</option>
            <option value="true">Errors Only</option>
            <option value="false">Success Only</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div class="jd-loading">Loading tool calls...</div>
      ) : toolCalls.length === 0 ? (
        <div class="jd-empty" style={{ padding: 24, textAlign: "center" }}>
          No tool calls found
        </div>
      ) : (
        <>
          <div class="tu-calls-list">
            {toolCalls.map((tc) => (
              <RecentToolCallRow
                key={tc.id}
                tc={tc}
                expanded={expandedId === tc.id}
                onToggle={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
              />
            ))}
          </div>

          <div class="db-pagination">
            <button
              class="db-pagination-btn"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              &lt; Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              class="db-pagination-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next &gt;
            </button>
          </div>
        </>
      )}
    </div>
  );
}
