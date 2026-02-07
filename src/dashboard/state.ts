// Dashboard state manager: watches jobs directory, maintains in-memory state,
// emits events on changes for SSE broadcasting.

import { EventEmitter } from "events";
import { watch, type FSWatcher } from "fs";
import { config } from "../config.ts";
import { getJobsJson, loadJob, refreshJobStatus, type JobsJsonEntry, type JobsJsonOutput } from "../jobs.ts";
import { mkdirSync } from "fs";

export type StateEvent =
  | { type: "snapshot"; jobs: JobsJsonEntry[]; metrics: DashboardMetrics }
  | { type: "job_updated"; job: JobsJsonEntry }
  | { type: "job_created"; job: JobsJsonEntry }
  | { type: "job_completed"; job: JobsJsonEntry }
  | { type: "job_failed"; job: JobsJsonEntry }
  | { type: "metrics_update"; metrics: DashboardMetrics };

export interface DashboardMetrics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  averageJobDurationMs: number;
  uptimeMs: number;
}

export class DashboardState extends EventEmitter {
  private jobs: Map<string, JobsJsonEntry> = new Map();
  private watcher: FSWatcher | null = null;
  private refreshTimer: Timer | null = null;
  private startedAt = Date.now();
  private debounceTimer: Timer | null = null;

  start() {
    // Initial load
    this.refresh();

    // Watch jobs directory for changes
    mkdirSync(config.jobsDir, { recursive: true });
    this.watcher = watch(config.jobsDir, (_eventType, _filename) => {
      // Debounce: multiple file changes happen rapidly during job updates
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.refresh(), 200);
    });

    // Periodic refresh for running jobs (catches tmux session completion)
    this.refreshTimer = setInterval(() => this.refresh(), 5000);
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  getSnapshot(): { jobs: JobsJsonEntry[]; metrics: DashboardMetrics } {
    return {
      jobs: Array.from(this.jobs.values()),
      metrics: this.computeMetrics(),
    };
  }

  private refresh() {
    const data: JobsJsonOutput = getJobsJson();
    const newJobsMap = new Map<string, JobsJsonEntry>();

    for (const job of data.jobs) {
      newJobsMap.set(job.id, job);
      const prev = this.jobs.get(job.id);

      if (!prev) {
        this.emit("change", { type: "job_created", job } satisfies StateEvent);
      } else if (prev.status !== job.status) {
        if (job.status === "completed") {
          this.emit("change", { type: "job_completed", job } satisfies StateEvent);
        } else if (job.status === "failed") {
          this.emit("change", { type: "job_failed", job } satisfies StateEvent);
        } else {
          this.emit("change", { type: "job_updated", job } satisfies StateEvent);
        }
      } else if (JSON.stringify(prev) !== JSON.stringify(job)) {
        this.emit("change", { type: "job_updated", job } satisfies StateEvent);
      }
    }

    this.jobs = newJobsMap;
    this.emit("change", { type: "metrics_update", metrics: this.computeMetrics() } satisfies StateEvent);
  }

  private computeMetrics(): DashboardMetrics {
    const jobs = Array.from(this.jobs.values());
    const completed = jobs.filter((j) => j.status === "completed");
    const failed = jobs.filter((j) => j.status === "failed");
    const active = jobs.filter((j) => j.status === "running" || j.status === "pending");

    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    let totalDurationMs = 0;

    for (const job of completed) {
      if (job.tokens) {
        totalTokensInput += job.tokens.input || 0;
        totalTokensOutput += job.tokens.output || 0;
      }
      totalDurationMs += job.elapsed_ms;
    }

    return {
      totalJobs: jobs.length,
      activeJobs: active.length,
      completedJobs: completed.length,
      failedJobs: failed.length,
      totalTokensInput,
      totalTokensOutput,
      averageJobDurationMs: completed.length > 0 ? Math.round(totalDurationMs / completed.length) : 0,
      uptimeMs: Date.now() - this.startedAt,
    };
  }
}

// Singleton instance
let dashboardState: DashboardState | null = null;

export function getDashboardState(): DashboardState {
  if (!dashboardState) {
    dashboardState = new DashboardState();
    dashboardState.start();
  }
  return dashboardState;
}
