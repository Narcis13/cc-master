import { h, Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import type { JobEntry } from "../hooks/useJobs";
import { TerminalPanel } from "./TerminalPanel";
import { formatDuration, formatTokens, formatTime } from "../lib/format";

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
};

export function JobDetail({ jobId, jobs }: { jobId: string; jobs: JobEntry[] }) {
  const job = jobs.find((j) => j.id === jobId);
  const [elapsed, setElapsed] = useState(job?.elapsed_ms ?? 0);

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

  if (!job) {
    return (
      <div class="job-detail">
        <div class="detail-header">
          <a href="#/" class="back-link">← Dashboard</a>
        </div>
        <div class="empty-state">Job not found</div>
      </div>
    );
  }

  return (
    <div class="job-detail">
      <div class="detail-header">
        <a href="#/" class="back-link">← Dashboard</a>
        <div class="detail-title-row">
          <span class={`status-dot status-dot--${job.status}`} />
          <code class="job-id">{job.id}</code>
          <span class={`status-badge status-badge--${job.status}`}>
            {STATUS_LABELS[job.status] || job.status}
          </span>
          <span class="job-elapsed">{formatDuration(elapsed)}</span>
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
            </div>
          </div>

          <div class="detail-section">
            <h3>Prompt</h3>
            <pre class="prompt-display">{job.prompt}</pre>
          </div>

          <TerminalPanel jobId={jobId} />
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
