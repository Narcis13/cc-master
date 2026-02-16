import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { formatRelativeTime, formatAbsoluteTime } from "../lib/format";

interface ActivityEntry {
  id: number;
  action: string;
  details: string | null;
  trigger_id: number | null;
  queue_task_id: number | null;
  created_at: string;
}

const ACTION_ICONS: Record<string, string> = {
  trigger_fired: "\u26A1",
  queue_injected: "\u{1F4E5}",
  queue_processed: "\u2705",
  context_cleared: "\u{1F504}",
  respawned: "\u{1F504}",
  approval_approved: "\u2705",
  approval_rejected: "\u274C",
  approval_required: "\u{1F514}",
  orchestrator_started: "\u25B6\uFE0F",
  orchestrator_stopped: "\u23F9\uFE0F",
  prompt_injected: "\u{1F4AC}",
  task_completed: "\u2705",
  task_failed: "\u274C",
  mode_activated: "\u{1F3AF}",
  pulse_started: "\u{1F49A}",
  pulse_stopped: "\u{1F6D1}",
};

function formatDetails(details: string | null): string | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    if (typeof parsed === "object" && parsed !== null) {
      // Build a readable summary from the object
      const parts: string[] = [];
      for (const [key, val] of Object.entries(parsed)) {
        if (val === null || val === undefined) continue;
        const label = key.replace(/_/g, " ");
        const value = typeof val === "string" ? val : JSON.stringify(val);
        parts.push(`${label}: ${value}`);
      }
      return parts.join(" | ") || null;
    }
    return String(parsed);
  } catch {
    return details;
  }
}

function formatActionLabel(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ActivityFeed({ orchestratorEventVersion }: { orchestratorEventVersion: number }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  const fetchActivity = async () => {
    try {
      const res = await fetch("/api/triggers/activity?limit=50");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.activity || []);
      }
    } catch {}
  };

  // Fetch on mount and when SSE events arrive
  useEffect(() => {
    fetchActivity();
  }, [orchestratorEventVersion]);

  // Also poll as fallback
  useEffect(() => {
    const iv = setInterval(fetchActivity, 15000);
    return () => clearInterval(iv);
  }, []);

  // Auto-scroll to bottom when new entries arrive (if already at bottom)
  useEffect(() => {
    const el = listRef.current;
    if (el && wasAtBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  const handleScroll = () => {
    const el = listRef.current;
    if (el) {
      wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    }
  };

  const icon = (action: string) => ACTION_ICONS[action] || "\u2022";

  // Show entries in chronological order (oldest first = log style)
  const sorted = [...entries].reverse();

  return (
    <div class={`activity-log ${collapsed ? "activity-log--collapsed" : ""}`}>
      <div class="activity-log-header" onClick={() => setCollapsed(!collapsed)} style={{ cursor: "pointer" }}>
        <span class="activity-log-title">
          <span class="activity-log-chevron">{collapsed ? "\u25B6" : "\u25BC"}</span>
          Activity Log
        </span>
        <span class="activity-log-count">{entries.length} entries</span>
      </div>
      {!collapsed && (
        <div class="activity-log-list" ref={listRef} onScroll={handleScroll}>
          {sorted.length === 0 ? (
            <div class="activity-log-empty">No activity recorded yet</div>
          ) : (
            sorted.map((e) => {
              const details = formatDetails(e.details);
              return (
                <div key={e.id} class="activity-log-row">
                  <span class="activity-log-time" title={e.created_at}>
                    {formatAbsoluteTime(e.created_at)}
                  </span>
                  <span class="activity-log-icon">{icon(e.action)}</span>
                  <span class="activity-log-action">{formatActionLabel(e.action)}</span>
                  {details && <span class="activity-log-details">{details}</span>}
                  <span class="activity-log-relative">{formatRelativeTime(e.created_at)}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
