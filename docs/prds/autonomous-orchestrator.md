# PRD: Autonomous Orchestrator for CC-Agent

## 1. Context & Motivation

CC-Agent currently operates in a **human-triggered** model: you type `cc-agent start "prompt"`, an agent runs, you check results. The orchestrator (cc-orchestrator skill) adds a layer where one Claude Code instance delegates to workers, but it still requires a human to kick it off and monitor it.

This PRD specifies a **meta-orchestration layer** that makes the orchestrator:
- **Externally controllable** - launch it as a visible tmux session, inject prompts from CLI/dashboard/API
- **Self-managing** - auto-clear context at thresholds, persist state across clears, self-heal from crashes
- **Schedulable** - cron triggers, event reactions, threshold monitors, task queues, modes/profiles
- **Autonomous** - a configurable pulse loop that ties everything together, with per-trigger autonomy settings

The key insight: **all primitives exist** in the codebase. tmux command injection (`sendMessage`), WebSocket terminal streaming, SSE events, hooks, SQLite, REST APIs. This project wires them into a nervous system.

---

## 2. Component Architecture & Relationships

```
                     ┌─ YOU (human) ──────────────────────┐
                     │  CLI / Dashboard UI / REST API      │
                     └──────────┬──────────────────────────┘
                                │ commands, tasks, trigger configs
                    ┌───────────▼───────────────────────────┐
                    │         DASHBOARD SERVER (Hono)        │
                    │                                        │
                    │  ┌──────────────────────────────────┐  │
                    │  │        Pulse Loop (10s tick)      │  │
                    │  │  1. Health check → self-heal      │  │
                    │  │  2. Trigger eval → fire actions    │  │
                    │  │  3. Context monitor → auto-clear   │  │
                    │  │  4. Queue drain → inject tasks     │  │
                    │  └──────────┬───────────────────────┘  │
                    │             │                           │
                    │  ┌──────────▼───────────────────────┐  │
                    │  │ Orchestrator Manager (orch.ts)    │  │
                    │  │  - start/stop/inject/state        │  │
                    │  │  - wraps tmux primitives          │  │
                    │  └──────────┬───────────────────────┘  │
                    │             │ tmux send-keys            │
                    ├─────────────┼──────────────────────────┤
                    │  ┌──────────▼───────────────────────┐  │
                    │  │  ORCHESTRATOR (Claude Code TUI)   │  │
                    │  │  tmux session: cc-orchestrator     │  │
                    │  │  log: ~/.cc-agent/jobs/orch.log    │  │
                    │  │  Visible: tmux attach + dashboard  │  │
                    │  └──────────┬───────────────────────┘  │
                    │             │ cc-agent start "..."       │
                    │      ┌──────┼──────┐                   │
                    │      ▼      ▼      ▼                   │
                    │   [Agent1][Agent2][Agent3] (workers)    │
                    └────────────────────────────────────────┘
```

### 2.1 Component Dependency Graph

```
                 ┌─────────────┐
                 │  config.ts   │ ← constants (ORCH_JOB_ID, STATE_FILE path)
                 └──────┬──────┘
                        │
            ┌───────────┼───────────────┐
            ▼           ▼               ▼
     ┌──────────┐ ┌──────────┐  ┌──────────────┐
     │ tmux.ts  │ │  jobs.ts │  │ dashboard/   │
     │(existing)│ │(existing)│  │  db.ts       │
     └────┬─────┘ └────┬─────┘  │(+3 tables)   │
          │             │        └──────┬───────┘
          └──────┬──────┘               │
                 ▼                      │
          ┌──────────────┐              │
          │orchestrator.ts│◄────────────┘
          │(session mgmt) │   reads queue/trigger tables
          └──────┬───────┘
                 │
          ┌──────▼───────┐
          │  pulse.ts     │ ← imports orchestrator.ts + triggers.ts
          │(autonomous    │   + queue helpers from db.ts
          │ loop)         │   + DashboardState for events
          └──────┬───────┘
                 │
          ┌──────▼───────┐
          │ triggers.ts   │ ← imports db.ts (trigger CRUD)
          │(eval engine)  │   + orchestrator.ts (execute actions)
          └──────┬───────┘
                 │
          ┌──────▼───────┐
          │  modes.ts     │ ← imports db.ts (mode + trigger CRUD)
          │(profiles)     │   higher-level abstraction over triggers
          └──────────────┘
```

### 2.2 Data Flow

```
Input sources:          Storage:              Runtime:
┌──────────────┐   ┌─────────────────┐   ┌──────────────────┐
│CLI queue add │──▶│orchestrator_    │──▶│Pulse reads queue │
│API POST      │   │queue (SQLite)   │   │injects into orch │
│Dashboard UI  │   └─────────────────┘   └──────────────────┘
└──────────────┘
                   ┌─────────────────┐   ┌──────────────────┐
┌──────────────┐   │orchestrator_    │──▶│Pulse evaluates   │
│CLI trigger   │──▶│triggers (SQLite)│   │triggers each tick│
│API POST      │   └─────────────────┘   │fires actions     │
│Dashboard UI  │                         └──────────────────┘
│Orchestrator* │
└──────────────┘   ┌─────────────────┐   ┌──────────────────┐
                   │orchestrator-    │──▶│Written by orch   │
                   │state.json (file)│   │before /clear,    │
                   └─────────────────┘   │read after /clear │
                                         └──────────────────┘
* Orchestrator self-configures via cc-agent CLI (Bash tool)
```

---

## 3. Detailed Component Specifications

### 3.1 Orchestrator Session Manager (`src/orchestrator.ts`)

**Purpose**: Manages the lifecycle of a single, persistent Claude Code tmux session that acts as the "brain."

**Key difference from regular jobs**: The orchestrator uses a **fixed job ID** (`"orch"`) instead of a random hex ID. This means:
- Session name: `cc-agent-orch` (via existing `getSessionName()`)
- Log file: `~/.cc-agent/jobs/orch.log`
- Job file: `~/.cc-agent/jobs/orch.json`
- Terminal WebSocket: `/api/terminal/orch` (works with existing TerminalStreamer)

**Reuses from existing code**:
- `startJob()` from `src/jobs.ts:318` - job creation + tmux session. We'll create a thin wrapper that calls startJob with `jobId = "orch"`. NOTE: `startJob` currently generates a random ID. We need to either: (a) add an optional `jobId` override to `StartJobOptions`, or (b) directly call `createSession()` from tmux.ts + `saveJob()` manually. Option (a) is cleaner.
- `sendToJob()` from `src/jobs.ts` - command injection
- `clearJobContext()` from `src/jobs.ts:511` - sends `/clear`
- `getJobUsage()` from `src/jobs.ts:529` - context stats
- `killJob()` from `src/jobs.ts:362` - shutdown
- `loadJob()` from `src/jobs.ts:56` - status check

**State file** (`~/.cc-agent/orchestrator-state.json`):
```typescript
interface OrchestratorState {
  current_task: string | null;       // description of what it's doing
  active_agents: string[];            // job IDs of spawned workers
  context_summary: string;            // what context should be preserved
  queue_position: number;             // last queue task ID processed
  last_saved: string;                 // ISO timestamp
}
```

The orchestrator writes this file via Bash tool before context clear. The dashboard reads it to verify save succeeded, then injects it as a resume prompt after clear.

**Exports**:
```typescript
startOrchestrator(opts?: {model?, reasoning?}): {success, error?}
stopOrchestrator(): {success, error?}
getOrchestratorStatus(): {running, idle, state, contextPct?}
injectToOrchestrator(message: string): boolean
saveOrchestratorState(state: OrchestratorState): void
loadOrchestratorState(): OrchestratorState | null
ORCH_JOB_ID: "orch"  // constant
```

---

### 3.2 Context Lifecycle Manager (integrated into `src/dashboard/state.ts`)

**Purpose**: Monitors orchestrator context usage and triggers auto-clear cycle.

**How context_used_pct is obtained**: `loadSessionData(jobId)` in `src/jobs.ts:148` parses the Claude session JSONL file and extracts `tokens.context_used_pct`. The `getJobsJson()` function already does this for all running jobs. We hook into the existing `DashboardState.refresh()` cycle (runs every 5s).

**The clear cycle (3 steps)**:

| Step | Trigger | Action | Guards |
|------|---------|--------|--------|
| 1. Warn | context >= 70% | Inject "SYSTEM: Context at N%. Save state now." | Only once per 120s (cooldown) |
| 2. Clear | context >= 80% OR state file updated after warn | Send `/clear` | Only if warn was sent first |
| 3. Resume | 3s after clear | Inject "SYSTEM: Read state file, resume work" | Only if clear was sent |

**Integration point**: Add a `private checkOrchestratorContext()` method to `DashboardState` class, called from `refresh()`. Track `lastContextWarnTime` and `contextClearState: 'idle' | 'warned' | 'clearing' | 'resuming'` as instance variables.

**Relationship to Pulse**: The context manager runs in DashboardState's 5s refresh cycle, NOT in the pulse loop. This is intentional - context monitoring should work even if the pulse is stopped.

---

### 3.3 Task Queue (SQLite table + helpers in `src/dashboard/db.ts`)

**Purpose**: Persistent queue of tasks for the orchestrator to process.

**Schema** (add to `initSchema()` in `src/dashboard/db.ts:22`):
```sql
CREATE TABLE IF NOT EXISTS orchestrator_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt TEXT NOT NULL,
  priority INTEGER DEFAULT 0,           -- higher = more urgent
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  metadata TEXT,                          -- JSON blob for tags, notes
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_status_priority
  ON orchestrator_queue(status, priority DESC, created_at ASC);
```

**Helper functions** (add to `src/dashboard/db.ts`):
```typescript
addQueueTask({prompt, priority?, metadata?}): number        // returns ID
getQueueTasks(status?: string): QueueTask[]                  // ordered by priority DESC, created_at ASC
getNextPendingTask(): QueueTask | null                       // convenience: first pending
updateQueueTask(id, {status?, started_at?, completed_at?})
removeQueueTask(id): boolean
getQueueDepth(): number                                      // COUNT of pending
```

**Queue processing** (done by pulse loop, not by queue module):
1. Pulse checks: Is orchestrator idle? (state file has `current_task: null` AND log file unchanged for 30s)
2. Pulse gets next pending task via `getNextPendingTask()`
3. Marks task as `processing`, sets `started_at`
4. Injects prompt into orchestrator: `"SYSTEM: New task from queue (#ID):\n\n{prompt}\n\nWhen done, save state and update queue."`
5. Orchestrator processes task, eventually updates state file with `current_task: null`
6. On next idle check, pulse marks previous task as `completed`

---

### 3.4 Trigger Engine (`src/orchestrator/triggers.ts`)

**Purpose**: Evaluate conditions and fire actions, with configurable autonomy.

**Schema** (add to `initSchema()` in `src/dashboard/db.ts`):
```sql
CREATE TABLE IF NOT EXISTS orchestrator_triggers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,                    -- cron | event | threshold
  condition TEXT NOT NULL,               -- "*/15 * * * *" | "job_completed" | "context_used_pct > 75"
  action TEXT NOT NULL,                  -- inject_prompt | clear_context | start_orchestrator | queue_task | notify
  action_payload TEXT,                   -- JSON: {"prompt":"..."} or {"message":"..."}
  autonomy TEXT NOT NULL DEFAULT 'confirm', -- auto | confirm
  enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_seconds INTEGER DEFAULT 60,
  last_triggered TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Three trigger types**:

| Type | Condition format | Evaluation | Example |
|------|-----------------|------------|---------|
| `cron` | `"M H D Mo W"` (5-field cron) | Match against current minute | `"*/15 * * * *"` = every 15 min |
| `event` | Event name string | Match against emitted event | `"job_completed"` |
| `threshold` | `"metric op value"` | Compare metric to threshold | `"queue_depth >= 5"` |

**Cron evaluation**: Implement a simple 50-line matcher supporting `*`, `*/N`, and literal values. No npm dependency needed. Evaluated every 10s by pulse; use `last_triggered` + `cooldown_seconds` to prevent re-firing within the same minute.

**Event evaluation**: `DashboardState` already emits `job_completed`, `job_failed`, `hook_event`. The pulse loop calls `evaluateEventTriggers(eventName)` when these fire.

**Threshold metrics available**:
- `context_used_pct` - from orchestrator's session data
- `queue_depth` - COUNT of pending queue tasks
- `active_agents` - COUNT of running jobs
- `idle_seconds` - seconds since orchestrator's last log file change

**Five action types**:

| Action | What it does | Payload |
|--------|-------------|---------|
| `inject_prompt` | `sendToJob("orch", payload.prompt)` | `{"prompt": "..."}` |
| `clear_context` | `clearJobContext("orch")` | none |
| `start_orchestrator` | `startOrchestrator()` | `{"model?": "...", "reasoning?": "..."}` |
| `queue_task` | `addQueueTask(payload)` | `{"prompt": "...", "priority?": N}` |
| `notify` | Emit SSE event for dashboard | `{"message": "..."}` |

**Autonomy model**:
- `auto`: Execute immediately, log to activity feed
- `confirm`: Add to `pendingApprovals[]` in-memory array, emit SSE `approval_required` event, dashboard shows approve/reject buttons

**Pending approvals** (in-memory, not persisted - they're ephemeral):
```typescript
interface PendingApproval {
  id: string;             // random UUID
  trigger_id: number;
  trigger_name: string;
  action: string;
  action_payload: any;
  created_at: string;
}

// Module state
const pendingApprovals: PendingApproval[] = [];
getPendingApprovals(): PendingApproval[]
approveAction(approvalId: string): boolean
rejectAction(approvalId: string): boolean
```

---

### 3.5 Pulse Loop (`src/orchestrator/pulse.ts`)

**Purpose**: The 10-second heartbeat that ties all components together.

**Imports**: This is the most connected module. It imports from:
- `orchestrator.ts` - start/stop/status/inject
- `triggers.ts` - evaluateTriggers()
- `db.ts` - getNextPendingTask(), updateQueueTask()
- `state.ts` - getDashboardState() for event subscriptions

**The tick (every 10 seconds)**:
```
function pulseTick():
  1. HEALTH: Is cc-agent-orch tmux session alive?
     - No → respawn: startOrchestrator() + inject state file after 5s
     - Yes → continue

  2. TRIGGERS: evaluateCronTriggers() + evaluateThresholdTriggers()
     - auto triggers → execute immediately
     - confirm triggers → add to pending approvals

  3. QUEUE: Is orchestrator idle AND has pending tasks?
     - Idle = loadOrchestratorState().current_task === null
             AND log file mtime > 30s ago
     - If idle: dequeue next task, mark processing, inject prompt

  4. EMIT: Send SSE pulse event with summary:
     {type: "pulse", orchestrator_running, queue_depth, active_triggers, pending_approvals}
```

**Event-based triggers**: Subscribe to `DashboardState` change events for `job_completed` and `job_failed`. Call `evaluateEventTriggers(eventType)` immediately (not waiting for tick).

**Start/stop**:
```typescript
startPulse(): {success, error?}     // setInterval(pulseTick, 10000)
stopPulse(): {success, error?}      // clearInterval
getPulseStatus(): {running, last_tick, next_tick}
```

**Relationship to dashboard server**: Pulse starts automatically when dashboard starts (`startDashboard()` in `server.ts:91`). But can be independently stopped/started via CLI or API.

---

### 3.6 Modes / Profiles (`src/orchestrator/modes.ts`)

**Purpose**: Named collections of trigger configurations for different operational contexts.

**Schema** (add to `initSchema()` in `src/dashboard/db.ts`):
```sql
CREATE TABLE IF NOT EXISTS orchestrator_modes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  trigger_config TEXT NOT NULL,    -- JSON array of full trigger definitions
  is_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

`trigger_config` stores the complete trigger definitions (not IDs), so modes are self-contained snapshots:
```json
[
  {"name": "queue-check", "type": "cron", "condition": "*/15 * * * *", "action": "inject_prompt", "action_payload": "{\"prompt\":\"Check queue\"}", "autonomy": "auto", "cooldown_seconds": 60}
]
```

**Activation**: When a mode is activated:
1. Disable all current triggers: `UPDATE orchestrator_triggers SET enabled = 0`
2. Delete all current triggers (they're recreated from mode config)
3. Insert triggers from mode's `trigger_config`
4. Set `is_active = 1` on the mode, `0` on all others

**Preset modes** (created on first `initSchema` run if modes table is empty):

| Mode | Triggers | Autonomy |
|------|----------|----------|
| **dev** | Queue check every 15min, health report every 30min | auto |
| **maintenance** | Nightly cleanup at 2am, weekly audit Monday 8am | confirm |
| **sprint** | Queue check every 5min, low-capacity alert (`active_agents < 2`), continuous processing | auto |

**Self-configuration**: The orchestrator can call `cc-agent mode create "custom-mode" --triggers '[...]'` via Bash tool, and `cc-agent mode activate "custom-mode"`. All changes logged in SQLite.

---

### 3.7 API Routes (new files in `src/dashboard/api/`)

All follow the pattern established by `src/dashboard/api/actions.ts`.

**`src/dashboard/api/orchestrator.ts`**:
```
POST   /api/orchestrator/start          → startOrchestrator()
POST   /api/orchestrator/stop           → stopOrchestrator()
GET    /api/orchestrator/status          → getOrchestratorStatus()
POST   /api/orchestrator/inject          → injectToOrchestrator(body.message)
GET    /api/orchestrator/state           → loadOrchestratorState()
```

**`src/dashboard/api/queue.ts`**:
```
GET    /api/queue/tasks?status=pending   → getQueueTasks(status)
POST   /api/queue/tasks                  → addQueueTask(body)
DELETE /api/queue/tasks/:id              → removeQueueTask(id)
PATCH  /api/queue/tasks/:id              → updateQueueTask(id, body)
```

**`src/dashboard/api/triggers.ts`**:
```
GET    /api/triggers                     → getTriggers()
POST   /api/triggers                     → addTrigger(body)
PATCH  /api/triggers/:id                 → updateTrigger(id, body)
DELETE /api/triggers/:id                 → removeTrigger(id)
GET    /api/approvals                    → getPendingApprovals()
POST   /api/approvals/:id/approve        → approveAction(id)
POST   /api/approvals/:id/reject         → rejectAction(id)
```

**`src/dashboard/api/modes.ts`**:
```
GET    /api/modes                        → getModes()
POST   /api/modes                        → createMode(body)
POST   /api/modes/:id/activate           → activateMode(id)
DELETE /api/modes/:id                    → deleteMode(id)
```

**`src/dashboard/api/pulse.ts`**:
```
POST   /api/pulse/start                  → startPulse()
POST   /api/pulse/stop                   → stopPulse()
GET    /api/pulse/status                 → getPulseStatus()
```

**Registration** (add to `src/dashboard/server.ts:67-73`):
```typescript
app.route("/api/orchestrator", orchestratorApi);
app.route("/api/queue", queueApi);
app.route("/api/triggers", triggersApi);
app.route("/api/modes", modesApi);
app.route("/api/pulse", pulseApi);
```

---

### 3.8 CLI Extensions (`src/cli.ts`)

Add command groups after the existing switch statement:

```
cc-agent orchestrator start [--model opus] [--reasoning xhigh]
cc-agent orchestrator stop
cc-agent orchestrator status
cc-agent orchestrator inject "message"

cc-agent queue add "prompt" [--priority 5]
cc-agent queue list [--status pending]
cc-agent queue remove <id>

cc-agent trigger add <name> <type> <condition> <action> [--payload '{}'] [--autonomy auto|confirm] [--cooldown 60]
cc-agent trigger list
cc-agent trigger toggle <id>
cc-agent trigger remove <id>

cc-agent mode list
cc-agent mode activate <name>
cc-agent mode create <name> [--description "..."] [--from-current]

cc-agent pulse start
cc-agent pulse stop
cc-agent pulse status
```

These CLI commands call the same functions as the API routes. The orchestrator uses these via Bash tool to self-configure.

---

### 3.9 Dashboard UI Components

**Route**: `#/orchestrator` in `ui/src/App.tsx`

**New components** (in `ui/src/components/`):

| Component | Description | Data source |
|-----------|-------------|-------------|
| `OrchestratorView.tsx` | Layout container for the orchestrator page | composes children |
| `OrchestratorPanel.tsx` | Terminal (xterm.js) + status + inject form | WS `/api/terminal/orch` + `GET /api/orchestrator/status` |
| `QueuePanel.tsx` | Task list + add form + remove | `GET/POST/DELETE /api/queue/tasks` |
| `TriggerPanel.tsx` | Trigger list + add/edit + toggle | `GET/POST/PATCH/DELETE /api/triggers` |
| `ModeSelector.tsx` | Mode dropdown/tabs + activate | `GET /api/modes` + `POST /api/modes/:id/activate` |
| `ApprovalsBar.tsx` | Pending approvals with approve/reject | `GET /api/approvals` + `POST /api/approvals/:id/*` |
| `PulseIndicator.tsx` | Pulse status indicator (on/off + last tick) | `GET /api/pulse/status` |

**Terminal reuse**: `OrchestratorPanel` uses the same `TerminalPanel` component that already exists for agent terminals. It just passes `jobId="orch"`.

---

## 4. Implementation Sessions (Context-Optimized)

Each session is designed to:
- Touch **3-5 files max** to stay within comfortable context
- Complete a **full vertical slice** (data + server + CLI or UI)
- Be **independently testable** at the end
- Have **clear boundaries** that minimize cross-session dependencies

### Session 1: Orchestrator Session Manager
**Focus**: New file `src/orchestrator.ts` + modify `src/cli.ts` + modify `src/config.ts`

**Files to read** (context load): `src/jobs.ts` (startJob pattern), `src/tmux.ts` (createSession), `src/config.ts`
**Files to create**: `src/orchestrator.ts`
**Files to modify**: `src/cli.ts` (add orchestrator command), `src/config.ts` (add ORCH_JOB_ID)
**Files to modify (small)**: `src/jobs.ts` - add optional `jobId` parameter to `StartJobOptions`

**What to verify**:
```bash
cc-agent orchestrator start
# Observe: tmux session cc-agent-orch created
tmux attach -t cc-agent-orch
# See: Claude Code running with orchestrator initial prompt
cc-agent orchestrator status
# See: Running, current state info
cc-agent orchestrator inject "What agents are running?"
# See: Message appears in orchestrator's terminal
cc-agent orchestrator stop
# tmux session killed
```

**Estimated context**: ~400 lines read + ~200 lines written = light session

---

### Session 2: Orchestrator API + Dashboard Terminal
**Focus**: API route file + register in server + verify WebSocket terminal works

**Files to read**: `src/dashboard/api/actions.ts` (pattern), `src/dashboard/server.ts` (registration)
**Files to create**: `src/dashboard/api/orchestrator.ts`
**Files to modify**: `src/dashboard/server.ts` (register route + import)

**What to verify**:
```bash
# Start dashboard + orchestrator
cc-agent dashboard
cc-agent orchestrator start
# API works:
curl localhost:3131/api/orchestrator/status
curl -X POST localhost:3131/api/orchestrator/inject -d '{"message":"hello"}'
# WebSocket terminal works:
# Open localhost:3131, navigate to terminal for job "orch"
```

**Estimated context**: ~200 lines read + ~80 lines written = very light session

---

### Session 3: Context Lifecycle Manager
**Focus**: Add context monitoring to DashboardState + state file read/write in orchestrator.ts

**Files to read**: `src/dashboard/state.ts` (refresh cycle), `src/orchestrator.ts` (from session 1)
**Files to modify**: `src/dashboard/state.ts` (add checkOrchestratorContext), `src/orchestrator.ts` (state file helpers)

**What to verify**:
- Start orchestrator, feed it tasks that grow context
- Watch dashboard logs for context threshold warnings
- Verify state file gets written before clear
- Verify orchestrator resumes after clear

**Estimated context**: ~300 lines read + ~100 lines written = light session

---

### Session 4: Task Queue (Data + CLI + API)
**Focus**: SQLite schema + helpers + CLI + API route

**Files to read**: `src/dashboard/db.ts` (schema pattern), `src/cli.ts` (command pattern), `src/dashboard/api/actions.ts` (API pattern)
**Files to modify**: `src/dashboard/db.ts` (add table + helpers), `src/cli.ts` (add queue command)
**Files to create**: `src/dashboard/api/queue.ts`
**Files to modify (small)**: `src/dashboard/server.ts` (register queue route)

**What to verify**:
```bash
cc-agent queue add "Review the authentication module" --priority 5
cc-agent queue add "Write tests for the API layer"
cc-agent queue list
# ID  PRIORITY  STATUS   PROMPT
# 1   5         pending  Review the authentication...
# 2   0         pending  Write tests for the API...
curl localhost:3131/api/queue/tasks
cc-agent queue remove 2
```

**Estimated context**: ~250 lines read + ~200 lines written = moderate session

---

### Session 5: Trigger Engine (Data + Evaluation + CLI + API)
**Focus**: Trigger schema + evaluation logic + CLI + API. **Largest session** - may need to split.

**Files to read**: `src/dashboard/db.ts` (from session 4), `src/orchestrator.ts`
**Files to modify**: `src/dashboard/db.ts` (add triggers table + helpers)
**Files to create**: `src/orchestrator/triggers.ts`, `src/dashboard/api/triggers.ts`
**Files to modify**: `src/cli.ts` (add trigger command), `src/dashboard/server.ts` (register route)

**Potential split**: If context gets heavy, split into:
- 5a: Schema + helpers + CLI (db.ts + cli.ts)
- 5b: Evaluation engine + API (triggers.ts + api/triggers.ts)

**What to verify**:
```bash
cc-agent trigger add "queue-check" cron "*/15 * * * *" inject_prompt \
  --payload '{"prompt":"Check the queue for new tasks"}' --autonomy auto
cc-agent trigger list
cc-agent trigger toggle 1
curl localhost:3131/api/triggers
```

**Estimated context**: ~300 lines read + ~350 lines written = moderate-heavy session

---

### Session 6: Pulse Loop + Self-Healing
**Focus**: Core autonomous loop that ties triggers + queue + health together

**Files to read**: `src/orchestrator.ts`, `src/orchestrator/triggers.ts`, `src/dashboard/db.ts` (queue helpers), `src/dashboard/state.ts`
**Files to create**: `src/orchestrator/pulse.ts`, `src/dashboard/api/pulse.ts`
**Files to modify**: `src/dashboard/server.ts` (start pulse + register API), `src/cli.ts` (pulse command)

**What to verify**:
```bash
# Start everything
cc-agent dashboard   # pulse auto-starts
cc-agent orchestrator start
cc-agent queue add "List all files in the project"
# Watch: pulse detects idle orchestrator, injects queue task
# Kill orchestrator manually:
tmux kill-session -t cc-agent-orch
# Watch: pulse detects crash, respawns orchestrator, injects state
cc-agent pulse status
# Pulse: running, last tick: 2s ago
```

**Estimated context**: ~400 lines read + ~200 lines written = moderate session

---

### Session 7: Modes / Profiles
**Focus**: Modes schema + management + presets + CLI + API

**Files to read**: `src/dashboard/db.ts` (triggers schema), `src/orchestrator/triggers.ts`
**Files to create**: `src/orchestrator/modes.ts`, `src/dashboard/api/modes.ts`
**Files to modify**: `src/dashboard/db.ts` (add modes table), `src/cli.ts` (mode command), `src/dashboard/server.ts` (register route)

**What to verify**:
```bash
cc-agent mode list
# NAME          ACTIVE  DESCRIPTION
# dev           no      Development mode...
# maintenance   no      Nightly maintenance...
# sprint        no      Aggressive processing...
cc-agent mode activate dev
cc-agent trigger list
# Shows dev-mode triggers now enabled
```

**Estimated context**: ~300 lines read + ~200 lines written = moderate session

---

### Session 8: Dashboard UI - Orchestrator Page
**Focus**: All UI components for the orchestrator view

**Files to read**: `ui/src/App.tsx` (routing pattern), existing component for reference
**Files to create**: `ui/src/components/OrchestratorView.tsx`, `OrchestratorPanel.tsx`, `QueuePanel.tsx`, `TriggerPanel.tsx`, `ModeSelector.tsx`, `ApprovalsBar.tsx`, `PulseIndicator.tsx`
**Files to modify**: `ui/src/App.tsx` (add route + nav link)

**Potential split**: This is UI-heavy but the components are independent:
- 8a: OrchestratorView + OrchestratorPanel + PulseIndicator (terminal focus)
- 8b: QueuePanel + TriggerPanel + ModeSelector + ApprovalsBar (config panels)

**What to verify**: Open `localhost:3131/#/orchestrator` in browser, verify all panels render with live data.

---

## 5. Cross-Cutting Concerns

### 5.1 Error Handling
- All tmux operations can fail silently (session not found, send failed). Every function wraps in try/catch and returns `{success, error?}`.
- SQLite operations use the existing WAL mode + NORMAL synchronous from `db.ts`.
- Pulse loop catches all errors per-tick to prevent the whole loop from crashing.

### 5.2 SSE Events (for real-time dashboard updates)
Add new event types to `StateEvent` in `src/dashboard/state.ts`:
```typescript
| { type: "orchestrator_status_change"; status: "started" | "stopped" | "clearing" | "resuming" }
| { type: "queue_update"; task: QueueTask }
| { type: "trigger_fired"; trigger: Trigger; action: string }
| { type: "approval_required"; approval: PendingApproval }
| { type: "pulse_tick"; summary: PulseSummary }
```

### 5.3 Logging / Audit Trail
All automated actions are logged to an `orchestrator_activity` SQLite table:
```sql
CREATE TABLE IF NOT EXISTS orchestrator_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,          -- "trigger_fired", "queue_processed", "context_cleared", "respawned"
  details TEXT,                   -- JSON details
  trigger_id INTEGER,
  queue_task_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
```
This provides a full audit trail visible in the dashboard activity log.

### 5.4 Guard Rails
- **Cooldown**: Every trigger has a configurable `cooldown_seconds` (default 60). Prevents rapid-fire.
- **Context clear guard**: Only one clear cycle can be active at a time. State machine: `idle → warned → clearing → resuming → idle`.
- **Queue processing guard**: Only one task can be `processing` at a time.
- **Respawn guard**: At most 1 respawn attempt per 60 seconds.

---

## 6. Verification Plan

### End-to-end test scenario:
1. `cc-agent dashboard` - starts dashboard with pulse
2. `cc-agent orchestrator start` - creates orchestrator session
3. `cc-agent mode activate dev` - enables dev-mode triggers
4. `cc-agent queue add "List all TypeScript files"` - queue a task
5. **Watch**: Pulse detects idle orchestrator, injects task
6. **Watch**: Orchestrator processes task, spawns agents
7. `cc-agent trigger add "test-trigger" cron "* * * * *" inject_prompt --payload '{"prompt":"Status report"}' --autonomy confirm`
8. **Watch**: Dashboard shows approval notification
9. Approve in dashboard UI
10. **Watch**: "Status report" injected into orchestrator
11. Kill orchestrator tmux session manually
12. **Watch**: Pulse respawns it, injects state file
13. Open `localhost:3131/#/orchestrator` - verify all panels show correct data

### Per-session verification (listed in each session above)

---

## 7. Files Summary

### New files (10)
| File | Session | Lines est. |
|------|---------|-----------|
| `src/orchestrator.ts` | 1 | ~150 |
| `src/orchestrator/triggers.ts` | 5 | ~300 |
| `src/orchestrator/pulse.ts` | 6 | ~150 |
| `src/orchestrator/modes.ts` | 7 | ~120 |
| `src/dashboard/api/orchestrator.ts` | 2 | ~60 |
| `src/dashboard/api/queue.ts` | 4 | ~70 |
| `src/dashboard/api/triggers.ts` | 5 | ~90 |
| `src/dashboard/api/modes.ts` | 7 | ~60 |
| `src/dashboard/api/pulse.ts` | 6 | ~30 |
| `ui/src/components/OrchestratorView.tsx` | 8 | ~400 (total for all UI components) |

### Modified files (7)
| File | Sessions | Changes |
|------|----------|---------|
| `src/config.ts` | 1 | Add ORCH_JOB_ID constant |
| `src/jobs.ts` | 1 | Optional jobId in StartJobOptions |
| `src/cli.ts` | 1,4,5,6,7 | Add 5 command groups (~200 lines total) |
| `src/dashboard/db.ts` | 4,5,7 | Add 4 tables + helpers (~250 lines total) |
| `src/dashboard/server.ts` | 2,4,5,6,7 | Register 5 API routes + start pulse |
| `src/dashboard/state.ts` | 3 | Context lifecycle monitoring (~60 lines) |
| `ui/src/App.tsx` | 8 | Add orchestrator route + nav link |

### Total estimated new code: ~1,700 lines
