import { h } from "preact";
import { useState, useEffect } from "preact/hooks";

interface PulseStatus {
  running: boolean;
  last_tick: string | null;
  next_tick: string | null;
  queue_depth: number;
  active_triggers: number;
  pending_approvals: number;
  orchestrator_running: boolean;
}

export function PulseIndicator({ eventVersion = 0 }: { eventVersion?: number } = {}) {
  const [status, setStatus] = useState<PulseStatus | null>(null);
  const [toggling, setToggling] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/pulse/status");
      if (res.ok) setStatus(await res.json());
    } catch {}
  };

  // SSE-driven refetch
  useEffect(() => { fetchStatus(); }, [eventVersion]);

  // Slow polling fallback
  useEffect(() => {
    const iv = setInterval(fetchStatus, 30000);
    return () => clearInterval(iv);
  }, []);

  const toggle = async () => {
    if (!status || toggling) return;
    setToggling(true);
    try {
      const endpoint = status.running ? "/api/pulse/stop" : "/api/pulse/start";
      await fetch(endpoint, { method: "POST" });
      await fetchStatus();
    } finally {
      setToggling(false);
    }
  };

  const timeSince = (iso: string | null): string => {
    if (!iso) return "never";
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 1000) return "just now";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    return `${Math.floor(s / 60)}m ago`;
  };

  if (!status) return null;

  return (
    <div class="pulse-indicator">
      <button
        class={`pulse-dot-btn ${status.running ? "pulse-active" : "pulse-stopped"}`}
        onClick={toggle}
        disabled={toggling}
        title={status.running ? "Pulse running — click to stop" : "Pulse stopped — click to start"}
      >
        <span class={`pulse-dot-icon ${status.running ? "pulse-dot-icon--active" : ""}`} />
        <span class="pulse-label">{status.running ? "Pulse ON" : "Pulse OFF"}</span>
      </button>
      {status.running && (
        <span class="pulse-meta">
          Last tick: {timeSince(status.last_tick)}
          {status.queue_depth > 0 && (
            <span class="pulse-badge">{status.queue_depth} queued</span>
          )}
          {status.pending_approvals > 0 && (
            <span class="pulse-badge pulse-badge--warn">{status.pending_approvals} pending</span>
          )}
        </span>
      )}
    </div>
  );
}
