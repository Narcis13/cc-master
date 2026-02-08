import { h } from "preact";
import { useState } from "preact/hooks";
import type { Notification } from "../hooks/useJobs";

const SEVERITY_ICONS: Record<string, string> = {
  info: "[i]",
  success: "[*]",
  warning: "[!]",
  error: "[!]",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "var(--status-running)",
  success: "var(--status-complete)",
  warning: "var(--status-pending)",
  error: "var(--status-failed)",
};

type FilterCategory = "all" | "completions" | "errors" | "info";

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function NotificationCenter({
  notifications,
  onMarkAllRead,
  onDismiss,
  onMarkRead,
}: {
  notifications: Notification[];
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
}) {
  const [filter, setFilter] = useState<FilterCategory>("all");

  const filtered = notifications.filter((n) => {
    if (filter === "completions") return n.type === "agent_completed";
    if (filter === "errors") return n.severity === "error";
    if (filter === "info") return n.severity === "info";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div class="notification-center">
      <div class="notification-header">
        <h3>Notifications</h3>
        <div class="notification-actions">
          {unreadCount > 0 && (
            <span class="notification-unread-count">{unreadCount} unread</span>
          )}
          <button class="btn btn--ghost btn--sm" onClick={onMarkAllRead}>
            Mark all read
          </button>
        </div>
      </div>

      <div class="notification-filters">
        {(["all", "completions", "errors", "info"] as const).map((f) => (
          <button
            key={f}
            class={`timeline-filter-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div class="notification-list">
        {filtered.length === 0 ? (
          <div class="timeline-empty">No notifications</div>
        ) : (
          filtered.map((notif) => (
            <div
              key={notif.id}
              class={`notification-item ${notif.read ? "read" : "unread"}`}
              onClick={() => {
                onMarkRead(notif.id);
                if (notif.jobId) window.location.hash = `#/jobs/${notif.jobId}`;
              }}
            >
              <span
                class="notification-icon"
                style={{ color: SEVERITY_COLORS[notif.severity] }}
              >
                {SEVERITY_ICONS[notif.severity]}
              </span>
              <div class="notification-body">
                <div class="notification-title">{notif.title}</div>
                <div class="notification-message">{notif.message}</div>
              </div>
              <div class="notification-meta">
                <span class="notification-time">{timeAgo(notif.timestamp)}</span>
                <button
                  class="notification-dismiss"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(notif.id);
                  }}
                >
                  x
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
