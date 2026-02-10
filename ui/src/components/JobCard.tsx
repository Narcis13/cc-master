import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import type { JobEntry, HookEvent } from "../hooks/useJobs";
import { formatDuration, formatTokens } from "../lib/format";

const STATUS_LABELS: Record<string, string> = {
  running: "Running",
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
};

function formatActivity(event: HookEvent): string {
  if (event.event_type === "PreToolUse" && event.tool_name) {
    return `Using ${event.tool_name}...`;
  }
  if (event.event_type === "PostToolUse" && event.tool_name) {
    return `${event.tool_name} done`;
  }
  if (event.event_type === "PostToolUseFailure" && event.tool_name) {
    return `${event.tool_name} failed`;
  }
  if (event.event_type === "PreCompact") return "Compacting context...";
  if (event.event_type === "Stop") return "Thinking complete";
  return event.event_type;
}

export function JobCard({ job, activity }: { job: JobEntry; activity?: HookEvent }) {
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
    <div class={`job-card job-card--${job.status}`} onClick={() => { window.location.hash = `#/jobs/${job.id}`; }}>
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

      {activity && job.status === "running" && (
        <div class="job-activity">
          <span class="activity-indicator" />
          <span class="activity-text">{formatActivity(activity)}</span>
        </div>
      )}

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

      {(job.tool_call_count !== null || job.estimated_cost !== null) && (
        <div class="job-card-enrichments">
          {job.tool_call_count !== null && (
            <span class="enrichment-badge enrichment-badge--tools">{job.tool_call_count} tools</span>
          )}
          {job.primary_tool && (
            <span class="enrichment-badge enrichment-badge--primary">{job.primary_tool}</span>
          )}
          {job.failed_tool_calls !== null && job.failed_tool_calls > 0 && (
            <span class="enrichment-badge enrichment-badge--failed">
              <span class="failed-dot" />
              {job.failed_tool_calls} failed
            </span>
          )}
          {job.estimated_cost !== null && (
            <span class={`enrichment-badge enrichment-badge--cost ${
              job.estimated_cost < 0.5 ? "enrichment-badge--cost-low"
              : job.estimated_cost < 2 ? "enrichment-badge--cost-mid"
              : "enrichment-badge--cost-high"
            }`}>
              ${job.estimated_cost.toFixed(2)}
            </span>
          )}
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
