// Dashboard state manager: watches jobs directory, maintains in-memory state,
// emits events on changes for SSE broadcasting.

import { EventEmitter } from "events";
import { watch, type FSWatcher } from "fs";
import { config } from "../config.ts";
import { getJobsJson, getJobSession, loadJob, refreshJobStatus, clearJobContext, sendToJob, sendControlToJob, type JobsJsonEntry, type JobsJsonOutput } from "../jobs.ts";
import { mkdirSync, existsSync, statSync } from "fs";
import { getEventsReader, type HookEvent } from "./events-reader.ts";
import { recordJobCompletion, recordHookEvent, truncatePreview, logActivity, type QueueTask } from "./db.ts";
import { getOrchestratorStatus, injectToOrchestrator, saveOrchestratorState, ORCH_JOB_ID } from "../orchestrator.ts";
import type { PendingApproval } from "../orchestrator/triggers.ts";
import orchestratorBus from "./event-bus.ts";

export type ContextClearState = "idle" | "warned" | "interrupting" | "clearing" | "resuming";

export interface PulseSummary {
  orchestrator_running: boolean;
  queue_depth: number;
  active_triggers: number;
  pending_approvals: number;
  last_tick: string;
}

export type StateEvent =
  | { type: "snapshot"; jobs: JobsJsonEntry[]; metrics: DashboardMetrics }
  | { type: "job_updated"; job: JobsJsonEntry }
  | { type: "job_created"; job: JobsJsonEntry }
  | { type: "job_completed"; job: JobsJsonEntry }
  | { type: "job_failed"; job: JobsJsonEntry }
  | { type: "metrics_update"; metrics: DashboardMetrics }
  | { type: "hook_event"; event: HookEvent }
  | { type: "orchestrator_status_change"; status: "started" | "stopped" | "clearing" | "resuming" }
  | { type: "orchestrator_context_warn"; contextPct: number; clearState: ContextClearState }
  | { type: "queue_update"; task: QueueTask; operation: "added" | "removed" | "status_changed" }
  | { type: "trigger_fired"; trigger_id: number; trigger_name: string; action: string }
  | { type: "approval_required"; approval: PendingApproval }
  | { type: "pulse_tick"; summary: PulseSummary };

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
  private onHookEvent: ((event: HookEvent) => void) | null = null;
  private onBusEvent: ((event: StateEvent) => void) | null = null;

  // Context lifecycle manager state
  private contextClearState: ContextClearState = "idle";
  private lastContextWarnTime: number = 0;
  private resumeTimer: Timer | null = null;

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

    // Start listening for hook events
    const eventsReader = getEventsReader();
    this.onHookEvent = (event: HookEvent) => {
      this.emit("change", { type: "hook_event", event } satisfies StateEvent);
      try {
        recordHookEvent({
          timestamp: event.timestamp,
          job_id: event.job_id,
          event_type: event.event_type,
          tool_name: event.tool_name,
          data: event.data,
        });
      } catch {
        // Ignore SQLite errors for hook events
      }
    };
    eventsReader.on("event", this.onHookEvent);

    // Forward cross-module events from the bus
    this.onBusEvent = (event: StateEvent) => {
      this.emit("change", event);
    };
    orchestratorBus.on("state_event", this.onBusEvent);
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    if (this.onHookEvent) {
      const eventsReader = getEventsReader();
      eventsReader.off("event", this.onHookEvent);
      this.onHookEvent = null;
    }
    if (this.onBusEvent) {
      orchestratorBus.off("state_event", this.onBusEvent);
      this.onBusEvent = null;
    }
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
          this.persistJob(job);
        } else if (job.status === "failed") {
          this.emit("change", { type: "job_failed", job } satisfies StateEvent);
          this.persistJob(job);
        } else {
          this.emit("change", { type: "job_updated", job } satisfies StateEvent);
        }
      } else if (JSON.stringify(prev) !== JSON.stringify(job)) {
        this.emit("change", { type: "job_updated", job } satisfies StateEvent);
      }
    }

    this.jobs = newJobsMap;
    this.emit("change", { type: "metrics_update", metrics: this.computeMetrics() } satisfies StateEvent);

    // Check orchestrator context usage (runs every refresh cycle)
    this.checkOrchestratorContext();
  }

  private persistJob(job: JobsJsonEntry) {
    try {
      // Load raw Job for reuse tracking
      const rawJob = loadJob(job.id);

      // Load full session data for tool calls, messages, subagents, session_id
      const fullSession = job.has_session ? getJobSession(job.id) : null;

      // Compute message counts from session
      let messageCount = 0;
      let userMessageCount = 0;
      if (fullSession?.messages) {
        messageCount = fullSession.messages.length;
        userMessageCount = fullSession.messages.filter(m => m.role === "user").length;
      }

      // Build tool_calls array with truncated previews
      const toolCallsForDb = (fullSession?.tool_calls ?? []).map(tc => ({
        name: tc.name,
        is_error: tc.is_error,
        timestamp: tc.timestamp,
        input_preview: truncatePreview(tc.input),
        output_preview: truncatePreview(tc.output),
      }));

      // Build subagents array from session data
      // Subagents are detected by Task tool calls that spawn subagents
      const subagentMap = new Map<string, { tool_calls: number; messages: number }>();
      if (fullSession?.tool_calls) {
        for (const tc of fullSession.tool_calls) {
          if (tc.name === "Task" && tc.input && typeof tc.input === "object") {
            const inp = tc.input as Record<string, unknown>;
            const name = typeof inp.name === "string" ? inp.name : typeof inp.description === "string" ? inp.description : null;
            if (name) {
              const existing = subagentMap.get(name) ?? { tool_calls: 0, messages: 0 };
              existing.tool_calls++;
              subagentMap.set(name, existing);
            }
          }
        }
      }
      const subagentsForDb = Array.from(subagentMap.entries()).map(([id, stats]) => ({
        id,
        tool_call_count: stats.tool_calls,
        message_count: stats.messages,
      }));

      recordJobCompletion({
        id: job.id,
        status: job.status,
        model: job.model,
        reasoning: job.reasoning,
        cwd: job.cwd,
        prompt: job.prompt,
        summary: job.summary,
        session_id: fullSession?.session_id ?? null,
        started_at: job.started_at,
        completed_at: job.completed_at,
        elapsed_ms: job.elapsed_ms,
        tokens: job.tokens ? {
          input: job.tokens.input,
          output: job.tokens.output,
          context_used_pct: job.tokens.context_used_pct,
          context_window: job.tokens.context_window,
        } : null,
        estimated_cost: job.estimated_cost,
        tool_call_count: job.tool_call_count,
        failed_tool_calls: job.failed_tool_calls,
        primary_tool: job.primary_tool,
        files_modified: job.files_modified,
        message_count: messageCount,
        user_message_count: userMessageCount,
        has_session: job.has_session,
        reuse_count: rawJob?.reuseCount ?? 0,
        original_prompt: rawJob?.originalPrompt ?? null,
        tool_calls: toolCallsForDb,
        subagents: subagentsForDb,
      });
    } catch (err) {
      console.error("Failed to persist job to SQLite:", err);
    }
  }

  /**
   * Context Lifecycle Manager — monitors orchestrator context usage
   * and triggers the auto-clear cycle:
   *   1. Warn at >= 70% → inject "save state" message (cooldown: 120s)
   *   2. Interrupt at >= 80% OR state file updated → send Escape to cancel turn
   *   3. Clear 2s after interrupt → send /clear (Claude is now at prompt)
   *   4. Resume 5s after clear → inject "read state, resume" message
   *
   * The key insight: /clear only works when Claude is at the ❯ prompt (idle).
   * If Claude is mid-turn, we must first send Escape to interrupt before /clear.
   */
  private checkOrchestratorContext() {
    try {
      const status = getOrchestratorStatus();
      if (!status.running || status.contextPct == null) return;

      const pct = status.contextPct;
      const now = Date.now();
      const WARN_COOLDOWN_MS = 120_000; // 2 minutes
      const WARN_THRESHOLD = 70;
      const CLEAR_THRESHOLD = 80;

      switch (this.contextClearState) {
        case "idle": {
          if (pct >= WARN_THRESHOLD && now - this.lastContextWarnTime > WARN_COOLDOWN_MS) {
            // Step 1: Auto-save state snapshot, then warn orchestrator
            saveOrchestratorState({ notes: `Context at ${pct}%, auto-saved before clear` });
            const msg = `SYSTEM: Context at ${pct}%. Briefly summarize what you're currently doing — the system will save your state automatically. Context will be cleared soon.`;
            injectToOrchestrator(msg);
            this.lastContextWarnTime = now;
            this.contextClearState = "warned";
            console.log(`[context-lifecycle] Warned orchestrator: context at ${pct}%`);
            this.emit("change", {
              type: "orchestrator_context_warn",
              contextPct: pct,
              clearState: "warned",
            } satisfies StateEvent);
          }
          break;
        }

        case "warned": {
          // Step 2: Interrupt — either context hit 80% or state file was updated after warn
          const stateFileUpdated = this.isStateFileRecentlyUpdated();
          if (pct >= CLEAR_THRESHOLD || stateFileUpdated) {
            // Send Escape to interrupt any in-progress turn.
            // /clear only works at the ❯ prompt — if Claude is mid-turn,
            // it gets queued as pending input and never executes.
            sendControlToJob(ORCH_JOB_ID, "Escape");
            this.contextClearState = "interrupting";
            console.log(`[context-lifecycle] Interrupting orchestrator turn before clear (${pct}%, stateFileUpdated=${stateFileUpdated})`);

            // Step 3: Send /clear after 2s (gives Claude time to cancel and return to prompt)
            this.resumeTimer = setTimeout(() => {
              clearJobContext(ORCH_JOB_ID);
              this.contextClearState = "clearing";
              logActivity({ action: "context_cleared", details: { context_pct: pct } });
              console.log("[context-lifecycle] Sent /clear to orchestrator");
              this.emit("change", {
                type: "orchestrator_status_change",
                status: "clearing",
              } satisfies StateEvent);

              // Step 4: Resume after 5s (gives /clear time to complete)
              this.resumeTimer = setTimeout(() => {
                this.contextClearState = "resuming";
                const resumeMsg = `SYSTEM: Context was cleared. Read your saved state from ${config.orchStateFile} using the Read tool and resume your previous work.`;
                injectToOrchestrator(resumeMsg);
                console.log("[context-lifecycle] Injected resume prompt after context clear");
                this.emit("change", {
                  type: "orchestrator_status_change",
                  status: "resuming",
                } satisfies StateEvent);

                // Back to idle after resume message sent
                setTimeout(() => {
                  this.contextClearState = "idle";
                }, 2000);
              }, 5000);
            }, 2000);
          }
          break;
        }

        case "interrupting":
        case "clearing":
        case "resuming":
          // Wait for the cycle to complete — don't interfere
          break;
      }
    } catch (err) {
      // Don't let context monitoring crash the refresh cycle
      console.error("[context-lifecycle] Error:", err);
    }
  }

  private isStateFileRecentlyUpdated(): boolean {
    try {
      if (!existsSync(config.orchStateFile)) return false;
      const mtime = statSync(config.orchStateFile).mtimeMs;
      // Consider "recently updated" if modified after the last warn time
      return mtime > this.lastContextWarnTime;
    } catch {
      return false;
    }
  }

  getContextClearState(): ContextClearState {
    return this.contextClearState;
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
