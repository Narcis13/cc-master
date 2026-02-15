// Orchestrator Session Manager
// Manages a persistent Claude Code tmux session with fixed job ID "orch"

import { readFileSync, writeFileSync, existsSync } from "fs";
import { config } from "./config.ts";
import {
  startJob,
  loadJob,
  killJob,
  sendToJob,
  clearJobContext,
  refreshJobStatus,
  loadSessionData,
  getJobOutput,
} from "./jobs.ts";
import { sessionExists, getSessionName } from "./tmux.ts";

export interface CompletedTask {
  id: number;
  description: string;
  result: string;
  completed_at: string;
}

export interface OrchestratorState {
  started_at: string;
  status: string;
  current_task: string | null;
  active_agents: string[];
  completed_tasks: CompletedTask[];
  pending_tasks: string[];
  notes: string;
  last_saved: string;
}

const MAX_COMPLETED_TASKS = 5;

const ORCH_ID = config.orchJobId;

const INITIAL_PROMPT = `You are the CC-Agent Orchestrator — a persistent Claude Code instance that manages worker agents.

You are the mastermind — the strategic powerhouse. You think, plan, decompose, and delegate. You are NOT an implementer. Never write code or make file changes yourself. Your job is to break work into well-scoped tasks and assign them to worker agents.

Common commands (not exhaustive):
- Start worker agents: \`cc-agent start "task description"\`
- Check agent status: \`cc-agent jobs --json\`
- Send messages to agents: \`cc-agent send <jobId> "message"\`
- Monitor agent output: \`cc-agent capture <jobId>\`

These are just the basics. Run \`cc-agent --help\` to discover the full CLI — you have access to all features including queue management, triggers, modes, and more.

Your responsibilities:
1. Process tasks injected by the pulse loop or human operator
2. Decompose work into focused, well-scoped subtasks
3. Delegate each subtask to a worker agent — scope tasks so workers use at most 70% of their context window. Smaller, focused tasks produce better results than large sprawling ones
4. Monitor worker progress and collect results
5. Synthesize results and coordinate multi-agent workflows

State management is automatic — the pulse loop saves your state for you. You do NOT need to write to any state files. When you finish a task, just say "Task done".

When you receive a SYSTEM message, follow its instructions. When idle, wait for new tasks.`;

export function startOrchestrator(opts?: {
  model?: string;
  reasoning?: string;
}): { success: boolean; error?: string } {
  // Check if already running
  const sessionName = getSessionName(ORCH_ID);
  if (sessionExists(sessionName)) {
    return { success: false, error: "Orchestrator is already running" };
  }

  try {
    // Reset state so stale tasks from previous sessions don't linger
    saveOrchestratorState({
      started_at: new Date().toISOString(),
      status: "idle",
      current_task: null,
      active_agents: [],
      completed_tasks: [],
      pending_tasks: [],
      notes: "",
    });

    const job = startJob({
      prompt: "Orchestrator online. Awaiting tasks.",
      systemPrompt: INITIAL_PROMPT,
      model: opts?.model || "opus",
      reasoningEffort: (opts?.reasoning as any) || "xhigh",
      sandbox: "danger-full-access",
      jobId: ORCH_ID,
      cwd: process.cwd(),
    });

    if (job.status === "failed") {
      return { success: false, error: job.error || "Failed to start orchestrator" };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export function stopOrchestrator(): { success: boolean; error?: string } {
  const sessionName = getSessionName(ORCH_ID);
  if (!sessionExists(sessionName)) {
    return { success: false, error: "Orchestrator is not running" };
  }

  const killed = killJob(ORCH_ID);
  if (!killed) {
    return { success: false, error: "Failed to kill orchestrator session" };
  }

  return { success: true };
}

export function getOrchestratorStatus(): {
  running: boolean;
  idle: boolean;
  state: OrchestratorState | null;
  contextPct?: number;
} {
  const sessionName = getSessionName(ORCH_ID);
  const running = sessionExists(sessionName);

  if (!running) {
    return { running: false, idle: false, state: null };
  }

  // Refresh job to get latest data
  const job = refreshJobStatus(ORCH_ID);
  const state = loadOrchestratorState();

  // Determine idle: no current task in state
  const idle = state ? state.current_task === null : true;

  // Get context usage — parse from tmux status bar (most reliable for running sessions)
  // Falls back to session JSONL data if tmux parse fails
  let contextPct: number | undefined;
  const pctFromTmux = parseContextFromOutput(ORCH_ID);
  if (pctFromTmux != null) {
    contextPct = pctFromTmux;
  } else {
    const sessionData = loadSessionData(ORCH_ID);
    if (sessionData?.tokens?.context_used_pct != null) {
      contextPct = sessionData.tokens.context_used_pct;
    }
  }

  return {
    running: true,
    idle,
    state,
    contextPct,
  };
}

export function injectToOrchestrator(message: string): boolean {
  const sessionName = getSessionName(ORCH_ID);
  if (!sessionExists(sessionName)) {
    return false;
  }

  return sendToJob(ORCH_ID, message);
}

/**
 * Parse context usage % from tmux capture output.
 * Claude Code status bar shows: ███████░░░ 75%
 * After stripping ANSI codes, we match the N% pattern near block chars.
 */
function parseContextFromOutput(jobId: string): number | null {
  try {
    const output = getJobOutput(jobId, 30);
    if (!output) return null;

    // Strip ANSI escape sequences
    const clean = output
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/\x1b\][^\x07]*\x07/g, "");

    // Look for context percentage pattern near block characters (█░)
    // The status bar shows: █████░░░░░ NN%
    const matches = clean.match(/[█░]+\s+(\d{1,3})%/g);
    if (matches && matches.length > 0) {
      // Take the last match (most recent status bar render)
      const last = matches[matches.length - 1];
      const pctMatch = last.match(/(\d{1,3})%/);
      if (pctMatch) {
        const pct = parseInt(pctMatch[1], 10);
        if (pct >= 0 && pct <= 100) return pct;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function saveOrchestratorState(state: Partial<OrchestratorState>): void {
  // Merge with existing state so callers can do partial updates
  const existing = loadOrchestratorState();
  const merged: OrchestratorState = {
    started_at: existing?.started_at || new Date().toISOString(),
    status: "idle",
    current_task: null,
    active_agents: [],
    completed_tasks: [],
    pending_tasks: [],
    notes: "",
    last_saved: new Date().toISOString(),
    ...existing,
    ...state,
    last_saved: new Date().toISOString(),
  };

  // Auto-trim completed_tasks to last N entries
  if (merged.completed_tasks.length > MAX_COMPLETED_TASKS) {
    merged.completed_tasks = merged.completed_tasks.slice(-MAX_COMPLETED_TASKS);
  }

  writeFileSync(config.orchStateFile, JSON.stringify(merged, null, 2));
}

export function loadOrchestratorState(): OrchestratorState | null {
  try {
    if (!existsSync(config.orchStateFile)) return null;
    const content = readFileSync(config.orchStateFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export { ORCH_ID as ORCH_JOB_ID };
