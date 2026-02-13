# The CC-Orchestrator: A Comprehensive Guide to Autonomous AI Agent Coordination

> *"The key insight: all primitives exist in the codebase. tmux command injection, WebSocket terminal streaming, SSE events, hooks, SQLite, REST APIs. This project wires them into a nervous system."*
> — from the Autonomous Orchestrator PRD

---

## Table of Contents

1. [What Is This?](#1-what-is-this)
2. [The Philosophy: Why This Exists](#2-the-philosophy-why-this-exists)
3. [Architecture: The Nervous System](#3-architecture-the-nervous-system)
4. [Getting Started: From Zero to Your First Agent Army](#4-getting-started-from-zero-to-your-first-agent-army)
5. [The Dashboard: Your Command Center](#5-the-dashboard-your-command-center)
6. [The Autonomy Gradient: From Manual to Autonomous](#6-the-autonomy-gradient-from-manual-to-autonomous)
7. [The Orchestrator: Your AI General](#7-the-orchestrator-your-ai-general)
8. [Hooks: Teaching Your Agents to Sense Their Environment](#8-hooks-teaching-your-agents-to-sense-their-environment)
9. [Real-Time Communication: How Information Flows](#9-real-time-communication-how-information-flows)
10. [Storage and State: Memory Across Time](#10-storage-and-state-memory-across-time)
11. [The Plugin System: Sharing the Power](#11-the-plugin-system-sharing-the-power)
12. [Advanced Patterns: Mastering the System](#12-advanced-patterns-mastering-the-system)
13. [CLI Reference: Every Command at Your Fingertips](#13-cli-reference-every-command-at-your-fingertips)
14. [Troubleshooting](#14-troubleshooting)
15. [Future Vision: Where This Goes Next](#15-future-vision-where-this-goes-next)

---

## 1. What Is This?

CC-Orchestrator is a **Claude Code plugin** that transforms how you work with AI coding agents. Instead of one Claude Code instance doing everything, you command an *army* of specialized Claude Code agents — each running in its own tmux session, each focused on a specific task, all monitored from a single real-time dashboard.

Think of it as the difference between having one developer and having a development *team*. You're the technical lead. Claude instances are your generals. Claude Code agents are the developers writing code.

```
YOU (the human)
  │
  ├── Claude #1 (General) ─── orchestrates ───┐
  │       ├── Agent: "Implement auth module"   │
  │       ├── Agent: "Write API tests"         │ real-time
  │       └── Agent: "Security audit"          │ dashboard
  │                                            │
  ├── Claude #2 (General) ─── orchestrates ───┤
  │       ├── Agent: "Refactor database"       │ monitors
  │       └── Agent: "Fix N+1 queries"         │ everything
  │                                            │
  └── Dashboard (localhost:3131) ──────────────┘
        Live terminals, event timeline,
        analytics, agent control
```

**What you get:**

- **Parallel execution**: 5, 10, 15+ agents working simultaneously on your codebase
- **Real-time visibility**: Watch every agent's terminal output in your browser, see every tool call as it happens
- **Bidirectional communication**: Send messages to agents, start new ones, kill stuck ones — all from the dashboard
- **Autonomous operation**: The orchestrator can process task queues, respond to triggers, self-heal from crashes, and manage its own context — all without human intervention
- **Gradual autonomy**: Start fully manual, add automation at your own pace. Every level of autonomy is configurable
- **Historical analytics**: Track token usage, job durations, tool call patterns over time

---

## 2. The Philosophy: Why This Exists

### The Problem with One Agent

Claude Code is extraordinary at focused coding tasks. But when you need to:

- Implement a feature while simultaneously running security review
- Research one part of the codebase while building another
- Run tests while refactoring adjacent code

...you hit a wall. One agent, one context window, one task at a time.

### The Orchestration Solution

CC-Orchestrator embraces a military command structure:

| Role | Who | Responsibility |
|------|-----|----------------|
| **Commander** | You (human) | Strategic vision, approve/reject, course-correct |
| **General** | Claude (Opus) | Task decomposition, agent management, synthesis |
| **Army** | Claude Code agents | Focused implementation, research, testing |

The generals handle the *how*. You handle the *what* and *why*. The army handles the *doing*.

### Design Principles

1. **Strong defaults, progressive disclosure**: `cc-agent start "prompt"` just works. Model (Opus), reasoning (xhigh), sandbox (workspace-write) — all pre-configured for quality. Advanced options are there when you need them.

2. **The filesystem is the API**: Jobs are JSON files. Events are JSONL lines. State is a JSON file. Everything is inspectable, debuggable, and composable with standard Unix tools.

3. **tmux as the universal substrate**: Every agent runs in a tmux session. You can always `tmux attach` to see exactly what's happening. The dashboard adds visibility, not indirection.

4. **Gradual autonomy**: You control how much the system does on its own. Start with manual agent spawning. Add event-driven triggers. Enable the autonomous pulse loop. Each step is optional and reversible.

5. **Real-time over batch**: SSE for status updates. WebSocket for terminal streaming. Hook events for tool call tracking. The dashboard shows you what's happening *now*, not what happened.

---

## 3. Architecture: The Nervous System

The architecture has three major planes that work together:

### 3.1 The Execution Plane

This is where work actually happens.

```
CLI (src/cli.ts)
  │ parses commands, routes to functions
  │
  ├── Jobs (src/jobs.ts)
  │     │ creates, tracks, persists job lifecycle
  │     │
  │     └── tmux (src/tmux.ts)
  │           │ creates sessions, sends keystrokes, captures output
  │           │
  │           └── Claude Code (external binary)
  │                 runs in tmux with --dangerously-skip-permissions
  │
  └── Files (src/files.ts)
        loads file context for agent prompts
```

When you run `cc-agent start "Implement auth"`, this happens:

1. **CLI** parses your command and flags
2. **Jobs** generates an 8-character hex ID, creates `~/.cc-agent/jobs/{id}.json` and `{id}.prompt`
3. **tmux** creates a session named `cc-agent-{id}`, starts `script` to log output to `{id}.log`
4. **Claude Code** launches inside tmux with your prompt, model, reasoning level, and sandbox mode
5. **Dashboard** auto-starts in the background if not already running

The job file is the source of truth. It tracks status (`pending` → `running` → `completed`/`failed`), timestamps, model, prompt, and tmux session name.

### 3.2 The Monitoring Plane (Dashboard)

The dashboard is a Hono HTTP server running on Bun that provides real-time visibility.

```
Browser (Preact UI)
  │
  ├── SSE (/api/events)     ← job status, metrics, hook events, orchestrator events
  ├── WebSocket (/api/terminal/:id) ← live terminal output
  ├── REST (/api/*)          ← on-demand queries, actions
  │
Hono Server (src/dashboard/server.ts)
  │
  ├── DashboardState (state.ts)
  │     │ in-memory state, fs.watch, EventEmitter
  │     │
  │     ├── fs.watch on ~/.cc-agent/jobs/  (200ms debounce)
  │     ├── 5s polling for running jobs    (catches tmux completion)
  │     └── EventsReader (events-reader.ts)
  │           tail-follows events.jsonl     (byte-offset tracking)
  │
  ├── TerminalStreamer (terminal-stream.ts)
  │     reads .log files with byte-offset deltas (500ms polling)
  │
  ├── SQLite (db.ts)
  │     historical jobs, events, metrics, queue, triggers, modes
  │
  └── Event Bus (event-bus.ts)
        propagates orchestrator events to SSE without circular imports
```

The dashboard starts automatically when you spawn your first agent. It runs as a background daemon with a pidfile at `~/.cc-agent/dashboard.pid`. The pulse loop also starts automatically with the dashboard.

### 3.3 The Autonomy Plane (Orchestrator)

The orchestrator is a Claude Code instance that *runs other Claude Code instances*. It's the "brain" of the system.

```
Pulse Loop (10s interval)
  │
  ├── Health Check
  │     Is cc-agent-orch tmux session alive?
  │     No → respawn + inject saved state
  │
  ├── Trigger Evaluation
  │     ├── Cron: does "*/15 * * * *" match now?
  │     ├── Event: did job_completed fire?
  │     └── Threshold: is queue_depth >= 5?
  │     │
  │     └── auto → execute immediately
  │         confirm → create pending approval
  │
  ├── Queue Processing
  │     Is orchestrator idle AND queue has pending tasks?
  │     Yes → dequeue, inject prompt, track
  │
  └── SSE Emission
        Broadcast pulse_tick summary to dashboard
```

The orchestrator uses a **fixed job ID** (`"orch"`) instead of a random hex ID. This means it always lives at:
- tmux session: `cc-agent-orch`
- Log file: `~/.cc-agent/jobs/orch.log`
- Job metadata: `~/.cc-agent/jobs/orch.json`
- State: `~/.cc-agent/orchestrator-state.json`
- Terminal WebSocket: `/api/terminal/orch`

### 3.4 How Signals Propagate

The system has five distinct signal paths — its "nervous system":

**Path 1: Hook Event Pipeline** (environment sensing)
```
Claude Code hook fires → stdin JSON → hooks-relay.sh → jq processing
  → events.jsonl append → EventsReader fs.watch → DashboardState emit
  → SSE broadcast → Browser timeline/activity indicator
```

**Path 2: File System Change Detection** (status awareness)
```
Job file changes → fs.watch on ~/.cc-agent/jobs/ (200ms debounce)
  → DashboardState.refresh() → diff detection via JSON stringify
  → emit job_created/updated/completed/failed → SSE → Browser
```

**Path 3: Terminal Output Streaming** (real-time output)
```
Claude Code writes to terminal → script command captures to .log file
  → TerminalStreamer polls .log (500ms) with byte-offset tracking
  → sends {type: "delta", data: ...} over WebSocket → xterm.js renders
```

**Path 4: Bidirectional Communication** (human → agent)
```
Browser input → POST /api/actions/jobs/:id/send (or WebSocket {type: "input"})
  → sendToJob() → tmux send-keys → keystrokes appear in Claude Code's terminal
```

**Path 5: Orchestrator Events** (autonomy signals)
```
triggers.ts fires trigger → orchestratorBus.emit("state_event")
  → state.ts receives via bus subscription → emits as SSE StateEvent
  → Browser OrchestratorView updates panels
```

---

## 4. Getting Started: From Zero to Your First Agent Army

### Prerequisites

Three things must be installed:

1. **tmux** — terminal multiplexer (agents run in tmux sessions)
2. **Bun** — JavaScript runtime (runs the CLI)
3. **Claude Code CLI** — the AI coding agent being orchestrated

### Installation

If you're installing as a Claude Code plugin:

```bash
# In Claude Code:
/plugin marketplace add Narcis13/cc-master
/plugin install cc-orchestrator
```

Or manually:

```bash
git clone https://github.com/Narcis13/cc-master.git ~/.cc-orchestrator
cd ~/.cc-orchestrator
bun install
# Add to PATH:
export PATH="$HOME/.cc-orchestrator/bin:$PATH"
```

### Quick Health Check

```bash
cc-agent health
# Output:
# tmux: OK
# claude: 1.x.x (/path/to/claude)
# Status: Ready
```

### Your First Agent

```bash
# Start an agent with a task
cc-agent start "List all TypeScript files in the project and summarize the architecture"

# Output:
# Job started: a1b2c3d4
# Model: opus (xhigh)
# Working dir: /your/project
# tmux session: cc-agent-a1b2c3d4
#
# Commands:
#   Capture output:  cc-agent capture a1b2c3d4
#   Send message:    cc-agent send a1b2c3d4 "message"
#   Attach session:  tmux attach -t cc-agent-a1b2c3d4
```

The dashboard auto-starts in the background. Open `http://localhost:3131` to see your agent working in real-time.

### Spawn an Army

```bash
# Research agents (read-only — they can't modify files)
cc-agent start "Audit the auth flow for vulnerabilities" --map -s read-only
cc-agent start "Find all N+1 query patterns" --map -s read-only
cc-agent start "Review error handling across the API" --map -s read-only

# Implementation agent (can modify files)
cc-agent start "Implement the user profile feature per docs/prds/profile.md" --map

# Check them all
cc-agent jobs
```

### Enable Real-Time Event Tracking

```bash
# Install Claude Code hooks (one-time setup)
cc-agent setup-hooks

# Now every tool call, file edit, and lifecycle event
# appears in the dashboard Timeline view in real-time
```

### Generate a Codebase Map (Recommended)

The `--map` flag gives agents instant architectural context. First, generate the map:

```bash
# Using the Cartographer skill (included):
/cartographer
# Or manually trigger it — creates docs/CODEBASE_MAP.md
```

Then every `cc-agent start ... --map` command injects the codebase map into the agent's prompt. Agents that have the map start working immediately instead of spending time exploring.

---

## 5. The Dashboard: Your Command Center

The dashboard at `localhost:3131` is a dark-themed, real-time monitoring interface built with Preact and xterm.js.

### Views

| View | Route | Purpose |
|------|-------|---------|
| **Dashboard** | `#/` | Job grid with filter/sort/search, status metrics, activity indicators |
| **Job Detail** | `#/jobs/:id` | Full job view: terminal output, prompt, tokens, files modified, per-job timeline |
| **Timeline** | `#/timeline` | Chronological event feed from Claude Code hooks (tool calls, file edits, errors) |
| **Notifications** | `#/notifications` | Alert panel: completions, failures, context warnings |
| **Analytics** | `#/analytics` | Canvas-rendered charts: token usage, job duration, daily trends |
| **Split Terminal** | `#/split` | Multi-terminal view (1x1, 2x1, 2x2 layouts) for watching multiple agents |
| **Pipeline** | `#/pipeline` | Gantt-style timeline showing all jobs on a time axis, colored by status |
| **Database** | `#/db` | Historical browser: past jobs, events, tool usage analytics |
| **Orchestrator** | `#/orchestrator` | Orchestrator control: terminal, queue, triggers, modes, approvals, pulse |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | Open New Agent modal |
| `/` | Focus search input |
| `?` | Show help overlay |
| `Ctrl+K` | Command palette (fuzzy search for navigation, actions, jobs) |
| `Esc` | Close any modal/overlay |

### The Job Card

Each job card shows:
- **Status badge**: Running (blue, pulsing), Pending (amber), Completed (green), Failed (red)
- **Model and reasoning level**: e.g., "opus/xhigh"
- **Live elapsed timer**: Updates every second for running jobs
- **Token usage**: Input/output tokens with context percentage
- **Prompt preview**: First line of the task prompt
- **Activity indicator**: Shows current tool call for running agents (e.g., "Using Edit...")

Click any card to see the full Job Detail with live terminal output.

### The Terminal Panel

The terminal panel uses xterm.js to render full ANSI output — colors, cursor movement, the full terminal experience. You're seeing exactly what you'd see if you `tmux attach`ed to the session.

Below the terminal is a **message input** where you can send follow-up instructions to a running agent. Type your message and press Enter — it's sent via tmux keystrokes to the agent's terminal.

### Split Terminal

The Split Terminal view lets you watch 2-4 agents simultaneously in a grid layout:
- **1x1**: Single agent, full-width
- **2x1**: Two agents side by side
- **2x2**: Four agents in a grid

Each panel has a chip selector to pick which agent to watch. Great for monitoring parallel research or implementation agents.

---

## 6. The Autonomy Gradient: From Manual to Autonomous

One of the most powerful aspects of CC-Orchestrator is its **gradual autonomy model**. You can operate at any level of automation, and mix levels freely.

### Level 0: Pure CLI (Fully Manual)

You type commands, agents execute. No automation.

```bash
cc-agent start "Implement feature X" --map
cc-agent jobs
cc-agent capture abc123
cc-agent send abc123 "Also handle the edge case for null inputs"
cc-agent kill abc123 --completed
```

**When to use**: Learning the system, one-off tasks, tasks requiring constant human judgment.

### Level 1: Dashboard Monitoring (Visual Manual)

Same as Level 0, but you use the dashboard instead of CLI commands. The dashboard gives you:
- Real-time terminal output without `cc-agent capture`
- Click-to-act instead of typing job IDs
- Visual overview of all agents at once
- Event timeline showing what tools agents are using

**When to use**: Managing 3+ agents simultaneously, wanting visual feedback.

### Level 2: Event Triggers with Confirmation

The system detects conditions and proposes actions. You approve or reject.

```bash
# When any job fails, propose a retry
cc-agent trigger add "auto-retry" event "job_failed" queue_task \
  --payload '{"prompt":"Investigate and fix the failure from the last agent"}' \
  --autonomy confirm

# When context exceeds 80%, propose clearing
cc-agent trigger add "context-guard" threshold "context_used_pct > 80" clear_context \
  --autonomy confirm
```

Triggers with `--autonomy confirm` create pending approvals in the dashboard. You see a notification, review the proposed action, and click Approve or Reject.

**When to use**: When you want the system to watch for conditions but keep final control.

### Level 3: Automatic Triggers

The system acts on conditions without asking.

```bash
# Automatically inject a status check every 15 minutes
cc-agent trigger add "status-check" cron "*/15 * * * *" inject_prompt \
  --payload '{"prompt":"Give a brief status update on current progress"}' \
  --autonomy auto

# When a job completes, automatically queue a review
cc-agent trigger add "auto-review" event "job_completed" queue_task \
  --payload '{"prompt":"Review the changes made by the last completed agent for quality"}' \
  --autonomy auto

# If more than 5 tasks pile up, notify via dashboard
cc-agent trigger add "queue-warning" threshold "queue_depth >= 5" notify \
  --payload '{"message":"Queue is backing up — consider starting the orchestrator"}' \
  --autonomy auto
```

**When to use**: Routine tasks, well-understood workflows, trusted patterns.

### Level 4: Full Autonomous Operation

The orchestrator runs as a persistent Claude Code instance, processing a task queue autonomously. The pulse loop checks health, evaluates triggers, and injects work every 10 seconds.

```bash
# Start the orchestrator
cc-agent orchestrator start

# Queue tasks for it
cc-agent queue add "Implement the user authentication module" --priority 10
cc-agent queue add "Write integration tests for the API layer" --priority 5
cc-agent queue add "Run security audit on all external-facing endpoints" --priority 3

# Activate a preset mode (replaces all triggers with a curated set)
cc-agent mode activate dev

# The pulse loop (already running with dashboard) will:
# 1. Check orchestrator health every 10s
# 2. Evaluate all triggers (cron, event, threshold)
# 3. Inject the highest-priority queued task when idle
# 4. Respawn if the orchestrator crashes
# 5. Auto-clear context when usage exceeds thresholds
```

**When to use**: Overnight batch processing, well-defined task pipelines, maximum throughput.

### Modes: Preset Trigger Profiles

Modes are named collections of trigger configurations. Activating a mode replaces all current triggers with the mode's predefined set.

```bash
# See available modes
cc-agent mode list

# Built-in presets:
# dev         — Queue check every 15min, health report every 30min (auto)
# maintenance — Nightly cleanup at 2am, weekly audit Monday 8am (confirm)
# sprint      — Queue check every 5min, low-capacity alert, continuous processing (auto)

# Activate one
cc-agent mode activate sprint

# Save your current trigger configuration as a custom mode
cc-agent mode create my-workflow --from-current --description "My trigger setup for feature work"
```

### The Self-Configuration Loop

Here's where it gets interesting: the orchestrator is a Claude Code instance that can run `cc-agent` commands via its Bash tool. This means **the orchestrator can modify its own configuration**:

- Queue tasks for itself: `cc-agent queue add "..."`
- Change its own triggers: `cc-agent trigger add "..." --autonomy auto`
- Switch modes: `cc-agent mode activate sprint`
- Monitor its own workers: `cc-agent jobs --json`

This creates a recursive self-management system. The orchestrator can decide it needs to scale up (spawn more agents), scale down (queue tasks instead of parallel execution), or change strategy (switch to review mode after implementation completes).

---

## 7. The Orchestrator: Your AI General

The orchestrator is a special Claude Code instance with a fixed identity (`cc-agent-orch`) that acts as the autonomous coordinator.

### How It Thinks

When started, the orchestrator receives an initial prompt that explains its role:

> *"You are the CC-Agent Orchestrator — a persistent Claude Code instance that manages worker agents. Your capabilities: start worker agents, check status, send messages, monitor output. When you receive a SYSTEM message, follow its instructions."*

The orchestrator uses Claude Code's Bash tool to run `cc-agent` commands, effectively commanding its army programmatically.

### The Task Queue

Tasks are stored in SQLite, ordered by priority (higher = more urgent), then by creation time.

```bash
cc-agent queue add "Critical: fix the authentication bypass" --priority 10
cc-agent queue add "Refactor the database connection pool" --priority 3
cc-agent queue add "Write documentation for the API" --priority 1
```

The pulse loop checks every 10 seconds: if the orchestrator is idle (no current task + log file unchanged for 30s) and the queue has pending tasks, it dequeues the highest-priority task and injects it as a `SYSTEM:` message.

### Context Lifecycle Management

Claude Code instances have finite context windows. The orchestrator's context lifecycle is managed automatically:

| Context % | What Happens |
|-----------|-------------|
| < 70% | Normal operation |
| >= 70% | **Warn**: System auto-saves state, tells orchestrator to summarize current work |
| >= 80% | **Interrupt + Clear**: Send Escape to cancel any in-progress turn, wait 2s, send `/clear` |
| After clear | **Resume**: Wait 5s, inject "Read your saved state and resume" |

The key insight is that `/clear` only works when Claude is at the `>` prompt (idle). If Claude is mid-turn, the clear command gets queued as pending input and never executes. That's why the system sends Escape first to interrupt, waits for Claude to return to the prompt, then clears.

State is persisted to `~/.cc-agent/orchestrator-state.json`:

```json
{
  "started_at": "2026-02-12T10:00:00.000Z",
  "status": "idle",
  "current_task": null,
  "active_agents": ["a1b2c3d4", "e5f6g7h8"],
  "completed_tasks": [
    {"id": 1, "description": "Implemented auth module", "result": "completed", "completed_at": "..."}
  ],
  "pending_tasks": [],
  "notes": "Context at 73%, auto-saved before clear",
  "last_saved": "2026-02-12T10:45:00.000Z"
}
```

### Self-Healing

If the orchestrator tmux session crashes or is killed, the pulse loop detects it within 10 seconds and:

1. Respawns a new orchestrator instance (respawn guard: max 1 per 60s)
2. Waits 5 seconds for Claude to boot
3. Injects: *"SYSTEM: You were respawned after a crash. Read your saved state and resume."*

The orchestrator reads its state file and picks up where it left off.

---

## 8. Hooks: Teaching Your Agents to Sense Their Environment

Claude Code hooks are the system's sensory organs. They provide real-time visibility into what every agent is doing, without polling or guessing.

### How Hooks Work

Claude Code fires lifecycle events during operation. CC-Orchestrator installs a hook relay script that captures these events:

```
Claude Code agent runs a tool (e.g., Edit src/auth.ts)
  │
  ├── PreToolUse hook fires → relay-event.sh receives JSON on stdin
  │     { "hook_event_name": "PreToolUse", "tool_name": "Edit", "session_id": "...", ... }
  │
  └── relay-event.sh:
        1. Reads JSON from stdin
        2. Extracts job ID from tmux session name (cc-agent-{id} → {id})
        3. Adds timestamp
        4. Appends event line to ~/.cc-agent/events.jsonl
```

### Installed Hooks

| Hook | When It Fires | What It Captures |
|------|--------------|------------------|
| `PreToolUse` | Before any tool call | Tool name, input (what the agent is about to do) |
| `PostToolUse` | After Write/Edit/Bash complete | Tool name, input, result |
| `PostToolUseFailure` | When a tool call fails | Tool name, error details |
| `Stop` | Agent finishes a turn | Completion signal |
| `Notification` | Agent sends a notification | Message, type |
| `SessionStart` | Agent session begins | Session ID, model |
| `SessionEnd` | Agent session ends | Completion reason |
| `PreCompact` | Context is about to compact | Compaction trigger |

All hooks are **async: true** — they never block the agent's work. The monitoring system is observational, not decisional.

### Setting Up Hooks

```bash
# Install hooks (one-time, idempotent)
cc-agent setup-hooks

# Verify
# Check ~/.claude/settings.json — you'll see the hook configuration

# Remove if needed
cc-agent remove-hooks
```

### What You See in the Dashboard

With hooks enabled, the **Timeline** view shows a chronological feed:

```
10:31:42  a1b2c3d4  Edit src/auth/session.ts
10:31:38  e5f6g7h8  Read src/auth/jwt.ts
10:31:35  a1b2c3d4  Write src/auth/types.ts
10:31:30  i9j0k1l2  Grep "\.find\(" across 42 files
10:31:25  m3n4o5p6  ✓ Completed — 4 files modified
```

The **Job Cards** on the dashboard show activity indicators for running agents — a pulsing dot with the current tool name (e.g., "Using Bash...").

The **Job Detail** view has a per-job sidebar showing that agent's event log.

---

## 9. Real-Time Communication: How Information Flows

CC-Orchestrator uses four distinct real-time communication protocols, each chosen for its specific strengths.

### SSE (Server-Sent Events) — Status Updates

**Why SSE**: Job status updates are one-way (server → browser) and need auto-reconnection. SSE provides both natively via the browser's `EventSource` API.

```
Browser                           Server
  │                                 │
  ├─── EventSource(/api/events) ──→ │
  │                                 │ (sends snapshot of all jobs + metrics)
  │ ←── event: snapshot ───────────│
  │                                 │
  │ ←── event: job_updated ────────│ (every time a job changes)
  │ ←── event: hook_event ─────────│ (every time a hook fires)
  │ ←── event: pulse_tick ─────────│ (every 10s from pulse loop)
  │ ←── event: heartbeat ─────────│ (every 30s to keep connection alive)
  │                                 │
  │ (connection drops)              │
  │                                 │
  ├─── EventSource reconnects ────→│
  │ ←── event: snapshot ───────────│ (full state, no delta merge needed)
```

Event types: `snapshot`, `job_created`, `job_updated`, `job_completed`, `job_failed`, `metrics_update`, `hook_event`, `orchestrator_status_change`, `orchestrator_context_warn`, `queue_update`, `trigger_fired`, `approval_required`, `pulse_tick`

### WebSocket — Terminal Streaming

**Why WebSocket**: Terminal output is bidirectional (server sends output, browser can send input) and high-frequency. WebSocket provides low-latency full-duplex communication.

```
Browser                           Server
  │                                 │
  ├─── WS connect (/api/terminal/abc123) ──→
  │                                 │
  │ ←── {type: "initial", data: "full log content"} ──
  │                                 │
  │ ←── {type: "delta", data: "new bytes"} ────── (every 500ms if changed)
  │ ←── {type: "delta", data: "more bytes"} ──────
  │                                 │
  │ ──── {type: "input", data: "user message"} ──→ (user sends to agent)
  │                                 │               → tmux send-keys
  │                                 │
  │ ←── {type: "completed"} ─────── (agent finished)
```

The server uses **byte-offset tracking**: it remembers how many bytes it's already sent from the `.log` file and only sends new bytes. This is efficient and avoids duplicate data.

### REST API — On-Demand Actions

```
POST /api/actions/jobs              → Start new agent
POST /api/actions/jobs/:id/send     → Send message to running agent
POST /api/actions/jobs/:id/kill     → Kill agent
GET  /api/jobs                      → List all jobs (enriched data)
GET  /api/jobs/:id                  → Single job with full detail
GET  /api/metrics                   → Aggregate metrics
GET  /api/metrics/history?range=7d  → Historical daily metrics
```

Plus orchestrator-specific endpoints:
```
POST /api/orchestrator/start|stop|inject
GET  /api/orchestrator/status
CRUD /api/queue/tasks
CRUD /api/triggers
POST /api/triggers/:id/toggle
GET  /api/triggers/approvals
POST /api/triggers/approvals/:id/approve|reject
GET|POST /api/modes
POST /api/modes/:name/activate
POST /api/pulse/start|stop
GET  /api/pulse/status
```

### The Event Bus — Internal Propagation

The `event-bus.ts` module is a simple EventEmitter that solves a practical problem: circular imports. The orchestrator modules (`triggers.ts`, `pulse.ts`) need to emit events that `state.ts` broadcasts via SSE. But `state.ts` imports from `jobs.ts` which is imported by `orchestrator.ts` — creating a circular dependency.

The event bus breaks this cycle:
```
triggers.ts ──emit──→ orchestratorBus ──listen──→ state.ts ──emit──→ SSE clients
pulse.ts ──emit──→ orchestratorBus ──listen──→ state.ts ──emit──→ SSE clients
```

---

## 10. Storage and State: Memory Across Time

The system uses five storage layers, each optimized for its purpose.

### Layer 1: File-Based Job Storage

Location: `~/.cc-agent/jobs/`

Each job produces three files:
- `{id}.json` — Job metadata (status, model, timestamps, tmux session name)
- `{id}.prompt` — Original prompt text (preserved separately for easy inspection)
- `{id}.log` — Full terminal output captured by the `script` command

The job JSON file is the source of truth for status. It's updated when:
- Job is created (status: `running`)
- Job completion is detected (marker string `[cc-agent: Session complete`)
- Job times out (log file mtime > 60 minutes)
- Job is killed

**Enrichment**: `getJobsJson()` enriches job data by parsing Claude's session JSONL files (in `~/.claude/projects/`), extracting token counts, modified files, and the summary. This is how the dashboard knows token usage and files modified.

### Layer 2: SQLite Database

Location: `~/.cc-agent/dashboard.db` (WAL mode for concurrent reads)

| Table | Purpose | Records |
|-------|---------|---------|
| `job_history` | Completed/failed job records with full metadata | One per finished job |
| `hook_events` | Hook events from events.jsonl | One per hook fire |
| `daily_metrics` | Aggregated daily stats (jobs, tokens, files) | One per day |
| `orchestrator_queue` | Task queue for orchestrator | FIFO with priority |
| `orchestrator_triggers` | Trigger definitions (cron/event/threshold) | User-configured |
| `orchestrator_modes` | Named trigger profiles | User-configured |
| `orchestrator_activity` | Audit trail of all automated actions | One per action |

SQLite is chosen because it's **built into Bun** (zero dependencies), supports WAL mode for concurrent read/write, and handles the dashboard's workload easily.

### Layer 3: JSONL Event Stream

Location: `~/.cc-agent/events.jsonl`

An append-only file where each line is a JSON object representing a hook event. The `EventsReader` tail-follows this file using byte-offset tracking — it only reads new lines, similar to `tail -f` but programmatic.

### Layer 4: Orchestrator State File

Location: `~/.cc-agent/orchestrator-state.json`

A single JSON file that survives context clears. The pulse loop manages this automatically — saving state before clears and injecting "read your state" after clears. The state tracks current task, active agents, completed tasks (last 5, auto-trimmed), and notes.

### Layer 5: In-Memory State (Browser)

The `useJobs` hook in Preact manages all browser-side state:
- Jobs, metrics, hook events, notifications — all from SSE
- useState-based (no signals, no stores, no Zustand)
- Client-side notification generation from job state transitions
- Limits: 200 hook events, 100 notifications max (to prevent memory bloat)

The design principle: **SSE is the source of truth for the browser**. On reconnect, the server sends a full snapshot and the browser replaces its state entirely. No complex delta merging.

---

## 11. The Plugin System: Sharing the Power

CC-Orchestrator is distributed as a Claude Code plugin, making it installable with a single command.

### Plugin Structure

```
.claude-plugin/marketplace.json     # Plugin registry
plugins/cc-orchestrator/
  .claude-plugin/plugin.json        # Plugin metadata
  skills/
    cc-orchestrator/SKILL.md        # Main orchestration skill (5K tokens)
    cco-update/SKILL.md             # Self-update skill
    cartographer/
      SKILL.md                      # Codebase mapping skill
      scripts/scan-codebase.py      # Token scanner (tiktoken-based)
  scripts/install.sh                # Platform-aware dependency installer
  LICENSE
```

### The SKILL.md: Teaching Claude to Be a General

The most important file in the entire plugin is `SKILL.md`. It's the instruction set that transforms a Claude instance into an orchestrator. Key sections:

1. **The Command Structure**: Establishes the USER → General → Army hierarchy
2. **Critical Rules**: "Agents are the default", "You are the orchestrator, not the implementer", "Don't block for user input"
3. **The Factory Pipeline**: 7-stage workflow from Ideation through Testing
4. **Agent Timing Expectations**: Sets expectations (20-60+ minutes is normal)
5. **Context Management**: When to reuse vs. respawn agents
6. **CLI Reference**: Complete command documentation
7. **Multi-Agent Patterns**: Parallel investigation, sequential implementation
8. **Self-Management Commands**: Queue, trigger, mode, pulse commands

### The Cartographer

The Cartographer is a bundled skill that generates `docs/CODEBASE_MAP.md` — a comprehensive architecture document. It uses parallel subagents to scan the codebase and produces:
- System overview with Mermaid diagrams
- Directory structure with token counts
- Module guide (purpose, exports, key behaviors per file)
- Data flow diagrams
- Storage structure
- Conventions and gotchas
- Navigation guide

This map is what the `--map` flag injects into agent prompts, giving them instant architectural context.

### Installation Script

`scripts/install.sh` handles cross-platform installation:
- Detects macOS/Linux
- Checks for tmux, Bun, Claude CLI
- Installs missing dependencies via official package managers
- Clones the repo
- Adds `cc-agent` to PATH
- No sudo required

---

## 12. Advanced Patterns: Mastering the System

### Pattern: Parallel Research → Sequential Implementation

```bash
# Phase 1: Research (parallel, read-only)
cc-agent start "Audit the auth flow" --map -s read-only
cc-agent start "Review API security" --map -s read-only
cc-agent start "Check data validation" --map -s read-only

# Wait for research agents to complete
cc-agent jobs --json  # check status

# Phase 2: Synthesize findings (Claude orchestrator reviews)
# Phase 3: Implementation (sequential, workspace-write)
cc-agent start "Implement Phase 1 of docs/prds/auth-hardening.md" --map
```

### Pattern: Agent Reuse (Faster Than Kill + Respawn)

```bash
# Agent finished its task but is still in interactive mode
cc-agent capture abc123 50  # verify it's done
cc-agent reuse abc123 "New task: now review the tests for coverage gaps"
# Context cleared, new task injected — no tmux session creation overhead
```

### Pattern: Autonomous Overnight Processing

```bash
# Set up the queue
cc-agent queue add "Implement user profile feature" --priority 10
cc-agent queue add "Add pagination to all list endpoints" --priority 8
cc-agent queue add "Write missing unit tests" --priority 5
cc-agent queue add "Update API documentation" --priority 3

# Start orchestrator with sprint mode
cc-agent orchestrator start
cc-agent mode activate sprint

# Go to sleep. The system will:
# - Process tasks in priority order
# - Auto-clear context when it fills up
# - Self-heal if it crashes
# - Continue until the queue is empty
```

### Pattern: Event-Driven Workflows

```bash
# When any agent completes, automatically review its changes
cc-agent trigger add "auto-review" event "job_completed" queue_task \
  --payload '{"prompt":"Review the changes made by the last completed agent. Check for security, quality, and test coverage."}' \
  --autonomy auto

# When queue gets deep, spawn the orchestrator
cc-agent trigger add "auto-start" threshold "queue_depth >= 3" start_orchestrator \
  --autonomy auto --cooldown 300

# Status report every hour
cc-agent trigger add "hourly-report" cron "0 * * * *" inject_prompt \
  --payload '{"prompt":"Give a comprehensive status report: running agents, completed tasks, any issues."}' \
  --autonomy auto
```

### Pattern: Custom Modes for Different Workflows

```bash
# Feature development mode
cc-agent trigger add "feature-queue-check" cron "*/10 * * * *" inject_prompt \
  --payload '{"prompt":"Check queue for new tasks"}' --autonomy auto
cc-agent trigger add "feature-review-on-complete" event "job_completed" queue_task \
  --payload '{"prompt":"Review recent changes"}' --autonomy auto
cc-agent mode create feature-dev --from-current --description "Feature development workflow"

# Code review mode
cc-agent trigger add "review-check" cron "*/5 * * * *" inject_prompt \
  --payload '{"prompt":"Check for PRs needing review"}' --autonomy auto
cc-agent mode create code-review --from-current --description "Code review workflow"

# Switch between them
cc-agent mode activate feature-dev
cc-agent mode activate code-review
```

---

## 13. CLI Reference: Every Command at Your Fingertips

### Agent Lifecycle

| Command | Description |
|---------|-------------|
| `cc-agent start "prompt" [opts]` | Start an agent in a tmux session |
| `cc-agent status <id>` | Check job status |
| `cc-agent jobs [--json]` | List all jobs (sorted: running > pending > failed > completed) |
| `cc-agent kill <id> [--completed]` | Kill agent (use `--completed` for finished agents) |
| `cc-agent clean` | Remove jobs older than 7 days |
| `cc-agent delete <id>` | Delete a specific job and its files |

### Agent Communication

| Command | Description |
|---------|-------------|
| `cc-agent send <id> "message"` | Send message to running agent |
| `cc-agent capture <id> [lines]` | Capture recent terminal output (default: 50 lines) |
| `cc-agent output <id>` | Get full session output |
| `cc-agent watch <id>` | Stream output updates (polling) |
| `cc-agent attach <id>` | Get tmux attach command |
| `cc-agent session <id> [--json]` | Show archived session data (tools, messages, tokens) |

### Context Management

| Command | Description |
|---------|-------------|
| `cc-agent clear <id>` | Send `/clear` to reset agent context |
| `cc-agent usage <id>` | Send `/usage` to see token stats |
| `cc-agent reuse <id> "prompt"` | Clear context + assign new task (faster than kill + respawn) |

### Dashboard & Hooks

| Command | Description |
|---------|-------------|
| `cc-agent dashboard [--port N]` | Start dashboard (default: 3131) |
| `cc-agent dashboard-stop` | Stop running dashboard |
| `cc-agent setup-hooks` | Install Claude Code event hooks |
| `cc-agent remove-hooks` | Remove installed hooks |
| `cc-agent health` | Check tmux + claude availability |

### Orchestrator

| Command | Description |
|---------|-------------|
| `cc-agent orchestrator start [--model M] [--reasoning R]` | Start orchestrator session |
| `cc-agent orchestrator stop` | Stop orchestrator |
| `cc-agent orchestrator status` | Show running/idle/context%/state |
| `cc-agent orchestrator inject "msg"` | Inject message into orchestrator |

### Queue

| Command | Description |
|---------|-------------|
| `cc-agent queue add "prompt" [--priority N]` | Add task (higher priority = processed first) |
| `cc-agent queue list [--status S]` | List tasks (filter by status) |
| `cc-agent queue remove <id>` | Remove a task |

### Triggers

| Command | Description |
|---------|-------------|
| `cc-agent trigger add <name> <type> <cond> <action> [opts]` | Add a trigger |
| `cc-agent trigger list` | List all triggers |
| `cc-agent trigger toggle <id>` | Toggle enabled/disabled |
| `cc-agent trigger remove <id>` | Remove a trigger |

Trigger types: `cron`, `event`, `threshold`
Actions: `inject_prompt`, `clear_context`, `start_orchestrator`, `queue_task`, `notify`
Options: `--payload '{"prompt":"..."}'`, `--autonomy auto|confirm`, `--cooldown 60`

#### Trigger Condition Reference

The `<cond>` argument depends on the trigger type:

**Cron** — standard 5-field cron expression: `"*/5 * * * *"`, `"0 9 * * 1-5"`, etc.

**Threshold** — `metric operator value`. Available metrics:

| Metric | Description | Example |
|--------|-------------|---------|
| `context_used_pct` | Orchestrator context window usage (0-100) | `context_used_pct>=80` |
| `queue_depth` | Number of pending tasks in the queue | `queue_depth>=5` |
| `active_agents` | Count of currently running agent jobs | `active_agents==0` |
| `idle_seconds` | Seconds since orchestrator log was last modified | `idle_seconds>=300` |

Operators: `>=`, `<=`, `>`, `<`, `==`, `!=`

**Event** — exact match on an SSE event name:

| Event | When it fires |
|-------|--------------|
| `job_created` | New agent job started |
| `job_updated` | Agent job status or output changed |
| `job_completed` | Agent job finished successfully |
| `job_failed` | Agent job errored out |
| `hook_event` | A Claude Code hook fired |
| `orchestrator_status_change` | Orchestrator started, stopped, clearing, or resuming |
| `orchestrator_context_warn` | Context usage exceeds warning threshold |
| `queue_update` | Queue task added, removed, or status changed |
| `pulse_tick` | Pulse loop heartbeat (every 10s) |

### Modes

| Command | Description |
|---------|-------------|
| `cc-agent mode list` | List available modes |
| `cc-agent mode activate <name>` | Activate mode (replaces all triggers) |
| `cc-agent mode create <name> [opts]` | Create mode (`--from-current`, `--description`) |
| `cc-agent mode delete <name>` | Delete a mode |

### Pulse

| Command | Description |
|---------|-------------|
| `cc-agent pulse start` | Start 10s heartbeat loop |
| `cc-agent pulse stop` | Stop heartbeat loop |
| `cc-agent pulse status` | Show running/last_tick/queue_depth/triggers/approvals |

### Start Command Flags

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--reasoning` | `-r` | `xhigh` | low, medium, high, xhigh (-r low → sonnet model) |
| `--model` | `-m` | `opus` | Explicit model override |
| `--sandbox` | `-s` | `workspace-write` | read-only, workspace-write, danger-full-access |
| `--file` | `-f` | — | Include files matching glob (repeatable) |
| `--map` | — | — | Include docs/CODEBASE_MAP.md in prompt |
| `--dir` | `-d` | cwd | Working directory |
| `--dry-run` | — | — | Preview prompt without executing |
| `--strip-ansi` | — | — | Remove ANSI codes from output |

---

## 14. Troubleshooting

### Agent won't start

```bash
cc-agent health  # Check prerequisites
# Most common: tmux not installed → brew install tmux
# Or: claude CLI not found → npm install -g @anthropic-ai/claude-code
```

### Dashboard won't start

```bash
# Check if already running
cc-agent dashboard-stop
cc-agent dashboard

# If UI build fails, check dependencies:
cd ~/.cc-orchestrator && bun install
```

### Agent seems stuck

```bash
cc-agent capture <id> 100    # Check what's happening
cc-agent send <id> "Status update — what are you working on?"
# If truly stuck (no output for 10+ minutes):
cc-agent kill <id>
```

### Hooks not working

```bash
# Verify jq is installed (required by relay script)
which jq  # → should return a path

# Verify hooks are installed
cat ~/.claude/settings.json  # Look for hooks section

# Check events file
tail -f ~/.cc-agent/events.jsonl  # Should show events when agents run
```

### Orchestrator not processing queue

```bash
cc-agent orchestrator status   # Is it running?
cc-agent pulse status          # Is pulse running?
cc-agent queue list            # Are there pending tasks?

# Pulse needs the dashboard running:
cc-agent dashboard
```

### Terminal not streaming in dashboard

The WebSocket connects to `/api/terminal/{jobId}`. The `.log` file must exist. If the job was started before the dashboard, the log file exists but the WebSocket connection needs to be opened by navigating to the job detail.

### Context clear not working

The context lifecycle manager sends Escape → waits 2s → sends `/clear` → waits 5s → injects resume. If the orchestrator is in the middle of a long tool call, the Escape may not interrupt immediately. The system handles this gracefully — it will retry on the next refresh cycle.

---

## 15. Future Vision: Where This Goes Next

CC-Orchestrator already demonstrates several patterns that hint at something bigger. Here are proposals for the next iterations — ideas that push toward more sophisticated AI agent coordination.

### 15.1 Learning from History

**Current state**: Historical data is stored in SQLite but never analyzed. Past job success/failure patterns are available but unused.

**Proposal**: An analytics engine that learns from past executions:
- Which agent configurations (model, reasoning, sandbox) succeed for which task types?
- Which prompts lead to faster completion?
- What's the optimal number of parallel agents for this codebase's size?
- Which tool call patterns predict failure (e.g., many Grep calls followed by no Read = lost agent)?

The orchestrator could consult this "experience database" before spawning agents, automatically choosing the configuration most likely to succeed.

### 15.2 Inter-Agent Communication

**Current state**: Agents don't know about each other. Two agents could edit the same file simultaneously without knowing.

**Proposal**: A shared message bus where agents can:
- Claim files they're working on (advisory locks)
- Post findings that other agents can read
- Request help from idle agents
- Negotiate task allocation

Implementation: A `/api/bus` endpoint where agents post messages tagged with topics. Other agents poll or subscribe. The orchestrator mediates conflicts.

### 15.3 Emergent Task Discovery

**Current state**: Tasks must be explicitly queued by a human or trigger.

**Proposal**: Agents that identify work autonomously:
- "I noticed these tests are failing — should I fix them?"
- "This function has no error handling — should I add it?"
- "This dependency has a known vulnerability — should I update?"

The orchestrator runs a periodic "what needs doing?" sweep of the codebase, generating task proposals that flow through the confirmation system.

### 15.4 Adaptive Trigger Tuning

**Current state**: Trigger thresholds are static (set once, never change).

**Proposal**: Triggers that adjust their own parameters based on outcomes:
- If context clears at 80% always succeed but at 75% sometimes fail, raise the threshold
- If queue processing rate drops when > 3 agents run simultaneously, add a threshold trigger to cap at 3
- If cron triggers fire during periods of low productivity, adjust timing

This is essentially a control theory feedback loop applied to AI orchestration.

### 15.5 Multi-Orchestrator Coordination

**Current state**: One orchestrator per system. Multiple Claude instances each have their own agents but don't share a queue.

**Proposal**: Multiple orchestrators sharing a coordination layer:
- Shared SQLite database for queue and triggers
- Leader election (one orchestrator is primary, others are workers)
- Task routing based on orchestrator specialization
- Load balancing across orchestrator context windows

### 15.6 Environment Modeling

**Current state**: Hook events are captured and displayed but not analyzed in real-time.

**Proposal**: Build a live model of the codebase from hook events:
- Track which files are being modified across all agents (detect conflicts)
- Build a "heat map" of codebase activity (which modules get the most attention)
- Detect patterns: "Every time agent A edits config.ts, agent B's tests fail"
- Predict: "Agent C is about to edit a file that Agent D is also working on — intervene"

This turns the hook event stream from a display feature into an intelligence layer.

### 15.7 Collective Memory

**Current state**: Each agent starts fresh. Completed agents' knowledge is lost.

**Proposal**: A shared knowledge base (beyond the codebase map):
- "Agent X discovered that the auth module uses a custom JWT library, not jsonwebtoken"
- "The test suite requires DATABASE_URL to be set or it fails silently"
- "The build script needs Node 18+ for the fs/promises import"

Agents write discoveries to the knowledge base. New agents read it on startup. Over time, the system accumulates institutional knowledge about the codebase — knowledge that persists even as individual agents come and go.

### 15.8 Goal Decomposition

**Current state**: The human writes prompts that describe tasks. Task decomposition is manual or delegated to the orchestrator Claude instance.

**Proposal**: An AI-powered task decomposition engine:
- Input: "Implement user authentication with OAuth2 and JWT"
- Output: A dependency graph of sub-tasks, automatically queued:
  1. Research existing auth patterns in codebase (read-only)
  2. Write PRD for auth system (orchestrator)
  3. Implement OAuth2 provider integration (workspace-write)
  4. Implement JWT token management (workspace-write)
  5. Add auth middleware (workspace-write)
  6. Security review (read-only)
  7. Write tests (workspace-write)

The orchestrator breaks down goals into queued tasks with dependencies, priority, and appropriate configurations — turning a sentence into a project plan.

### 15.9 The Recursive Dream

The most provocative idea: an orchestrator that improves its own orchestration skill.

The SKILL.md file that instructs the orchestrator is itself a text file. An agent with `workspace-write` access could edit it. What if the orchestrator analyzed its own performance — which strategies worked, which didn't — and updated its instruction set?

This is, of course, deeply recursive and requires careful guardrails. But the primitives are there: the orchestrator can read its own SKILL.md, it has access to historical performance data in SQLite, and it can write files. The question is whether we trust it to improve its own instructions.

This is where orchestration meets self-improvement, and where the line between tool and agent begins to blur.

---

## Appendix A: Architecture Diagram

```
┌─────────────────── YOU ────────────────────┐
│  Terminal / Browser / Claude instances       │
└──────────┬──────────────────────────────────┘
           │
     ┌─────┴─────┐              ┌──────────────────────┐
     │  CLI      │              │  Dashboard (browser)   │
     │  cc-agent │              │  localhost:3131        │
     └─────┬─────┘              └──────────┬───────────┘
           │                               │
           │ commands                      │ SSE / WS / REST
           │                               │
┌──────────┴───────────────────────────────┴──────────────────┐
│                    DASHBOARD SERVER (Hono on Bun)            │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ REST API    │  │ SSE Stream   │  │ WebSocket Handler  │  │
│  │ 12 routes   │  │ /api/events  │  │ /api/terminal/:id  │  │
│  └──────┬──────┘  └──────┬───────┘  └──────┬────────────┘  │
│         │                │                  │                │
│  ┌──────┴────────────────┴──────────────────┴───────────┐   │
│  │              DashboardState (singleton)                │   │
│  │  fs.watch + 5s polling + EventsReader + EventBus      │   │
│  │  Context lifecycle manager (warn → interrupt → clear)  │   │
│  └──────┬────────────────┬──────────────────┬───────────┘   │
│         │                │                  │                │
│  ┌──────┴──────┐  ┌─────┴──────┐  ┌───────┴──────────┐    │
│  │ SQLite DB   │  │ Pulse Loop │  │ Terminal Streamer │    │
│  │ 7 tables    │  │ 10s tick   │  │ byte-offset delta │    │
│  └─────────────┘  └─────┬──────┘  └──────────────────┘    │
│                          │                                   │
│              ┌───────────┼───────────────┐                  │
│              │           │               │                  │
│         ┌────┴────┐ ┌───┴────┐  ┌──────┴──────┐           │
│         │Triggers │ │ Queue  │  │   Modes     │           │
│         │cron/evt/│ │process │  │  profiles   │           │
│         │threshold│ │drain   │  │             │           │
│         └─────────┘ └────────┘  └─────────────┘           │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Orchestrator  │  │  Worker      │  │  Worker         │  │
│  │ cc-agent-orch │  │  cc-agent-X  │  │  cc-agent-Y     │  │
│  │ (Claude Code) │  │  (Claude Code)│  │  (Claude Code)  │  │
│  │               │  │              │  │                 │  │
│  │  cc-agent     │  │  focused on  │  │  focused on    │  │
│  │  start/send/  │  │  a single    │  │  a single      │  │
│  │  kill/jobs    │  │  task        │  │  task           │  │
│  └───────┬───────┘  └──────┬───────┘  └──────┬──────────┘  │
│          │                 │                  │              │
│          └─────────────────┴──────────────────┘              │
│                    tmux sessions                             │
└──────────────────────────────────────────────────────────────┘
           │
     ┌─────┴─────────────────────────────┐
     │  Storage (~/.cc-agent/)            │
     │  ├── jobs/*.json, *.prompt, *.log  │
     │  ├── dashboard.db (SQLite)         │
     │  ├── events.jsonl (hook events)    │
     │  ├── orchestrator-state.json       │
     │  ├── dashboard.pid                 │
     │  └── hooks/relay-event.sh          │
     └───────────────────────────────────┘
```

---

## Appendix B: Technology Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Runtime | Bun | Fast JS runtime, built-in SQLite, native bundler |
| Server | Hono | 14KB, built-in SSE, native Bun adapter |
| UI Framework | Preact | 3KB, React-compatible, fast |
| Terminal | xterm.js | Industry-standard, full ANSI support |
| Real-time (status) | SSE via EventSource | Auto-reconnects, simpler than WS for one-way |
| Real-time (terminal) | WebSocket | Bidirectional for terminal I/O |
| Database | bun:sqlite | Zero deps, built into Bun, WAL mode |
| Build tool | bun build | Built into Bun, no webpack/Vite needed |
| Styling | CSS variables | No Tailwind, matches spec exactly |
| Charts | Canvas 2D API | Zero deps, DPR-aware, sufficient |
| Session management | tmux | Universal, reliable, scriptable |
| Process capture | script command | Captures full terminal output with ANSI |

---

*CC-Orchestrator is open source and available at [github.com/Narcis13/cc-master](https://github.com/Narcis13/cc-master). Contributions, ideas, and feedback are welcome.*
