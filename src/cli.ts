#!/usr/bin/env bun

// CC Agent CLI - Delegate tasks to Claude Code agents with tmux integration
// Designed for Claude Code orchestration with bidirectional communication

import { config, ReasoningEffort, SandboxMode } from "./config.ts";
import { startDashboard, ensureDashboardRunning, stopDashboard, DEFAULT_PORT } from "./dashboard/server.ts";
import { installHooks, removeHooks, hooksInstalled } from "./dashboard/hooks-manager.ts";
import {
  startJob,
  loadJob,
  listJobs,
  killJob,
  refreshJobStatus,
  cleanupOldJobs,
  deleteJob,
  sendToJob,
  sendControlToJob,
  getJobOutput,
  getJobFullOutput,
  getAttachCommand,
  Job,
  getJobsJson,
  getJobSession,
  clearJobContext,
  getJobUsage,
  reuseJob,
} from "./jobs.ts";
import { resolveFileRefs, formatPromptWithFileRefs, estimateTokens, findCodebaseMapPath } from "./files.ts";
import { isTmuxAvailable, listSessions, resolveClaudePath } from "./tmux.ts";
import {
  startOrchestrator,
  stopOrchestrator,
  getOrchestratorStatus,
  injectToOrchestrator,
} from "./orchestrator.ts";
import { addQueueTask, getQueueTasks, removeQueueTask, addTrigger, getTriggers, removeTrigger, toggleTrigger } from "./dashboard/db.ts";
import { getModes, activateModeByName, createModeFromCurrent, deleteMode, getModeByName, getActiveMode } from "./orchestrator/modes.ts";

const HELP = `
CC Agent - Delegate tasks to Claude Code agents (tmux-based)

Usage:
  cc-agent start "prompt" [options]   Start agent in tmux session
  cc-agent status <jobId>             Check job status
  cc-agent send <jobId> "message"     Send message to running agent
  cc-agent capture <jobId> [lines]    Capture recent output (default: 50 lines)
  cc-agent output <jobId>             Get full session output
  cc-agent attach <jobId>             Get tmux attach command
  cc-agent watch <jobId>              Stream output updates
  cc-agent session <jobId> [--json]   Show archived session data (tools, messages, tokens)
  cc-agent jobs [--json]              List all jobs
  cc-agent sessions                   List active tmux sessions
  cc-agent clear <jobId>              Send /clear to agent (reset context)
  cc-agent usage <jobId>              Send /usage to agent and show token stats
  cc-agent reuse <jobId> "prompt"     Clear context and assign new task to existing agent
  cc-agent kill <jobId> [--completed]  Kill running job (--completed marks as completed instead of failed)
  cc-agent clean                      Clean old completed jobs
  cc-agent dashboard [--port <n>]      Launch monitoring dashboard (also auto-starts with agents)
  cc-agent dashboard-stop               Stop running dashboard
  cc-agent setup-hooks                Install Claude Code hooks for event tracking
  cc-agent remove-hooks               Remove installed hooks
  cc-agent health                     Check tmux and claude code availability

  cc-agent queue add "prompt" [--priority N]  Add task to orchestrator queue
  cc-agent queue list [--status pending]     List queue tasks
  cc-agent queue remove <id>                 Remove a queue task

  cc-agent orchestrator start [options]  Start the orchestrator session
  cc-agent orchestrator stop             Stop the orchestrator
  cc-agent orchestrator status           Show orchestrator status
  cc-agent orchestrator inject "msg"     Inject a message into the orchestrator

  cc-agent trigger add <name> <type> <condition> <action> [opts]  Add a trigger
  cc-agent trigger list                                          List triggers
  cc-agent trigger toggle <id>                                   Toggle enabled
  cc-agent trigger remove <id>                                   Remove a trigger

  cc-agent pulse start                  Start the pulse loop
  cc-agent pulse stop                   Stop the pulse loop
  cc-agent pulse status                 Show pulse loop status

  cc-agent mode list                    List available modes
  cc-agent mode activate <name>         Activate a mode (replaces triggers)
  cc-agent mode create <name> [opts]    Create a mode [--description "..."] [--from-current]
  cc-agent mode delete <name>           Delete a mode

Options:
  -r, --reasoning <level>    Reasoning effort: low, medium, high, xhigh (default: xhigh)
  -m, --model <model>        Model name (default: opus)
  -s, --sandbox <mode>       Sandbox: read-only, workspace-write, danger-full-access
  -f, --file <glob>          Include files matching glob (can repeat)
  -d, --dir <path>           Working directory (default: cwd)
  --parent-session <id>      Parent session ID for linkage
  --map                      Include codebase map if available
  --dry-run                  Show prompt without executing
  --strip-ansi               Remove ANSI escape codes from output (for capture/output)
  --completed                Mark killed job as completed instead of failed (kill command only)
  --json                     Output JSON (jobs command only)
  --limit <n>                Limit jobs shown (jobs command only)
  --all                      Show all jobs (jobs command only)
  -h, --help                 Show this help

Examples:
  # Start an agent
  cc-agent start "Review this code for security issues" -f "src/**/*.ts"

  # Check on it
  cc-agent capture abc123

  # Send additional context
  cc-agent send abc123 "Also check the auth module"

  # Attach to watch interactively
  tmux attach -t cc-agent-abc123

  # Or use the attach command
  cc-agent attach abc123

Bidirectional Communication:
  - Use 'send' to give agents additional instructions mid-task
  - Use 'capture' to see recent output programmatically
  - Use 'attach' to interact directly in tmux
  - Press Ctrl+C in tmux to interrupt, type to continue conversation
`;

/**
 * Resolve model based on reasoning effort.
 * -r low -> sonnet, everything else -> opus.
 * Explicit -m flag takes priority.
 */
function resolveModel(reasoning: ReasoningEffort, explicitModel: string | null): string {
  if (explicitModel) return explicitModel;
  return reasoning === "low" ? "sonnet" : "opus";
}

interface Options {
  reasoning: ReasoningEffort;
  model: string;
  explicitModel: string | null;
  sandbox: SandboxMode;
  files: string[];
  dir: string;
  includeMap: boolean;
  parentSessionId: string | null;
  dryRun: boolean;
  stripAnsi: boolean;
  json: boolean;
  jobsLimit: number | null;
  jobsAll: boolean;
  markCompleted: boolean;
  priority: number;
  statusFilter: string | null;
  payload: string | null;
  autonomy: string | null;
  cooldown: number | null;
  description: string | null;
  fromCurrent: boolean;
}

function stripAnsiCodes(text: string): string {
  return text
    // Remove ANSI escape sequences (colors, cursor movements, etc)
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    // Remove other escape sequences (OSC, etc)
    .replace(/\x1b\][^\x07]*\x07/g, '')
    // Remove carriage returns (used for spinner overwrites)
    .replace(/\r/g, '')
    // Remove other control characters except newline and tab
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

function parseArgs(args: string[]): {
  command: string;
  positional: string[];
  options: Options;
} {
  const options: Options = {
    reasoning: config.defaultReasoningEffort,
    model: config.model,
    explicitModel: null,
    sandbox: config.defaultSandbox,
    files: [],
    dir: process.cwd(),
    includeMap: false,
    parentSessionId: null,
    dryRun: false,
    stripAnsi: false,
    json: false,
    jobsLimit: config.jobsListLimit,
    jobsAll: false,
    markCompleted: false,
    priority: 0,
    statusFilter: null,
    payload: null,
    autonomy: null,
    cooldown: null,
    description: null,
    fromCurrent: false,
  };

  const positional: string[] = [];
  let command = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      console.log(HELP);
      process.exit(0);
    } else if (arg === "-r" || arg === "--reasoning") {
      const level = args[++i] as ReasoningEffort;
      if (config.reasoningEfforts.includes(level)) {
        options.reasoning = level;
      } else {
        console.error(`Invalid reasoning level: ${level}`);
        console.error(`Valid options: ${config.reasoningEfforts.join(", ")}`);
        process.exit(1);
      }
    } else if (arg === "-m" || arg === "--model") {
      options.explicitModel = args[++i];
      options.model = options.explicitModel;
    } else if (arg === "-s" || arg === "--sandbox") {
      const mode = args[++i] as SandboxMode;
      if (config.sandboxModes.includes(mode)) {
        options.sandbox = mode;
      } else {
        console.error(`Invalid sandbox mode: ${mode}`);
        console.error(`Valid options: ${config.sandboxModes.join(", ")}`);
        process.exit(1);
      }
    } else if (arg === "-f" || arg === "--file") {
      options.files.push(args[++i]);
    } else if (arg === "-d" || arg === "--dir") {
      options.dir = args[++i];
    } else if (arg === "--parent-session") {
      options.parentSessionId = args[++i] ?? null;
    } else if (arg === "--map") {
      options.includeMap = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--strip-ansi") {
      options.stripAnsi = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--limit") {
      const raw = args[++i];
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 1) {
        console.error(`Invalid limit: ${raw}`);
        process.exit(1);
      }
      options.jobsLimit = Math.floor(parsed);
    } else if (arg === "--all") {
      options.jobsAll = true;
    } else if (arg === "--completed") {
      options.markCompleted = true;
    } else if (arg === "--priority") {
      const raw = args[++i];
      const parsed = Number(raw);
      options.priority = Number.isFinite(parsed) ? Math.floor(parsed) : 0;
    } else if (arg === "--status") {
      options.statusFilter = args[++i] ?? null;
    } else if (arg === "--payload") {
      options.payload = args[++i] ?? null;
    } else if (arg === "--autonomy") {
      options.autonomy = args[++i] ?? null;
    } else if (arg === "--cooldown") {
      const raw = args[++i];
      const parsed = Number(raw);
      options.cooldown = Number.isFinite(parsed) ? Math.floor(parsed) : null;
    } else if (arg === "--description") {
      options.description = args[++i] ?? null;
    } else if (arg === "--from-current") {
      options.fromCurrent = true;
    } else if (!arg.startsWith("-")) {
      if (!command) {
        command = arg;
      } else {
        positional.push(arg);
      }
    }
  }

  // Resolve model from reasoning effort if no explicit -m flag
  options.model = resolveModel(options.reasoning, options.explicitModel);

  return { command, positional, options };
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatJobStatus(job: Job): string {
  const elapsed = job.startedAt
    ? formatDuration(
        (job.completedAt ? new Date(job.completedAt).getTime() : Date.now()) -
          new Date(job.startedAt).getTime()
      )
    : "-";

  const status = job.status.toUpperCase().padEnd(10);
  const promptPreview = job.prompt.slice(0, 50) + (job.prompt.length > 50 ? "..." : "");

  return `${job.id}  ${status}  ${elapsed.padEnd(8)}  ${job.reasoningEffort.padEnd(6)}  ${promptPreview}`;
}

function refreshJobsForDisplay(jobs: Job[]): Job[] {
  return jobs.map((job) => {
    if (job.status !== "running") return job;
    const refreshed = refreshJobStatus(job.id);
    return refreshed ?? job;
  });
}

function sortJobsRunningFirst(jobs: Job[]): Job[] {
  const statusRank: Record<Job["status"], number> = {
    running: 0,
    pending: 1,
    failed: 2,
    completed: 3,
  };

  return [...jobs].sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function applyJobsLimit<T>(jobs: T[], limit: number | null): T[] {
  if (!limit || limit <= 0) return jobs;
  return jobs.slice(0, limit);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const { command, positional, options } = parseArgs(args);

  try {
    switch (command) {
      case "health": {
        // Check tmux
        if (!isTmuxAvailable()) {
          console.error("tmux not found");
          console.error("Install with: brew install tmux");
          process.exit(1);
        }
        console.log("tmux: OK");

        // Check claude
        const { execSync } = await import("child_process");
        try {
          const claudeBin = resolveClaudePath();
          const version = execSync(`${claudeBin} --version`, { encoding: "utf-8" }).trim();
          console.log(`claude: ${version} (${claudeBin})`);
        } catch {
          console.error("Claude Code CLI not found");
          console.error("Install with: npm install -g @anthropic-ai/claude-code");
          process.exit(1);
        }

        console.log("Status: Ready");
        break;
      }

      case "start": {
        if (positional.length === 0) {
          console.error("Error: No prompt provided");
          process.exit(1);
        }

        // Check tmux first
        if (!isTmuxAvailable()) {
          console.error("Error: tmux is required but not installed");
          console.error("Install with: brew install tmux");
          process.exit(1);
        }

        let prompt = positional.join(" ");

        // Load file context if specified — use file references instead of inlining
        // to avoid flooding the agent's prompt and causing truncation
        if (options.files.length > 0) {
          const files = await resolveFileRefs(options.files, options.dir);
          if (files.length > 0) {
            prompt = formatPromptWithFileRefs(prompt, files);
            console.error(`Referenced ${files.length} files (agent will read them)`);
          }
        }

        // Include codebase map if requested — reference the file instead of inlining
        if (options.includeMap) {
          const mapPath = findCodebaseMapPath(options.dir);
          if (mapPath) {
            prompt = `IMPORTANT: Before starting, read the codebase map at "${mapPath}" for full architectural context.\n\n${prompt}`;
            console.error(`Referenced codebase map: ${mapPath}`);
          } else {
            console.error("No codebase map found");
          }
        }

        if (options.dryRun) {
          const tokens = estimateTokens(prompt);
          console.log(`Would send ~${tokens.toLocaleString()} tokens`);
          console.log(`Model: ${options.model}`);
          console.log(`Reasoning: ${options.reasoning}`);
          console.log(`Sandbox: ${options.sandbox}`);
          console.log("\n--- Prompt Preview ---\n");
          console.log(prompt.slice(0, 3000));
          if (prompt.length > 3000) {
            console.log(`\n... (${prompt.length - 3000} more characters)`);
          }
          process.exit(0);
        }

        const job = startJob({
          prompt,
          model: options.model,
          reasoningEffort: options.reasoning,
          sandbox: options.sandbox,
          parentSessionId: options.parentSessionId ?? undefined,
          cwd: options.dir,
        });

        // Auto-start dashboard if not already running
        ensureDashboardRunning();

        console.log(`Job started: ${job.id}`);
        console.log(`Model: ${job.model} (${job.reasoningEffort})`);
        console.log(`Working dir: ${job.cwd}`);
        console.log(`tmux session: ${job.tmuxSession}`);
        console.log("");
        console.log("Commands:");
        console.log(`  Capture output:  cc-agent capture ${job.id}`);
        console.log(`  Send message:    cc-agent send ${job.id} "message"`);
        console.log(`  Attach session:  tmux attach -t ${job.tmuxSession}`);
        break;
      }

      case "status": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const job = refreshJobStatus(positional[0]);
        if (!job) {
          console.error(`Job ${positional[0]} not found`);
          process.exit(1);
        }

        console.log(`Job: ${job.id}`);
        console.log(`Status: ${job.status}`);
        console.log(`Model: ${job.model} (${job.reasoningEffort})`);
        console.log(`Sandbox: ${job.sandbox}`);
        console.log(`Created: ${job.createdAt}`);
        if (job.startedAt) {
          console.log(`Started: ${job.startedAt}`);
        }
        if (job.completedAt) {
          console.log(`Completed: ${job.completedAt}`);
        }
        if (job.tmuxSession) {
          console.log(`tmux session: ${job.tmuxSession}`);
        }
        if (job.error) {
          console.log(`Error: ${job.error}`);
        }
        break;
      }

      case "send": {
        if (positional.length < 2) {
          console.error("Error: Usage: cc-agent send <jobId> \"message\"");
          process.exit(1);
        }

        const jobId = positional[0];
        const message = positional.slice(1).join(" ");

        if (sendToJob(jobId, message)) {
          console.log(`Sent to ${jobId}: ${message}`);
        } else {
          console.error(`Could not send to job ${jobId}`);
          console.error("Job may not be running or tmux session not found");
          process.exit(1);
        }
        break;
      }

      case "clear": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const clearResult = clearJobContext(positional[0]);
        if (clearResult.success) {
          console.log(`Sent /clear to ${positional[0]}`);
          console.log("Context will be reset. Wait a few seconds before sending new tasks.");
        } else {
          console.error(`Could not clear context: ${clearResult.error}`);
          process.exit(1);
        }
        break;
      }

      case "usage": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        console.error(`Sending /usage to ${positional[0]}... (waiting 2s for output)`);
        const usageResult = getJobUsage(positional[0]);
        if (usageResult.success && usageResult.output) {
          console.log(usageResult.output);
        } else {
          console.error(`Could not get usage: ${usageResult.error ?? "no output captured"}`);
          process.exit(1);
        }
        break;
      }

      case "reuse": {
        if (positional.length < 2) {
          console.error("Error: Usage: cc-agent reuse <jobId> \"new prompt\"");
          process.exit(1);
        }

        const reuseJobId = positional[0];
        const newPrompt = positional.slice(1).join(" ");

        console.error(`Reusing agent ${reuseJobId}... (clearing context, then sending new task)`);
        const reuseResult = reuseJob(reuseJobId, newPrompt);
        if (reuseResult.success) {
          const job = loadJob(reuseJobId);
          console.log(`Agent ${reuseJobId} reused successfully`);
          console.log(`New task: ${newPrompt.slice(0, 100)}${newPrompt.length > 100 ? "..." : ""}`);
          console.log(`Reuse count: ${job?.reuseCount ?? 1}`);
        } else {
          console.error(`Could not reuse agent: ${reuseResult.error}`);
          process.exit(1);
        }
        break;
      }

      case "capture": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const lines = positional[1] ? parseInt(positional[1], 10) : 50;
        let output = getJobOutput(positional[0], lines);

        if (output) {
          if (options.stripAnsi) {
            output = stripAnsiCodes(output);
          }
          console.log(output);
        } else {
          console.error(`Could not capture output for job ${positional[0]}`);
          process.exit(1);
        }
        break;
      }

      case "output": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        let output = getJobFullOutput(positional[0]);
        if (output) {
          if (options.stripAnsi) {
            output = stripAnsiCodes(output);
          }
          console.log(output);
        } else {
          console.error(`Could not get output for job ${positional[0]}`);
          process.exit(1);
        }
        break;
      }

      case "attach": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const attachCmd = getAttachCommand(positional[0]);
        if (attachCmd) {
          console.log(attachCmd);
        } else {
          console.error(`Job ${positional[0]} not found or no tmux session`);
          process.exit(1);
        }
        break;
      }

      case "watch": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const job = loadJob(positional[0]);
        if (!job || !job.tmuxSession) {
          console.error(`Job ${positional[0]} not found or no tmux session`);
          process.exit(1);
        }

        console.error(`Watching ${job.tmuxSession}... (Ctrl+C to stop)`);
        console.error("For interactive mode, use: tmux attach -t " + job.tmuxSession);
        console.error("");

        // Simple polling-based watch
        let lastOutput = "";
        const pollInterval = setInterval(() => {
          const output = getJobOutput(positional[0], 100);
          if (output && output !== lastOutput) {
            // Print only new content
            if (lastOutput) {
              const newPart = output.replace(lastOutput, "");
              if (newPart.trim()) {
                process.stdout.write(newPart);
              }
            } else {
              console.log(output);
            }
            lastOutput = output;
          }

          // Check if job is still running
          const refreshed = refreshJobStatus(positional[0]);
          if (refreshed && refreshed.status !== "running") {
            console.error(`\nJob ${refreshed.status}`);
            clearInterval(pollInterval);
            process.exit(0);
          }
        }, 1000);

        // Handle Ctrl+C
        process.on("SIGINT", () => {
          clearInterval(pollInterval);
          console.error("\nStopped watching");
          process.exit(0);
        });
        break;
      }

      case "session": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        const sessionData = getJobSession(positional[0]);
        if (!sessionData) {
          console.error(`No session data for job ${positional[0]}`);
          console.error("Session file is archived on Stop/SessionEnd via hooks.");
          console.error("Run 'cc-agent setup-hooks' to install hooks if not already done.");
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(sessionData, null, 2));
        } else {
          console.log(`Session for job: ${positional[0]}`);
          if (sessionData.session_id) console.log(`Session ID: ${sessionData.session_id}`);
          if (sessionData.model) console.log(`Model: ${sessionData.model}`);
          if (sessionData.duration_ms !== null) console.log(`Duration: ${formatDuration(sessionData.duration_ms)}`);
          if (sessionData.tokens) {
            console.log(`Tokens: ${sessionData.tokens.input.toLocaleString()} in / ${sessionData.tokens.output.toLocaleString()} out (${sessionData.tokens.context_used_pct}% context)`);
          }
          console.log(`Messages: ${sessionData.messages.length}`);
          console.log(`Tool calls: ${sessionData.tool_calls.length}`);
          if (sessionData.files_modified && sessionData.files_modified.length > 0) {
            console.log(`Files modified: ${sessionData.files_modified.length}`);
            for (const f of sessionData.files_modified) {
              console.log(`  ${f}`);
            }
          }
          if (sessionData.tool_calls.length > 0) {
            console.log("\nTool calls:");
            const toolCounts = new Map<string, number>();
            for (const tc of sessionData.tool_calls) {
              toolCounts.set(tc.name, (toolCounts.get(tc.name) ?? 0) + 1);
            }
            for (const [name, count] of [...toolCounts.entries()].sort((a, b) => b[1] - a[1])) {
              console.log(`  ${name}: ${count}`);
            }
          }
          if (sessionData.summary) {
            console.log(`\nSummary: ${sessionData.summary.slice(0, 300)}${sessionData.summary.length > 300 ? "..." : ""}`);
          }
        }
        break;
      }

      case "jobs": {
        if (options.json) {
          const payload = getJobsJson();
          const limit = options.jobsAll ? null : options.jobsLimit;
          const statusRank: Record<Job["status"], number> = {
            running: 0,
            pending: 1,
            failed: 2,
            completed: 3,
          };
          payload.jobs.sort((a, b) => {
            const rankDiff = statusRank[a.status] - statusRank[b.status];
            if (rankDiff !== 0) return rankDiff;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          payload.jobs = applyJobsLimit(payload.jobs, limit);
          console.log(JSON.stringify(payload, null, 2));
          break;
        }

        const limit = options.jobsAll ? null : options.jobsLimit;
        const allJobs = refreshJobsForDisplay(listJobs());
        const jobs = applyJobsLimit(sortJobsRunningFirst(allJobs), limit);
        if (jobs.length === 0) {
          console.log("No jobs");
        } else {
          console.log("ID        STATUS      ELAPSED   EFFORT  PROMPT");
          console.log("-".repeat(80));
          for (const job of jobs) {
            console.log(formatJobStatus(job));
          }
        }
        break;
      }

      case "sessions": {
        const sessions = listSessions();
        if (sessions.length === 0) {
          console.log("No active cc-agent sessions");
        } else {
          console.log("SESSION NAME                    ATTACHED  CREATED");
          console.log("-".repeat(60));
          for (const session of sessions) {
            const attached = session.attached ? "yes" : "no";
            console.log(
              `${session.name.padEnd(30)}  ${attached.padEnd(8)}  ${session.created}`
            );
          }
        }
        break;
      }

      case "kill": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        if (killJob(positional[0], options.markCompleted)) {
          const label = options.markCompleted ? "Completed" : "Killed";
          console.log(`${label} job: ${positional[0]}`);
        } else {
          console.error(`Could not kill job: ${positional[0]}`);
          process.exit(1);
        }
        break;
      }

      case "clean": {
        const cleaned = cleanupOldJobs(7);
        console.log(`Cleaned ${cleaned} old jobs`);
        break;
      }

      case "dashboard": {
        const port = options.jobsLimit ?? DEFAULT_PORT; // reuse --limit for port for now
        // Parse --port from raw args
        const portIdx = args.indexOf("--port");
        const dashPort = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : DEFAULT_PORT;
        await startDashboard(dashPort);
        // Keep process alive
        await new Promise(() => {});
        break;
      }

      case "dashboard-stop": {
        if (stopDashboard()) {
          console.log("Dashboard stopped");
        } else {
          console.log("No dashboard running");
        }
        break;
      }

      case "setup-hooks": {
        const result = installHooks();
        if (result.installed.length > 0) {
          console.log(`Installed hooks: ${result.installed.join(", ")}`);
        }
        if (result.skipped.length > 0) {
          console.log(`Already installed: ${result.skipped.join(", ")}`);
        }
        console.log("Hooks will relay events to ~/.cc-agent/events.jsonl");
        break;
      }

      case "remove-hooks": {
        const result = removeHooks();
        if (result.removed.length > 0) {
          console.log(`Removed hooks: ${result.removed.join(", ")}`);
        }
        if (result.notFound.length > 0) {
          console.log(`Not found: ${result.notFound.join(", ")}`);
        }
        break;
      }

      case "delete": {
        if (positional.length === 0) {
          console.error("Error: No job ID provided");
          process.exit(1);
        }

        if (deleteJob(positional[0])) {
          console.log(`Deleted job: ${positional[0]}`);
        } else {
          console.error(`Could not delete job: ${positional[0]}`);
          process.exit(1);
        }
        break;
      }

      case "queue": {
        const subCmd = positional[0];
        if (!subCmd || subCmd === "help") {
          console.log("Usage:");
          console.log('  cc-agent queue add "prompt" [--priority N]');
          console.log("  cc-agent queue list [--status pending]");
          console.log("  cc-agent queue remove <id>");
          break;
        }

        switch (subCmd) {
          case "add": {
            const prompt = positional.slice(1).join(" ");
            if (!prompt) {
              console.error("Error: No prompt provided");
              console.error('Usage: cc-agent queue add "prompt" [--priority N]');
              process.exit(1);
            }
            const id = addQueueTask({ prompt, priority: options.priority });
            console.log(`Queued task #${id}: ${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}`);
            if (options.priority > 0) console.log(`Priority: ${options.priority}`);
            break;
          }
          case "list": {
            const tasks = getQueueTasks(options.statusFilter ?? undefined);
            if (tasks.length === 0) {
              console.log(options.statusFilter ? `No ${options.statusFilter} tasks` : "Queue is empty");
            } else {
              console.log("ID    PRIORITY  STATUS      PROMPT");
              console.log("-".repeat(70));
              for (const t of tasks) {
                const promptPreview = t.prompt.slice(0, 40) + (t.prompt.length > 40 ? "..." : "");
                console.log(
                  `${String(t.id).padEnd(6)}${String(t.priority).padEnd(10)}${t.status.padEnd(12)}${promptPreview}`
                );
              }
            }
            break;
          }
          case "remove": {
            const idStr = positional[1];
            if (!idStr) {
              console.error("Error: No task ID provided");
              process.exit(1);
            }
            const taskId = parseInt(idStr, 10);
            if (isNaN(taskId)) {
              console.error(`Invalid task ID: ${idStr}`);
              process.exit(1);
            }
            if (removeQueueTask(taskId)) {
              console.log(`Removed task #${taskId}`);
            } else {
              console.error(`Task #${taskId} not found`);
              process.exit(1);
            }
            break;
          }
          default:
            console.error(`Unknown queue subcommand: ${subCmd}`);
            process.exit(1);
        }
        break;
      }

      case "orchestrator": {
        const subCmd = positional[0];
        if (!subCmd || subCmd === "help") {
          console.log("Usage:");
          console.log("  cc-agent orchestrator start [--model opus] [--reasoning xhigh]");
          console.log("  cc-agent orchestrator stop");
          console.log("  cc-agent orchestrator status");
          console.log('  cc-agent orchestrator inject "message"');
          break;
        }

        switch (subCmd) {
          case "start": {
            if (!isTmuxAvailable()) {
              console.error("Error: tmux is required but not installed");
              process.exit(1);
            }
            const result = startOrchestrator({
              model: options.model,
              reasoning: options.reasoning,
            });
            if (result.success) {
              ensureDashboardRunning();
              console.log("Orchestrator started");
              console.log(`tmux session: cc-agent-orch`);
              console.log(`Attach: tmux attach -t cc-agent-orch`);
            } else {
              console.error(`Failed to start orchestrator: ${result.error}`);
              process.exit(1);
            }
            break;
          }
          case "stop": {
            const result = stopOrchestrator();
            if (result.success) {
              console.log("Orchestrator stopped");
            } else {
              console.error(`Failed to stop orchestrator: ${result.error}`);
              process.exit(1);
            }
            break;
          }
          case "status": {
            const status = getOrchestratorStatus();
            console.log(`Running: ${status.running ? "yes" : "no"}`);
            if (status.running) {
              console.log(`Idle: ${status.idle ? "yes" : "no"}`);
              if (status.contextPct !== undefined) {
                console.log(`Context: ${status.contextPct}%`);
              }
              if (status.state) {
                console.log(`Current task: ${status.state.current_task ?? "none"}`);
                console.log(`Active agents: ${status.state.active_agents.length}`);
                console.log(`Last saved: ${status.state.last_saved}`);
              }
            }
            break;
          }
          case "inject": {
            const message = positional.slice(1).join(" ");
            if (!message) {
              console.error("Error: No message provided");
              console.error('Usage: cc-agent orchestrator inject "message"');
              process.exit(1);
            }
            if (injectToOrchestrator(message)) {
              console.log(`Injected message into orchestrator`);
            } else {
              console.error("Failed to inject message (orchestrator may not be running)");
              process.exit(1);
            }
            break;
          }
          default:
            console.error(`Unknown orchestrator subcommand: ${subCmd}`);
            process.exit(1);
        }
        break;
      }

      case "trigger": {
        const subCmd = positional[0];
        if (!subCmd || subCmd === "help") {
          console.log("Usage:");
          console.log('  cc-agent trigger add <name> <type> <condition> <action> [--payload \'{"prompt":"..."}\'] [--autonomy auto|confirm] [--cooldown 60]');
          console.log("  cc-agent trigger list");
          console.log("  cc-agent trigger toggle <id>");
          console.log("  cc-agent trigger remove <id>");
          console.log("");
          console.log("Types: cron, event, threshold");
          console.log("Actions: inject_prompt, clear_context, start_orchestrator, queue_task, notify");
          break;
        }

        switch (subCmd) {
          case "add": {
            // trigger add <name> <type> <condition> <action>
            const [name, type, condition, action] = positional.slice(1);
            if (!name || !type || !condition || !action) {
              console.error("Error: name, type, condition, and action are required");
              console.error('Usage: cc-agent trigger add <name> <type> <condition> <action> [--payload \'...\'] [--autonomy auto|confirm] [--cooldown 60]');
              process.exit(1);
            }
            const validTypes = ["cron", "event", "threshold"];
            if (!validTypes.includes(type)) {
              console.error(`Invalid type: ${type}. Must be one of: ${validTypes.join(", ")}`);
              process.exit(1);
            }
            const validActions = ["inject_prompt", "clear_context", "start_orchestrator", "queue_task", "notify"];
            if (!validActions.includes(action)) {
              console.error(`Invalid action: ${action}. Must be one of: ${validActions.join(", ")}`);
              process.exit(1);
            }
            try {
              const id = addTrigger({
                name,
                type,
                condition,
                action,
                action_payload: options.payload ?? undefined,
                autonomy: options.autonomy ?? undefined,
                cooldown_seconds: options.cooldown ?? undefined,
              });
              console.log(`Trigger #${id} "${name}" created`);
              console.log(`  Type: ${type} | Condition: ${condition}`);
              console.log(`  Action: ${action} | Autonomy: ${options.autonomy ?? "confirm"}`);
            } catch (err: any) {
              if (err.message?.includes("UNIQUE")) {
                console.error(`Trigger name "${name}" already exists`);
              } else {
                console.error(`Failed to create trigger: ${err.message}`);
              }
              process.exit(1);
            }
            break;
          }
          case "list": {
            const triggers = getTriggers();
            if (triggers.length === 0) {
              console.log("No triggers configured");
            } else {
              console.log("ID    ENABLED  TYPE        AUTONOMY  COOLDOWN  NAME                  CONDITION");
              console.log("-".repeat(95));
              for (const t of triggers) {
                const enabled = t.enabled ? "yes" : "no";
                const condPreview = t.condition.slice(0, 20) + (t.condition.length > 20 ? "..." : "");
                console.log(
                  `${String(t.id).padEnd(6)}${enabled.padEnd(9)}${t.type.padEnd(12)}${t.autonomy.padEnd(10)}${String(t.cooldown_seconds ?? 60).padEnd(10)}${t.name.padEnd(22)}${condPreview}`
                );
              }
            }
            break;
          }
          case "toggle": {
            const idStr = positional[1];
            if (!idStr) {
              console.error("Error: No trigger ID provided");
              process.exit(1);
            }
            const triggerId = parseInt(idStr, 10);
            if (isNaN(triggerId)) {
              console.error(`Invalid trigger ID: ${idStr}`);
              process.exit(1);
            }
            if (toggleTrigger(triggerId)) {
              console.log(`Trigger #${triggerId} toggled`);
            } else {
              console.error(`Trigger #${triggerId} not found`);
              process.exit(1);
            }
            break;
          }
          case "remove": {
            const idStr = positional[1];
            if (!idStr) {
              console.error("Error: No trigger ID provided");
              process.exit(1);
            }
            const triggerId = parseInt(idStr, 10);
            if (isNaN(triggerId)) {
              console.error(`Invalid trigger ID: ${idStr}`);
              process.exit(1);
            }
            if (removeTrigger(triggerId)) {
              console.log(`Trigger #${triggerId} removed`);
            } else {
              console.error(`Trigger #${triggerId} not found`);
              process.exit(1);
            }
            break;
          }
          default:
            console.error(`Unknown trigger subcommand: ${subCmd}`);
            process.exit(1);
        }
        break;
      }

      case "pulse": {
        const subCmd = positional[0];
        if (!subCmd || subCmd === "help") {
          console.log("Usage:");
          console.log("  cc-agent pulse start    Start the pulse loop");
          console.log("  cc-agent pulse stop     Stop the pulse loop");
          console.log("  cc-agent pulse status   Show pulse loop status");
          break;
        }

        switch (subCmd) {
          case "start": {
            try {
              const res = await fetch(`http://localhost:${DEFAULT_PORT}/api/pulse/start`, { method: "POST" });
              if (res.ok) {
                console.log("Pulse started (10s interval)");
              } else {
                const data = await res.json();
                console.error(`Failed to start pulse: ${data.error}`);
                process.exit(1);
              }
            } catch {
              console.error("Dashboard not running. Start it first: cc-agent dashboard");
              process.exit(1);
            }
            break;
          }
          case "stop": {
            try {
              const res = await fetch(`http://localhost:${DEFAULT_PORT}/api/pulse/stop`, { method: "POST" });
              if (res.ok) {
                console.log("Pulse stopped");
              } else {
                const data = await res.json();
                console.error(`Failed to stop pulse: ${data.error}`);
                process.exit(1);
              }
            } catch {
              console.error("Dashboard not running. Start it first: cc-agent dashboard");
              process.exit(1);
            }
            break;
          }
          case "status": {
            try {
              const res = await fetch(`http://localhost:${DEFAULT_PORT}/api/pulse/status`);
              const status = await res.json();
              console.log(`Running: ${status.running ? "yes" : "no"}`);
              if (status.last_tick) console.log(`Last tick: ${status.last_tick}`);
              if (status.next_tick) console.log(`Next tick: ${status.next_tick}`);
              console.log(`Orchestrator: ${status.orchestrator_running ? "running" : "stopped"}`);
              console.log(`Queue depth: ${status.queue_depth}`);
              console.log(`Active triggers: ${status.active_triggers}`);
              console.log(`Pending approvals: ${status.pending_approvals}`);
            } catch {
              console.log("Running: no (dashboard not reachable)");
            }
            break;
          }
          default:
            console.error(`Unknown pulse subcommand: ${subCmd}`);
            process.exit(1);
        }
        break;
      }

      case "mode": {
        const subCmd = positional[0];
        if (!subCmd || subCmd === "help") {
          console.log("Usage:");
          console.log("  cc-agent mode list                           List available modes");
          console.log("  cc-agent mode activate <name>                Activate a mode (replaces triggers)");
          console.log('  cc-agent mode create <name> [--description "..."] [--from-current]');
          console.log("  cc-agent mode delete <name>                  Delete a mode");
          break;
        }

        switch (subCmd) {
          case "list": {
            const modes = getModes();
            const active = getActiveMode();
            if (modes.length === 0) {
              console.log("No modes configured");
            } else {
              console.log("NAME            ACTIVE  TRIGGERS  DESCRIPTION");
              console.log("-".repeat(75));
              for (const m of modes) {
                const isActive = m.is_active ? "yes" : "no";
                let triggerCount = 0;
                try { triggerCount = JSON.parse(m.trigger_config).length; } catch {}
                const desc = (m.description ?? "").slice(0, 35) + ((m.description ?? "").length > 35 ? "..." : "");
                console.log(
                  `${m.name.padEnd(16)}${isActive.padEnd(8)}${String(triggerCount).padEnd(10)}${desc}`
                );
              }
            }
            break;
          }
          case "activate": {
            const name = positional[1];
            if (!name) {
              console.error("Error: No mode name provided");
              console.error("Usage: cc-agent mode activate <name>");
              process.exit(1);
            }
            if (activateModeByName(name)) {
              console.log(`Mode "${name}" activated`);
              const triggers = getTriggers();
              console.log(`${triggers.length} trigger(s) installed`);
            } else {
              console.error(`Mode "${name}" not found`);
              process.exit(1);
            }
            break;
          }
          case "create": {
            const name = positional[1];
            if (!name) {
              console.error("Error: No mode name provided");
              console.error('Usage: cc-agent mode create <name> [--description "..."] [--from-current]');
              process.exit(1);
            }
            try {
              let id: number;
              if (options.fromCurrent) {
                id = createModeFromCurrent(name, options.description ?? undefined);
                const currentTriggers = getTriggers();
                console.log(`Mode "${name}" created from ${currentTriggers.length} current trigger(s)`);
              } else {
                // Create an empty mode (triggers can be added via activate + trigger add + save)
                const { createMode } = await import("./dashboard/db.ts");
                id = createMode({
                  name,
                  description: options.description ?? undefined,
                  trigger_config: "[]",
                });
                console.log(`Mode "${name}" created (empty — use --from-current to snapshot triggers)`);
              }
            } catch (err: any) {
              if (err.message?.includes("UNIQUE")) {
                console.error(`Mode name "${name}" already exists`);
              } else {
                console.error(`Failed to create mode: ${err.message}`);
              }
              process.exit(1);
            }
            break;
          }
          case "delete": {
            const name = positional[1];
            if (!name) {
              console.error("Error: No mode name provided");
              console.error("Usage: cc-agent mode delete <name>");
              process.exit(1);
            }
            const mode = getModeByName(name);
            if (!mode) {
              console.error(`Mode "${name}" not found`);
              process.exit(1);
            }
            if (deleteMode(mode.id)) {
              console.log(`Mode "${name}" deleted`);
            } else {
              console.error(`Failed to delete mode "${name}"`);
              process.exit(1);
            }
            break;
          }
          default:
            console.error(`Unknown mode subcommand: ${subCmd}`);
            process.exit(1);
        }
        break;
      }

      default:
        // Treat as prompt for start command
        if (command) {
          // Check tmux first
          if (!isTmuxAvailable()) {
            console.error("Error: tmux is required but not installed");
            console.error("Install with: brew install tmux");
            process.exit(1);
          }

          const prompt = [command, ...positional].join(" ");

          if (options.dryRun) {
            const tokens = estimateTokens(prompt);
            console.log(`Would send ~${tokens.toLocaleString()} tokens`);
            process.exit(0);
          }

          const job = startJob({
            prompt,
            model: options.model,
            reasoningEffort: options.reasoning,
            sandbox: options.sandbox,
            parentSessionId: options.parentSessionId ?? undefined,
            cwd: options.dir,
          });

          // Auto-start dashboard if not already running
          ensureDashboardRunning();

          console.log(`Job started: ${job.id}`);
          console.log(`tmux session: ${job.tmuxSession}`);
          console.log(`Attach: tmux attach -t ${job.tmuxSession}`);
        } else {
          console.log(HELP);
        }
    }
  } catch (err) {
    console.error("Error:", (err as Error).message);
    process.exit(1);
  }
}

main();
