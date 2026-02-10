import { h, Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import type { JobEntry, HookEvent } from "../hooks/useJobs";
import { SessionTabs } from "./SessionTabs";
import { CostBadge } from "./CostBadge";
import { Timeline } from "./Timeline";
import { formatDuration, formatTokens, formatTime } from "../lib/format";

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
};

export function JobDetail({
  jobId,
  jobs,
  hookEvents,
}: {
  jobId: string;
  jobs: JobEntry[];
  hookEvents?: HookEvent[];
}) {
  const job = jobs.find((j) => j.id === jobId);
  const [elapsed, setElapsed] = useState(job?.elapsed_ms ?? 0);
  const [confirmKill, setConfirmKill] = useState(false);
  const [killing, setKilling] = useState(false);

  // Filter hook events for this job
  const jobEvents = (hookEvents || []).filter((e) => e.job_id === jobId);

  // Live-tick elapsed for running jobs
  useEffect(() => {
    if (!job || job.status !== "running") {
      if (job) setElapsed(job.elapsed_ms);
      return;
    }
    setElapsed(job.elapsed_ms);
    const interval = setInterval(() => setElapsed((p) => p + 1000), 1000);
    return () => clearInterval(interval);
  }, [job?.id, job?.status, job?.elapsed_ms]);

  const doKill = async () => {
    setKilling(true);
    try {
      await fetch(`/api/actions/jobs/${jobId}/kill`, { method: "POST" });
    } finally {
      setKilling(false);
      setConfirmKill(false);
    }
  };

  if (!job) {
    return (
      <div class="job-detail">
        <div class="detail-header">
          <a href="#/" class="back-link">&larr; Dashboard</a>
        </div>
        <div class="empty-state">Job not found</div>
      </div>
    );
  }

  const isRunning = job.status === "running";

  return (
    <div class="job-detail">
      <div class="detail-header">
        <a href="#/" class="back-link">&larr; Dashboard</a>
        <div class="detail-title-row">
          <span class={`status-dot status-dot--${job.status}`} />
          <code class="job-id">{job.id}</code>
          <span class={`status-badge status-badge--${job.status}`}>
            {STATUS_LABELS[job.status] || job.status}
          </span>
          <span class="job-elapsed">{formatDuration(elapsed)}</span>
          <CostBadge cost={job.estimated_cost} />
          {isRunning && (
            <>
              {confirmKill ? (
                <span class="kill-confirm">
                  <span class="kill-confirm-text">Kill this agent?</span>
                  <button class="btn btn--danger btn--sm" onClick={doKill} disabled={killing}>
                    {killing ? "Killing..." : "Yes, Kill"}
                  </button>
                  <button class="btn btn--ghost btn--sm" onClick={() => setConfirmKill(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button class="btn btn--danger-outline btn--sm" onClick={() => setConfirmKill(true)}>
                  Kill
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div class="detail-body">
        <div class="detail-main">
          <div class="detail-section">
            <h3>Info</h3>
            <div class="detail-info-grid">
              <span class="info-label">Model</span>
              <span>{job.model} / {job.reasoning}</span>
              <span class="info-label">Directory</span>
              <span class="info-cwd">{job.cwd}</span>
              {job.started_at && (
                <>
                  <span class="info-label">Started</span>
                  <span>{formatTime(job.started_at)}</span>
                </>
              )}
              {job.completed_at && (
                <>
                  <span class="info-label">Ended</span>
                  <span>{formatTime(job.completed_at)}</span>
                </>
              )}
              {job.tool_call_count !== null && (
                <>
                  <span class="info-label">Tool Calls</span>
                  <span>
                    {job.tool_call_count}
                    {job.failed_tool_calls !== null && job.failed_tool_calls > 0 && (
                      <span class="session-failed-count">
                        {" "}({job.failed_tool_calls} failed)
                      </span>
                    )}
                  </span>
                </>
              )}
            </div>
          </div>

          <div class="detail-section">
            <h3>Prompt</h3>
            <pre class="prompt-display">{job.prompt}</pre>
          </div>

          <SessionTabs
            jobId={jobId}
            isRunning={isRunning}
            hasSession={job.has_session ?? false}
            estimatedCost={job.estimated_cost}
          />
        </div>

        <div class="detail-sidebar">
          {job.tokens && (
            <div class="detail-section">
              <h3>Token Usage</h3>
              <div class="token-detail">
                <div class="token-row">
                  <span class="token-label">Input</span>
                  <span class="token-in">{formatTokens(job.tokens.input)}</span>
                </div>
                <div class="token-row">
                  <span class="token-label">Output</span>
                  <span class="token-out">{formatTokens(job.tokens.output)}</span>
                </div>
                <div class="token-row">
                  <span class="token-label">Total</span>
                  <span>{formatTokens(job.tokens.input + job.tokens.output)}</span>
                </div>
                <div class="context-bar-lg">
                  <div
                    class="context-bar-fill"
                    style={{ width: `${Math.min(job.tokens.context_used_pct, 100)}%` }}
                  />
                </div>
                <span class="context-pct-lg">
                  {job.tokens.context_used_pct.toFixed(1)}% of{" "}
                  {formatTokens(job.tokens.context_window)} context
                </span>
              </div>
            </div>
          )}

          {jobEvents.length > 0 && (
            <div class="detail-section detail-section--timeline">
              <Timeline events={jobEvents} jobId={jobId} />
            </div>
          )}

          {job.files_modified && job.files_modified.length > 0 && (
            <div class="detail-section">
              <h3>Files Modified ({job.files_modified.length})</h3>
              <ul class="files-list">
                {job.files_modified.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {job.summary && (
            <div class="detail-section">
              <h3>Summary</h3>
              <p class="summary-text">{job.summary}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
