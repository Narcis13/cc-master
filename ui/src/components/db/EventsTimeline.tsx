import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";

interface EventRecord {
  id: number;
  timestamp: string;
  job_id: string;
  event_type: string;
  tool_name: string | null;
  file_path: string | null;
  data_json: string | null;
}

interface EventsResponse {
  events: EventRecord[];
  total: number;
  stats: { by_type: Record<string, number> };
}

// --- EventFilterBar ---
function EventFilterBar({
  jobId,
  eventType,
  toolName,
  filePath,
  jobIds,
  eventTypes,
  toolNames,
  onJobIdChange,
  onEventTypeChange,
  onToolNameChange,
  onFilePathChange,
}: {
  jobId: string;
  eventType: string;
  toolName: string;
  filePath: string;
  jobIds: string[];
  eventTypes: string[];
  toolNames: string[];
  onJobIdChange: (v: string) => void;
  onEventTypeChange: (v: string) => void;
  onToolNameChange: (v: string) => void;
  onFilePathChange: (v: string) => void;
}) {
  return (
    <div class="db-filter-bar">
      <select
        class="db-filter-select"
        value={jobId}
        onChange={(e) => onJobIdChange((e.target as HTMLSelectElement).value)}
      >
        <option value="">All Jobs</option>
        {jobIds.map((id) => (
          <option key={id} value={id}>
            {id.slice(0, 8)}
          </option>
        ))}
      </select>

      <select
        class="db-filter-select"
        value={eventType}
        onChange={(e) => onEventTypeChange((e.target as HTMLSelectElement).value)}
      >
        <option value="">All Types</option>
        {eventTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        class="db-filter-select"
        value={toolName}
        onChange={(e) => onToolNameChange((e.target as HTMLSelectElement).value)}
      >
        <option value="">All Tools</option>
        {toolNames.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <div class="db-filter-separator" />

      <input
        class="db-filter-search"
        type="text"
        placeholder="Search file path..."
        value={filePath}
        onInput={(e) => onFilePathChange((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
    </div>
  );
}

// --- EventStats ---
function EventStats({ stats, total }: { stats: Record<string, number>; total: number }) {
  const toolUse = stats["tool_use"] || 0;
  const fileWrite = stats["file_write"] || 0;
  const errors = stats["error"] || 0;

  return (
    <div class="db-stat-cards" style={{ marginBottom: "16px" }}>
      <div class="db-stat-card">
        <span class="db-stat-value">{total.toLocaleString()}</span>
        <span class="db-stat-label">Total Events</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value">{toolUse.toLocaleString()}</span>
        <span class="db-stat-label">tool_use</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value">{fileWrite.toLocaleString()}</span>
        <span class="db-stat-label">file_write</span>
      </div>
      <div class="db-stat-card">
        <span class="db-stat-value db-events-error-value">{errors.toLocaleString()}</span>
        <span class="db-stat-label">Errors</span>
      </div>
    </div>
  );
}

// --- EventDetail ---
function EventDetail({
  event,
  onClose,
}: {
  event: EventRecord;
  onClose: () => void;
}) {
  let parsedJson: string;
  try {
    parsedJson = event.data_json
      ? JSON.stringify(JSON.parse(event.data_json), null, 2)
      : "null";
  } catch {
    parsedJson = event.data_json || "null";
  }

  return (
    <div class="db-detail-panel">
      <div class="db-detail-header">
        <span class="db-detail-header-title">
          Event #{event.id}: {event.event_type}
        </span>
        <button class="db-detail-close" onClick={onClose}>
          x
        </button>
      </div>
      <div class="db-detail-body">
        <div class="db-events-detail-meta">
          <span>
            Job:{" "}
            <a href={`#/db/jobs/${event.job_id}`} class="db-events-job-link">
              {event.job_id.slice(0, 8)}
            </a>
          </span>
          <span>Time: {new Date(event.timestamp).toLocaleString()}</span>
          {event.file_path && <span>File: {event.file_path}</span>}
          {event.tool_name && <span>Tool: {event.tool_name}</span>}
        </div>

        <div class="db-detail-block">
          <span class="db-detail-block-label">Data</span>
          <pre class="db-detail-block-content">{parsedJson}</pre>
        </div>

        <a href={`#/db/jobs/${event.job_id}`} class="db-events-view-job-link">
          View Job &rarr;
        </a>
      </div>
    </div>
  );
}

// --- EventsTable ---
function EventsTable({
  events,
  total,
  page,
  limit,
  expandedId,
  onToggle,
  onPageChange,
}: {
  events: EventRecord[];
  total: number;
  page: number;
  limit: number;
  expandedId: number | null;
  onToggle: (id: number) => void;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <div class="db-table-wrap">
        <table class="db-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Job ID</th>
              <th>Event Type</th>
              <th>Tool / File</th>
              <th class="db-events-data-col">Data</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "24px" }}>
                  No events found
                </td>
              </tr>
            )}
            {events.map((ev) => {
              const isExpanded = expandedId === ev.id;
              const toolOrFile = ev.file_path || ev.tool_name || "-";
              const dataPreview = ev.data_json
                ? ev.data_json.length > 50
                  ? ev.data_json.slice(0, 50) + "..."
                  : ev.data_json
                : "-";

              return (
                <tr
                  key={ev.id}
                  class={`clickable ${isExpanded ? "db-events-row-expanded" : ""}`}
                  onClick={() => onToggle(ev.id)}
                >
                  <td class="cell-mono">{formatTimestamp(ev.timestamp)}</td>
                  <td>
                    <a
                      href={`#/db/jobs/${ev.job_id}`}
                      class="db-events-job-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ev.job_id.slice(0, 8)}
                    </a>
                  </td>
                  <td>
                    <span class={`db-events-type-badge db-events-type-badge--${ev.event_type}`}>
                      {ev.event_type}
                    </span>
                  </td>
                  <td class="cell-truncate">{toolOrFile}</td>
                  <td class="cell-secondary cell-truncate db-events-data-col">{dataPreview}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedId !== null && (
        (() => {
          const ev = events.find((e) => e.id === expandedId);
          return ev ? (
            <EventDetail event={ev} onClose={() => onToggle(expandedId)} />
          ) : null;
        })()
      )}

      <div class="db-pagination">
        <button
          class="db-pagination-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          &lt; Prev
        </button>
        <span>
          Page {page} of {totalPages} ({total} total)
        </span>
        <button
          class="db-pagination-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next &gt;
        </button>
      </div>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

// --- Main EventsTimeline ---
export function EventsTimeline() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [jobId, setJobId] = useState("");
  const [eventType, setEventType] = useState("");
  const [toolName, setToolName] = useState("");
  const [filePath, setFilePath] = useState("");
  const [filePathDebounced, setFilePathDebounced] = useState("");

  // Distinct values for dropdowns
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [toolNames, setToolNames] = useState<string[]>([]);

  // Debounce file path input
  useEffect(() => {
    const t = setTimeout(() => setFilePathDebounced(filePath), 300);
    return () => clearTimeout(t);
  }, [filePath]);

  // Single fetch driven by all filter state (using debounced file path)
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "50");
      if (jobId) params.set("job_id", jobId);
      if (eventType) params.set("event_type", eventType);
      if (toolName) params.set("tool_name", toolName);
      if (filePathDebounced) params.set("file_path", filePathDebounced);

      const res = await fetch(`/api/db/events?${params.toString()}`);
      const data: EventsResponse = await res.json();
      setEvents(data.events);
      setTotal(data.total);
      setStats(data.stats.by_type);

      // Populate dropdown options from stats and current page data
      if (Object.keys(data.stats.by_type).length > 0) {
        setEventTypes(Object.keys(data.stats.by_type).sort());
      }
      const jids = new Set<string>();
      const tnames = new Set<string>();
      for (const ev of data.events) {
        jids.add(ev.job_id);
        if (ev.tool_name) tnames.add(ev.tool_name);
      }
      setJobIds((prev) => [...new Set([...prev, ...jids])].sort());
      setToolNames((prev) => [...new Set([...prev, ...tnames])].sort());
    } catch (err) {
      console.error("Failed to fetch events:", err);
    } finally {
      setLoading(false);
    }
  }, [page, jobId, eventType, toolName, filePathDebounced]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Reset page + collapse when dropdown filters change
  const handleJobIdChange = (v: string) => {
    setJobId(v);
    setPage(1);
    setExpandedId(null);
  };
  const handleEventTypeChange = (v: string) => {
    setEventType(v);
    setPage(1);
    setExpandedId(null);
  };
  const handleToolNameChange = (v: string) => {
    setToolName(v);
    setPage(1);
    setExpandedId(null);
  };
  const handleFilePathChange = (v: string) => {
    setFilePath(v);
    setPage(1);
    setExpandedId(null);
  };

  const handleToggle = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    setExpandedId(null);
  };

  const totalFromStats = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div class="db-events-timeline">
      <div class="db-breadcrumb">
        <a href="#/db">Database</a>
        <span class="db-breadcrumb-sep">&gt;</span>
        Events
      </div>

      <EventFilterBar
        jobId={jobId}
        eventType={eventType}
        toolName={toolName}
        filePath={filePath}
        jobIds={jobIds}
        eventTypes={eventTypes}
        toolNames={toolNames}
        onJobIdChange={handleJobIdChange}
        onEventTypeChange={handleEventTypeChange}
        onToolNameChange={handleToolNameChange}
        onFilePathChange={handleFilePathChange}
      />

      <EventStats stats={stats} total={totalFromStats || total} />

      {loading && events.length === 0 ? (
        <div class="empty-state">Loading events...</div>
      ) : (
        <EventsTable
          events={events}
          total={total}
          page={page}
          limit={50}
          expandedId={expandedId}
          onToggle={handleToggle}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
