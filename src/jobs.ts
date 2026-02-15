// Job management for async claude agent execution with tmux

import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, statSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { config, ReasoningEffort, SandboxMode } from "./config.ts";
import { randomBytes } from "crypto";
import { extractSessionId, findSessionFile, parseSessionFile, parseFullSession, type ParsedSessionData, type FullSessionData } from "./session-parser.ts";
import {
  createSession,
  killSession,
  sessionExists,
  getSessionName,
  capturePane,
  captureFullHistory,
  isSessionActive,
  sendMessage,
  sendControl,
} from "./tmux.ts";

export interface Job {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  prompt: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  sandbox: SandboxMode;
  parentSessionId?: string;
  cwd: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  tmuxSession?: string;
  result?: string;
  error?: string;
  reuseCount?: number;
  originalPrompt?: string;
}

function ensureJobsDir(): void {
  mkdirSync(config.jobsDir, { recursive: true });
}

function generateJobId(): string {
  return randomBytes(4).toString("hex");
}

function getJobPath(jobId: string): string {
  return join(config.jobsDir, `${jobId}.json`);
}

export function saveJob(job: Job): void {
  ensureJobsDir();
  writeFileSync(getJobPath(job.id), JSON.stringify(job, null, 2));
}

export function loadJob(jobId: string): Job | null {
  try {
    const content = readFileSync(getJobPath(jobId), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function listJobs(): Job[] {
  ensureJobsDir();
  const files = readdirSync(config.jobsDir).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        const content = readFileSync(join(config.jobsDir, f), "utf-8");
        return JSON.parse(content) as Job;
      } catch {
        return null;
      }
    })
    .filter((j): j is Job => j !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function computeElapsedMs(job: Job): number {
  const start = job.startedAt ?? job.createdAt;
  const startMs = Date.parse(start);
  const endMs = job.completedAt ? Date.parse(job.completedAt) : Date.now();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, endMs - startMs);
}

function getLogMtimeMs(jobId: string): number | null {
  const logFile = join(config.jobsDir, `${jobId}.log`);
  try {
    return statSync(logFile).mtimeMs;
  } catch {
    return null;
  }
}

function getLastActivityMs(job: Job): number | null {
  const logMtime = getLogMtimeMs(job.id);
  if (logMtime !== null) return logMtime;

  const fallback = job.startedAt ?? job.createdAt;
  const fallbackMs = Date.parse(fallback);
  if (!Number.isFinite(fallbackMs)) return null;
  return fallbackMs;
}

function isInactiveTimedOut(job: Job): boolean {
  const timeoutMinutes = config.defaultTimeout;
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return false;

  const lastActivityMs = getLastActivityMs(job);
  if (!lastActivityMs) return false;

  return Date.now() - lastActivityMs > timeoutMinutes * 60 * 1000;
}

function getArchivedSessionPath(jobId: string): string {
  return join(config.jobsDir, `${jobId}.session.jsonl`);
}

function findSessionFilePath(jobId: string): string | null {
  // Prefer the archived session file (copied by hook on Stop/SessionEnd)
  const archived = getArchivedSessionPath(jobId);
  if (existsSync(archived)) return archived;

  // Fall back to finding it via session ID in the log
  const logFile = join(config.jobsDir, `${jobId}.log`);
  let logContent: string;
  try {
    logContent = readFileSync(logFile, "utf-8");
  } catch {
    return null;
  }

  const sessionId = extractSessionId(logContent);
  if (!sessionId) return null;

  return findSessionFile(sessionId);
}

export function loadSessionData(jobId: string): ParsedSessionData | null {
  const sessionFile = findSessionFilePath(jobId);
  if (!sessionFile) return null;
  return parseSessionFile(sessionFile);
}

export function getJobSession(jobId: string): FullSessionData | null {
  const sessionFile = findSessionFilePath(jobId);
  if (!sessionFile) return null;
  return parseFullSession(sessionFile);
}

export type JobsJsonEntry = {
  id: string;
  status: Job["status"];
  prompt: string;
  model: string;
  reasoning: ReasoningEffort;
  cwd: string;
  elapsed_ms: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  tokens: ParsedSessionData["tokens"] | null;
  files_modified: ParsedSessionData["files_modified"] | null;
  summary: string | null;
  tool_call_count: number | null;
  has_session: boolean;
  estimated_cost: number | null;
  failed_tool_calls: number | null;
  primary_tool: string | null;
};

export type JobsJsonOutput = {
  generated_at: string;
  jobs: JobsJsonEntry[];
};

const PRICING: Record<string, { input_per_1m: number; output_per_1m: number }> = {
  opus: { input_per_1m: 15, output_per_1m: 75 },
  sonnet: { input_per_1m: 3, output_per_1m: 15 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const tier = model.includes("opus") ? "opus" : "sonnet";
  const rates = PRICING[tier];
  return (inputTokens / 1_000_000) * rates.input_per_1m
       + (outputTokens / 1_000_000) * rates.output_per_1m;
}

export function getJobsJson(): JobsJsonOutput {
  const jobs = listJobs();
  const enriched = jobs.map((job) => {
    const refreshed = job.status === "running" ? refreshJobStatus(job.id) : null;
    const effective = refreshed ?? job;
    const elapsedMs = computeElapsedMs(effective);

    let tokens: ParsedSessionData["tokens"] | null = null;
    let filesModified: ParsedSessionData["files_modified"] | null = null;
    let summary: string | null = null;
    let toolCallCount: number | null = null;
    let failedToolCalls: number | null = null;
    let primaryTool: string | null = null;
    let cost: number | null = null;
    const hasSession = existsSync(getArchivedSessionPath(effective.id));

    if (effective.status === "completed" || effective.status === "running") {
      const sessionData = loadSessionData(effective.id);
      if (sessionData) {
        tokens = sessionData.tokens;
        filesModified = sessionData.files_modified;
        summary = sessionData.summary ? truncateText(sessionData.summary, 500) : null;
      }

      // Load full session for tool call stats (only for completed jobs with archived sessions)
      if (effective.status === "completed" && hasSession) {
        const fullSession = getJobSession(effective.id);
        if (fullSession) {
          toolCallCount = fullSession.tool_calls.length;
          failedToolCalls = fullSession.tool_calls.filter(tc => tc.is_error).length;

          // Compute primary tool (most frequently used)
          if (fullSession.tool_calls.length > 0) {
            const freq = new Map<string, number>();
            for (const tc of fullSession.tool_calls) {
              freq.set(tc.name, (freq.get(tc.name) ?? 0) + 1);
            }
            let maxCount = 0;
            for (const [name, count] of freq) {
              if (count > maxCount) {
                maxCount = count;
                primaryTool = name;
              }
            }
          }
        }
      }

      // Compute cost estimate from tokens
      if (tokens) {
        cost = estimateCost(effective.model, tokens.input, tokens.output);
        cost = Math.round(cost * 100) / 100; // round to cents
      }
    }

    return {
      id: effective.id,
      status: effective.status,
      prompt: truncateText(effective.prompt, 100),
      model: effective.model,
      reasoning: effective.reasoningEffort,
      cwd: effective.cwd,
      elapsed_ms: elapsedMs,
      created_at: effective.createdAt,
      started_at: effective.startedAt ?? null,
      completed_at: effective.completedAt ?? null,
      tokens,
      files_modified: filesModified,
      summary,
      tool_call_count: toolCallCount,
      has_session: hasSession,
      estimated_cost: cost,
      failed_tool_calls: failedToolCalls,
      primary_tool: primaryTool,
    };
  });

  return {
    generated_at: new Date().toISOString(),
    jobs: enriched,
  };
}

export function deleteJob(jobId: string): boolean {
  const job = loadJob(jobId);

  // Kill tmux session if running
  if (job?.tmuxSession && sessionExists(job.tmuxSession)) {
    killSession(job.tmuxSession);
  }

  try {
    unlinkSync(getJobPath(jobId));
    // Clean up associated files
    const cleanupFiles = [
      join(config.jobsDir, `${jobId}.prompt`),
      join(config.jobsDir, `${jobId}.log`),
      join(config.jobsDir, `${jobId}.session.jsonl`),
    ];
    for (const f of cleanupFiles) {
      try { unlinkSync(f); } catch { /* may not exist */ }
    }
    // Clean up subagent transcripts directory
    const subagentDir = join(config.jobsDir, `${jobId}-subagents`);
    try { rmSync(subagentDir, { recursive: true }); } catch { /* may not exist */ }
    return true;
  } catch {
    return false;
  }
}

export interface StartJobOptions {
  prompt: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  sandbox?: SandboxMode;
  parentSessionId?: string;
  cwd?: string;
  jobId?: string;
  systemPrompt?: string;
}

export function startJob(options: StartJobOptions): Job {
  ensureJobsDir();

  const jobId = options.jobId || generateJobId();
  const cwd = options.cwd || process.cwd();

  const job: Job = {
    id: jobId,
    status: "pending",
    prompt: options.prompt,
    model: options.model || config.model,
    reasoningEffort: options.reasoningEffort || config.defaultReasoningEffort,
    sandbox: options.sandbox || config.defaultSandbox,
    parentSessionId: options.parentSessionId,
    cwd,
    createdAt: new Date().toISOString(),
  };

  saveJob(job);

  // Create tmux session with claude
  const result = createSession({
    jobId,
    prompt: options.prompt,
    model: job.model,
    reasoningEffort: job.reasoningEffort,
    sandbox: job.sandbox,
    cwd,
    systemPrompt: options.systemPrompt,
  });

  if (result.success) {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.tmuxSession = result.sessionName;
  } else {
    job.status = "failed";
    job.error = result.error || "Failed to create tmux session";
    job.completedAt = new Date().toISOString();
  }

  saveJob(job);
  return job;
}

export function killJob(jobId: string, markCompleted: boolean = false): boolean {
  const job = loadJob(jobId);
  if (!job) return false;

  // Kill tmux session
  if (job.tmuxSession) {
    killSession(job.tmuxSession);
  }

  if (markCompleted) {
    job.status = "completed";
  } else {
    job.status = "failed";
    job.error = "Killed by user";
  }
  job.completedAt = new Date().toISOString();
  saveJob(job);
  return true;
}

export function sendToJob(jobId: string, message: string): boolean {
  const job = loadJob(jobId);
  if (!job || !job.tmuxSession) return false;

  return sendMessage(job.tmuxSession, message);
}

export function sendControlToJob(jobId: string, key: string): boolean {
  const job = loadJob(jobId);
  if (!job || !job.tmuxSession) return false;

  return sendControl(job.tmuxSession, key);
}

export function getJobOutput(jobId: string, lines?: number): string | null {
  const job = loadJob(jobId);
  if (!job) return null;

  // First try tmux capture if session exists
  if (job.tmuxSession && sessionExists(job.tmuxSession)) {
    const output = capturePane(job.tmuxSession, { lines });
    if (output) return output;
  }

  // Fall back to log file
  const logFile = join(config.jobsDir, `${jobId}.log`);
  try {
    const content = readFileSync(logFile, "utf-8");
    if (lines) {
      const allLines = content.split("\n");
      return allLines.slice(-lines).join("\n");
    }
    return content;
  } catch {
    return null;
  }
}

export function getJobFullOutput(jobId: string): string | null {
  const job = loadJob(jobId);
  if (!job) return null;

  // First try tmux capture if session exists
  if (job.tmuxSession && sessionExists(job.tmuxSession)) {
    const output = captureFullHistory(job.tmuxSession);
    if (output) return output;
  }

  // Fall back to log file
  const logFile = join(config.jobsDir, `${jobId}.log`);
  try {
    return readFileSync(logFile, "utf-8");
  } catch {
    return null;
  }
}

export function cleanupOldJobs(maxAgeDays: number = 7): number {
  const jobs = listJobs();
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  for (const job of jobs) {
    const jobTime = new Date(job.completedAt || job.createdAt).getTime();
    if (jobTime < cutoff && (job.status === "completed" || job.status === "failed")) {
      if (deleteJob(job.id)) cleaned++;
    }
  }

  return cleaned;
}

export function isJobRunning(jobId: string): boolean {
  const job = loadJob(jobId);
  if (!job || !job.tmuxSession) return false;

  return isSessionActive(job.tmuxSession);
}

export function refreshJobStatus(jobId: string): Job | null {
  const job = loadJob(jobId);
  if (!job) return null;

  if (job.status === "running" && job.tmuxSession) {
    // Check if tmux session still exists
    if (!sessionExists(job.tmuxSession)) {
      // Session ended completely
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      const logFile = join(config.jobsDir, `${jobId}.log`);
      try {
        job.result = readFileSync(logFile, "utf-8");
      } catch {
        // No log file
      }
      saveJob(job);
    } else {
      // Session exists - check if claude is still running
      // Look for the "[cc-agent: Session complete" marker in output
      const output = capturePane(job.tmuxSession, { lines: 20 });
      if (output && output.includes("[cc-agent: Session complete")) {
        job.status = "completed";
        job.completedAt = new Date().toISOString();
        // Capture full output
        const fullOutput = captureFullHistory(job.tmuxSession);
        if (fullOutput) {
          job.result = fullOutput;
        }
        saveJob(job);
      } else if (isInactiveTimedOut(job)) {
        killSession(job.tmuxSession);
        job.status = "failed";
        job.error = `Timed out after ${config.defaultTimeout} minutes of inactivity`;
        job.completedAt = new Date().toISOString();
        saveJob(job);
      }
    }
  }

  return loadJob(jobId);
}

export function getAttachCommand(jobId: string): string | null {
  const job = loadJob(jobId);
  if (!job || !job.tmuxSession) return null;

  return `tmux attach -t "${job.tmuxSession}"`;
}

export function clearJobContext(jobId: string): { success: boolean; error?: string } {
  const job = loadJob(jobId);
  if (!job || !job.tmuxSession) {
    return { success: false, error: "Job not found or no tmux session" };
  }

  if (!sessionExists(job.tmuxSession)) {
    return { success: false, error: "tmux session no longer exists" };
  }

  // Interrupt any in-progress turn first — /clear only works at the ❯ prompt.
  // If Claude is mid-turn, keystrokes get queued as pending input.
  sendControl(job.tmuxSession, "Escape");

  const sent = sendMessage(job.tmuxSession, "/clear");
  if (!sent) {
    return { success: false, error: "Failed to send /clear to session" };
  }

  return { success: true };
}

export function getJobUsage(jobId: string): { success: boolean; output?: string; error?: string } {
  const job = loadJob(jobId);
  if (!job || !job.tmuxSession) {
    return { success: false, error: "Job not found or no tmux session" };
  }

  if (!sessionExists(job.tmuxSession)) {
    return { success: false, error: "tmux session no longer exists" };
  }

  const sent = sendMessage(job.tmuxSession, "/usage");
  if (!sent) {
    return { success: false, error: "Failed to send /usage to session" };
  }

  // Wait for Claude Code to render the output
  const { spawnSync } = require("child_process");
  spawnSync("sleep", ["2"]);

  const output = capturePane(job.tmuxSession, { lines: 30 });
  return { success: true, output: output ?? undefined };
}

export function reuseJob(jobId: string, newPrompt: string): { success: boolean; error?: string } {
  const job = loadJob(jobId);
  if (!job || !job.tmuxSession) {
    return { success: false, error: "Job not found or no tmux session" };
  }

  if (!sessionExists(job.tmuxSession)) {
    return { success: false, error: "tmux session no longer exists" };
  }

  // Interrupt any in-progress turn first — /clear only works at the ❯ prompt
  sendControl(job.tmuxSession, "Escape");
  const { spawnSync } = require("child_process");
  spawnSync("sleep", ["2"]);

  // Send /clear
  const clearSent = sendMessage(job.tmuxSession, "/clear");
  if (!clearSent) {
    return { success: false, error: "Failed to send /clear to session" };
  }

  // Wait for context reset
  spawnSync("sleep", ["3"]);

  // Send the new prompt
  const promptSent = sendMessage(job.tmuxSession, newPrompt);
  if (!promptSent) {
    return { success: false, error: "Failed to send new prompt to session" };
  }

  // Update job metadata
  if (!job.originalPrompt) {
    job.originalPrompt = job.prompt;
  }
  job.prompt = newPrompt;
  job.reuseCount = (job.reuseCount ?? 0) + 1;
  job.startedAt = new Date().toISOString();
  job.status = "running";
  job.result = undefined;
  job.error = undefined;
  job.completedAt = undefined;
  saveJob(job);

  return { success: true };
}
