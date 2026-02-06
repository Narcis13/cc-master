# CC-Agent Monitoring Dashboard: UI Proposal

> Comprehensive specification for a real-time monitoring UI for the cc-orchestrator system.
> Produced by multi-agent analysis: data modeling, hooks integration, UI patterns research,
> technology stack evaluation, and wireframe design.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Analysis](#2-system-analysis)
3. [Data Model](#3-data-model)
4. [Claude Code Hooks Integration](#4-claude-code-hooks-integration)
5. [Technology Stack](#5-technology-stack)
6. [UI Design & Wireframes](#6-ui-design--wireframes)
7. [Real-time Architecture](#7-real-time-architecture)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [Appendix: API Reference](#9-appendix-api-reference)

---

## 1. Executive Summary

### Problem

The cc-orchestrator manages multiple Claude Code agents running in tmux sessions. Currently, monitoring relies on CLI commands (`cc-agent jobs`, `cc-agent capture <id>`) that provide snapshots but no continuous visibility. When running 5-15+ agents in parallel across multiple orchestrator instances, there is no unified view of:

- What all agents are doing right now
- How much context/tokens each agent has consumed
- Which files are being modified (and by which agents)
- Real-time terminal output without manually attaching to each tmux session
- Historical trends and aggregate metrics

### Solution

A **local web dashboard** launched via `cc-agent dashboard` that provides:

- Real-time job status monitoring with auto-refresh
- Live terminal output streaming via xterm.js (full ANSI support)
- Bidirectional agent communication (send messages from the UI)
- Claude Code hooks integration for granular event tracking
- Multi-instance coordination view
- Historical metrics and trend analysis

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Web dashboard (hybrid) | Rich visualization + existing CLI for quick checks |
| Server | Hono on Bun | Native Bun adapter, tiny footprint, built-in WS/SSE |
| Frontend | Preact + xterm.js | 3KB UI framework + industry-standard terminal emulation |
| Real-time | SSE (status) + WebSocket (terminal) | SSE auto-reconnects; WS needed for bidirectional terminal |
| Storage | JSON files (existing) + bun:sqlite (metrics) | Don't break existing system; SQLite for time-series |
| Hooks | Async event collection via JSONL | Non-blocking, append-only, compatible with cc-agent agents |

---

## 2. System Analysis

### Current Architecture

```
USER
  |
  ├── Claude #1 (Orchestrator)
  |       ├── cc-agent start "task A" --> tmux session cc-agent-a1b2c3d4
  |       ├── cc-agent start "task B" --> tmux session cc-agent-e5f6g7h8
  |       └── cc-agent start "task C" --> tmux session cc-agent-i9j0k1l2
  |
  ├── Claude #2 (Orchestrator)
  |       ├── cc-agent start "task D" --> tmux session cc-agent-m3n4o5p6
  |       └── cc-agent start "task E" --> tmux session cc-agent-q7r8s9t0
  |
  └── CLI / Dashboard (monitoring)
```

### Data Sources Available

| Source | Type | Update Frequency | Content |
|--------|------|-----------------|---------|
| `~/.cc-agent/jobs/<id>.json` | File | On status change | Job metadata, status, timestamps |
| `~/.cc-agent/jobs/<id>.log` | File | Continuous (buffered) | Full terminal output with ANSI codes |
| `~/.cc-agent/jobs/<id>.prompt` | File | Once (at creation) | Original prompt text |
| `tmux capture-pane` | Command | On-demand | Current visible terminal content |
| `tmux list-sessions` | Command | On-demand | Active session list |
| Claude session JSONL | File | On completion | Token usage, files modified, summary |
| `agents.log` (project root) | File | Manual by orchestrator | Coordination log across instances |
| Claude Code hooks | Events | Real-time | Tool calls, completions, errors, notifications |

### Current Limitations

1. **Polling-only monitoring** - No push notifications when job states change
2. **ANSI in logs** - Log files contain raw terminal codes; need stripping or proper rendering
3. **No cross-instance view** - Each orchestrator manages its own agents independently
4. **Session data extraction** - Token/file data only available after job completion
5. **No event timeline** - Cannot see what tools an agent used or when

---

## 3. Data Model

### Core Entities

```typescript
// === Primary Job Entity (extends existing Job interface) ===
interface MonitoredJob {
  // From existing Job interface
  id: string;                          // 8-char hex
  status: "pending" | "running" | "completed" | "failed";
  prompt: string;
  model: string;                       // "opus" | "sonnet" | etc.
  reasoningEffort: ReasoningEffort;    // "low" | "medium" | "high" | "xhigh"
  sandbox: SandboxMode;               // "read-only" | "workspace-write" | "danger-full-access"
  parentSessionId?: string;
  cwd: string;
  createdAt: string;                   // ISO 8601
  startedAt?: string;
  completedAt?: string;
  tmuxSession?: string;               // "cc-agent-<id>"
  result?: string;
  error?: string;

  // Enriched fields (computed by dashboard)
  elapsedMs: number;                   // Live-computed for running jobs
  tokens?: TokenUsage;                 // Available after completion (or via hooks)
  filesModified?: string[];            // From session parser
  summary?: string;                    // Last assistant message
  lastActivityAt?: string;             // Log file mtime
  isTimedOut: boolean;                 // Computed from inactivity timeout
  pipelineStage?: PipelineStage;       // Inferred from prompt/context
}

// === Token Usage ===
interface TokenUsage {
  input: number;
  output: number;
  contextWindow: number;
  contextUsedPct: number;              // (input / contextWindow) * 100
  estimatedCostUsd?: number;           // Computed from model pricing
}

// === Pipeline Stage (from SKILL.md factory pipeline) ===
type PipelineStage =
  | "research"
  | "implementation"
  | "review"
  | "testing"
  | "unknown";

// === Real-time Event (from hooks or polling) ===
interface AgentEvent {
  id: string;                          // UUID
  timestamp: string;                   // ISO 8601
  jobId: string;
  eventType: AgentEventType;
  data: Record<string, unknown>;       // Event-specific payload
}

type AgentEventType =
  | "job_created"
  | "job_started"
  | "job_completed"
  | "job_failed"
  | "tool_call"                        // PreToolUse hook
  | "tool_result"                      // PostToolUse hook
  | "tool_error"                       // PostToolUseFailure hook
  | "file_modified"                    // PostToolUse for Write/Edit
  | "message_sent"                     // User sent message to agent
  | "context_compacted"                // PreCompact hook
  | "notification"                     // Notification hook
  | "output_update";                   // Terminal output changed

// === Terminal Session State ===
interface TerminalState {
  jobId: string;
  sessionName: string;
  isActive: boolean;
  isAttached: boolean;
  lastCaptureAt: string;
  outputBuffer: string;                // Ring buffer of recent output
  outputSizeBytes: number;
}

// === Dashboard Aggregate Metrics ===
interface DashboardMetrics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  averageJobDurationMs: number;
  activeTmuxSessions: number;
  uptimeMs: number;
}

// === Orchestrator Instance (for multi-instance view) ===
interface OrchestratorInstance {
  id: string;                          // Derived from agents.log or session linkage
  agentIds: string[];                  // Jobs spawned by this instance
  startedAt: string;
  lastActiveAt: string;
  pipelineStage?: PipelineStage;
}
```

### Data Refresh Strategy

| Data | Method | Interval | Trigger |
|------|--------|----------|---------|
| Job status | `fs.watch` on jobs dir | Event-driven | File change |
| Terminal output (active) | `tmux capture-pane` | 500ms per active job | Polling |
| Terminal output (completed) | Log file read | On-demand | User opens job |
| Token usage | Session JSONL parse | On job completion | Status change |
| Hook events | JSONL tail-follow | Real-time | Hook fires |
| tmux sessions | `tmux list-sessions` | 5s | Polling |
| Aggregate metrics | Computed from state | On any change | Derived |

### Historical Data (SQLite Schema)

```sql
-- Job completion records for trends
CREATE TABLE job_history (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning_effort TEXT NOT NULL,
  sandbox TEXT NOT NULL,
  pipeline_stage TEXT,
  cwd TEXT,
  started_at TEXT,
  completed_at TEXT,
  elapsed_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  context_used_pct REAL,
  files_modified_count INTEGER,
  prompt_preview TEXT,     -- First 200 chars
  summary TEXT,            -- Last 500 chars
  created_at TEXT DEFAULT (datetime('now'))
);

-- Hook events for timeline
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  tool_name TEXT,
  file_path TEXT,
  data_json TEXT,          -- Full event payload
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_job ON events(job_id);
CREATE INDEX idx_events_time ON events(timestamp);

-- Daily aggregate metrics
CREATE TABLE daily_metrics (
  date TEXT PRIMARY KEY,   -- YYYY-MM-DD
  jobs_started INTEGER DEFAULT 0,
  jobs_completed INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_elapsed_ms INTEGER DEFAULT 0,
  files_modified_count INTEGER DEFAULT 0
);
```

---

## 4. Claude Code Hooks Integration

### Architecture Overview

Claude Code hooks provide real-time event data from inside each agent's session. Since cc-agent agents run with `--dangerously-skip-permissions`, hooks must be configured at the **user level** (`~/.claude/settings.json`) to apply to all Claude Code instances.

```
┌─────────────────────────────────────────────────────┐
│  Claude Code Agent (tmux session)                    │
│                                                      │
│  ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
│  │ PreTool  │──>│ PostTool │──>│ Stop/Notify    │  │
│  │ Use Hook │   │ Use Hook │   │ Hooks          │  │
│  └────┬─────┘   └────┬─────┘   └──────┬─────────┘  │
│       │              │                 │             │
└───────┼──────────────┼─────────────────┼─────────────┘
        │              │                 │
        v              v                 v
  ┌──────────────────────────────────────────────────┐
  │  Hook Script: cc-agent-hook-relay.sh              │
  │  - Reads JSON from stdin                          │
  │  - Extracts job ID from session/cwd               │
  │  - Appends event to ~/.cc-agent/events.jsonl      │
  └──────────────────┬───────────────────────────────┘
                     │
                     v
  ┌──────────────────────────────────────────────────┐
  │  Dashboard Server                                 │
  │  - Tails events.jsonl                             │
  │  - Pushes events via SSE to connected browsers    │
  │  - Stores in SQLite for historical queries        │
  └──────────────────────────────────────────────────┘
```

### Hook Event to UI Update Mapping

| Hook Event | UI Update | Key Data Extracted | Async? |
|------------|-----------|-------------------|--------|
| `SessionStart` | "Agent session initialized" indicator | `session_id`, `model`, `source` | Yes |
| `UserPromptSubmit` | Show prompt being processed | `prompt` text | Yes |
| `PreToolUse` | "Agent is calling [tool]..." activity indicator | `tool_name`, `tool_input` | Yes |
| `PostToolUse` | Tool result badge, file modification tracking | `tool_name`, `tool_input`, `tool_response` | Yes |
| `PostToolUseFailure` | Error indicator on agent card | `tool_name`, `error` | Yes |
| `Notification` | Alert in notification center | `message`, `notification_type` | Yes |
| `SubagentStart` | Sub-agent spawned indicator (nested) | `agent_type`, `agent_id` | Yes |
| `SubagentStop` | Sub-agent completed indicator | `agent_type`, `agent_id` | Yes |
| `Stop` | "Agent finished thinking" update | `stop_hook_active` | Yes |
| `PreCompact` | "Context compacting..." warning badge | `trigger` (manual/auto) | Yes |
| `SessionEnd` | Mark agent as completed/ended | `reason` | Yes |
| `PermissionRequest` | Permission dialog alert (rare with --dangerously-skip-permissions) | `tool_name` | Yes |

**All hooks should be `async: true`** to avoid blocking agent work. The monitoring system is observational, not decisional.

### Hook Configuration

The following configuration should be installed at `~/.claude/settings.json` to enable monitoring for all Claude Code instances:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.cc-agent/hooks/relay-event.sh",
            "async": true,
            "timeout": 5,
            "statusMessage": ""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "~/.cc-agent/hooks/relay-event.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.cc-agent/hooks/relay-event.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.cc-agent/hooks/relay-event.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.cc-agent/hooks/relay-event.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.cc-agent/hooks/relay-event.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.cc-agent/hooks/relay-event.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.cc-agent/hooks/relay-event.sh",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Relay Hook Script

```bash
#!/bin/bash
# ~/.cc-agent/hooks/relay-event.sh
# Relays Claude Code hook events to the monitoring dashboard event stream.
# Receives JSON on stdin, appends to events.jsonl with timestamp and job ID.

set -e

EVENTS_FILE="${HOME}/.cc-agent/events.jsonl"
INPUT=$(cat)

# Extract fields from hook input
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
EVENT_NAME=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Try to determine job ID from tmux session name or cwd
JOB_ID=""
TMUX_SESSION="${TMUX_PANE:-}"
if [ -n "$TMUX_SESSION" ]; then
  # Extract job ID from tmux session name (cc-agent-<jobId>)
  CURRENT_SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null || true)
  if [[ "$CURRENT_SESSION" == cc-agent-* ]]; then
    JOB_ID="${CURRENT_SESSION#cc-agent-}"
  fi
fi

# Build event JSON
EVENT=$(jq -n \
  --arg ts "$TIMESTAMP" \
  --arg sid "$SESSION_ID" \
  --arg event "$EVENT_NAME" \
  --arg tool "$TOOL_NAME" \
  --arg job "$JOB_ID" \
  --arg cwd "$CWD" \
  --argjson raw "$INPUT" \
  '{
    timestamp: $ts,
    session_id: $sid,
    event_type: $event,
    tool_name: $tool,
    job_id: $job,
    cwd: $cwd,
    data: $raw
  }')

# Append to events file (atomic via temp + rename, or just append with lock)
echo "$EVENT" >> "$EVENTS_FILE"
```

### What Hooks Cannot Capture (Alternative Sources Needed)

| Missing Data | Alternative Source | Strategy |
|-------------|-------------------|----------|
| Token usage during execution | Session JSONL (post-completion) | Parse on job completion |
| Real-time context window usage | `tmux capture-pane` output parsing | Look for token count display |
| Files modified (detailed list) | Session JSONL + PostToolUse(Write/Edit) hooks | Combine both sources |
| Agent's internal reasoning | Not accessible | Show tool calls as proxy |
| Communication between agents | `agents.log` in project root | File watch |
| tmux session state | `tmux list-sessions` | Poll every 5s |

### Hook Installation Command

The dashboard should offer a setup command:

```bash
cc-agent dashboard --setup-hooks    # Install hook configuration
cc-agent dashboard --remove-hooks   # Remove hook configuration
```

This modifies `~/.claude/settings.json` programmatically, merging the monitoring hooks with any existing user hooks.

---

## 5. Technology Stack

### Architecture: Hybrid (Web Dashboard + Existing CLI)

The web dashboard is the primary monitoring interface. The existing CLI remains for quick checks and scripted access. Both share the same data layer.

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Dashboard UI)                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Preact   │ │ xterm.js │ │ SSE      │ │ Charts   │   │
│  │ App      │ │ Terminal │ │ Client   │ │ (Canvas) │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│         |            |           |                        │
└─────────┼────────────┼───────────┼───────────────────────┘
          |            |           |
     HTTP REST     WebSocket      SSE
          |            |           |
┌─────────┼────────────┼───────────┼───────────────────────┐
│         v            v           v                        │
│  ┌───────────────────────────────────────────┐           │
│  │           Hono Server (Bun)                │           │
│  │  /api/jobs         - REST endpoints        │           │
│  │  /api/events       - SSE event stream      │           │
│  │  /api/terminal/:id - WebSocket terminal    │           │
│  │  /static/*         - Built UI assets       │           │
│  └─────────────────┬─────────────────────────┘           │
│                    │                                      │
│  ┌─────────────────┼─────────────────────────────────┐   │
│  │  Data Layer      │                                 │   │
│  │  ┌───────────┐ ┌─┴──────────┐ ┌───────────────┐  │   │
│  │  │ fs.watch  │ │ In-Memory  │ │ bun:sqlite    │  │   │
│  │  │ Jobs Dir  │ │ State      │ │ (Historical)  │  │   │
│  │  └───────────┘ └────────────┘ └───────────────┘  │   │
│  │  ┌───────────┐ ┌────────────┐                     │   │
│  │  │ tmux      │ │ events     │                     │   │
│  │  │ capture   │ │ .jsonl     │                     │   │
│  │  └───────────┘ └────────────┘                     │   │
│  └───────────────────────────────────────────────────┘   │
│                 Dashboard Server Process                   │
└───────────────────────────────────────────────────────────┘
```

### Package Selection

| Package | Version | Purpose | Size |
|---------|---------|---------|------|
| `hono` | ^4.7 | HTTP server, routing, SSE, WebSocket | ~14KB |
| `preact` | ^10.25 | UI rendering (React-compatible) | ~3KB gzipped |
| `@xterm/xterm` | ^5.5 | Terminal emulation in browser | ~200KB (client only) |
| `@xterm/addon-fit` | ^0.10 | Auto-resize terminal to container | ~2KB |
| `@xterm/addon-webgl` | ^0.18 | GPU-accelerated rendering | ~50KB |
| `@xterm/addon-search` | ^0.15 | Search within terminal output | ~5KB |
| `bun:sqlite` | built-in | Historical metrics database | 0 (built into Bun) |

**Build tool:** `bun build` (built-in, no webpack/Vite needed)

### File Structure

```
src/
  cli.ts                    # Existing - add 'dashboard' command
  dashboard/
    server.ts               # Hono app setup, route mounting
    state.ts                # In-memory job state, fs.watch
    terminal-stream.ts      # tmux capture polling, WebSocket push
    events.ts               # SSE broadcasting, event aggregation
    hooks-manager.ts        # Install/remove monitoring hooks
    db.ts                   # bun:sqlite setup, historical queries
    api/
      jobs.ts               # GET /api/jobs, GET /api/jobs/:id
      events.ts             # GET /api/events (SSE stream)
      terminal.ts           # WS /api/terminal/:id
      metrics.ts            # GET /api/metrics, GET /api/metrics/history
      actions.ts            # POST /api/jobs/:id/send, POST /api/jobs/:id/kill
ui/
  src/
    index.tsx               # Preact app entry point
    app.tsx                 # Main app layout with routing
    components/
      Dashboard.tsx         # Overview with job grid
      JobCard.tsx           # Individual job status card
      JobDetail.tsx         # Full job detail view
      TerminalPanel.tsx     # xterm.js wrapper component
      StatusBar.tsx         # Global metrics bar
      Timeline.tsx          # Agent event timeline
      NotificationCenter.tsx # Alert/notification panel
      MessageInput.tsx      # Send message to agent
      NewJobForm.tsx        # Start new agent form
      MetricsChart.tsx      # Token usage / duration charts
    hooks/
      useJobs.ts            # SSE subscription for job updates
      useTerminal.ts        # WebSocket hook for terminal data
      useMetrics.ts         # Historical metrics fetching
    lib/
      api.ts                # API client helpers
      format.ts             # Duration, token, date formatters
    styles/
      theme.css             # Dark theme (terminal-friendly)
      layout.css            # Grid/flexbox layout
  dist/                     # Built output (gitignored)
```

### Launch Command

```bash
cc-agent dashboard              # Start on default port 3131
cc-agent dashboard --port 8080  # Custom port
cc-agent dashboard --open       # Auto-open browser
cc-agent dashboard --setup-hooks # Install monitoring hooks
```

---

## 6. UI Design & Wireframes

### Color Theme

Dark theme to match terminal aesthetics and reduce eye strain during long monitoring sessions.

```css
:root {
  --bg-primary:    #0d1117;    /* GitHub dark background */
  --bg-secondary:  #161b22;    /* Card backgrounds */
  --bg-tertiary:   #21262d;    /* Hover/active states */
  --border:        #30363d;    /* Subtle borders */
  --text-primary:  #e6edf3;    /* Main text */
  --text-secondary:#8b949e;    /* Muted text */
  --status-running:#58a6ff;    /* Blue - active */
  --status-complete:#3fb950;   /* Green - success */
  --status-failed: #f85149;    /* Red - error */
  --status-pending:#d29922;    /* Yellow - waiting */
  --accent:        #bc8cff;    /* Purple - highlights */
}
```

### View 1: Dashboard Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  CC-Agent Dashboard                              [Settings] [?] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ RUNNING  │ │ COMPLETE │ │  FAILED  │ │  TOKENS  │           │
│  │    3     │ │    12    │ │    1     │ │  1.2M in │           │
│  │ ●●●      │ │ ✓✓✓...  │ │ ✗        │ │  45K out │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  ┌─[+ New Agent]──────────────────────────────────[Filter ▾]──┐ │
│  │                                                              │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │ ● a1b2c3d4  RUNNING   opus/xhigh   12m 34s             │ │ │
│  │  │   "Implement auth refactor per PRD Phase 1"             │ │ │
│  │  │   Tokens: 45.2K in / 3.1K out  Context: 17.5%          │ │ │
│  │  │   Last: Edit src/auth/session.ts                ▸ [Send]│ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │ ● e5f6g7h8  RUNNING   opus/xhigh   8m 12s              │ │ │
│  │  │   "Review security vulnerabilities in auth module"      │ │ │
│  │  │   Tokens: 32.1K in / 1.8K out  Context: 12.4%          │ │ │
│  │  │   Last: Read src/auth/jwt.ts                    ▸ [Send]│ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │ ● i9j0k1l2  RUNNING   sonnet/low   2m 05s              │ │ │
│  │  │   "Check for N+1 queries in database layer"             │ │ │
│  │  │   Tokens: 18.5K in / 0.9K out  Context: 7.2%           │ │ │
│  │  │   Last: Grep "\.find\(" -g "*.ts"              ▸ [Send] │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │ ✓ m3n4o5p6  COMPLETED  opus/xhigh   23m 41s            │ │ │
│  │  │   "Write tests for the authentication module"           │ │ │
│  │  │   Tokens: 89.3K in / 12.4K out  Files: 4 modified      │ │ │
│  │  │   Summary: "Added 15 test cases covering..."   ▸ [View]│ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │ ✗ q7r8s9t0  FAILED     opus/high    5m 22s             │ │ │
│  │  │   "Deploy to staging environment"                       │ │ │
│  │  │   Error: "Timed out after 60 minutes of inactivity"    │ │ │
│  │  │                                            ▸ [Retry]    │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Event Timeline ──────────────────────────────────────────┐  │
│  │ 10:31  a1b2c3d4  Edit src/auth/session.ts                │  │
│  │ 10:30  e5f6g7h8  Read src/auth/jwt.ts                    │  │
│  │ 10:29  a1b2c3d4  Write src/auth/types.ts                 │  │
│  │ 10:28  i9j0k1l2  Grep "\.find\(" across 42 files         │  │
│  │ 10:25  m3n4o5p6  ✓ Completed - 4 files modified          │  │
│  │ 10:22  a1b2c3d4  Bash "bun run typecheck"                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**

| Component | Data Binding | Refresh |
|-----------|-------------|---------|
| MetricCards | `DashboardMetrics` | SSE (on any job change) |
| JobList | `MonitoredJob[]` | SSE (job_created, job_updated, job_completed) |
| JobCard | `MonitoredJob` | SSE per-job events |
| EventTimeline | `AgentEvent[]` (last 50) | SSE + JSONL tail |
| FilterBar | Local state | Instant (client-side) |
| NewAgentButton | Opens modal | User action |

**Keyboard Shortcuts:**

| Key | Action |
|-----|--------|
| `N` | New agent dialog |
| `R` | Refresh all jobs |
| `1-9` | Select job by position |
| `Enter` | Open selected job detail |
| `/` | Focus filter |
| `?` | Show keyboard help |

### View 2: Agent Detail

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back    Agent a1b2c3d4                   ● RUNNING  12m 34s │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Info ──────────────────────┐ ┌─ Token Usage ──────────────┐ │
│  │ Model:    opus (xhigh)      │ │                             │ │
│  │ Sandbox:  workspace-write   │ │  ┌────────────────────┐    │ │
│  │ CWD:      ~/project/src     │ │  │▓▓▓▓▓▓▓░░░░░░░░░░░░│    │ │
│  │ tmux:     cc-agent-a1b2c3d4 │ │  └────────────────────┘    │ │
│  │ Started:  10:18:23          │ │  17.5% of 258K context     │ │
│  │                             │ │  Input:  45,200 tokens     │ │
│  │  [Attach tmux] [Kill]       │ │  Output:  3,100 tokens     │ │
│  └─────────────────────────────┘ └─────────────────────────────┘ │
│                                                                  │
│  ┌─ Prompt ────────────────────────────────────────────────────┐ │
│  │ Implement Phase 1 of docs/prds/auth-refactor.md. Read the  │ │
│  │ PRD first. Focus on the session management refactor...      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Terminal Output ─────────────────────────────[Search] [⤓]─┐ │
│  │                                                              │ │
│  │  $ claude --dangerously-skip-permissions --model opus        │ │
│  │                                                              │ │
│  │  I'll start by reading the PRD to understand the full        │ │
│  │  scope of changes needed...                                  │ │
│  │                                                              │ │
│  │  > Read docs/prds/auth-refactor.md                          │ │
│  │                                                              │ │
│  │  I can see the PRD outlines 3 phases. Let me start with     │ │
│  │  Phase 1: Session Management Refactor...                    │ │
│  │                                                              │ │
│  │  > Edit src/auth/session.ts                                 │ │
│  │  Replacing `createSession` with new implementation...       │ │
│  │                                                              │ │
│  │  > Write src/auth/types.ts                                  │ │
│  │  Created new type definitions for session tokens...         │ │
│  │                                                              │ │
│  │  ░ (cursor blinking - agent is thinking)                    │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Send Message ──────────────────────────────────────────────┐ │
│  │ > Type a message to send to this agent...          [Send ⏎] │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Files Modified ──────┐ ┌─ Event Log ─────────────────────┐ │
│  │ src/auth/session.ts   │ │ 10:31  Edit src/auth/session.ts │ │
│  │ src/auth/types.ts     │ │ 10:29  Write src/auth/types.ts  │ │
│  │                       │ │ 10:27  Read docs/prds/auth-...  │ │
│  │                       │ │ 10:26  Glob src/auth/**/*.ts     │ │
│  │                       │ │ 10:25  Read CODEBASE_MAP.md      │ │
│  └───────────────────────┘ └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**

| Component | Data Binding | Refresh |
|-----------|-------------|---------|
| InfoPanel | `MonitoredJob` fields | SSE (job_updated) |
| TokenGauge | `TokenUsage` | SSE or hooks |
| PromptDisplay | `job.prompt` | Static |
| TerminalPanel | WebSocket stream | Real-time (500ms) |
| MessageInput | POST /api/jobs/:id/send | User action |
| FilesModified | `job.filesModified` | SSE (PostToolUse Write/Edit) |
| EventLog | `AgentEvent[]` filtered by jobId | SSE |

### View 3: Multi-Terminal Split View

```
┌─────────────────────────────────────────────────────────────────┐
│  Split View: 3 agents                    [1x1] [2x1] [2x2] [←]│
├────────────────────────────┬────────────────────────────────────┤
│ ● a1b2c3d4 - auth refactor│ ● e5f6g7h8 - security review      │
│                            │                                    │
│ I'll now update the session│ Checking src/auth/jwt.ts for       │
│ validation logic to use    │ potential vulnerabilities...        │
│ the new token type...      │                                    │
│                            │ Found: JWT tokens stored in        │
│ > Edit src/auth/validate.ts│ localStorage. This is an XSS       │
│                            │ risk. Recommending httpOnly         │
│ Replacing the old validate │ cookies instead.                   │
│ function with...           │                                    │
│ ░                          │ > Read src/middleware/auth.ts       │
│                            │ ░                                   │
├────────────────────────────┴────────────────────────────────────┤
│ ● i9j0k1l2 - N+1 query check                                   │
│                                                                  │
│ Searching for N+1 query patterns across the database layer...   │
│                                                                  │
│ > Grep "\.find\(" -g "src/db/**/*.ts"                           │
│                                                                  │
│ Found 3 potential N+1 patterns:                                 │
│   1. src/db/users.ts:45 - User.find() inside loop              │
│   2. src/db/posts.ts:78 - Post.find() without include          │
│   3. src/db/comments.ts:23 - nested find without batch         │
│ ░                                                                │
└─────────────────────────────────────────────────────────────────┘
```

### View 4: Pipeline/Timeline View

```
┌─────────────────────────────────────────────────────────────────┐
│  Pipeline Timeline                                    [Refresh] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  RESEARCH        SYNTHESIS      IMPLEMENTATION    REVIEW         │
│  ──────────      ─────────      ──────────────    ──────         │
│                                                                  │
│  ┌──────────┐                   ┌──────────────┐                │
│  │ e5f6g7h8 │ ●────────────────>│  a1b2c3d4    │                │
│  │ security │                   │  auth refactor│                │
│  │ 8m ●     │                   │  12m ●        │                │
│  └──────────┘                   └──────────────┘                │
│                                                                  │
│  ┌──────────┐                                                   │
│  │ i9j0k1l2 │                                                   │
│  │ N+1 check│                                                   │
│  │ 2m ●     │                                                   │
│  └──────────┘                                                   │
│                                                                  │
│  ┌──────────┐  ✓                                                │
│  │ m3n4o5p6 │─────────────────────────────── ✓ DONE             │
│  │ tests    │  23m                                              │
│  └──────────┘                                                   │
│                                                                  │
│  ── TIME ──────────────────────────────────────────────────>    │
│  10:18     10:20     10:22     10:24     10:26     10:28        │
│                                                                  │
│  ┌─ agents.log ─────────────────────────────────────────────┐  │
│  │ ## Session: 2026-02-07T10:18:00Z                         │  │
│  │ Goal: Refactor authentication system                      │  │
│  │ PRD: docs/prds/auth-refactor.md                          │  │
│  │                                                           │  │
│  │ ### Spawned: a1b2c3d4 - 10:18                            │  │
│  │ Type: implementation                                      │  │
│  │ Prompt: Implement Phase 1 of auth refactor...             │  │
│  │                                                           │  │
│  │ ### Spawned: e5f6g7h8 - 10:22                            │  │
│  │ Type: research                                            │  │
│  │ Prompt: Review security vulnerabilities...                │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### View 5: New Agent Form

```
┌─────────────────────────────────────────────────┐
│  Start New Agent                           [✕]  │
├─────────────────────────────────────────────────┤
│                                                  │
│  Prompt:                                         │
│  ┌───────────────────────────────────────────┐  │
│  │ Review the database migration scripts     │  │
│  │ for data integrity issues. Check that     │  │
│  │ rollbacks are safe.                       │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  Model:      [opus ▾]     Reasoning: [xhigh ▾]  │
│  Sandbox:    [read-only ▾]                       │
│  Directory:  [~/project ▾]                       │
│                                                  │
│  ☑ Include codebase map (--map)                  │
│  ☐ Include files:                                │
│    [Add glob pattern...]                         │
│                                                  │
│  ┌──────────────────┐                            │
│  │ Preview Command   │                            │
│  │ cc-agent start    │                            │
│  │   "Review the..." │                            │
│  │   --map            │                            │
│  │   -s read-only     │                            │
│  │   -r xhigh         │                            │
│  └──────────────────┘                            │
│                                                  │
│           [Cancel]  [Start Agent]                │
└─────────────────────────────────────────────────┘
```

### View 6: Notification Center

```
┌─────────────────────────────────────────────────┐
│  Notifications                    [Mark all read]│
├─────────────────────────────────────────────────┤
│                                                  │
│  ● 10:25  Agent m3n4o5p6 completed              │
│           15 test cases written, all passing     │
│           4 files modified                       │
│                                                  │
│  ● 10:22  Agent q7r8s9t0 failed                 │
│           Error: Timed out after 60 minutes      │
│           [Retry] [View Output]                  │
│                                                  │
│  ○ 10:20  Agent a1b2c3d4 context at 80%         │
│           May compact soon                       │
│                                                  │
│  ○ 10:18  3 agents started                      │
│           auth refactor, security review, N+1    │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Responsive Behavior

| Viewport | Layout Adaptation |
|----------|------------------|
| > 1400px | Full dashboard with side-by-side panels |
| 1024-1400px | Stacked cards, terminal below info |
| 768-1024px | Single column, collapsible panels |
| < 768px | Mobile: card list only, tap to open detail |

---

## 7. Real-time Architecture

### Event Flow

```
                    ┌──────────────────────────────┐
                    │    Browser (Dashboard UI)     │
                    │                              │
                    │  EventSource(/api/events)    │  ← SSE (job status)
                    │  WebSocket(/api/terminal/X)  │  ← WS (terminal data)
                    │  fetch(/api/*)               │  ← REST (on-demand)
                    └──────────┬───────────────────┘
                               │
                    ┌──────────┴───────────────────┐
                    │     Hono Server               │
                    │                              │
                    │  ┌─────────────────────────┐ │
                    │  │   Event Bus             │ │
                    │  │   (EventEmitter)        │ │
                    │  └──────┬──────────────────┘ │
                    │         │                    │
                    │  ┌──────┴──────┐             │
                    │  │  Watchers   │             │
                    │  ├─────────────┤             │
                    │  │ jobs/*.json │ fs.watch    │
                    │  │ events.jsonl│ tail-follow │
                    │  │ tmux panes  │ poll 500ms  │
                    │  │ tmux list   │ poll 5s     │
                    │  └─────────────┘             │
                    └──────────────────────────────┘
```

### SSE Protocol (Job Status)

```typescript
// Client
const events = new EventSource('/api/events');

events.addEventListener('snapshot', (e) => {
  // Full state on connect/reconnect
  const state: { jobs: MonitoredJob[], metrics: DashboardMetrics } = JSON.parse(e.data);
  renderJobs(state.jobs);
});

events.addEventListener('job_updated', (e) => {
  const job: MonitoredJob = JSON.parse(e.data);
  updateJob(job);
});

events.addEventListener('job_created', (e) => { /* ... */ });
events.addEventListener('job_completed', (e) => { /* ... */ });
events.addEventListener('event', (e) => {
  const event: AgentEvent = JSON.parse(e.data);
  appendToTimeline(event);
});
```

### WebSocket Protocol (Terminal Streaming)

```typescript
// Client
const ws = new WebSocket(`ws://localhost:3131/api/terminal/${jobId}`);

ws.onopen = () => {
  // Request initial buffer
  ws.send(JSON.stringify({ type: 'init', lines: 500 }));
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case 'initial':
      terminal.write(msg.data);   // Write initial buffer to xterm.js
      break;
    case 'delta':
      terminal.write(msg.data);   // Append new output
      break;
    case 'completed':
      showCompletionBadge();
      break;
  }
};

// Send message to agent via WebSocket
function sendToAgent(message: string) {
  ws.send(JSON.stringify({ type: 'input', data: message }));
}
```

### Server-Side Terminal Streaming

```typescript
// Efficient tmux capture with delta detection
class TerminalStreamer {
  private lastCapture = '';
  private interval: Timer;
  private clients = new Set<WebSocket>();

  start(sessionName: string) {
    this.interval = setInterval(() => {
      const capture = capturePane(sessionName, { lines: 200 });
      if (!capture || capture === this.lastCapture) return;

      // Compute delta (new content since last capture)
      const delta = this.computeDelta(this.lastCapture, capture);
      this.lastCapture = capture;

      // Broadcast to all connected clients
      for (const ws of this.clients) {
        ws.send(JSON.stringify({ type: 'delta', data: delta }));
      }
    }, 500);
  }

  private computeDelta(prev: string, curr: string): string {
    // Find common prefix length, return the new suffix
    const prevLines = prev.split('\n');
    const currLines = curr.split('\n');
    let commonPrefix = 0;
    while (commonPrefix < prevLines.length &&
           commonPrefix < currLines.length &&
           prevLines[commonPrefix] === currLines[commonPrefix]) {
      commonPrefix++;
    }
    return currLines.slice(commonPrefix).join('\n');
  }
}
```

### Reconnection Strategy

```
1. SSE auto-reconnects (browser EventSource default)
   - On reconnect: server sends full 'snapshot' event
   - Client replaces state entirely (no delta merge needed)

2. WebSocket reconnect with exponential backoff:
   - 1s, 2s, 4s, 8s, max 30s between attempts
   - On reconnect: request last 500 lines (catch-up buffer)
   - Server streams from ring buffer, then live deltas
```

---

## 8. Implementation Roadmap

### Phase 1: Core Dashboard (MVP)

**Goal:** Replace `cc-agent jobs` + `cc-agent capture` with a live web dashboard.

| Task | Effort | Priority |
|------|--------|----------|
| Hono server setup + static serving | 2h | P0 |
| `cc-agent dashboard` CLI command | 1h | P0 |
| REST API: GET /api/jobs, GET /api/jobs/:id | 2h | P0 |
| fs.watch on jobs directory + in-memory state | 3h | P0 |
| SSE endpoint for job status updates | 3h | P0 |
| Preact dashboard layout (dark theme) | 4h | P0 |
| JobList + JobCard components | 3h | P0 |
| StatusBar with aggregate metrics | 2h | P0 |
| Auto-open browser on start | 0.5h | P1 |

**Deliverable:** Live dashboard showing all jobs with auto-updating status.

### Phase 2: Terminal Streaming

**Goal:** View agent terminal output in the browser without tmux attach.

| Task | Effort | Priority |
|------|--------|----------|
| WebSocket endpoint for terminal streaming | 4h | P0 |
| tmux capture polling + delta computation | 3h | P0 |
| xterm.js terminal component (Preact) | 4h | P0 |
| JobDetail view with terminal panel | 3h | P0 |
| Split-pane multi-terminal view | 4h | P1 |
| Terminal search (addon-search) | 2h | P1 |
| Log file viewer for completed jobs | 2h | P1 |

**Deliverable:** Click any job to see its live terminal output.

### Phase 3: Bidirectional Communication

**Goal:** Send messages to agents from the dashboard.

| Task | Effort | Priority |
|------|--------|----------|
| POST /api/jobs/:id/send endpoint | 1h | P0 |
| POST /api/jobs/:id/kill endpoint | 1h | P0 |
| MessageInput component | 2h | P0 |
| NewJobForm (start agent from UI) | 4h | P1 |
| Keyboard shortcuts | 2h | P1 |

**Deliverable:** Full agent lifecycle management from the browser.

### Phase 4: Hooks Integration

**Goal:** Rich event timeline powered by Claude Code hooks.

| Task | Effort | Priority |
|------|--------|----------|
| Hook relay script (relay-event.sh) | 2h | P0 |
| `cc-agent dashboard --setup-hooks` command | 3h | P0 |
| JSONL tail-follow reader | 3h | P0 |
| Event timeline component | 4h | P0 |
| Tool call activity indicators on job cards | 2h | P1 |
| Notification center component | 3h | P1 |

**Deliverable:** Real-time visibility into every tool call, file edit, and agent decision.

### Phase 5: Historical Analytics

**Goal:** Trends and insights over time.

| Task | Effort | Priority |
|------|--------|----------|
| bun:sqlite setup + schema migration | 2h | P0 |
| Job completion -> SQLite persistence | 2h | P0 |
| Metrics API endpoints | 2h | P0 |
| Token usage chart (daily/weekly) | 4h | P1 |
| Job duration trends | 2h | P1 |
| Pipeline timeline/Gantt view | 6h | P2 |
| agents.log parser + coordination view | 4h | P2 |

**Deliverable:** Historical visibility into agent usage patterns and costs.

### Phase 6: Polish & Advanced Features

| Task | Effort | Priority |
|------|--------|----------|
| Responsive design (tablet/mobile) | 4h | P1 |
| WebGL terminal renderer | 2h | P1 |
| Dark/light theme toggle | 2h | P2 |
| Export job data (JSON/CSV) | 2h | P2 |
| Desktop notifications (via Notification API) | 2h | P2 |
| Multi-instance orchestrator view | 6h | P2 |
| File conflict detection (multiple agents editing same file) | 4h | P2 |

### Total Estimated Effort

| Phase | Hours | Weeks (solo dev) |
|-------|-------|-------------------|
| Phase 1: Core Dashboard | ~20h | 1 week |
| Phase 2: Terminal Streaming | ~22h | 1 week |
| Phase 3: Bidirectional Comms | ~10h | 0.5 weeks |
| Phase 4: Hooks Integration | ~17h | 1 week |
| Phase 5: Historical Analytics | ~22h | 1 week |
| Phase 6: Polish | ~22h | 1 week |
| **Total** | **~113h** | **~5.5 weeks** |

MVP (Phases 1-3): ~52h / ~2.5 weeks

---

## 9. Appendix: API Reference

### REST Endpoints

```
GET  /api/jobs                    # List all jobs (same as cc-agent jobs --json)
GET  /api/jobs/:id                # Get single job with enriched data
POST /api/jobs                    # Start new agent (body: { prompt, model, reasoning, sandbox, files, map })
POST /api/jobs/:id/send           # Send message to running agent (body: { message })
POST /api/jobs/:id/kill           # Kill running agent
DELETE /api/jobs/:id              # Delete job and cleanup

GET  /api/metrics                 # Current aggregate metrics
GET  /api/metrics/history         # Historical metrics (query: ?range=7d|30d|90d)

GET  /api/events                  # SSE event stream
GET  /api/events/history          # Recent events (query: ?jobId=X&limit=100)

WS   /api/terminal/:id            # WebSocket terminal stream

GET  /api/health                  # Dashboard + system health check
POST /api/hooks/setup             # Install monitoring hooks
POST /api/hooks/remove            # Remove monitoring hooks
```

### SSE Event Types

```typescript
type SSEEvent =
  | { event: 'snapshot';       data: { jobs: MonitoredJob[]; metrics: DashboardMetrics } }
  | { event: 'job_created';    data: MonitoredJob }
  | { event: 'job_updated';    data: MonitoredJob }
  | { event: 'job_completed';  data: MonitoredJob }
  | { event: 'job_failed';     data: MonitoredJob }
  | { event: 'agent_event';    data: AgentEvent }
  | { event: 'metrics_update'; data: DashboardMetrics }
  | { event: 'heartbeat';      data: { timestamp: string } };
```

### WebSocket Messages

```typescript
// Client -> Server
type WSClientMessage =
  | { type: 'init';  lines?: number }    // Request initial buffer
  | { type: 'input'; data: string };     // Send message to agent

// Server -> Client
type WSServerMessage =
  | { type: 'initial';   data: string }  // Initial buffer content
  | { type: 'delta';     data: string }  // New output since last message
  | { type: 'completed'; data: null }    // Agent finished
  | { type: 'error';     data: string }; // Error message
```

---

## Sources

Research on Claude Code hooks system:
- [Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Claude Code Notifications: Hooks Setup](https://alexop.dev/posts/claude-code-notification-hooks/)
- [Claude Code Hooks Mastery - GitHub](https://github.com/disler/claude-code-hooks-mastery)
- [Complete Guide to Hooks in Claude Code](https://www.eesel.ai/blog/hooks-in-claude-code)
- [Claude Code Hooks: All 12 Lifecycle Events](https://claudefa.st/blog/tools/hooks/hooks-guide)
