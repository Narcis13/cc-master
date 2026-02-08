import { h } from "preact";
import { useState } from "preact/hooks";
import type { HookEvent } from "../hooks/useJobs";

const EVENT_ICONS: Record<string, string> = {
  PreToolUse: ">>",
  PostToolUse: "<<",
  PostToolUseFailure: "!!",
  Stop: "[]",
  SessionStart: "[>",
  SessionEnd: "[x",
  Notification: "(!",
  PreCompact: "~~",
};

const EVENT_COLORS: Record<string, string> = {
  PreToolUse: "var(--status-running)",
  PostToolUse: "var(--status-complete)",
  PostToolUseFailure: "var(--status-failed)",
  Stop: "var(--text-secondary)",
  SessionStart: "var(--accent)",
  SessionEnd: "var(--text-secondary)",
  Notification: "var(--status-pending)",
  PreCompact: "var(--status-pending)",
};

function formatEventTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

function formatEventDetail(event: HookEvent): string {
  if (event.tool_name) {
    if (event.event_type === "PreToolUse") return `Calling ${event.tool_name}...`;
    if (event.event_type === "PostToolUse") return `${event.tool_name} completed`;
    if (event.event_type === "PostToolUseFailure") return `${event.tool_name} failed`;
  }
  if (event.event_type === "Stop") return "Agent finished thinking";
  if (event.event_type === "SessionStart") return "Session started";
  if (event.event_type === "SessionEnd") return "Session ended";
  if (event.event_type === "PreCompact") return "Context compacting...";
  if (event.event_type === "Notification") return event.data?.message || "Notification";
  return event.event_type;
}

type FilterType = "all" | "tools" | "lifecycle";

export function Timeline({
  events,
  jobId,
}: {
  events: HookEvent[];
  jobId?: string;
}) {
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = events.filter((e) => {
    if (jobId && e.job_id && e.job_id !== jobId) return false;
    if (filter === "tools") return e.event_type.includes("ToolUse");
    if (filter === "lifecycle") return !e.event_type.includes("ToolUse");
    return true;
  });

  return (
    <div class="timeline">
      <div class="timeline-header">
        <h3>Event Timeline</h3>
        <div class="timeline-filters">
          <button
            class={`timeline-filter-btn ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            class={`timeline-filter-btn ${filter === "tools" ? "active" : ""}`}
            onClick={() => setFilter("tools")}
          >
            Tools
          </button>
          <button
            class={`timeline-filter-btn ${filter === "lifecycle" ? "active" : ""}`}
            onClick={() => setFilter("lifecycle")}
          >
            Lifecycle
          </button>
        </div>
      </div>

      <div class="timeline-list">
        {filtered.length === 0 ? (
          <div class="timeline-empty">
            No events yet. Install hooks with <code>cc-agent setup-hooks</code>
          </div>
        ) : (
          filtered.map((event, i) => (
            <div key={`${event.timestamp}-${i}`} class="timeline-item">
              <span
                class="timeline-icon"
                style={{ color: EVENT_COLORS[event.event_type] || "var(--text-secondary)" }}
              >
                {EVENT_ICONS[event.event_type] || ".."}
              </span>
              <div class="timeline-content">
                <span class="timeline-detail">{formatEventDetail(event)}</span>
                {event.job_id && !jobId && (
                  <a class="timeline-job-link" href={`#/jobs/${event.job_id}`}>
                    {event.job_id.slice(0, 8)}
                  </a>
                )}
              </div>
              <span class="timeline-time">{formatEventTime(event.timestamp)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
