import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import type { JobEntry } from "../hooks/useJobs";
import { formatDuration, formatTokens } from "../lib/format";

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
};

export function JobCard({ job }: { job: JobEntry }) {
  const [elapsed, setElapsed] = useState(job.elapsed_ms);

  // Live-tick elapsed for running jobs
  useEffect(() => {
    if (job.status !== "running") {
      setElapsed(job.elapsed_ms);
      return;
    }
    setElapsed(job.elapsed_ms);
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [job.id, job.status, job.elapsed_ms]);

  return (
    <div class={`job-card job-card--${job.status}`}>
      <div class="job-card-header">
        <div class="job-card-id-row">
          <span class={`status-dot status-dot--${job.status}`} />
          <code class="job-id">{job.id}</code>
          <span class={`status-badge status-badge--${job.status}`}>
            {STATUS_LABELS[job.status] || job.status}
          </span>
        </div>
        <span class="job-elapsed">{formatDuration(elapsed)}</span>
      </div>

      <div class="job-card-meta">
        <span>{job.model}</span>
        <span class="meta-sep">/</span>
        <span>{job.reasoning}</span>
      </div>

      <p class="job-prompt">{job.prompt}</p>

      {job.tokens && (
        <div class="job-tokens">
          <div class="token-counts">
            <span class="token-in">{formatTokens(job.tokens.input)} in</span>
            <span class="token-out">{formatTokens(job.tokens.output)} out</span>
          </div>
          <div class="context-bar">
            <div
              class="context-bar-fill"
              style={{ width: `${Math.min(job.tokens.context_used_pct, 100)}%` }}
            />
          </div>
          <span class="context-pct">{job.tokens.context_used_pct.toFixed(0)}%</span>
        </div>
      )}

      {job.files_modified && job.files_modified.length > 0 && (
        <div class="job-files">
          {job.files_modified.length} file{job.files_modified.length !== 1 ? "s" : ""} modified
        </div>
      )}

      {job.summary && <p class="job-summary">{job.summary}</p>}

      {job.status === "failed" && job.prompt && (
        <p class="job-error">Failed</p>
      )}
    </div>
  );
}
