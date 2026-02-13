// Pulse Loop — the 10-second heartbeat that ties health, triggers, and queue together.
// This is the most connected module: imports orchestrator, triggers, queue, and state.

import { statSync } from "fs";
import { join } from "path";
import { config } from "../config.ts";
import {
  startOrchestrator,
  getOrchestratorStatus,
  injectToOrchestrator,
  loadOrchestratorState,
  saveOrchestratorState,
  ORCH_JOB_ID,
} from "../orchestrator.ts";
import { sessionExists, getSessionName } from "../tmux.ts";
import {
  evaluateCronTriggers,
  evaluateThresholdTriggers,
  evaluateEventTriggers,
  getPendingApprovals,
} from "./triggers.ts";
import { loadDaemonPrefs } from "../daemon-prefs.ts";
import {
  getNextPendingTask,
  updateQueueTask,
  getQueueDepth,
  logActivity,
  getTriggers,
} from "../dashboard/db.ts";
import type { DashboardState, StateEvent } from "../dashboard/state.ts";
import orchestratorBus from "../dashboard/event-bus.ts";

const TICK_INTERVAL_MS = 10_000;
const IDLE_THRESHOLD_MS = 30_000; // 30s since last log change = idle
const RESPAWN_COOLDOWN_MS = 60_000; // at most 1 respawn per 60s

let pulseTimer: Timer | null = null;
let lastTickTime: number = 0;
let lastRespawnTime: number = 0;
let currentProcessingTaskId: number | null = null;
let dashboardStateRef: DashboardState | null = null;

// --- Idle Detection ---

function getLogMtimeMs(): number | null {
  try {
    const logFile = join(config.jobsDir, `${ORCH_JOB_ID}.log`);
    return statSync(logFile).mtimeMs;
  } catch {
    return null;
  }
}

function isOrchestratorIdle(): boolean {
  const state = loadOrchestratorState();
  const hasTask = state?.current_task != null;
  if (hasTask) return false;

  const logMtime = getLogMtimeMs();
  if (logMtime === null) return true; // no log file = assume idle
  return Date.now() - logMtime > IDLE_THRESHOLD_MS;
}

// --- The Tick ---

function pulseTick(): void {
  lastTickTime = Date.now();

  try {
    // 1. HEALTH: Is orchestrator tmux session alive?
    const sessionName = getSessionName(ORCH_JOB_ID);
    const alive = sessionExists(sessionName);

    if (!alive) {
      // Skip respawn if user intentionally stopped the orchestrator
      const prefs = loadDaemonPrefs();
      if (!prefs.auto_respawn) {
        // Emit pulse_tick but don't respawn
        orchestratorBus.emit("state_event", {
          type: "pulse_tick",
          summary: {
            orchestrator_running: false,
            queue_depth: getQueueDepth(),
            active_triggers: getTriggers(true).length,
            pending_approvals: getPendingApprovals().length,
            last_tick: new Date(lastTickTime).toISOString(),
          },
        });
        return;
      }

      // Respawn guard: at most once per 60s
      if (Date.now() - lastRespawnTime > RESPAWN_COOLDOWN_MS) {
        console.log("[pulse] Orchestrator session not found, respawning...");
        const result = startOrchestrator();
        lastRespawnTime = Date.now();

        if (result.success) {
          logActivity({ action: "respawned", details: { reason: "session_not_found" } });

          // Inject state file after 5s to let Claude boot up
          setTimeout(() => {
            const state = loadOrchestratorState();
            if (state) {
              injectToOrchestrator(
                `SYSTEM: You were respawned after a crash. Read your saved state from ${config.orchStateFile} using the Read tool and resume your previous work.`
              );
              console.log("[pulse] Injected state resume after respawn");
            }
          }, 5000);
        } else {
          console.error("[pulse] Failed to respawn orchestrator:", result.error);
        }
      }
      // Emit pulse_tick even when orchestrator is down
      orchestratorBus.emit("state_event", {
        type: "pulse_tick",
        summary: {
          orchestrator_running: false,
          queue_depth: getQueueDepth(),
          active_triggers: getTriggers(true).length,
          pending_approvals: getPendingApprovals().length,
          last_tick: new Date(lastTickTime).toISOString(),
        },
      });
      return; // Skip triggers/queue if orchestrator is down
    }

    // 2. TRIGGERS: Evaluate cron and threshold triggers
    evaluateCronTriggers();
    evaluateThresholdTriggers();

    // 3. QUEUE: If orchestrator is idle and has pending tasks, inject next one
    if (isOrchestratorIdle()) {
      // First, mark any previously processing task as completed
      if (currentProcessingTaskId !== null) {
        updateQueueTask(currentProcessingTaskId, {
          status: "completed",
          completed_at: new Date().toISOString(),
        });

        // Save state: mark task done, trim history automatically
        const existingState = loadOrchestratorState();
        const completedTasks = existingState?.completed_tasks || [];
        completedTasks.push({
          id: currentProcessingTaskId,
          description: existingState?.current_task || "unknown",
          result: "completed",
          completed_at: new Date().toISOString(),
        });
        saveOrchestratorState({
          current_task: null,
          status: "idle",
          completed_tasks: completedTasks,
        });

        logActivity({
          action: "queue_processed",
          details: { task_id: currentProcessingTaskId },
          queue_task_id: currentProcessingTaskId,
        });
        currentProcessingTaskId = null;
      }

      // Dequeue next task
      const task = getNextPendingTask();
      if (task) {
        updateQueueTask(task.id, {
          status: "processing",
          started_at: new Date().toISOString(),
        });
        currentProcessingTaskId = task.id;

        // Save state: record current task
        saveOrchestratorState({
          current_task: task.prompt,
          status: "processing",
        });

        const msg = `SYSTEM: New task from queue (#${task.id}):\n\n${task.prompt}\n\nWhen done, just say "Task done" — state is managed automatically.`;
        injectToOrchestrator(msg);
        console.log(`[pulse] Injected queue task #${task.id}`);
        logActivity({
          action: "queue_injected",
          details: { task_id: task.id, prompt_preview: task.prompt.slice(0, 100) },
          queue_task_id: task.id,
        });
      }
    }

    // Emit pulse_tick summary for SSE subscribers
    orchestratorBus.emit("state_event", {
      type: "pulse_tick",
      summary: {
        orchestrator_running: true,
        queue_depth: getQueueDepth(),
        active_triggers: getTriggers(true).length,
        pending_approvals: getPendingApprovals().length,
        last_tick: new Date(lastTickTime).toISOString(),
      },
    });
  } catch (err) {
    // Catch all errors per-tick to prevent the loop from crashing
    console.error("[pulse] Tick error:", err);
  }
}

// --- Event-based triggers ---

function onStateChange(event: StateEvent): void {
  if (event.type === "job_completed" || event.type === "job_failed") {
    try {
      evaluateEventTriggers(event.type);
    } catch (err) {
      console.error("[pulse] Event trigger error:", err);
    }
  }
}

// --- Public API ---

export function startPulse(state?: DashboardState): { success: boolean; error?: string } {
  if (pulseTimer) {
    return { success: false, error: "Pulse is already running" };
  }

  // Subscribe to state events for event-based triggers
  if (state) {
    dashboardStateRef = state;
    state.on("change", onStateChange);
  }

  pulseTimer = setInterval(pulseTick, TICK_INTERVAL_MS);
  // Run first tick immediately
  pulseTick();

  console.log("[pulse] Started (10s interval)");
  logActivity({ action: "pulse_started" });
  return { success: true };
}

export function stopPulse(): { success: boolean; error?: string } {
  if (!pulseTimer) {
    return { success: false, error: "Pulse is not running" };
  }

  clearInterval(pulseTimer);
  pulseTimer = null;

  // Unsubscribe from state events
  if (dashboardStateRef) {
    dashboardStateRef.off("change", onStateChange);
    dashboardStateRef = null;
  }

  console.log("[pulse] Stopped");
  logActivity({ action: "pulse_stopped" });
  return { success: true };
}

export function getPulseStatus(): {
  running: boolean;
  last_tick: string | null;
  next_tick: string | null;
  queue_depth: number;
  active_triggers: number;
  pending_approvals: number;
  orchestrator_running: boolean;
} {
  const running = pulseTimer !== null;
  return {
    running,
    last_tick: lastTickTime > 0 ? new Date(lastTickTime).toISOString() : null,
    next_tick: running && lastTickTime > 0
      ? new Date(lastTickTime + TICK_INTERVAL_MS).toISOString()
      : null,
    queue_depth: getQueueDepth(),
    active_triggers: getTriggers(true).length,
    pending_approvals: getPendingApprovals().length,
    orchestrator_running: sessionExists(getSessionName(ORCH_JOB_ID)),
  };
}
