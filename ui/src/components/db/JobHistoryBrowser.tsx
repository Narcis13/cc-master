import { h, Fragment } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { formatDuration, formatTokens, formatRelativeTime } from "../../lib/format";

interface JobHistoryRecord {
  id: string;
  status: string;
  model: string;
  reasoning_effort: string;
  cwd: string;
  prompt: string;
  summary: string | null;
  session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  elapsed_ms: number;
  input_tokens: number;
  output_tokens: number;
  context_used_pct: number;
  context_window: number;
  estimated_cost: number | null;
  tool_call_count: number;
  failed_tool_calls: number;
  primary_tool: string | null;
  files_modified_count: number;
  message_count: number;
  user_message_count: number;
  has_session: number;
}

interface FilterState {
  status: string;
  model: string;
  reasoning: string;
  cost: string;
  date: string;
  has_session: string;
  search: string;
  search_mode: string;
  sort: string;
  order: "asc" | "desc";
  page: number;
}

interface ApiResult {
  jobs: JobHistoryRecord[];
  total: number;
  page: number;
  limit: number;
  aggregate: { total_cost: number; total_input: number; total_output: number };
}

const PAGE_SIZE = 50;

function costRange(cost: string): { cost_min?: string; cost_max?: string } {
  switch (cost) {
    case "<1": return { cost_min: "0", cost_max: "1" };
    case "1-5": return { cost_min: "1", cost_max: "5" };
    case "5-10": return { cost_min: "5", cost_max: "10" };
    case ">10": return { cost_min: "10" };
    default: return {};
  }
}

function dateToSince(date: string): string | undefined {
  if (date === "all") return undefined;
  const d = new Date();
  const days = date === "24h" ? 1 : date === "7d" ? 7 : date === "30d" ? 30 : date === "90d" ? 90 : 0;
  if (days === 0) return undefined;
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function parseHashParams(): Partial<FilterState> {
  const hash = window.location.hash;
  const qIdx = hash.indexOf("?");
  if (qIdx < 0) return {};
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const result: Partial<FilterState> = {};
  if (params.get("search")) result.search = params.get("search")!;
  if (params.get("search_mode")) result.search_mode = params.get("search_mode")!;
  if (params.get("status")) result.status = params.get("status")!;
  if (params.get("model")) result.model = params.get("model")!;
  return result;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span class={`db-status-badge db-status-badge--${status}`}>
      {status}
    </span>
  );
}

function SortHeader({
  label,
  field,
  sort,
  order,
  onSort,
}: {
  label: string;
  field: string;
  sort: string;
  order: "asc" | "desc";
  onSort: (field: string) => void;
}) {
  const isSorted = sort === field;
  return (
    <th
      class={`sortable ${isSorted ? "sorted" : ""}`}
      onClick={() => onSort(field)}
    >
      {label}
      {isSorted && (
        <span class="sort-indicator">{order === "asc" ? "▲" : "▼"}</span>
      )}
    </th>
  );
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
}) {
  const [localSearch, setLocalSearch] = useState(filters.search);

  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  const doSearch = () => {
    onChange({ search: localSearch, page: 1 });
  };

  return (
    <div class="db-filter-bar">
      <select
        class="db-filter-select"
        value={filters.status}
        onChange={(e) => onChange({ status: (e.target as HTMLSelectElement).value, page: 1 })}
      >
        <option value="">All Statuses</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
        <option value="running">Running</option>
      </select>

      <select
        class="db-filter-select"
        value={filters.model}
        onChange={(e) => onChange({ model: (e.target as HTMLSelectElement).value, page: 1 })}
      >
        <option value="">All Models</option>
        <option value="opus">Opus</option>
        <option value="sonnet">Sonnet</option>
      </select>

      <select
        class="db-filter-select"
        value={filters.reasoning}
        onChange={(e) => onChange({ reasoning: (e.target as HTMLSelectElement).value, page: 1 })}
      >
        <option value="">All Reasoning</option>
        <option value="xhigh">xhigh</option>
        <option value="high">high</option>
        <option value="medium">medium</option>
        <option value="low">low</option>
      </select>

      <select
        class="db-filter-select"
        value={filters.cost}
        onChange={(e) => onChange({ cost: (e.target as HTMLSelectElement).value, page: 1 })}
      >
        <option value="">All Costs</option>
        <option value="<1">{"< $1"}</option>
        <option value="1-5">$1 – $5</option>
        <option value="5-10">$5 – $10</option>
        <option value=">10">{"> $10"}</option>
      </select>

      <select
        class="db-filter-select"
        value={filters.date}
        onChange={(e) => onChange({ date: (e.target as HTMLSelectElement).value, page: 1 })}
      >
        <option value="all">All Time</option>
        <option value="24h">Last 24h</option>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
      </select>

      <select
        class="db-filter-select"
        value={filters.has_session}
        onChange={(e) => onChange({ has_session: (e.target as HTMLSelectElement).value, page: 1 })}
      >
        <option value="">Has Session: Any</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>

      <div class="db-filter-separator" />

      <select
        class="db-filter-select db-search-mode-select"
        value={filters.search_mode}
        onChange={(e) => onChange({ search_mode: (e.target as HTMLSelectElement).value, page: 1 })}
      >
        <option value="prompt">by Prompt</option>
        <option value="file">by File Path</option>
        <option value="tool">by Tool Name</option>
        <option value="summary">by Summary</option>
      </select>

      <input
        class="db-filter-search"
        type="text"
        placeholder="Search..."
        value={localSearch}
        onInput={(e) => setLocalSearch((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => e.key === "Enter" && doSearch()}
      />

      <button class="btn btn--primary btn--sm" onClick={doSearch}>
        Search
      </button>
    </div>
  );
}

function SummaryBar({
  total,
  aggregate,
}: {
  total: number;
  aggregate: { total_cost: number; total_input: number; total_output: number };
}) {
  return (
    <div class="db-summary-bar">
      <span>
        Showing <strong>{total.toLocaleString()}</strong> jobs
      </span>
      <span>
        <strong>${aggregate.total_cost.toFixed(2)}</strong> total cost
      </span>
      <span>
        <strong>{formatTokens(aggregate.total_input)}</strong> input /{" "}
        <strong>{formatTokens(aggregate.total_output)}</strong> output tokens
      </span>
    </div>
  );
}

function Pagination({
  page,
  total,
  limit,
  onPageChange,
}: {
  page: number;
  total: number;
  limit: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return (
    <div class="db-pagination">
      <button
        class="db-pagination-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        ← Prev
      </button>
      <span>
        Page {page} of {totalPages} ({limit} per page)
      </span>
      <button
        class="db-pagination-btn"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next →
      </button>
    </div>
  );
}

function BulkStats({ jobs }: { jobs: JobHistoryRecord[] }) {
  if (jobs.length === 0) return null;

  const avgCost =
    jobs.reduce((s, j) => s + (j.estimated_cost || 0), 0) / jobs.length;
  const avgTime = jobs.reduce((s, j) => s + j.elapsed_ms, 0) / jobs.length;
  const avgInput = jobs.reduce((s, j) => s + j.input_tokens, 0) / jobs.length;
  const avgOutput = jobs.reduce((s, j) => s + j.output_tokens, 0) / jobs.length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const finishedCount = jobs.filter((j) => j.status === "completed" || j.status === "failed").length;
  const successRate = finishedCount > 0 ? Math.round((completed / finishedCount) * 100) : 0;

  return (
    <div class="db-stat-cards db-bulk-stats">
      <div class="db-stat-card">
        <span class="db-stat-value">${avgCost.toFixed(2)}</span>
        <span class="db-stat-label">Avg Cost</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value">{formatDuration(avgTime)}</span>
        <span class="db-stat-label">Avg Time</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value">
          {formatTokens(Math.round(avgInput))} / {formatTokens(Math.round(avgOutput))}
        </span>
        <span class="db-stat-label">Avg Tokens (in/out)</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value">{successRate}%</span>
        <span class="db-stat-label">Success Rate</span>
      </div>
    </div>
  );
}

export function JobHistoryBrowser() {
  const hashParams = parseHashParams();

  const [filters, setFilters] = useState<FilterState>({
    status: hashParams.status || "",
    model: hashParams.model || "",
    reasoning: "",
    cost: "",
    date: "all",
    has_session: "",
    search: hashParams.search || "",
    search_mode: hashParams.search_mode || "prompt",
    sort: "completed_at",
    order: "desc",
    page: 1,
  });

  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.model) params.set("model", filters.model);
    if (filters.reasoning) params.set("reasoning", filters.reasoning);
    const cr = costRange(filters.cost);
    if (cr.cost_min) params.set("cost_min", cr.cost_min);
    if (cr.cost_max) params.set("cost_max", cr.cost_max);
    const since = dateToSince(filters.date);
    if (since) params.set("since", since);
    if (filters.has_session) params.set("has_session", filters.has_session);
    if (filters.search) {
      params.set("search", filters.search);
      params.set("search_mode", filters.search_mode);
    }
    params.set("sort", filters.sort);
    params.set("order", filters.order);
    params.set("page", String(filters.page));
    params.set("limit", String(PAGE_SIZE));

    setLoading(true);
    fetch(`/api/db/jobs?${params.toString()}`)
      .then((r) => r.json())
      .then((data: ApiResult) => {
        setResult(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const updateFilters = (patch: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const handleSort = (field: string) => {
    setFilters((prev) => ({
      ...prev,
      sort: field,
      order: prev.sort === field && prev.order === "desc" ? "asc" : "desc",
      page: 1,
    }));
  };

  return (
    <div class="db-job-history">
      <FilterBar filters={filters} onChange={updateFilters} />

      {result && <SummaryBar total={result.total} aggregate={result.aggregate} />}

      <div class="db-table-wrap">
        <table class="db-table">
          <thead>
            <tr>
              <th>ID</th>
              <SortHeader label="Status" field="elapsed_ms" sort={filters.sort} order={filters.order} onSort={handleSort} />
              <th>Model</th>
              <th>Prompt</th>
              <SortHeader label="Cost" field="estimated_cost" sort={filters.sort} order={filters.order} onSort={handleSort} />
              <SortHeader label="Tokens" field="input_tokens" sort={filters.sort} order={filters.order} onSort={handleSort} />
              <SortHeader label="Tools" field="tool_call_count" sort={filters.sort} order={filters.order} onSort={handleSort} />
              <SortHeader label="Files" field="files_modified_count" sort={filters.sort} order={filters.order} onSort={handleSort} />
              <SortHeader label="Date" field="completed_at" sort={filters.sort} order={filters.order} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {loading && !result ? (
              <tr>
                <td colSpan={9} class="cell-secondary" style={{ textAlign: "center", padding: "24px" }}>
                  Loading...
                </td>
              </tr>
            ) : result && result.jobs.length === 0 ? (
              <tr>
                <td colSpan={9} class="cell-secondary" style={{ textAlign: "center", padding: "24px" }}>
                  No jobs found matching filters
                </td>
              </tr>
            ) : (
              result?.jobs.map((job) => (
                <tr
                  key={job.id}
                  class="clickable"
                  onClick={() => (window.location.hash = `#/db/jobs/${job.id}`)}
                >
                  <td class="cell-mono">{job.id.slice(0, 8)}</td>
                  <td>
                    <StatusBadge status={job.status} />
                    <div class="cell-secondary" style={{ marginTop: "2px" }}>
                      {formatDuration(job.elapsed_ms)}
                    </div>
                  </td>
                  <td>
                    <div>{job.model}</div>
                    <div class="cell-secondary">{job.reasoning_effort}</div>
                  </td>
                  <td class="cell-truncate" title={job.prompt}>
                    {job.prompt ? job.prompt.slice(0, 50) + (job.prompt.length > 50 ? "..." : "") : "—"}
                  </td>
                  <td class="cell-mono">
                    {job.estimated_cost != null ? `$${job.estimated_cost.toFixed(2)}` : "—"}
                  </td>
                  <td>
                    <div class="cell-mono">
                      {formatTokens(job.input_tokens)} / {formatTokens(job.output_tokens)}
                    </div>
                    <div class="cell-secondary">
                      ctx: {Math.round(job.context_used_pct)}%
                    </div>
                  </td>
                  <td class="cell-mono">
                    {job.tool_call_count}
                    {job.primary_tool && (
                      <span class="cell-secondary"> ({job.primary_tool})</span>
                    )}
                  </td>
                  <td class="cell-mono">{job.files_modified_count}</td>
                  <td class="cell-secondary" style={{ whiteSpace: "nowrap" }}>
                    {job.completed_at
                      ? formatRelativeTime(job.completed_at)
                      : job.started_at
                      ? formatRelativeTime(job.started_at)
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {result && (
        <Pagination
          page={result.page}
          total={result.total}
          limit={result.limit}
          onPageChange={(p) => updateFilters({ page: p })}
        />
      )}

      {result && result.jobs.length > 0 && <BulkStats jobs={result.jobs} />}
    </div>
  );
}
