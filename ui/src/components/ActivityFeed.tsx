import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { formatRelativeTime } from "../lib/format";

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
  context_cleared: "\u{1F504}",
  respawned: "\u{1F504}",
  approval_approved: "\u2705",
  approval_rejected: "\u274C",
  orchestrator_started: "\u25B6",
  orchestrator_stopped: "\u23F9",
  task_completed: "\u2705",
  task_failed: "\u274C",
  mode_activated: "\u{1F3AF}",
};

const ACTION_LABELS: Record<string, string> = {
  trigger_fired: "Trigger Fired",
  queue_injected: "Queue Injected",
  context_cleared: "Context Cleared",
  respawned: "Respawned",
  approval_approved: "Approved",
  approval_rejected: "Rejected",
  orchestrator_started: "Started",
  orchestrator_stopped: "Stopped",
  task_completed: "Task Done",
  task_failed: "Task Failed",
  mode_activated: "Mode Activated",
};

export function ActivityFeed({ orchestratorEventVersion }: { orchestratorEventVersion: number }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

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

  const icon = (action: string) => ACTION_ICONS[action] || "\u2022";
  const label = (action: string) => ACTION_LABELS[action] || action.replace(/_/g, " ");

  return (
    <div class="config-panel activity-feed">
      <div class="config-panel-header" onClick={() => setCollapsed(!collapsed)} style={{ cursor: "pointer" }}>
        <span class="config-panel-title">
          Activity {entries.length > 0 && <span class="activity-count">({entries.length})</span>}
        </span>
        <span class="activity-toggle">{collapsed ? "\u25B6" : "\u25BC"}</span>
      </div>

      {!collapsed && (
        <div class="activity-list" ref={listRef}>
          {entries.length === 0 ? (
            <div class="config-empty">No activity yet</div>
          ) : (
            entries.map((e) => (
              <div key={e.id} class="activity-item">
                <span class="activity-icon">{icon(e.action)}</span>
                <div class="activity-content">
                  <span class="activity-label">{label(e.action)}</span>
                  {e.details && <span class="activity-details">{e.details}</span>}
                </div>
                <span class="config-time">{formatRelativeTime(e.created_at)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
