/** @jsxRuntime classic */
import { h } from "preact";
import type { JobEntry } from "../hooks/useJobs";
import { formatDuration, formatTime } from "../lib/format";

export function PipelineView({ jobs }: { jobs: JobEntry[] }) {
  // Sort by start time ascending for timeline layout
  const sorted = [...jobs]
    .filter((j) => j.started_at)
    .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime());

  if (sorted.length === 0) {
    return (
      <div class="pipeline">
        <div class="pipeline-header">
          <h3>Pipeline Timeline</h3>
          <a href="#/" class="back-link">&larr; Back</a>
        </div>
        <div class="empty-state">No jobs with timing data yet.</div>
      </div>
    );
  }

  // Calculate time bounds
  const minTime = new Date(sorted[0].started_at!).getTime();
  const maxTime = Math.max(
    ...sorted.map((j) => {
      if (j.completed_at) return new Date(j.completed_at).getTime();
      return new Date(j.started_at!).getTime() + j.elapsed_ms;
    })
  );
  const totalSpan = Math.max(maxTime - minTime, 60000); // At least 1 minute

  return (
    <div class="pipeline">
      <div class="pipeline-header">
        <h3>Pipeline Timeline</h3>
        <a href="#/" class="back-link">&larr; Back</a>
      </div>

      <div class="pipeline-chart">
        {/* Time axis */}
        <div class="pipeline-axis">
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const t = new Date(minTime + totalSpan * pct);
            return (
              <span key={pct} class="pipeline-tick" style={{ left: `${pct * 100}%` }}>
                {formatTime(t.toISOString())}
              </span>
            );
          })}
        </div>

        {/* Job bars */}
        {sorted.map((job) => {
          const start = new Date(job.started_at!).getTime();
          const end = job.completed_at
            ? new Date(job.completed_at).getTime()
            : start + job.elapsed_ms;
          const leftPct = Math.min(((start - minTime) / totalSpan) * 100, 99);
          const widthPct = Math.min(Math.max(((end - start) / totalSpan) * 100, 1), 100 - leftPct);

          const statusColor =
            job.status === "running"
              ? "var(--status-running)"
              : job.status === "completed"
                ? "var(--status-complete)"
                : job.status === "failed"
                  ? "var(--status-failed)"
                  : "var(--status-pending)";

          return (
            <div key={job.id} class="pipeline-row">
              <a href={`#/jobs/${job.id}`} class="pipeline-bar-link">
                <div
                  class={`pipeline-bar pipeline-bar--${job.status}`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: statusColor,
                  }}
                >
                  <span class="pipeline-bar-label">
                    {job.id.slice(0, 8)} — {formatDuration(job.elapsed_ms)}
                  </span>
                </div>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
