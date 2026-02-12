import { h, Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { TerminalPanel } from "./TerminalPanel";
import { MessageInput } from "./MessageInput";

interface OrchestratorStatus {
  running: boolean;
  idle: boolean;
  state: {
    current_task: string | null;
    active_agents: string[];
    completed_tasks: Array<{ id: number; description: string; result: string; completed_at: string }>;
    pending_tasks: string[];
    notes: string;
    last_saved: string;
  } | null;
  contextPct?: number;
  contextClearState?: string;
}

export function OrchestratorPanel() {
  const [status, setStatus] = useState<OrchestratorStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/orchestrator/status");
      if (res.ok) setStatus(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 3000);
    return () => clearInterval(iv);
  }, []);

  const doStart = async () => {
    setStarting(true);
    try {
      await fetch("/api/orchestrator/start", { method: "POST" });
      // Give it a moment to spin up
      setTimeout(fetchStatus, 1500);
    } finally {
      setStarting(false);
    }
  };

  const doStop = async () => {
    setStopping(true);
    try {
      await fetch("/api/orchestrator/stop", { method: "POST" });
      setTimeout(fetchStatus, 500);
    } finally {
      setStopping(false);
      setConfirmStop(false);
    }
  };

  const isRunning = status?.running ?? false;
  const contextPct = status?.contextPct ?? 0;
  const clearState = status?.contextClearState ?? "idle";

  return (
    <div class="orch-panel">
      {/* Header bar */}
      <div class="orch-panel-header">
        <div class="orch-panel-title">
          <span class={`status-dot ${isRunning ? "status-dot--running" : "status-dot--failed"}`} />
          <span>Orchestrator</span>
          {isRunning && (
            <span class={`orch-idle-badge ${status?.idle ? "orch-idle" : "orch-busy"}`}>
              {status?.idle ? "Idle" : "Working"}
            </span>
          )}
        </div>
        <div class="orch-panel-actions">
          {!isRunning ? (
            <button class="btn btn--primary btn--sm" onClick={doStart} disabled={starting}>
              {starting ? "Starting..." : "Start Orchestrator"}
            </button>
          ) : confirmStop ? (
            <span class="kill-confirm">
              <span class="kill-confirm-text">Stop orchestrator?</span>
              <button class="btn btn--danger btn--sm" onClick={doStop} disabled={stopping}>
                {stopping ? "Stopping..." : "Yes, Stop"}
              </button>
              <button class="btn btn--ghost btn--sm" onClick={() => setConfirmStop(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button class="btn btn--danger-outline btn--sm" onClick={() => setConfirmStop(true)}>
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Context bar */}
      {isRunning && (
        <div class="orch-context-row">
          <span class="orch-context-label">Context</span>
          <div class="orch-context-bar">
            <div
              class={`orch-context-fill ${
                contextPct >= 80 ? "orch-ctx-danger" : contextPct >= 60 ? "orch-ctx-warn" : ""
              }`}
              style={{ width: `${Math.min(contextPct, 100)}%` }}
            />
          </div>
          <span class="orch-context-pct">{contextPct.toFixed(0)}%</span>
          {clearState !== "idle" && (
            <span class="orch-clear-badge">{clearState}</span>
          )}
        </div>
      )}

      {/* State info */}
      {isRunning && status?.state && (
        <div class="orch-state-info">
          {status.state.current_task && (
            <div class="orch-state-row">
              <span class="orch-state-label">Task</span>
              <span class="orch-state-value">{status.state.current_task}</span>
            </div>
          )}
          {status.state.active_agents.length > 0 && (
            <div class="orch-state-row">
              <span class="orch-state-label">Agents</span>
              <span class="orch-state-value">
                {status.state.active_agents.map((a) => (
                  <code key={a} class="orch-agent-id">{a}</code>
                ))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Terminal or empty state */}
      {isRunning ? (
        <>
          <div class="orch-terminal-wrap">
            <TerminalPanel jobId="orch" />
          </div>
          <MessageInput jobId="orch" />
        </>
      ) : (
        <div class="orch-empty">
          <div class="orch-empty-text">
            Orchestrator is not running. Start it to begin autonomous task processing.
          </div>
        </div>
      )}
    </div>
  );
}
