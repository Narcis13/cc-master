# CC Orchestrator - Monitoring UI Design Specification

> Production-ready wireframes and component specifications for the cc-orchestrator monitoring dashboard.

---

## Table of Contents

1. [Design System](#1-design-system)
2. [Dashboard Overview](#2-dashboard-overview)
3. [Agent Detail View](#3-agent-detail-view)
4. [Multi-Instance View](#4-multi-instance-view)
5. [Real-time Terminal Panel](#5-real-time-terminal-panel)
6. [Notification Center](#6-notification-center)
7. [Settings / Configuration Panel](#7-settings--configuration-panel)
8. [Navigation & Layout Shell](#8-navigation--layout-shell)

---

## 1. Design System

### Color Palette

| Token             | Value     | Usage                            |
|-------------------|-----------|----------------------------------|
| `--bg-primary`    | `#0d1117` | Main background (dark)           |
| `--bg-secondary`  | `#161b22` | Card/panel backgrounds           |
| `--bg-tertiary`   | `#21262d` | Hover states, input backgrounds  |
| `--border`        | `#30363d` | Borders, dividers                |
| `--text-primary`  | `#e6edf3` | Primary text                     |
| `--text-secondary`| `#8b949e` | Secondary/muted text             |
| `--accent`        | `#58a6ff` | Links, active indicators         |
| `--status-running`| `#3fb950` | Running agents (green)           |
| `--status-pending`| `#d29922` | Pending agents (amber)           |
| `--status-done`   | `#8b949e` | Completed agents (gray)          |
| `--status-failed` | `#f85149` | Failed agents (red)              |
| `--token-input`   | `#79c0ff` | Input token indicators (blue)    |
| `--token-output`  | `#d2a8ff` | Output token indicators (purple) |

### Typography

- **Font family**: `"JetBrains Mono", "SF Mono", "Fira Code", monospace`
- **Base size**: 13px
- **Headings**: 14px semibold (h3), 16px semibold (h2), 20px bold (h1)
- **Terminal text**: 12px monospace

### Spacing Scale

4px / 8px / 12px / 16px / 24px / 32px / 48px

### Status Indicators

```
RUNNING   [====----]  pulsing green dot + animated border
PENDING   [........]  static amber dot
COMPLETED [========]  static gray dot + checkmark
FAILED    [XXXXXXXX]  static red dot + X icon
```

---

## 2. Dashboard Overview

The primary landing view. Shows all agents at a glance with system-level metrics and pipeline visualization.

### Wireframe

```
+--[SHELL: sidebar + topbar]-----------------------------------------------+
|                                                                           |
|  SYSTEM METRICS BAR                                                       |
|  +----------+ +----------+ +----------+ +----------+ +-----------------+  |
|  | 3 Active | | 12 Done  | | 1 Failed | | 4 tmux   | | 847K tokens     |  |
|  | agents   | | agents   | | agents   | | sessions | | total used      |  |
|  +----------+ +----------+ +----------+ +----------+ +-----------------+  |
|                                                                           |
|  PIPELINE STAGES                                                          |
|  +--------+  +----------+  +-----------+  +-----+  +------+  +------+    |
|  |Ideation|->| Research  |->| Synthesis |->| PRD |->|Implem|->|Review|    |
|  |  (1)   |  |   (2)    |  |   (0)     |  | (0) |  | (3)  |  | (0)  |    |
|  +--------+  +----------+  +-----------+  +-----+  +------+  +------+    |
|  [green]     [green]        [gray]        [gray]   [green]    [gray]      |
|                                                                           |
|  QUICK ACTIONS                              FILTER / SORT                 |
|  [+ New Agent]  [Refresh]                   [All v] [Sort: Recent v]      |
|                                             [Search: ______________ ]     |
|                                                                           |
|  AGENT CARDS                                                              |
|  +-----------------------------------+ +-----------------------------------+
|  | a1b2c3d4  RUNNING        3m 42s   | | e5f6a7b8  RUNNING        1m 15s   |
|  | Model: opus  Effort: xhigh        | | Model: sonnet  Effort: low        |
|  | Sandbox: workspace-write           | | Sandbox: read-only                |
|  |                                    | |                                   |
|  | "Review auth module for security   | | "Generate unit tests for the      |
|  |  vulnerabilities in the login..."  | |  payment processing module..."    |
|  |                                    | |                                   |
|  | Tokens: 12.4K in / 3.2K out       | | Tokens: 5.1K in / 1.8K out        |
|  | Context: [========--] 78%          | | Context: [====------] 42%         |
|  |                                    | |                                   |
|  | Files: 3 modified                  | | Files: 0 modified                 |
|  | Dir: ~/projects/webapp             | | Dir: ~/projects/webapp             |
|  | tmux: cc-agent-a1b2c3d4            | | tmux: cc-agent-e5f6a7b8            |
|  |                                    | |                                   |
|  | [View] [Send Msg] [Terminal] [Kill]| | [View] [Send Msg] [Terminal] [Kill]|
|  +-----------------------------------+ +-----------------------------------+
|  +-----------------------------------+ +-----------------------------------+
|  | f9e8d7c6  COMPLETED     12m 08s   | | 1a2b3c4d  FAILED         0m 03s   |
|  | Model: opus  Effort: high         | | Model: opus  Effort: xhigh        |
|  |                                    | |                                   |
|  | "Refactor database connection      | | "Deploy staging environment..."    |
|  |  pooling to use async/await..."    | |                                   |
|  |                                    | | Error: Failed to create tmux      |
|  | Tokens: 45.2K in / 12.1K out      | | session                            |
|  | Context: [==========] 100%         | |                                   |
|  | Summary: Refactored 4 files to     | | [View] [Retry] [Delete]            |
|  |   use connection pool with...      | |                                   |
|  | Files: 4 modified                  | +-----------------------------------+
|  |                                    |
|  | [View] [Output] [Delete]           |
|  +-----------------------------------+
|                                                                           |
|  TIMELINE (collapsed by default, expandable)                              |
|  +-----------------------------------------------------------------------+
|  | 14:32  a1b2c3d4 started (opus/xhigh)                                  |
|  | 14:30  e5f6a7b8 started (sonnet/low)                                  |
|  | 14:28  f9e8d7c6 completed (12m 08s, 45.2K tokens)                     |
|  | 14:16  f9e8d7c6 started (opus/high)                                   |
|  | 14:15  1a2b3c4d failed (tmux session error)                           |
|  +-----------------------------------------------------------------------+
|                                                                           |
+--------------------------------------------------------------------------+
```

### Component List

| Component                | Data Binding                                   | Notes                                      |
|--------------------------|------------------------------------------------|--------------------------------------------|
| `SystemMetricsBar`       | `jobs.filter(status)`, `listSessions().length`  | Aggregate counters from jobs list           |
| `PipelineStages`         | Derived from `job.prompt` keyword detection     | Maps prompts to pipeline stages heuristically |
| `QuickActions`           | `startJob()`, refresh triggers                 | "+ New Agent" opens modal                   |
| `FilterSortBar`          | Local state: status filter, sort field         | Filters applied client-side                 |
| `AgentCard`              | Individual `Job` + `ParsedSessionData`         | Color-coded by status                       |
| `AgentCard.StatusBadge`  | `job.status`                                   | Pulsing animation for "running"             |
| `AgentCard.TokenBar`     | `tokens.input`, `tokens.output`, `tokens.context_used_pct` | Segmented progress bar          |
| `AgentCard.PromptPreview`| `job.prompt` (truncated to 100 chars)          | Full text in tooltip                        |
| `AgentCard.ActionButtons`| `sendToJob()`, `getJobOutput()`, `killJob()`  | Contextual per status                       |
| `Timeline`               | `jobs` sorted by timestamp events              | Collapsible, shows last 20 events           |

### Refresh Strategy

| Data                 | Method              | Interval  |
|----------------------|---------------------|-----------|
| Job list + statuses  | Poll `GET /jobs`    | 3 seconds |
| Token usage          | Poll with job data  | 3 seconds |
| tmux sessions count  | Poll `GET /sessions`| 10 seconds|
| Pipeline stages      | Derived from jobs   | On job refresh |

### Interaction Patterns

| Action                         | Trigger                       | Result                          |
|--------------------------------|-------------------------------|---------------------------------|
| View agent detail              | Click card or [View] button   | Navigate to Agent Detail View   |
| Start new agent                | Click [+ New Agent]           | Open "New Agent" modal          |
| Send message to agent          | Click [Send Msg]              | Open inline message input       |
| Open terminal for agent        | Click [Terminal]              | Open Terminal Panel for agent   |
| Kill agent                     | Click [Kill]                  | Confirmation dialog, then kill  |
| Filter by status               | Dropdown selection            | Filter cards instantly          |
| Sort agents                    | Dropdown selection            | Re-sort: recent, status, tokens |
| Toggle timeline                | Click timeline header         | Expand/collapse                 |
| Keyboard: refresh              | `R` key                       | Force refresh all data          |
| Keyboard: focus search         | `/` key                       | Focus search input              |
| Keyboard: navigate cards       | Arrow keys                    | Move focus between cards        |
| Keyboard: open focused card    | `Enter`                       | Navigate to detail view         |

### Responsive Behavior

| Breakpoint       | Layout                                         |
|------------------|-------------------------------------------------|
| >= 1440px        | 3 columns of agent cards                        |
| 1024px - 1439px  | 2 columns of agent cards                        |
| 768px - 1023px   | 1 column, metrics bar wraps to 2 rows           |
| < 768px          | 1 column, metrics become scrollable horizontal  |

---

## 3. Agent Detail View

Full status and interaction view for a single agent. Accessed by clicking into an agent card.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  BREADCRUMB: Dashboard > Agent a1b2c3d4                                    |
|  [<- Back to Dashboard]                                                    |
|                                                                            |
|  +--- HEADER -----------------------------------------------------------+  |
|  | a1b2c3d4                                          RUNNING   3m 42s   |  |
|  | Model: opus | Reasoning: xhigh | Sandbox: workspace-write            |  |
|  | Dir: ~/projects/webapp                                                |  |
|  | tmux: cc-agent-a1b2c3d4  [Attach in Terminal]                        |  |
|  | Created: 2026-02-07T14:32:00Z  Started: 2026-02-07T14:32:01Z        |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  +--- LEFT COLUMN (60%) ----+ +--- RIGHT COLUMN (40%) ----------------+   |
|  |                           | |                                       |   |
|  | PROMPT                    | | TOKEN USAGE                           |   |
|  | +------------------------+| | +-----------------------------------+ |   |
|  | | Review auth module for || | |  Input:  12,438 tokens             | |   |
|  | | security vulnerabilit- || | |  Output:  3,217 tokens             | |   |
|  | | ies in the login flow. || | |  Total:  15,655 tokens             | |   |
|  | | Check for SQL inject-  || | |                                    | |   |
|  | | ion, XSS, CSRF, and   || | |  Context Window: 200,000           | |   |
|  | | authentication bypass  || | |  Context Used:                     | |   |
|  | | vectors. Also review   || | |  [============--------] 78.2%     | |   |
|  | | the session management || | |                                    | |   |
|  | | and token refresh...   || | |  +------+ +------+                 | |   |
|  | +------------------------+| | |  | IN   | | OUT  |                 | |   |
|  | [Copy Prompt]             | | |  |12.4K | |3.2K  |  <- bar chart   | |   |
|  |                           | | |  +------+ +------+                 | |   |
|  | TERMINAL OUTPUT           | | +-----------------------------------+ |   |
|  | +------------------------+| |                                       |   |
|  | | $ claude --model opus  || | FILES MODIFIED (3)                    |   |
|  | |                        || | +-----------------------------------+ |   |
|  | | I'll review the auth   || | | M src/auth/login.ts               | |   |
|  | | module for security    || | | M src/auth/session.ts             | |   |
|  | | issues...              || | | A src/auth/csrf-guard.ts          | |   |
|  | |                        || | +-----------------------------------+ |   |
|  | | Reading src/auth/...   || |                                       |   |
|  | | Found potential SQL    || | SUMMARY                               |   |
|  | | injection in line 42   || | +-----------------------------------+ |   |
|  | |                        || | | Reviewed authentication module.   | |   |
|  | | [auto-scroll: ON]      || | | Found 2 SQL injection vectors    | |   |
|  | +------------------------+| | | in login.ts, added CSRF guard,   | |   |
|  | [Full Output] [Search]    | | | and fixed session token refresh. | |   |
|  |                           | | +-----------------------------------+ |   |
|  | SEND MESSAGE               | |                                       |   |
|  | +------------------------+| | EVENT TIMELINE                        |   |
|  | | Type a message...      || | +-----------------------------------+ |   |
|  | +------------------------+| | | 14:35:12  Read src/auth/login.ts  | |   |
|  | [Send] [Ctrl+C] [Escape]  | | | 14:35:08  Analyzing auth module   | |   |
|  |                           | | | 14:32:01  Agent started            | |   |
|  |                           | | | 14:32:00  Job created              | |   |
|  +---------------------------+ | +-----------------------------------+ |   |
|                                +---------------------------------------+   |
|                                                                            |
|  ACTIONS                                                                   |
|  [Kill Agent]  [Delete Job]  [Export Output]                               |
|                                                                            |
+----------------------------------------------------------------------------+
```

### Component List

| Component                   | Data Binding                                        | Notes                                |
|-----------------------------|-----------------------------------------------------|--------------------------------------|
| `AgentHeader`               | `Job` object                                        | Status badge, elapsed timer          |
| `AgentHeader.ElapsedTimer`  | `job.startedAt`, live `Date.now()` diff             | Updates every second for running     |
| `PromptDisplay`             | `job.prompt` (full text)                            | Scrollable, with copy button         |
| `TerminalOutputViewer`      | `getJobOutput(id, lines)` or `getJobFullOutput(id)` | ANSI rendering, auto-scroll toggle  |
| `SendMessageInput`          | `sendToJob(id, message)`                            | Text input with send button          |
| `TokenUsagePanel`           | `ParsedSessionData.tokens`                          | Bar chart + progress bar             |
| `TokenUsagePanel.ContextBar`| `tokens.context_used_pct`                           | Visual progress bar with percentage  |
| `FilesModifiedList`         | `ParsedSessionData.files_modified`                  | Prefixed with M/A/D indicators       |
| `SummaryPanel`              | `ParsedSessionData.summary`                         | Markdown rendered                    |
| `EventTimeline`             | Derived from output parsing / session events        | Chronological event list             |
| `ActionBar`                 | `killJob()`, `deleteJob()`                          | Destructive actions with confirmation|

### Refresh Strategy

| Data                 | Method                          | Interval   |
|----------------------|---------------------------------|------------|
| Job status           | Poll `refreshJobStatus(id)`     | 2 seconds  |
| Terminal output      | Poll `getJobOutput(id, 100)`    | 1 second   |
| Token/files/summary  | Poll session data               | 5 seconds  |
| Elapsed timer        | Client-side `setInterval`       | 1 second   |

### Interaction Patterns

| Action                         | Trigger                    | Result                               |
|--------------------------------|----------------------------|--------------------------------------|
| Send message                   | Type + Enter or [Send]     | `sendToJob(id, message)`             |
| Send Ctrl+C                    | Click [Ctrl+C] button      | `sendControlToJob(id, "C-c")`        |
| Send Escape                    | Click [Escape] button      | `sendControlToJob(id, "Escape")`     |
| Toggle auto-scroll             | Click toggle in terminal   | Lock/unlock scroll to bottom         |
| Search in output               | Click [Search], type query | Highlight matches in terminal viewer  |
| View full output               | Click [Full Output]        | Load full scrollback history          |
| Attach to tmux                 | Click [Attach in Terminal] | Copy `tmux attach` command, or launch|
| Copy prompt                    | Click [Copy Prompt]        | Copy to clipboard                    |
| Kill agent                     | Click [Kill Agent]         | Confirmation dialog                  |
| Export output                  | Click [Export Output]      | Download as .txt or .log             |
| Keyboard: back                 | `Esc` or `Backspace`       | Return to dashboard                  |
| Keyboard: focus send           | `M` key                    | Focus message input                  |
| Keyboard: toggle terminal      | `T` key                    | Expand terminal to full view         |

### Responsive Behavior

| Breakpoint       | Layout                                          |
|------------------|-------------------------------------------------|
| >= 1200px        | Two-column (60/40 split)                         |
| 768px - 1199px   | Single column, panels stacked vertically         |
| < 768px          | Single column, terminal viewer has fixed height  |

---

## 4. Multi-Instance View

Coordination view across multiple Claude Code instances. Shows the hierarchy:
User -> Claude Instances -> CC Agents.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  MULTI-INSTANCE COORDINATION                                               |
|                                                                            |
|  INSTANCE TREE                                                             |
|  +----------------------------------------------------------------------+  |
|  |                                                                      |  |
|  |  User                                                                |  |
|  |  +-- Claude Instance #1 (session: abc-123-def)        [4 agents]    |  |
|  |  |   +-- a1b2c3d4  RUNNING   "Review auth module..."   3m 42s       |  |
|  |  |   +-- e5f6a7b8  RUNNING   "Generate unit tests..."  1m 15s       |  |
|  |  |   +-- f9e8d7c6  COMPLETED "Refactor DB pooling..."  12m 08s      |  |
|  |  |   +-- 1a2b3c4d  FAILED    "Deploy staging..."       0m 03s       |  |
|  |  |                                                                   |  |
|  |  +-- Claude Instance #2 (session: fed-456-cba)        [2 agents]    |  |
|  |  |   +-- 5e6f7a8b  RUNNING   "Implement OAuth flow..." 8m 22s       |  |
|  |  |   +-- c9d0e1f2  RUNNING   "Write API docs..."       2m 50s       |  |
|  |  |                                                                   |  |
|  |  +-- Claude Instance #3 (session: 789-abc-012)        [1 agent]     |  |
|  |      +-- 3a4b5c6d  RUNNING   "Performance audit..."    15m 30s      |  |
|  |                                                                      |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  CONFLICT DETECTION                                                        |
|  +----------------------------------------------------------------------+  |
|  | WARNING: File overlap detected                                        |  |
|  |                                                                       |  |
|  | src/auth/login.ts                                                     |  |
|  |   Modified by: a1b2c3d4 (Instance #1)                                |  |
|  |   Modified by: 5e6f7a8b (Instance #2)                                |  |
|  |   Risk: Merge conflict likely                                         |  |
|  |                                                                       |  |
|  | src/api/routes.ts                                                     |  |
|  |   Modified by: e5f6a7b8 (Instance #1)                                |  |
|  |   Modified by: c9d0e1f2 (Instance #2)                                |  |
|  |   Risk: Merge conflict possible                                       |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  AGENTS.LOG TIMELINE                                                       |
|  +----------------------------------------------------------------------+  |
|  | TIME       INSTANCE  EVENT                                            |  |
|  |----------|----------|------------------------------------------------|  |
|  | 14:47:12 | #1       | Agent a1b2 found SQL injection in login.ts     |  |
|  | 14:45:30 | #2       | Agent 5e6f started OAuth implementation          |  |
|  | 14:44:08 | #1       | Agent e5f6 generating tests for payment module   |  |
|  | 14:42:55 | #3       | Agent 3a4b running performance benchmarks         |  |
|  | 14:40:11 | #2       | Agent c9d0 writing OpenAPI spec for /api/v2       |  |
|  | 14:38:00 | #1       | Agent f9e8 completed DB refactoring (4 files)     |  |
|  | 14:35:22 | #1       | Agent 1a2b failed (tmux session error)            |  |
|  | 14:32:00 | #1       | Orchestrator spawned 4 agents                     |  |
|  | 14:30:00 | #2       | Orchestrator spawned 2 agents                     |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  AGGREGATE STATS                                                           |
|  +----------------+ +----------------+ +----------------+                  |
|  | Instances: 3   | | Total Agents:7 | | Total Tokens:  |                  |
|  | Active: 3      | | Running: 5     | | 234.5K in      |                  |
|  |                | | Done: 1        | | 67.8K out      |                  |
|  |                | | Failed: 1      | |                |                  |
|  +----------------+ +----------------+ +----------------+                  |
|                                                                            |
+----------------------------------------------------------------------------+
```

### Component List

| Component               | Data Binding                                        | Notes                                  |
|-------------------------|-----------------------------------------------------|----------------------------------------|
| `InstanceTree`          | `jobs` grouped by `parentSessionId`                 | Collapsible tree nodes                 |
| `InstanceTree.Node`     | Group of `Job[]` with same parent                   | Shows instance session ID + agent count|
| `InstanceTree.AgentRow` | Individual `Job`                                    | Compact one-line summary               |
| `ConflictDetector`      | Cross-reference `files_modified` across all agents  | Alerts when 2+ agents touch same file  |
| `ConflictDetector.Alert`| File path + list of agent IDs                       | Severity: likely / possible            |
| `AgentsLogTimeline`     | Parse `agents.log` file                             | Reverse chronological                  |
| `AggregateStats`        | Computed from all jobs across instances              | Counter cards                          |

### Refresh Strategy

| Data                 | Method                            | Interval   |
|----------------------|-----------------------------------|------------|
| Instance grouping    | Poll all jobs, group by parent    | 5 seconds  |
| Conflict detection   | Recompute on job data refresh     | 5 seconds  |
| agents.log           | Tail `agents.log` file            | 3 seconds  |
| Aggregate stats      | Computed from job data            | 5 seconds  |

### Interaction Patterns

| Action                         | Trigger                       | Result                            |
|--------------------------------|-------------------------------|-----------------------------------|
| Expand/collapse instance       | Click instance node           | Toggle child agent visibility     |
| Navigate to agent              | Click agent row               | Open Agent Detail View            |
| View conflict details          | Click conflict alert          | Scroll to / highlight both agents |
| Filter timeline by instance    | Click instance ID in timeline | Filter to that instance only      |
| Search timeline                | Type in search box            | Filter timeline entries           |
| Keyboard: expand all           | `E` key                       | Expand all tree nodes             |
| Keyboard: collapse all         | `C` key                       | Collapse all tree nodes           |

### Responsive Behavior

| Breakpoint       | Layout                                           |
|------------------|--------------------------------------------------|
| >= 1200px        | Full tree + conflict panel side by side           |
| 768px - 1199px   | Stacked: tree above, conflicts below              |
| < 768px          | Tree with horizontal scroll, compact agent rows   |

---

## 5. Real-time Terminal Panel

Split-pane terminal viewer for monitoring multiple agents simultaneously.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  TERMINAL PANEL                                                            |
|  Layout: [1x1] [1x2] [2x2] [Custom]     [Auto-scroll: ON]  [Search: ___] |
|                                                                            |
|  AGENT SELECTOR (tab bar)                                                  |
|  [a1b2c3d4 *] [e5f6a7b8] [5e6f7a8b] [c9d0e1f2] [+]                      |
|                                                                            |
|  +--- PANE 1: a1b2c3d4 ----------------+ +--- PANE 2: e5f6a7b8 ----------+|
|  | RUNNING  opus/xhigh  3m 42s         | | RUNNING  sonnet/low  1m 15s    ||
|  |-------------------------------------|+|---------------------------------||
|  | $ claude --model opus               | | $ claude --model sonnet         ||
|  |   --dangerously-skip-permissions    | |   --dangerously-skip-permissions||
|  |                                     | |                                 ||
|  | I'll review the auth module for     | | I'll generate unit tests for    ||
|  | security vulnerabilities.           | | the payment module.             ||
|  |                                     | |                                 ||
|  | Reading src/auth/login.ts...        | | Reading src/payments/...         ||
|  |                                     | |                                 ||
|  | Found potential SQL injection       | | Creating test file:              ||
|  | vulnerability at line 42:           | | src/payments/__tests__/          ||
|  |                                     | |   processor.test.ts             ||
|  | ```typescript                       | |                                 ||
|  | const query = `SELECT * FROM users  | | Writing 15 test cases for        ||
|  |   WHERE email = '${email}'`;       | | PaymentProcessor class...        ||
|  | ```                                 | |                                 ||
|  |                                     | |                                 ||
|  | This should use parameterized       | |                                 ||
|  | queries instead...                  | |                                 ||
|  |                                     | |                                 ||
|  |                                     | |                                 ||
|  |                              [v]    | |                              [v]||
|  +---------[Send: __________] [>]------+ +----------[Send: __________] [>]-+|
|                                                                            |
|  +--- PANE 3: 5e6f7a8b ----------------+ +--- PANE 4: (empty) -----------+|
|  | RUNNING  opus/xhigh  8m 22s         | |                                ||
|  |-------------------------------------|+| Drag an agent tab here          ||
|  | Implementing OAuth 2.0 flow with    | | or click [+] to add a pane      ||
|  | PKCE for the single-page app...     | |                                 ||
|  |                                     | |                                 ||
|  | Created src/auth/oauth-provider.ts  | |                                 ||
|  | Created src/auth/pkce-utils.ts      | |                                 ||
|  | Modified src/auth/index.ts          | |                                 ||
|  |                                     | |                                 ||
|  | Now implementing the callback       | |                                 ||
|  | handler with state verification...  | |                                 ||
|  |                                     | |                                 ||
|  |                              [v]    | |                                 ||
|  +---------[Send: __________] [>]------+ +--------------------------------+|
|                                                                            |
+----------------------------------------------------------------------------+
```

### Component List

| Component                | Data Binding                                    | Notes                                   |
|--------------------------|-------------------------------------------------|-----------------------------------------|
| `LayoutSelector`         | Local state: grid layout                        | Presets: 1x1, 1x2, 2x2, custom         |
| `AgentTabBar`            | Running `Job[]`                                 | Tabs for each running agent             |
| `TerminalPane`           | `getJobOutput(id, lines)` per agent             | Individual terminal viewer              |
| `TerminalPane.Header`    | `Job` status, model, elapsed                    | Compact status bar per pane             |
| `TerminalPane.Output`    | Raw ANSI output from tmux capture               | ANSI-to-HTML rendering                  |
| `TerminalPane.SendInput` | `sendToJob(id, message)`                        | Inline send for each pane               |
| `TerminalPane.ScrollLock`| Local state per pane                            | Auto-scroll toggle button               |
| `SearchOverlay`          | Local state                                     | Ctrl+F style search across all panes    |

### ANSI Rendering

The terminal output contains ANSI escape codes from Claude Code's TUI. The renderer must handle:

- **SGR codes** (color/style): `\x1b[31m` (red), `\x1b[1m` (bold), `\x1b[0m` (reset)
- **256 color**: `\x1b[38;5;NNm` (foreground), `\x1b[48;5;NNm` (background)
- **True color**: `\x1b[38;2;R;G;Bm`
- **Cursor movement**: Strip or ignore (not rendered in viewer)
- **OSC sequences**: Strip (used for terminal title, etc.)

Recommended library: `xterm.js` (WebSocket terminal emulator) or `ansi-to-html` for simpler rendering.

### Refresh Strategy

| Data                 | Method                               | Interval  |
|----------------------|--------------------------------------|-----------|
| Terminal output      | Poll `getJobOutput(id, 100)` per pane| 500ms     |
| Pane status headers  | Poll `refreshJobStatus(id)`          | 2 seconds |

### Interaction Patterns

| Action                         | Trigger                         | Result                             |
|--------------------------------|---------------------------------|------------------------------------|
| Switch layout                  | Click layout preset button      | Re-arrange panes                   |
| Add agent to pane              | Drag tab to empty pane or [+]   | Start showing that agent's output  |
| Remove agent from pane         | Close button on pane header     | Clear pane                         |
| Send message in pane           | Type + Enter in pane's input    | `sendToJob()` for that agent       |
| Toggle auto-scroll per pane    | Click [v] scroll lock           | Toggle per-pane                    |
| Search across panes            | `Ctrl+F` or click [Search]      | Highlight matches in all panes     |
| Resize panes                   | Drag divider between panes      | Resize proportionally              |
| Maximize pane                  | Double-click pane header        | Expand to full view, others hide   |
| Keyboard: cycle panes          | `Tab` key                       | Move focus to next pane            |
| Keyboard: send to focused pane | Type when pane focused           | Focus moves to send input          |

### Responsive Behavior

| Breakpoint       | Layout                                           |
|------------------|--------------------------------------------------|
| >= 1440px        | Support up to 2x2 grid                           |
| 1024px - 1439px  | Max 1x2 layout, side by side                     |
| 768px - 1023px   | Single pane with tab switching                    |
| < 768px          | Single pane, full width, tabs as dropdown         |

---

## 6. Notification Center

Alerts panel for agent events, errors, and system notifications.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  NOTIFICATION CENTER                    [Mark All Read] [Clear Dismissed]  |
|                                                                            |
|  FILTERS: [All] [Completions] [Errors] [Warnings] [Info]     [3 unread]  |
|                                                                            |
|  +----------------------------------------------------------------------+  |
|  |                                                                      |  |
|  |  [!] AGENT FAILED                                    2 min ago  [x]  |  |
|  |  Agent 1a2b3c4d failed: Could not create tmux session                |  |
|  |  Instance: #1 | Prompt: "Deploy staging environment..."              |  |
|  |  [View Details] [Retry]                                              |  |
|  |                                                                      |  |
|  |----------------------------------------------------------------------|  |
|  |                                                                      |  |
|  |  [*] AGENT COMPLETED                                 5 min ago  [x]  |  |
|  |  Agent f9e8d7c6 finished in 12m 08s                                  |  |
|  |  45.2K tokens used | 4 files modified                               |  |
|  |  Summary: Refactored DB connection pooling to async/await            |  |
|  |  [View Details] [View Output]                                        |  |
|  |                                                                      |  |
|  |----------------------------------------------------------------------|  |
|  |                                                                      |  |
|  |  [!] FILE CONFLICT WARNING                           8 min ago  [x]  |  |
|  |  src/auth/login.ts modified by agents a1b2c3d4 AND 5e6f7a8b          |  |
|  |  Both agents are actively running - merge conflict likely            |  |
|  |  [View Agents] [Dismiss]                                             |  |
|  |                                                                      |  |
|  |----------------------------------------------------------------------|  |
|  |                                                                      |  |
|  |  [i] TOKEN BUDGET WARNING                           12 min ago  [x]  |  |
|  |  Agent a1b2c3d4 context usage at 78.2% (156K / 200K)                |  |
|  |  Agent may hit context limit soon                                    |  |
|  |  [View Agent]                                                        |  |
|  |                                                                      |  |
|  |----------------------------------------------------------------------|  |
|  |                                                                      |  |
|  |  [*] AGENT COMPLETED                                18 min ago  [x]  |  |
|  |  Agent 7c8d9e0f finished in 6m 44s                                  |  |
|  |  22.1K tokens used | 2 files modified                               |  |
|  |  [View Details]                                                      |  |
|  |                                                                      |  |
|  |----------------------------------------------------------------------|  |
|  |                                                                      |  |
|  |  [i] AGENT STARTED                                  20 min ago  [x]  |  |
|  |  Agent a1b2c3d4 spawned by Instance #1                              |  |
|  |  Model: opus | Reasoning: xhigh | Sandbox: workspace-write          |  |
|  |  [View Agent]                                                        |  |
|  |                                                                      |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  NOTIFICATION PREFERENCES (collapsed)                                      |
|  [v] Show desktop notifications for: [Errors] [Completions]               |
|  [v] Sound alerts for errors                                               |
|  [ ] Auto-dismiss info notifications after 30s                             |
|                                                                            |
+----------------------------------------------------------------------------+
```

### Component List

| Component                     | Data Binding                                     | Notes                                 |
|-------------------------------|--------------------------------------------------|---------------------------------------|
| `NotificationList`            | `Notification[]` array (local + derived)         | Reverse chronological                 |
| `NotificationList.FilterBar`  | Local filter state                               | Category-based filtering              |
| `NotificationItem`            | Individual `Notification`                        | Color-coded by severity               |
| `NotificationItem.Actions`    | Contextual: View, Retry, Dismiss                 | Per-notification actions              |
| `NotificationBadge`           | Unread count                                     | Shown in sidebar nav                  |
| `NotificationPreferences`     | User preferences (localStorage)                  | Desktop notification settings         |

### Notification Types

| Type              | Trigger                                        | Severity | Icon |
|-------------------|------------------------------------------------|----------|------|
| `agent_started`   | Job status changes to `running`                | info     | [i]  |
| `agent_completed` | Job status changes to `completed`              | success  | [*]  |
| `agent_failed`    | Job status changes to `failed`                 | error    | [!]  |
| `file_conflict`   | 2+ running agents modify same file             | warning  | [!]  |
| `token_warning`   | `context_used_pct > 75%`                       | warning  | [i]  |
| `token_critical`  | `context_used_pct > 90%`                       | error    | [!]  |
| `timeout_warning` | Job running > 45 minutes (75% of 60min timeout)| warning | [i]  |
| `timeout_killed`  | Job killed by inactivity timeout               | error    | [!]  |

### Refresh Strategy

| Data                 | Method                                | Interval   |
|----------------------|---------------------------------------|------------|
| Notifications        | Derived from job status changes       | 3 seconds  |
| File conflict checks | Cross-reference on job data refresh   | 5 seconds  |
| Token threshold      | Check on token data refresh           | 5 seconds  |

Notifications are generated client-side by comparing previous and current job states. A `lastKnownStatuses` map is maintained to detect transitions.

### Interaction Patterns

| Action                         | Trigger                     | Result                           |
|--------------------------------|-----------------------------|----------------------------------|
| Filter by category             | Click filter tab            | Show only that category          |
| View agent details             | Click [View Details]        | Navigate to Agent Detail View    |
| Retry failed agent             | Click [Retry]               | Re-run with same prompt/config   |
| Dismiss notification           | Click [x]                   | Remove from list                 |
| Mark all read                  | Click [Mark All Read]       | Clear unread indicators          |
| Clear dismissed                | Click [Clear Dismissed]     | Remove all dismissed             |
| Toggle desktop notifications   | Checkbox in preferences     | Enable/disable browser notifs    |

### Responsive Behavior

| Breakpoint       | Layout                                                |
|------------------|-------------------------------------------------------|
| >= 768px         | Full notification panel as main content                |
| < 768px          | Slide-over panel from right side                       |
| All sizes        | Badge count visible on sidebar notification icon       |

### Notification Delivery (In-App)

Additionally, a toast-style popup appears in the bottom-right corner when notifications arrive while the user is on a different view:

```
+------------------------------------------+
|  [!] Agent 1a2b3c4d FAILED        [x]   |
|  Could not create tmux session           |
|  [View]                   3 seconds ago  |
+------------------------------------------+
```

Toasts auto-dismiss after 8 seconds (errors) or 5 seconds (info/success). Click navigates to detail.

---

## 7. Settings / Configuration Panel

Configuration management for defaults, hooks, and cleanup.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  SETTINGS                                                                  |
|                                                                            |
|  +--- DEFAULTS --------------------------------------------------------+  |
|  |                                                                      |  |
|  |  Default Model                                                       |  |
|  |  ( ) sonnet  (*) opus                                                |  |
|  |                                                                      |  |
|  |  Default Reasoning Effort                                            |  |
|  |  ( ) low  ( ) medium  ( ) high  (*) xhigh                           |  |
|  |                                                                      |  |
|  |  Default Sandbox Mode                                                |  |
|  |  ( ) read-only  (*) workspace-write  ( ) danger-full-access          |  |
|  |                                                                      |  |
|  |  Inactivity Timeout                                                  |  |
|  |  [60_______] minutes                                                 |  |
|  |                                                                      |  |
|  |  Jobs List Limit                                                     |  |
|  |  [20_______] jobs (shown by default)                                 |  |
|  |                                                                      |  |
|  |  tmux Session Prefix                                                 |  |
|  |  [cc-agent__]                                                        |  |
|  |                                                                      |  |
|  |  [Save Defaults]  [Reset to Factory]                                 |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  +--- HOOK CONFIGURATION ----------------------------------------------+  |
|  |                                                                      |  |
|  |  Pre-Start Hook (runs before agent creation)                         |  |
|  |  +----------------------------------------------------------------+  |  |
|  |  | #!/bin/bash                                                    |  |  |
|  |  | # Validate working directory                                   |  |  |
|  |  | if [ ! -f "$CWD/package.json" ]; then                         |  |  |
|  |  |   echo "No package.json found" && exit 1                      |  |  |
|  |  | fi                                                             |  |  |
|  |  +----------------------------------------------------------------+  |  |
|  |  [Test Hook]  [Clear]                                                |  |
|  |                                                                      |  |
|  |  Post-Complete Hook (runs after agent completes)                     |  |
|  |  +----------------------------------------------------------------+  |  |
|  |  | #!/bin/bash                                                    |  |  |
|  |  | # Run linter on modified files                                 |  |  |
|  |  | echo "Agent $JOB_ID completed"                                 |  |  |
|  |  +----------------------------------------------------------------+  |  |
|  |  [Test Hook]  [Clear]                                                |  |
|  |                                                                      |  |
|  |  On-Failure Hook (runs when agent fails)                             |  |
|  |  +----------------------------------------------------------------+  |  |
|  |  | # empty                                                        |  |  |
|  |  +----------------------------------------------------------------+  |  |
|  |  [Test Hook]  [Clear]                                                |  |
|  |                                                                      |  |
|  |  [Save Hooks]                                                        |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  +--- CLEANUP CONTROLS ------------------------------------------------+  |
|  |                                                                      |  |
|  |  Job Retention                                                       |  |
|  |  Auto-clean completed/failed jobs older than [7___] days             |  |
|  |                                                                      |  |
|  |  Current Storage                                                     |  |
|  |  Jobs directory: ~/.cc-agent/jobs/                                   |  |
|  |  Total jobs: 47  |  Size: 12.3 MB                                   |  |
|  |  Completed: 38  |  Failed: 5  |  Running: 3  |  Pending: 1          |  |
|  |                                                                      |  |
|  |  [Clean Now (38 eligible)]  [Delete All Completed]  [Nuke Everything]|  |
|  |                                                                      |  |
|  |  Log files:                                                          |  |
|  |  Total: 47 files  |  Size: 89.7 MB                                  |  |
|  |  [Clean Orphaned Logs]                                               |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  +--- SYSTEM INFO -----------------------------------------------------+  |
|  |                                                                      |  |
|  |  tmux version: 3.4                                                   |  |
|  |  Claude CLI version: 1.0.16                                          |  |
|  |  Bun version: 1.1.34                                                 |  |
|  |  Active tmux sessions: 4                                             |  |
|  |  Jobs directory: ~/.cc-agent/jobs/                                   |  |
|  |  Platform: darwin (macOS 15.4)                                       |  |
|  |                                                                      |  |
|  |  [Run Health Check]                                                  |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
+----------------------------------------------------------------------------+
```

### Component List

| Component                  | Data Binding                              | Notes                                  |
|----------------------------|-------------------------------------------|----------------------------------------|
| `DefaultsForm`             | `config` object values                    | Radio groups, number inputs            |
| `DefaultsForm.ModelRadio`  | `config.model`                            | "sonnet" or "opus"                     |
| `DefaultsForm.ReasonRadio` | `config.defaultReasoningEffort`           | 4 options                              |
| `DefaultsForm.SandboxRadio`| `config.defaultSandbox`                   | 3 options                              |
| `DefaultsForm.TimeoutInput`| `config.defaultTimeout`                   | Numeric, min 1                         |
| `HookEditor`               | Hook scripts (stored in `~/.cc-agent/`)   | Code editor with syntax highlighting   |
| `HookEditor.TestButton`    | Executes hook in dry-run mode             | Shows output in inline console         |
| `CleanupControls`          | `cleanupOldJobs()`, job statistics        | Destructive actions need confirmation  |
| `CleanupControls.Stats`    | Computed from `listJobs()`                | File count and size                    |
| `SystemInfo`               | `health` command output                   | Version info and status                |

### Refresh Strategy

| Data                 | Method              | Interval   |
|----------------------|---------------------|------------|
| Config values        | Read on mount       | None (static until saved) |
| Storage stats        | Computed on mount   | None (refresh on action)  |
| System info          | Run health check    | None (on demand)          |

### Interaction Patterns

| Action                         | Trigger                     | Result                              |
|--------------------------------|-----------------------------|-------------------------------------|
| Change default value           | Radio/input change          | Mark form as dirty                  |
| Save defaults                  | Click [Save Defaults]       | Write to config, show confirmation  |
| Reset to factory               | Click [Reset to Factory]    | Confirmation dialog, reset values   |
| Edit hook script               | Type in code editor         | Mark as dirty                       |
| Test hook                      | Click [Test Hook]           | Run hook in sandbox, show output    |
| Clean old jobs                 | Click [Clean Now]           | Confirmation with count, execute    |
| Delete all completed           | Click [Delete All Completed]| Double confirmation (destructive)   |
| Nuke everything                | Click [Nuke Everything]     | Triple confirmation (type to confirm)|
| Run health check               | Click [Run Health Check]    | Execute health command, show result |
| Keyboard: save                 | `Ctrl+S`                    | Save current section                |

### Responsive Behavior

| Breakpoint       | Layout                                           |
|------------------|--------------------------------------------------|
| >= 1024px        | Two-column: defaults + hooks left, cleanup right |
| 768px - 1023px   | Single column, all sections stacked              |
| < 768px          | Single column, code editors use full width       |

---

## 8. Navigation & Layout Shell

The outer shell that contains all views. Provides persistent navigation and global controls.

### Wireframe

```
+--TOPBAR-------------------------------------------------------------------+
| CC Orchestrator                           [3]   [@]   [?]   [Settings]    |
|                                          notif  user  help                |
+---------------------------------------------------------------------------+
|      |                                                                    |
| SIDE | MAIN CONTENT AREA                                                 |
| BAR  |                                                                    |
|      | (Dashboard / Agent Detail / Multi-Instance / Terminal / etc.)       |
| [D]  |                                                                    |
| Dash |                                                                    |
|      |                                                                    |
| [A]  |                                                                    |
| Agnt |                                                                    |
|      |                                                                    |
| [M]  |                                                                    |
| Multi|                                                                    |
|      |                                                                    |
| [T]  |                                                                    |
| Term |                                                                    |
|      |                                                                    |
| [N]  |                                                                    |
| Notif|                                                                    |
| [3]  |                                                                    |
|      |                                                                    |
| ---- |                                                                    |
|      |                                                                    |
| [S]  |                                                                    |
| Sett |                                                                    |
|      |                                                                    |
+------+--------------------------------------------------------------------+
```

### Sidebar Navigation Items

| Icon | Label          | Route             | Keyboard | Description                 |
|------|----------------|-------------------|-----------|-----------------------------|
| D    | Dashboard      | `/`               | `1`       | Main overview               |
| A    | Agents         | `/agents`         | `2`       | Agent list (alt dashboard)  |
| M    | Multi-Instance | `/multi`          | `3`       | Cross-instance coordination |
| T    | Terminal       | `/terminal`       | `4`       | Split-pane terminal viewer  |
| N    | Notifications  | `/notifications`  | `5`       | Alert center (badge count)  |
| S    | Settings       | `/settings`       | `6`       | Configuration               |

### Topbar Components

| Component          | Purpose                                     |
|--------------------|---------------------------------------------|
| Logo / Title       | "CC Orchestrator" - click returns to dash   |
| Notification badge | Unread notification count                   |
| User indicator     | Current user / session info                 |
| Help link          | Documentation / keyboard shortcuts          |
| Settings shortcut  | Quick access to settings                    |

### Global Keyboard Shortcuts

| Shortcut    | Action                          |
|-------------|----------------------------------|
| `1` - `6`   | Navigate to sidebar views        |
| `R`         | Refresh current view             |
| `/`         | Focus global search              |
| `?`         | Show keyboard shortcut help      |
| `Esc`       | Close modal / go back            |
| `N`         | Toggle notification panel        |
| `Ctrl+K`    | Command palette (fuzzy search)   |

### Command Palette (Ctrl+K)

A fuzzy-search command palette for power users:

```
+------------------------------------------+
| > _________________________________      |
|                                          |
|  Agent a1b2c3d4 - "Review auth..."      |
|  Agent e5f6a7b8 - "Generate tests..."   |
|  Start New Agent                         |
|  View Running Agents                     |
|  Open Settings                           |
|  Run Health Check                        |
|  Clean Old Jobs                          |
+------------------------------------------+
```

Searches across: agent IDs, agent prompts, command names, navigation routes.

### Responsive Shell Behavior

| Breakpoint       | Sidebar                  | Topbar                    |
|------------------|--------------------------|---------------------------|
| >= 1024px        | Persistent, expanded     | Full width                |
| 768px - 1023px   | Collapsed to icons only  | Full width                |
| < 768px          | Hidden, hamburger menu   | Compact, overflow menu    |

---

## Appendix A: Data Flow Architecture

### API Layer

The UI communicates with the cc-agent CLI backend. Two integration approaches:

**Option 1: HTTP API Wrapper** (recommended for web UI)

Wrap CLI commands in a lightweight HTTP server:

```
GET  /api/jobs                -> listJobs() + enrichment
GET  /api/jobs/:id            -> refreshJobStatus(id) + session data
GET  /api/jobs/:id/output     -> getJobOutput(id, lines)
GET  /api/jobs/:id/fulloutput -> getJobFullOutput(id)
POST /api/jobs                -> startJob(options)
POST /api/jobs/:id/send       -> sendToJob(id, message)
POST /api/jobs/:id/control    -> sendControlToJob(id, key)
DELETE /api/jobs/:id          -> killJob(id)
GET  /api/sessions            -> listSessions()
GET  /api/health              -> health check
GET  /api/config              -> current config
PUT  /api/config              -> update config
```

**Option 2: Direct CLI Invocation** (for electron/terminal UI)

Shell out to `bun run src/cli.ts` with `--json` flag.

### State Management

```
AppState
  +-- jobs: Job[]                      // All jobs from API
  +-- selectedJobId: string | null     // Currently viewed agent
  +-- sessions: TmuxSession[]          // Active tmux sessions
  +-- notifications: Notification[]    // Generated from state transitions
  +-- lastKnownStatuses: Map<string, string>  // For transition detection
  +-- config: Config                   // Current settings
  +-- ui:
      +-- sidebarCollapsed: boolean
      +-- terminalLayout: "1x1" | "1x2" | "2x2"
      +-- terminalPanes: string[]      // Agent IDs in each pane
      +-- notificationFilter: string
      +-- dashboardSort: string
      +-- dashboardFilter: string
```

---

## Appendix B: "New Agent" Modal

Launched from [+ New Agent] button on the dashboard.

```
+--- NEW AGENT -----------------------------------------------+
|                                                              |
|  Prompt *                                                    |
|  +----------------------------------------------------------+
|  |                                                          |
|  | Enter your task description here...                      |
|  |                                                          |
|  |                                                          |
|  +----------------------------------------------------------+
|                                                              |
|  Model              Reasoning Effort                         |
|  [opus     v]       [xhigh   v]                              |
|                                                              |
|  Sandbox Mode                                                |
|  (*) workspace-write  ( ) read-only  ( ) danger-full-access  |
|                                                              |
|  Working Directory                                           |
|  [~/projects/webapp______________________________] [Browse]  |
|                                                              |
|  Include Files (glob patterns, one per line)                 |
|  +----------------------------------------------------------+
|  | src/**/*.ts                                              |
|  | !src/**/*.test.ts                                        |
|  +----------------------------------------------------------+
|                                                              |
|  [ ] Include codebase map                                    |
|                                                              |
|  Advanced                                                    |
|  Parent Session ID: [____________________________]           |
|                                                              |
|  PREVIEW                                                     |
|  Estimated tokens: ~2,450                                    |
|  Files matched: 23                                           |
|                                                              |
|  [Cancel]                              [Preview] [Start]     |
+--------------------------------------------------------------+
```

---

## Appendix C: Confirmation Dialogs

### Kill Agent

```
+--- KILL AGENT --------------------------------+
|                                                |
|  Are you sure you want to kill agent           |
|  a1b2c3d4?                                     |
|                                                |
|  This will:                                    |
|  - Terminate the tmux session                  |
|  - Mark the job as failed                      |
|  - Stop all agent work immediately             |
|                                                |
|  The agent output will be preserved in         |
|  the log file.                                 |
|                                                |
|  [Cancel]                        [Kill Agent]  |
+------------------------------------------------+
```

### Nuke Everything (Settings)

```
+--- DELETE ALL DATA ---------------------------+
|                                                |
|  WARNING: This will permanently delete:        |
|                                                |
|  - 47 job records                              |
|  - 47 log files (89.7 MB)                     |
|  - 3 running agents (will be killed)           |
|                                                |
|  Type "delete everything" to confirm:          |
|  [________________________________]            |
|                                                |
|  [Cancel]                [Delete Everything]   |
+------------------------------------------------+
```

---

## Appendix D: Technology Recommendations

| Concern              | Recommendation                                              |
|----------------------|-------------------------------------------------------------|
| **Framework**        | React 19 or Svelte 5 (both excellent for real-time UIs)     |
| **Terminal rendering**| `xterm.js` for full terminal emulation, or `ansi-to-html`  |
| **State management** | Zustand (React) or built-in stores (Svelte)                 |
| **Styling**          | Tailwind CSS with custom dark theme tokens                  |
| **Charts/viz**       | Lightweight: `chart.js` or SVG-based custom components      |
| **Layout**           | CSS Grid for dashboard cards, flexbox for details           |
| **Polling**          | `@tanstack/query` with configurable refetch intervals       |
| **Keyboard shortcuts**| `hotkeys-js` or framework-native event handlers            |
| **WebSocket** (future)| For replacing polling with push-based updates              |
| **Bundler**          | Vite (pairs well with Bun runtime)                          |
| **Testing**          | Vitest + Testing Library                                    |
