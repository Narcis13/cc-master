# CC Orchestrator - Database Explorer UI

> PRD for a "Database Explorer" view that surfaces all data persisted in the SQLite database (`dashboard.db`), following the design language of [UI_DESIGN_SPEC.md](../UI_DESIGN_SPEC.md).

---

## Table of Contents

1. [Problem](#1-problem)
2. [Database Schema Summary](#2-database-schema-summary)
3. [Current Gaps](#3-current-gaps)
4. [New Views Overview](#4-new-views-overview)
5. [View 1: Database Overview](#5-view-1-database-overview)
6. [View 2: Job History Browser](#6-view-2-job-history-browser)
7. [View 3: Job History Detail](#7-view-3-job-history-detail)
8. [View 4: Analytics Dashboard](#8-view-4-analytics-dashboard)
9. [View 5: Tool Usage Explorer](#9-view-5-tool-usage-explorer)
10. [View 6: Events Timeline](#10-view-6-events-timeline)
11. [API Endpoints Required](#11-api-endpoints-required)
12. [Navigation Integration](#12-navigation-integration)
13. [Success Criteria](#13-success-criteria)

---

## 1. Problem

The CC Orchestrator persists rich historical data into a SQLite database (`~/.cc-agent/dashboard.db`) including:

- Full job records with tokens, costs, files modified, summaries
- Individual tool calls per job with input/output previews
- Subagent spawning relationships
- Hook events (tool usage, file modifications in real-time)
- Aggregated daily metrics (jobs, tokens, elapsed time, files)

**None of this historical data is visible in the current dashboard UI.** The existing dashboard only shows "live" jobs from the filesystem JSON files. When jobs are cleaned up or the filesystem is pruned, all that rich data is invisible despite being persisted in SQLite.

Users need to:
- Browse historical jobs that are no longer on disk
- See cost and token usage trends over time
- Understand which tools agents use most and their error rates
- Inspect individual tool calls (what inputs/outputs did an agent produce?)
- See the subagent hierarchy for complex jobs
- Browse real-time hook events for debugging

---

## 2. Database Schema Summary

### Tables

| Table | Rows (typical) | Purpose |
|-------|----------------|---------|
| `job_history` | 50-500+ | Complete job records (26 columns) |
| `tool_calls` | 500-5000+ | Individual tool invocations per job |
| `job_subagents` | 10-100+ | Subagent relationships per job |
| `events` | 1000-10000+ | Real-time hook events (tool use, file changes) |
| `daily_metrics` | 7-365 | Aggregated daily stats |

### Key Columns per Table

**job_history**: `id`, `status`, `model`, `reasoning_effort`, `cwd`, `prompt`, `summary`, `session_id`, `started_at`, `completed_at`, `elapsed_ms`, `input_tokens`, `output_tokens`, `context_used_pct`, `context_window`, `estimated_cost`, `tool_call_count`, `failed_tool_calls`, `primary_tool`, `files_modified_count`, `files_modified_json`, `message_count`, `user_message_count`, `has_session`, `reuse_count`, `original_prompt`

**tool_calls**: `id`, `job_id`, `name`, `is_error`, `timestamp`, `input_preview`, `output_preview`

**job_subagents**: `id`, `job_id`, `subagent_id`, `tool_call_count`, `message_count`

**events**: `id`, `timestamp`, `job_id`, `event_type`, `tool_name`, `file_path`, `data_json`

**daily_metrics**: `date`, `jobs_started`, `jobs_completed`, `jobs_failed`, `total_input_tokens`, `total_output_tokens`, `total_elapsed_ms`, `files_modified_count`

---

## 3. Current Gaps

| Data | Stored in DB? | Exposed via API? | Visible in UI? |
|------|:---:|:---:|:---:|
| Historical job list | Yes | `GET /api/metrics/jobs` | No |
| Daily metrics history | Yes | `GET /api/metrics/history` | No |
| Tool calls per job | Yes | No | No |
| Subagents per job | Yes | No | No |
| Events timeline | Yes | No | No |
| Search jobs by file | Yes (function exists) | No | No |
| Search jobs by tool | Yes (function exists) | No | No |
| Cost analytics over time | Computable | No | No |
| Tool error rates | Computable | No | No |

---

## 4. New Views Overview

The Database Explorer adds a new "Database" link to the existing topbar navigation, with a secondary tab bar for sub-views:

```
Existing topbar:
  [Jobs] [Timeline] [Alerts] [Analytics] [Split] [Pipeline]

Updated topbar:
  [Jobs] [Timeline] [Alerts] [Analytics] [Split] [Pipeline] [Database]  <- NEW

Database sub-tabs (shown when on #/db* routes):
  [Overview] [Job History] [Analytics] [Tool Usage] [Events]
```

---

## 5. View 1: Database Overview

The landing page for the Database Explorer. Shows a bird's-eye view of everything stored in the database.

### Wireframe

```
+--[SHELL: sidebar + topbar]-----------------------------------------------+
|                                                                           |
|  DATABASE OVERVIEW                                                        |
|                                                                           |
|  DB INFO BAR                                                              |
|  +----------+ +----------+ +----------+ +-----------+ +-----------+       |
|  | 127 Jobs | | 2,341    | | 48       | | 8,912     | | dashboard |       |
|  | recorded | | tool     | | subagent | | events    | | .db       |       |
|  |          | | calls    | | records  | | logged    | | 4.2 MB    |       |
|  +----------+ +----------+ +----------+ +-----------+ +-----------+       |
|                                                                           |
|  TABLE CARDS                                                              |
|  +-----------------------------------+ +-----------------------------------+
|  | job_history                       | | tool_calls                        |
|  | 127 rows | 26 columns            | | 2,341 rows | 7 columns           |
|  |                                   | |                                   |
|  | Latest: 2m ago                    | | Latest: 2m ago                    |
|  | Oldest: 47 days ago              | | Oldest: 47 days ago               |
|  |                                   | |                                   |
|  | Top statuses:                     | | Top tools:                        |
|  |   completed: 98 (77%)            | |   Read: 892 (38%)                 |
|  |   failed: 22 (17%)               | |   Write: 456 (20%)                |
|  |   running: 7 (6%)                | |   Bash: 321 (14%)                 |
|  |                                   | |   Edit: 298 (13%)                 |
|  | [Browse Jobs ->]                  | | [Browse Tool Calls ->]            |
|  +-----------------------------------+ +-----------------------------------+
|  +-----------------------------------+ +-----------------------------------+
|  | job_subagents                      | | events                           |
|  | 48 rows | 5 columns               | | 8,912 rows | 7 columns          |
|  |                                   | |                                   |
|  | Jobs with subagents: 12           | | Top event types:                  |
|  | Avg subagents per job: 4          | |   tool_use: 6,231 (70%)          |
|  |                                   | |   file_write: 1,892 (21%)        |
|  | [Browse Subagents ->]             | |   error: 789 (9%)                |
|  +-----------------------------------+ +-----------------------------------+
|  +-----------------------------------+                                     |
|  | daily_metrics                     |                                     |
|  | 47 rows | 8 columns              |                                     |
|  |                                   |                                     |
|  | Date range: Jan 1 - Feb 11       |                                     |
|  | Total tokens: 12.4M in / 3.8M out|                                     |
|  | Total cost: ~$248.60             |                                     |
|  |                                   |                                     |
|  | SPARKLINE: jobs/day              |                                     |
|  | ..._..._/\___/\_/\               |                                     |
|  |                                   |                                     |
|  | [View Analytics ->]               |                                     |
|  +-----------------------------------+                                     |
|                                                                           |
|  QUICK SEARCH                                                             |
|  +---------------------------------------------------------------------+ |
|  | Search jobs by file path or tool name...                [Search]     | |
|  +---------------------------------------------------------------------+ |
|  | Examples: "src/auth/" | "Read" | "Bash" | "*.ts"                     | |
|  +---------------------------------------------------------------------+ |
|                                                                           |
+--------------------------------------------------------------------------+
```

### Component List

| Component | Data Binding | Notes |
|-----------|-------------|-------|
| `DbInfoBar` | Row counts from all tables, file size | 5 stat cards across top |
| `TableCard` | Per-table metadata: row count, columns, date range, top values | Links to respective browse views |
| `TableCard.StatusBreakdown` | `GROUP BY status` from job_history | Mini bar chart |
| `TableCard.ToolBreakdown` | `GROUP BY name` from tool_calls | Top 4 tools |
| `TableCard.Sparkline` | `daily_metrics` recent 30 days | Inline SVG sparkline |
| `QuickSearch` | `searchJobsByFile()` / `searchJobsByTool()` | Unified search with type detection |

### Refresh Strategy

| Data | Method | Interval |
|------|--------|----------|
| Table counts | `GET /api/db/overview` | On mount + 30s |
| DB file size | Included in overview | On mount + 30s |

### Interaction Patterns

| Action | Trigger | Result |
|--------|---------|--------|
| Browse table | Click [Browse ...->] | Navigate to respective sub-view |
| Quick search | Type + Enter or [Search] | Navigate to Job History with search applied |
| Refresh stats | `R` key | Force refresh overview data |

### Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| >= 1200px | 2 columns of table cards |
| 768px - 1199px | 1 column of table cards |
| < 768px | 1 column, stats bar scrolls horizontally |

---

## 6. View 2: Job History Browser

Searchable, filterable table of all historical jobs from `job_history`. This is the primary data exploration view.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  DATABASE > JOB HISTORY                                                    |
|  [<- Back to Overview]                                                     |
|                                                                            |
|  FILTER BAR                                                                |
|  +----------------------------------------------------------------------+  |
|  | Status: [All v]  Model: [All v]  Reasoning: [All v]  Cost: [All v]  |  |
|  | Date: [Last 7d v]  Has Session: [Any v]                              |  |
|  |                                                                      |  |
|  | Search: [__________________________________] [by Prompt v] [Search]  |  |
|  |         search modes: Prompt | File Path | Tool Name | Summary       |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  SUMMARY BAR                                                               |
|  Showing 127 jobs | $248.60 total cost | 12.4M input / 3.8M output tokens |
|                                                                            |
|  JOB TABLE                                                                 |
|  +----------------------------------------------------------------------+  |
|  | ID       | Status    | Model  | Prompt          | Cost  | Tokens     |  |
|  |          |           |        |                 |       | (in/out)   |  |
|  |----------|-----------|--------|-----------------|-------|------------|  |
|  | d6c936e2 | completed | opus   | Research the    | $1.42 | 36K / 4K   |  |
|  |          | 12m 08s   | xhigh  | SQLite datab... |       | ctx: 78%   |  |
|  |----------|-----------|--------|-----------------|-------|------------|  |
|  | a1b2c3d4 | completed | opus   | Implement auth  | $3.87 | 89K / 12K  |  |
|  |          | 34m 22s   | xhigh  | refactor per... |       | ctx: 95%   |  |
|  |----------|-----------|--------|-----------------|-------|------------|  |
|  | e5f6a7b8 | failed    | sonnet | Deploy staging  | $0.12 | 5K / 1K    |  |
|  |          | 0m 03s    | low    | environment...  |       | ctx: 4%    |  |
|  |----------|-----------|--------|-----------------|-------|------------|  |
|  | f9e8d7c6 | completed | opus   | Write compreh-  | $2.15 | 52K / 8K   |  |
|  |          | 22m 45s   | high   | ensive tests... |       | ctx: 62%   |  |
|  |----------|-----------|--------|-----------------|-------|------------|  |
|  | ...      | ...       | ...    | ...             | ...   | ...        |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  PAGINATION                                                                |
|  [< Prev] Page 1 of 3 (50 per page) [Next >]                             |
|                                                                            |
|  BULK STATS (computed from filtered set)                                   |
|  +----------+ +----------+ +----------+ +----------+                      |
|  | Avg Cost | | Avg Time | | Avg Toks | | Success  |                      |
|  | $2.14    | | 18m 32s  | | 45K / 7K | | Rate 82% |                      |
|  +----------+ +----------+ +----------+ +----------+                      |
|                                                                            |
+----------------------------------------------------------------------------+
```

### Column Details

| Column | Source | Sortable | Notes |
|--------|--------|:---:|-------|
| ID | `job_history.id` | No | Short 8-char hex, clickable to detail |
| Status | `job_history.status` | Yes | Badge colored by status + elapsed time |
| Model | `model` + `reasoning_effort` | Yes | Two-line: model / reasoning |
| Prompt | `job_history.prompt` | No | Truncated to ~40 chars, tooltip for full |
| Cost | `estimated_cost` | Yes | Formatted as `$X.XX` |
| Tokens | `input_tokens` / `output_tokens` | Yes | Two-line: counts + context % |
| Tools | `tool_call_count` | Yes | Count with primary tool name |
| Files | `files_modified_count` | Yes | Count |
| Date | `completed_at` or `started_at` | Yes | Relative time ("2h ago") |

### Component List

| Component | Data Binding | Notes |
|-----------|-------------|-------|
| `FilterBar` | Local filter state → query params | Dropdowns + search input |
| `FilterBar.SearchMode` | Toggle: prompt/file/tool/summary | Changes search behavior |
| `SummaryBar` | Aggregated from filtered results | Total cost, tokens, count |
| `JobHistoryTable` | `GET /api/db/jobs` with filters | Paginated, sortable |
| `JobHistoryTable.Row` | `JobHistoryRecord` | Click → Job History Detail |
| `JobHistoryTable.StatusBadge` | `status` | Color-coded per design system |
| `Pagination` | Local page state | 50 per page |
| `BulkStats` | Computed from current page / filter | 4 stat cards |

### Filter Logic

| Filter | Type | Values |
|--------|------|--------|
| Status | Dropdown | All, Completed, Failed, Running |
| Model | Dropdown | All, Opus, Sonnet |
| Reasoning | Dropdown | All, xhigh, high, medium, low |
| Cost | Dropdown | All, <$1, $1-$5, $5-$10, >$10 |
| Date range | Dropdown | Last 24h, 7d, 30d, 90d, All time |
| Has Session | Dropdown | Any, Yes, No |
| Search (Prompt) | Text | `WHERE prompt LIKE '%query%'` |
| Search (File) | Text | `searchJobsByFile(query)` |
| Search (Tool) | Text | `searchJobsByTool(query)` |
| Search (Summary) | Text | `WHERE summary LIKE '%query%'` |

### Refresh Strategy

| Data | Method | Interval |
|------|--------|----------|
| Job list | `GET /api/db/jobs?...filters` | On mount, on filter change |
| Aggregate stats | Included in API response | Same |

### Interaction Patterns

| Action | Trigger | Result |
|--------|---------|--------|
| View job detail | Click row or ID link | Navigate to Job History Detail |
| Sort column | Click column header | Toggle ASC/DESC, re-fetch |
| Filter | Change any dropdown | Re-fetch with filters |
| Search | Type + Enter | Re-fetch with search query |
| Change page | Click Prev/Next | Fetch page N |
| Export | Click [Export CSV] | Download filtered results |
| Keyboard: search | `/` key | Focus search input |
| Keyboard: navigate | Arrow up/down | Move row focus |
| Keyboard: open | Enter | Open focused row detail |

### Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| >= 1200px | Full table with all columns |
| 768px - 1199px | Hide Tools, Files columns |
| < 768px | Card layout instead of table |

---

## 7. View 3: Job History Detail

Deep dive into a single historical job from the database. Shows everything stored about the job.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  DATABASE > JOB HISTORY > d6c936e2                                         |
|  [<- Back to Job History]                                                  |
|                                                                            |
|  +--- HEADER -----------------------------------------------------------+  |
|  | d6c936e2                                      COMPLETED   12m 08s    |  |
|  | Model: opus | Reasoning: xhigh | Sandbox: workspace-write            |  |
|  | Dir: ~/newme/cc-master                                                |  |
|  | Session: abc-123-def-456  | Reuse count: 0                           |  |
|  | Started: 2026-02-11T14:32  Completed: 2026-02-11T14:44               |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  +--- LEFT COLUMN (55%) -----+ +--- RIGHT COLUMN (45%) ----------------+  |
|  |                            | |                                        |  |
|  | PROMPT                     | | TOKEN USAGE                            |  |
|  | +------------------------+| | +------------------------------------+  |  |
|  | | Research the SQLite    || | |  Input:  36,581 tokens   ($0.55)   |  |  |
|  | | database persistence   || | |  Output:  4,217 tokens   ($0.32)   |  |  |
|  | | layer thoroughly...    || | |  Total:  40,798 tokens   ($0.87)   |  |  |
|  | +------------------------+| | |                                     |  |  |
|  | [Copy Prompt]             | | |  Context Window: 258,400            |  |  |
|  |                            | | |  Context Used:                      |  |  |
|  | SUMMARY                    | | |  [==========---------] 14.2%       |  |  |
|  | +------------------------+| | +------------------------------------+  |  |
|  | | Reviewed all files     || | |                                        |  |
|  | | related to SQLite...   || | | COST BREAKDOWN                        |  |
|  | +------------------------+| | | +------------------------------------+ |  |
|  |                            | | | | Input:  $0.55  (36.6K * $15/1M)  | |  |
|  | TOOL CALLS (47)            | | | | Output: $0.32  (4.2K * $75/1M)   | |  |
|  | +------------------------+| | | | Total:  $0.87                      | |  |
|  | | # | Tool    | Error?  || | | +------------------------------------+ |  |
|  | |---|---------|-----------|  | |                                        |  |
|  | | 1 | Read    |         || | | FILES MODIFIED (3)                     |  |
|  | |   | src/dashboard/db..|| | | +------------------------------------+ |  |
|  | | 2 | Read    |         || | | | M src/dashboard/db.ts              | |  |
|  | |   | src/dashboard/st..|| | | | M src/dashboard/state.ts           | |  |
|  | | 3 | Read    |         || | | | A src/dashboard/api/search.ts      | |  |
|  | |   | src/jobs.ts       || | | +------------------------------------+ |  |
|  | | 4 | Grep    |         || | |                                        |  |
|  | |   | pattern: "sqlite"|| | | MESSAGES                               |  |
|  | | 5 | Read    |         || | | Total: 24 messages                     |  |
|  | |   | src/dashboard/se..|| | | User messages: 3                       |  |
|  | | ...                   || | |                                        |  |
|  | |47 | Write   |         || | | SUBAGENTS (0)                          |  |
|  | |   | src/api/search.ts|| | | No subagents spawned                    |  |
|  | +------------------------+| | |                                        |  |
|  | [Show All] [Errors Only]  | | |                                        |  |
|  +----------------------------+ +----------------------------------------+  |
|                                                                            |
|  TOOL CALL DETAIL (expanded on click)                                      |
|  +----------------------------------------------------------------------+  |
|  | Tool Call #4: Grep                                            [Close] |  |
|  |                                                                      |  |
|  | Input Preview:                                                       |  |
|  | +------------------------------------------------------------------+ |  |
|  | | { "pattern": "sqlite", "path": "src/", "type": "ts" }           | |  |
|  | +------------------------------------------------------------------+ |  |
|  |                                                                      |  |
|  | Output Preview:                                                      |  |
|  | +------------------------------------------------------------------+ |  |
|  | | src/dashboard/db.ts:3:import { Database } from "bun:sqlite";     | |  |
|  | | src/dashboard/db.ts:8:const DB_PATH = path.join(config.jobsDir,  | |  |
|  | | ...                                                               | |  |
|  | +------------------------------------------------------------------+ |  |
|  | Status: Success | Error: No                                         |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
+----------------------------------------------------------------------------+
```

### Component List

| Component | Data Binding | Notes |
|-----------|-------------|-------|
| `JobDetailHeader` | `JobHistoryRecord` | Status badge, timing, metadata |
| `PromptDisplay` | `job.prompt` (full, from DB) | Scrollable with copy button |
| `SummaryPanel` | `job.summary` | Markdown rendered |
| `ToolCallsTable` | `GET /api/db/jobs/:id/tool-calls` | Paginated list of tool invocations |
| `ToolCallsTable.Row` | `ToolCallRecord` | Click to expand detail |
| `ToolCallDetail` | Selected `ToolCallRecord` | Input/output preview panels |
| `TokenUsagePanel` | `input_tokens`, `output_tokens`, `context_*` | Same design as Agent Detail View |
| `CostBreakdown` | Computed from tokens + model pricing | Per-model rate calculation |
| `FilesModifiedList` | `files_modified_json` parsed | M/A/D prefix indicators |
| `MessageStats` | `message_count`, `user_message_count` | Counts only (messages not stored) |
| `SubagentsList` | `GET /api/db/jobs/:id/subagents` | List with tool/message counts |

### Refresh Strategy

| Data | Method | Interval |
|------|--------|----------|
| Job detail | `GET /api/db/jobs/:id` | On mount (static data) |
| Tool calls | `GET /api/db/jobs/:id/tool-calls` | On mount |
| Subagents | `GET /api/db/jobs/:id/subagents` | On mount |

### Interaction Patterns

| Action | Trigger | Result |
|--------|---------|--------|
| Expand tool call | Click row in tool calls table | Show input/output preview |
| Filter errors only | Click [Errors Only] | Filter tool calls to `is_error = 1` |
| Copy prompt | Click [Copy Prompt] | Copy to clipboard |
| Navigate back | Click breadcrumb or `Esc` | Return to Job History Browser |
| Keyboard: cycle tool calls | Arrow up/down in tool table | Navigate tool calls |

### Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| >= 1200px | Two-column (55/45 split) |
| 768px - 1199px | Single column, panels stacked vertically |
| < 768px | Single column, tool calls table becomes card layout |

---

## 8. View 4: Analytics Dashboard

Visual trends computed from `daily_metrics` and `job_history`. The "big picture" view of agent usage over time.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  DATABASE > ANALYTICS                                                      |
|  [<- Back to Overview]                                                     |
|                                                                            |
|  TIME RANGE: [7 days] [30 days] [90 days] [All time]                     |
|                                                                            |
|  HEADLINE STATS                                                            |
|  +----------+ +----------+ +----------+ +----------+ +-----------+        |
|  | 47 Jobs  | | 38 Done  | | 5 Failed | | $248.60  | | 16.2M     |        |
|  | started  | | (81%)    | | (11%)    | | spent    | | tokens    |        |
|  | this wk  | |          | |          | |          | | consumed  |        |
|  +----------+ +----------+ +----------+ +----------+ +-----------+        |
|                                                                            |
|  JOBS PER DAY (bar chart)                                                  |
|  +----------------------------------------------------------------------+  |
|  |     _                                                                |  |
|  |    | |  _        _     _                                             |  |
|  |  _ | | | |  _   | |   | |  _                                        |  |
|  | | || | | | | |  | | _ | | | |                                       |  |
|  | | || | | | | |  | || || | | |                                       |  |
|  |_|_||_|_|_|_|_|__|_||_||_|_|_|_______________________________________|  |
|  Feb 5  Feb 6  Feb 7  Feb 8  Feb 9  Feb 10  Feb 11                     |  |
|                                                                          |  |
|  Legend: [green] Completed  [red] Failed  [gray] Started                 |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  TOKEN USAGE OVER TIME (area chart)                                        |
|  +----------------------------------------------------------------------+  |
|  | 800K _     /\                                                        |  |
|  |     / \   /  \      /\                                               |  |
|  | 400K   \_/    \    /  \    /\                                        |  |
|  |               \  /    \__/  \                                        |  |
|  | 0 ____________\/_____________\_________________________________       |  |
|  |  Feb 5  Feb 6  Feb 7  Feb 8  Feb 9  Feb 10  Feb 11                  |  |
|  |                                                                      |  |
|  | Legend: [blue] Input tokens  [purple] Output tokens                  |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  +--- COST OVER TIME (line chart) ---+ +--- MODEL DISTRIBUTION (pie) --+  |
|  |                                    | |                               |  |
|  | $60 _                             | |         +---------+            |  |
|  |    / \                            | |        /  opus    /\           |  |
|  | $30  \_/\    /\                   | |       /  (78%)  /   \          |  |
|  |          \__/  \                  | |      /________/      |         |  |
|  | $0 ______________\___             | |      | sonnet (22%) |          |  |
|  |  Feb 5 ... Feb 11                | |      +---------------+          |  |
|  +------------------------------------+ +-------------------------------+  |
|                                                                            |
|  +--- AVG JOB DURATION (line chart) -+ +--- SUCCESS RATE (line chart) -+  |
|  |                                    | |                               |  |
|  | 30m ___     /\___                  | | 100%   _                      |  |
|  |     \  \   /                       | |       / \    /\               |  |
|  | 15m  \  \_/                        | |  75%_/   \__/  \              |  |
|  |       \                            | |                 \_            |  |
|  | 0m ____\__________                 | |  50%               \___       |  |
|  |  Feb 5 ... Feb 11                 | |  Feb 5 ... Feb 11             |  |
|  +------------------------------------+ +-------------------------------+  |
|                                                                            |
|  TOP MODELS                            TOP WORKING DIRECTORIES             |
|  +----------------------------------+  +----------------------------------+|
|  | opus/xhigh    ████████████  67%  |  | ~/newme/cc-master  ███████  55% ||
|  | opus/high     ████████      22%  |  | ~/projects/webapp  ████     32% ||
|  | sonnet/low    ███            8%  |  | ~/tools/api        ██       13% ||
|  | sonnet/medium █              3%  |  |                                  ||
|  +----------------------------------+  +----------------------------------+|
|                                                                            |
+----------------------------------------------------------------------------+
```

### Component List

| Component | Data Binding | Notes |
|-----------|-------------|-------|
| `TimeRangeSelector` | Query param: range | Buttons for 7d/30d/90d/all |
| `HeadlineStats` | Aggregated from filtered daily_metrics | 5 stat cards |
| `JobsPerDayChart` | `daily_metrics.jobs_started/completed/failed` | Stacked bar chart |
| `TokenUsageChart` | `daily_metrics.total_input/output_tokens` | Area chart, dual-series |
| `CostOverTimeChart` | Computed from daily token totals + pricing | Line chart |
| `ModelDistribution` | `GROUP BY model, reasoning_effort` from job_history | Donut/pie chart |
| `AvgDurationChart` | `daily_metrics.total_elapsed_ms / jobs_completed` | Line chart |
| `SuccessRateChart` | `completed / (completed + failed)` per day | Line chart |
| `TopModels` | `GROUP BY model || '/' || reasoning_effort` | Horizontal bar chart |
| `TopDirectories` | `GROUP BY cwd` from job_history | Horizontal bar chart |

### Chart Technology

Use inline SVG for all charts (zero dependencies). The charts are simple enough (bar, line, area, donut) that a library is unnecessary. Keep the dark theme colors from the design system:

| Chart Element | Color |
|---------------|-------|
| Input tokens | `--token-input` (#79c0ff) |
| Output tokens | `--token-output` (#d2a8ff) |
| Completed jobs | `--status-running` (#3fb950) |
| Failed jobs | `--status-failed` (#f85149) |
| Started jobs | `--text-secondary` (#8b949e) |
| Cost line | `--accent` (#58a6ff) |
| Grid lines | `--border` (#30363d) |

### Refresh Strategy

| Data | Method | Interval |
|------|--------|----------|
| Daily metrics | `GET /api/metrics/history?range=Xd` | On mount, on range change |
| Job aggregations | `GET /api/db/analytics?range=Xd` | On mount, on range change |

### Interaction Patterns

| Action | Trigger | Result |
|--------|---------|--------|
| Change time range | Click range button | Re-fetch all data for new range |
| Hover chart point | Mouse over data point | Show tooltip with exact values |
| Click chart bar | Click day bar in jobs chart | Navigate to Job History filtered to that date |
| Keyboard: cycle range | `[` / `]` keys | Previous / next time range |

### Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| >= 1440px | 2 charts per row |
| 1024px - 1439px | 2 charts per row, smaller |
| 768px - 1023px | 1 chart per row |
| < 768px | 1 chart per row, horizontally scrollable stat cards |

---

## 9. View 5: Tool Usage Explorer

Deep dive into tool calls across all jobs. Understand which tools agents use, error rates, and inspect individual calls.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  DATABASE > TOOL USAGE                                                     |
|  [<- Back to Overview]                                                     |
|                                                                            |
|  TOOL SUMMARY                                                              |
|  +----------------------------------------------------------------------+  |
|  | Tool Name      | Total Calls | Error Rate | Avg per Job | Last Used |  |
|  |----------------|-------------|------------|-------------|-----------|  |
|  | Read           |     892     |   0.2%     |    7.0      | 2m ago    |  |
|  | Write          |     456     |   1.1%     |    3.6      | 5m ago    |  |
|  | Bash           |     321     |   4.7%     |    2.5      | 8m ago    |  |
|  | Edit           |     298     |   0.7%     |    2.3      | 3m ago    |  |
|  | Grep           |     187     |   0.0%     |    1.5      | 12m ago   |  |
|  | Glob           |     112     |   0.0%     |    0.9      | 15m ago   |  |
|  | Task           |      48     |   2.1%     |    0.4      | 1h ago    |  |
|  | WebFetch       |      27     |  11.1%     |    0.2      | 3h ago    |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  ERROR RATE VISUALIZATION                                                  |
|  +----------------------------------------------------------------------+  |
|  | Read      ████████████████████████████████████████████████  0.2%     |  |
|  | Write     ████████████████████████████░                     1.1%     |  |
|  | Bash      ██████████████████████░░░░░░                      4.7%     |  |
|  | Edit      ███████████████████████████░                      0.7%     |  |
|  | WebFetch  ████████░░░░░░░░░░░░                             11.1%     |  |
|  |                                                                      |  |
|  | [green] Success  [red] Error                                         |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
|  RECENT TOOL CALLS                    FILTER: [All Tools v] [Errors v]    |
|  +----------------------------------------------------------------------+  |
|  | # | Tool    | Job ID   | Error? | Timestamp      | Preview          |  |
|  |---|---------|----------|--------|----------------|------------------|  |
|  | 1 | Read    | d6c936e2 |        | 14:44:12       | src/dashboa...   |  |
|  | 2 | Grep    | d6c936e2 |        | 14:44:08       | pattern: "s...   |  |
|  | 3 | Read    | d6c936e2 |        | 14:43:55       | src/jobs.ts      |  |
|  | 4 | Bash    | a1b2c3d4 | [!]    | 14:42:31       | npm run bui...   |  |
|  | 5 | Write   | a1b2c3d4 |        | 14:41:12       | src/auth/cs...   |  |
|  | ...                                                                  |  |
|  +----------------------------------------------------------------------+  |
|  [< Prev] Page 1 of 47 [Next >]                                          |
|                                                                            |
|  TOOL CALL DETAIL (expanded on click)                                      |
|  +----------------------------------------------------------------------+  |
|  | Tool: Bash | Job: a1b2c3d4 | ERROR                           [Close] |  |
|  |                                                                      |  |
|  | Input:                                                               |  |
|  | +------------------------------------------------------------------+ |  |
|  | | npm run build                                                     | |  |
|  | +------------------------------------------------------------------+ |  |
|  |                                                                      |  |
|  | Output:                                                              |  |
|  | +------------------------------------------------------------------+ |  |
|  | | ERR! Missing script: "build"                                      | |  |
|  | | npm ERR! To see a list of scripts, run: npm run                   | |  |
|  | +------------------------------------------------------------------+ |  |
|  |                                                                      |  |
|  | [View Job ->]                                                        |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
+----------------------------------------------------------------------------+
```

### Component List

| Component | Data Binding | Notes |
|-----------|-------------|-------|
| `ToolSummaryTable` | `GET /api/db/tool-stats` | Aggregate stats per tool |
| `ErrorRateChart` | Computed from tool stats | Horizontal stacked bar |
| `RecentToolCallsTable` | `GET /api/db/tool-calls?...` | Paginated, filterable |
| `RecentToolCallsTable.Row` | `ToolCallRecord` | Click to expand detail |
| `ToolCallDetailPanel` | Selected tool call | Input/output previews |
| `ToolFilter` | Dropdown of distinct tool names | Filters the recent calls list |
| `ErrorFilter` | Dropdown: All / Errors Only / Success Only | Filters by `is_error` |

### Refresh Strategy

| Data | Method | Interval |
|------|--------|----------|
| Tool stats | `GET /api/db/tool-stats` | On mount |
| Recent calls | `GET /api/db/tool-calls?page=N&tool=X` | On mount, on filter change |

### Interaction Patterns

| Action | Trigger | Result |
|--------|---------|--------|
| Filter by tool | Click tool name in summary or dropdown | Filter recent calls to that tool |
| View call detail | Click row in recent calls | Expand detail panel below |
| Navigate to job | Click [View Job ->] in detail | Go to Job History Detail |
| Sort summary | Click column header | Sort tool summary table |
| Toggle error filter | Dropdown change | Re-fetch tool calls |

### Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| >= 1200px | Summary table above, recent calls below |
| 768px - 1199px | Same but narrower columns |
| < 768px | Card layout for both tables |

---

## 10. View 6: Events Timeline

Browse the `events` table - real-time hook events logged as agents work.

### Wireframe

```
+--[SHELL]------------------------------------------------------------------+
|                                                                            |
|  DATABASE > EVENTS                                                         |
|  [<- Back to Overview]                                                     |
|                                                                            |
|  FILTER BAR                                                                |
|  Job: [All v]  Event Type: [All v]  Tool: [All v]  [Search file path___]  |
|                                                                            |
|  EVENT STATS                                                               |
|  +----------+ +----------+ +----------+ +----------+                      |
|  | 8,912    | | 6,231    | | 1,892    | | 789      |                      |
|  | total    | | tool_use | | file_    | | errors   |                      |
|  | events   | |          | | write    | |          |                      |
|  +----------+ +----------+ +----------+ +----------+                      |
|                                                                            |
|  EVENTS TABLE                                                              |
|  +----------------------------------------------------------------------+  |
|  | Timestamp       | Job ID   | Event Type | Tool/File       | Data     |  |
|  |-----------------|----------|------------|-----------------|----------|  |
|  | 14:44:12.123    | d6c936e2 | tool_use   | Read            | {...}    |  |
|  | 14:44:08.456    | d6c936e2 | tool_use   | Grep            | {...}    |  |
|  | 14:43:55.789    | d6c936e2 | file_write | src/api/sear... | {...}    |  |
|  | 14:42:31.012    | a1b2c3d4 | error      | Bash            | {...}    |  |
|  | 14:41:12.345    | a1b2c3d4 | file_write | src/auth/csr... | {...}    |  |
|  | ...             | ...      | ...        | ...             | ...      |  |
|  +----------------------------------------------------------------------+  |
|  [< Prev] Page 1 of 179 [Next >]                                         |
|                                                                            |
|  EVENT DETAIL (expanded on click)                                          |
|  +----------------------------------------------------------------------+  |
|  | Event #3: file_write                                          [Close] |  |
|  | Job: d6c936e2 | Time: 14:43:55.789                                   |  |
|  | File: src/api/search.ts                                               |  |
|  |                                                                       |  |
|  | Data:                                                                 |  |
|  | +------------------------------------------------------------------+  |  |
|  | | {                                                                 |  |  |
|  | |   "tool": "Write",                                               |  |  |
|  | |   "file_path": "src/api/search.ts",                              |  |  |
|  | |   "bytes_written": 1247                                          |  |  |
|  | | }                                                                 |  |  |
|  | +------------------------------------------------------------------+  |  |
|  |                                                                       |  |
|  | [View Job ->]                                                         |  |
|  +----------------------------------------------------------------------+  |
|                                                                            |
+----------------------------------------------------------------------------+
```

### Component List

| Component | Data Binding | Notes |
|-----------|-------------|-------|
| `EventFilterBar` | Local filter state | Dropdowns + file path search |
| `EventStats` | Aggregated counts by event_type | 4 stat cards |
| `EventsTable` | `GET /api/db/events?...` | Paginated, filterable |
| `EventsTable.Row` | Event record | Click to expand |
| `EventDetail` | Selected event | JSON viewer for data_json |

### Refresh Strategy

| Data | Method | Interval |
|------|--------|----------|
| Events | `GET /api/db/events?...filters` | On mount, on filter change |
| Stats | Included in response | Same |

### Interaction Patterns

| Action | Trigger | Result |
|--------|---------|--------|
| Filter by job | Dropdown or click job ID | Filter events to that job |
| Filter by type | Dropdown | Filter by event_type |
| Search by file | Text input | Filter by file_path LIKE |
| Expand event | Click row | Show JSON data detail |
| Navigate to job | Click [View Job ->] | Go to Job History Detail |

### Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| >= 1024px | Full table |
| 768px - 1023px | Hide Data column |
| < 768px | Card layout |

---

## 11. API Endpoints Required

New endpoints needed to power the Database Explorer views.

### Database Overview

```
GET /api/db/overview
```
Returns: table row counts, DB file size, top values per table.

### Job History (DB-backed)

```
GET /api/db/jobs
  ?status=completed|failed|running
  &model=opus|sonnet
  &reasoning=xhigh|high|medium|low
  &cost_min=0&cost_max=10
  &since=2026-02-01&until=2026-02-11
  &has_session=true|false
  &search=query
  &search_mode=prompt|file|tool|summary
  &sort=completed_at|estimated_cost|input_tokens|elapsed_ms
  &order=asc|desc
  &page=1&limit=50

GET /api/db/jobs/:id
  Returns: full JobHistoryRecord

GET /api/db/jobs/:id/tool-calls
  Returns: ToolCallRecord[]

GET /api/db/jobs/:id/subagents
  Returns: SubagentRecord[]
```

### Analytics

```
GET /api/db/analytics
  ?range=7d|30d|90d|all
  Returns: {
    headline: { jobs_started, jobs_completed, jobs_failed, total_cost, total_tokens },
    daily: DailyMetric[],
    by_model: { model, reasoning, count, cost }[],
    by_cwd: { cwd, count }[],
    avg_duration_by_day: { date, avg_ms }[],
    success_rate_by_day: { date, rate }[]
  }
```

### Tool Stats

```
GET /api/db/tool-stats
  Returns: {
    by_tool: { name, total_calls, error_count, error_rate, avg_per_job, last_used }[]
  }

GET /api/db/tool-calls
  ?tool=Read|Write|Bash|...
  &is_error=true|false
  &job_id=xxx
  &page=1&limit=50
  Returns: { tool_calls: ToolCallRecord[], total: number }
```

### Events

```
GET /api/db/events
  ?job_id=xxx
  &event_type=tool_use|file_write|error
  &tool_name=Read|Write|...
  &file_path=query
  &page=1&limit=50
  Returns: { events: EventRecord[], total: number, stats: { by_type: {...} } }
```

---

## 12. Navigation Integration

### Current Navigation (actual implementation)

The dashboard uses a **horizontal topbar** with hash-based routing (no sidebar exists):

```
CC-Agent Dashboard v1.0  [Jobs] [Timeline] [Alerts] [Analytics] [Split] [Pipeline]  [Ctrl+K] [+ New Agent]
```

Routes: `#/`, `#/timeline`, `#/notifications`, `#/analytics`, `#/split`, `#/pipeline`, `#/jobs/:id`

### Updated Topbar

Add a "Database" link to the existing topbar navigation:

```
CC-Agent Dashboard v1.0  [Jobs] [Timeline] [Alerts] [Analytics] [Split] [Pipeline] [Database]  [Ctrl+K] [+ New Agent]
```

New route: `#/db` (overview), with sub-routes:
- `#/db` — Database Overview
- `#/db/jobs` — Job History Browser
- `#/db/jobs/:id` — Job History Detail
- `#/db/analytics` — Analytics Dashboard
- `#/db/tools` — Tool Usage Explorer
- `#/db/events` — Events Timeline

### Database Sub-Navigation

When on any `#/db*` route, show a secondary horizontal tab bar inside the content area (below the topbar):

```
+--- DATABASE TAB BAR -------------------------------------------------+
| [Overview]  [Job History]  [Analytics]  [Tool Usage]  [Events]       |
+----------------------------------------------------------------------+
```

Reuses the existing `.topbar-nav-link` styling pattern but renders as a secondary row.

### Command Palette Integration

Add to the `Ctrl+K` command palette (in `CommandPalette.tsx`):

```
Database Overview
Browse Job History
View Analytics
Tool Usage Explorer
Browse Events
Search Jobs by File...
Search Jobs by Tool...
```

---

## 13. Success Criteria

| Criteria | Metric |
|----------|--------|
| All 5 DB tables browsable | Overview shows row counts for all 5 tables |
| Job history searchable | Can search by prompt, file path, tool name, summary |
| Job detail shows tool calls | Clicking a historical job shows all tool calls with previews |
| Analytics charts render | Jobs/day, tokens/day, cost/day charts show real data |
| Tool usage visible | Can see which tools are most used and their error rates |
| Events browsable | Can filter events by job, type, and file path |
| No data loss | All data visible in SQLite CLI is also visible in UI |
| Performance | All pages load in <500ms for databases up to 10K rows |
| Design consistency | All views follow UI_DESIGN_SPEC.md colors, typography, spacing |

---

## Appendix: Existing DB Functions Available

The following functions already exist in `src/dashboard/db.ts` and can be reused:

| Function | Purpose | Used by new views? |
|----------|---------|:---:|
| `getJobHistory(limit)` | Get recent job records | Job History Browser |
| `getJobToolCalls(jobId)` | Get tool calls for a job | Job History Detail |
| `getJobSubagents(jobId)` | Get subagents for a job | Job History Detail |
| `getMetricsHistory(range)` | Get daily metrics | Analytics Dashboard |
| `searchJobsByFile(path)` | Search jobs by file path | Quick Search, Job History |
| `searchJobsByTool(tool)` | Search jobs by tool name | Quick Search, Job History |

New DB functions needed:
- `getDbOverview()` — table counts, DB size, top values
- `getJobHistoryFiltered(filters)` — filtered/sorted/paginated job history
- `getToolStats()` — aggregated tool usage statistics
- `getToolCallsFiltered(filters)` — filtered/paginated tool calls
- `getEventsFiltered(filters)` — filtered/paginated events
- `getAnalytics(range)` — computed analytics aggregations

---

## Appendix: Implementation Strategy (2-Phase Agent Pipeline)

This section defines the exact agent splitting strategy for implementing this PRD using cc-orchestrator. The implementation is split into 2 phases to manage file conflicts and dependency ordering.

### Context Window Budget (200K tokens per agent)

Every agent operates within a ~200K token context window. This budget must cover the system prompt, injected files, file reads during work, code generation output, tool call overhead, and reasoning. Overloading an agent causes context compaction, which degrades output quality and can lose track of requirements.

#### Fixed Overhead Per Agent

| Item | Est. Tokens | Notes |
|------|------------|-------|
| Claude system prompt + tool definitions | ~15K | Unavoidable |
| Codebase map (`--map`) | ~5K | Worth it — prevents wasted exploratory reads |
| Full PRD (`-f` the PRD) | ~10K | **Only for Phase 1** — Phase 2 agents read only their sections |
| **Subtotal** | **~25-30K** | Leaves ~170K for actual work |

#### Per-Phase Token Estimates

| Agent | Reads | Output | Tool Overhead | Reasoning | Total | Headroom |
|-------|-------|--------|---------------|-----------|-------|----------|
| Phase 1 (Foundation) | ~15K | ~30K | ~20K | ~35K | **~130K** | ~70K safe |
| Agent A (Overview + History) | ~12K | ~20K | ~15K | ~25K | **~95K** | ~105K safe |
| Agent B (Detail + Tools) | ~12K | ~25K | ~15K | ~25K | **~100K** | ~100K safe |
| Agent C (Analytics — SVG charts) | ~10K | ~35K | ~15K | ~30K | **~110K** | ~90K safe |
| Agent D (Events Timeline) | ~8K | ~12K | ~10K | ~15K | **~65K** | ~135K safe |

**Key insight**: The original 3-agent Phase 2 plan put Analytics (8 SVG chart components with coordinate math) + Events Timeline on a single agent. That agent would estimate ~150-170K tokens — dangerously close to compaction. Splitting into Agent C (Analytics only) and Agent D (Events only) keeps both well within budget.

#### Orchestrator Context Hygiene

The orchestrator (Claude instance managing the agents) also has a 200K context window. To stay within budget:
- Use `cc-agent capture <id> 50` (last 50 lines) not `cc-agent output <id>` (full dump)
- Use `cc-agent jobs --json` for structured status, not verbose output
- Don't read agent-generated files unless verification requires it
- After Phase 1 verification, let context compact naturally before starting Phase 2

### Conflict Surface Analysis

These shared files will be modified by multiple concerns — they must be handled in Phase 1 to avoid merge conflicts in Phase 2:

| File | Conflict Risk | Reason |
|------|:---:|--------|
| `src/dashboard/db.ts` | HIGH | All 6 new DB functions land here |
| `src/dashboard/server.ts` | MEDIUM | Route registration for all new endpoints |
| `ui/src/app.tsx` | MEDIUM | Routing cases + navigation updates |
| `ui/src/styles/layout.css` | HIGH | Every view adds styles |
| `ui/src/components/CommandPalette.tsx` | LOW | Command palette entries |

### Dependency Chain

```
DB Functions → API Endpoints → UI Views
                                  ↑
                           Navigation Shell (routing, sub-tabs)
```

Views cannot be built until the API exists. The API cannot be built until DB functions exist. All views need the navigation shell (routes, sub-tab bar) to be in place.

---

### Phase 1: Foundation (1 Agent)

**Agent count**: 1
**Context budget**: ~130K of 200K (safe)
**Sandbox**: `workspace-write`
**Estimated duration**: 40-60 minutes
**Flags**: `--map -f "docs/prds/database-explorer-ui.md"`

**Why full PRD**: Phase 1 needs the complete picture — API specs from Section 11, DB schema from Section 2, navigation from Section 12. This is the only agent that gets the full PRD injected via `-f`.

**Prompt summary**: Build the entire backend (DB functions + API endpoints) and the frontend navigation shell for the Database Explorer.

#### Deliverables

**1. New DB functions in `src/dashboard/db.ts`:**

| Function | Purpose | Key Queries |
|----------|---------|------------|
| `getDbOverview()` | Table row counts, DB file size, top values per table | `SELECT COUNT(*) FROM ...` for each table, `GROUP BY status`, `GROUP BY name LIMIT 4`, DB file stat |
| `getJobHistoryFiltered(filters)` | Filtered, sorted, paginated job history | Dynamic WHERE clauses for status/model/reasoning/cost/date/session/search, with `ORDER BY` and `LIMIT/OFFSET` |
| `getToolStats()` | Aggregated tool usage statistics | `GROUP BY name` with `COUNT(*)`, `SUM(is_error)`, `MAX(timestamp)`, plus `AVG` per job |
| `getToolCallsFiltered(filters)` | Filtered, paginated tool calls | WHERE clauses for tool/is_error/job_id, with `LIMIT/OFFSET` |
| `getEventsFiltered(filters)` | Filtered, paginated events | WHERE clauses for job_id/event_type/tool_name/file_path LIKE, with `LIMIT/OFFSET` |
| `getAnalytics(range)` | Computed analytics aggregations | Headline stats from `daily_metrics`, `GROUP BY model, reasoning_effort`, `GROUP BY cwd`, success rate per day |

**2. New API route file `src/dashboard/api/db.ts`:**

All endpoints from [Section 11](#11-api-endpoints-required):
- `GET /api/db/overview`
- `GET /api/db/jobs` (with all filter/sort/pagination params)
- `GET /api/db/jobs/:id`
- `GET /api/db/jobs/:id/tool-calls`
- `GET /api/db/jobs/:id/subagents`
- `GET /api/db/analytics`
- `GET /api/db/tool-stats`
- `GET /api/db/tool-calls`
- `GET /api/db/events`

**3. Route registration in `src/dashboard/server.ts`:**

Import and mount the new `/api/db/*` routes.

**4. Navigation shell in `ui/src/app.tsx`:**

- Add "Database" link to topbar nav (after Pipeline)
- Add route cases for: `#/db`, `#/db/jobs`, `#/db/jobs/:id`, `#/db/analytics`, `#/db/tools`, `#/db/events`
- Create `DbLayout` wrapper component that renders the secondary tab bar + routed child view
- Each view initially renders a placeholder `<div>` (e.g., `<div>Database Overview - Coming Soon</div>`)

**5. Sub-navigation component:**

A `DbSubNav` component rendering the secondary tab bar:
```
[Overview]  [Job History]  [Analytics]  [Tool Usage]  [Events]
```
Reuses `.topbar-nav-link` styling pattern. Highlights active tab based on current hash route.

**6. Command palette entries in `ui/src/components/CommandPalette.tsx`:**

Add entries: Database Overview, Browse Job History, View Analytics, Tool Usage Explorer, Browse Events, Search Jobs by File, Search Jobs by Tool.

**7. CSS foundation in `ui/src/styles/layout.css`:**

- `.db-layout` container styles
- `.db-sub-nav` tab bar styles
- `.db-stat-card` shared stat card pattern (used by Overview, Analytics, Events, Job History)
- `.db-filter-bar` shared filter bar pattern
- `.db-table` shared table styles with sorting indicators
- `.db-pagination` shared pagination component styles
- `.db-detail-panel` expandable detail panel styles

#### Phase 1 Verification

Before spawning Phase 2 agents, verify:
- [ ] `bun run src/dashboard/server.ts` starts without errors
- [ ] `curl http://localhost:3131/api/db/overview` returns valid JSON
- [ ] `curl http://localhost:3131/api/db/jobs` returns valid JSON
- [ ] `curl http://localhost:3131/api/db/analytics` returns valid JSON
- [ ] Dashboard loads in browser, "Database" nav link visible
- [ ] Clicking "Database" shows sub-tab bar with all 5 tabs
- [ ] Each sub-tab navigates to correct route and shows placeholder

---

### Phase 2: View Implementation (4 Parallel Agents)

**Agent count**: 4 (launched simultaneously after Phase 1 verification)
**Sandbox**: `workspace-write`
**Estimated duration**: 30-50 minutes each

#### Context-Saving Rules for Phase 2 Agents

1. **Do NOT inject the full PRD via `-f`**. The PRD is ~10K tokens. Instead, each agent prompt contains only the requirements for its assigned views (extracted inline in the prompt). The agent can read the PRD file if it needs extra detail, but only the sections it's assigned to.
2. **Do use `--map`** (~5K tokens). It prevents agents from burning 10-20K on exploratory file reads.
3. **Do use `-f` for files the agent will modify**: `app.tsx` and `layout.css`. This saves a read tool call each (~2K + ~8K tokens recovered as inline context instead of tool overhead).
4. **Each agent creates its own component files** (no conflicts) and appends styles to `layout.css` in clearly commented sections.

---

#### Agent A: Database Overview + Job History Browser

**Context budget**: ~95K of 200K (safe)
**Flags**: `--map -f "ui/src/app.tsx" -f "ui/src/styles/layout.css"`

**Prompt**: Must include inline the requirements from Section 5 (Database Overview) and Section 6 (Job History Browser) — wireframes, component lists, filter logic, interaction patterns. Tell the agent: "Read `src/dashboard/api/db.ts` to understand the API response shapes. Read `docs/prds/database-explorer-ui.md` Section 5 and Section 6 ONLY if you need additional detail."

**Components to create:**

| File | Components |
|------|-----------|
| `ui/src/components/db/DbOverview.tsx` | `DbOverview`, `DbInfoBar`, `TableCard`, `TableCard.StatusBreakdown`, `TableCard.ToolBreakdown`, `TableCard.Sparkline`, `QuickSearch` |
| `ui/src/components/db/JobHistoryBrowser.tsx` | `JobHistoryBrowser`, `FilterBar`, `FilterBar.SearchMode`, `SummaryBar`, `JobHistoryTable`, `JobHistoryTable.Row`, `JobHistoryTable.StatusBadge`, `Pagination`, `BulkStats` |

**Key implementation details:**
- `TableCard.Sparkline`: Inline SVG, 30 data points, uses `daily_metrics` data
- `QuickSearch`: Detects search type (file path vs tool name) and navigates to `#/db/jobs` with search params
- `FilterBar`: All dropdowns from Section 6 filter logic table
- `JobHistoryTable`: Sortable columns (click header toggles ASC/DESC), paginated (50 per page)
- `BulkStats`: Computed client-side from current page results
- All data fetched from Phase 1 API endpoints (`/api/db/overview`, `/api/db/jobs`)

**CSS section marker**: `/* === DB: Overview + Job History === */`

**API endpoints consumed**: `GET /api/db/overview`, `GET /api/db/jobs`

**Wire up routing**: Replace the placeholder `<div>` in `app.tsx` for `#/db` and `#/db/jobs` routes with the real components.

---

#### Agent B: Job History Detail + Tool Usage Explorer

**Context budget**: ~100K of 200K (safe)
**Flags**: `--map -f "ui/src/app.tsx" -f "ui/src/styles/layout.css"`

**Prompt**: Must include inline the requirements from Section 7 (Job History Detail) and Section 9 (Tool Usage Explorer). Tell the agent: "Read `src/dashboard/api/db.ts` to understand the API response shapes. Read `docs/prds/database-explorer-ui.md` Section 7 and Section 9 ONLY if you need additional detail."

**Components to create:**

| File | Components |
|------|-----------|
| `ui/src/components/db/JobHistoryDetail.tsx` | `JobHistoryDetail`, `JobDetailHeader`, `PromptDisplay`, `SummaryPanel`, `ToolCallsTable`, `ToolCallsTable.Row`, `ToolCallDetail`, `TokenUsagePanel`, `CostBreakdown`, `FilesModifiedList`, `MessageStats`, `SubagentsList` |
| `ui/src/components/db/ToolUsageExplorer.tsx` | `ToolUsageExplorer`, `ToolSummaryTable`, `ErrorRateChart`, `RecentToolCallsTable`, `RecentToolCallsTable.Row`, `ToolCallDetailPanel`, `ToolFilter`, `ErrorFilter` |

**Key implementation details:**
- `JobHistoryDetail`: Two-column layout (55/45 split) at >= 1200px, stacked below
- `ToolCallsTable`: Click row to expand `ToolCallDetail` panel showing input/output previews
- `TokenUsagePanel`: Context usage progress bar (same design as existing Agent Detail View)
- `CostBreakdown`: Compute from tokens x model pricing (opus: $15/$75 per 1M, sonnet: $3/$15 per 1M)
- `ErrorRateChart`: Horizontal stacked bar (SVG), green for success, red for errors
- `ToolSummaryTable`: Sortable by any column
- Both views share the expandable tool call detail pattern — implement once, reuse

**CSS section marker**: `/* === DB: Job Detail + Tool Usage === */`

**API endpoints consumed**: `GET /api/db/jobs/:id`, `GET /api/db/jobs/:id/tool-calls`, `GET /api/db/jobs/:id/subagents`, `GET /api/db/tool-stats`, `GET /api/db/tool-calls`

**Wire up routing**: Replace placeholders for `#/db/jobs/:id` and `#/db/tools` routes.

---

#### Agent C: Analytics Dashboard (SVG Charts)

**Context budget**: ~110K of 200K (safe — was ~170K when combined with Events)
**Flags**: `--map -f "ui/src/app.tsx" -f "ui/src/styles/layout.css"`

**Why split from Events**: This agent generates 8 SVG chart components, each requiring coordinate math, scale calculations, and path generation. That's ~35K tokens of code output + ~30K reasoning for the math. Combined with Events Timeline, the original Agent C would have hit ~160-170K, risking compaction mid-generation.

**Prompt**: Must include inline the requirements from Section 8 (Analytics Dashboard) including the chart technology color table. Tell the agent: "Read `src/dashboard/api/db.ts` to understand the API response shapes for `/api/db/analytics`. Read `docs/prds/database-explorer-ui.md` Section 8 ONLY if you need additional detail."

**Components to create:**

| File | Components |
|------|-----------|
| `ui/src/components/db/AnalyticsDashboard.tsx` | `AnalyticsDashboard`, `TimeRangeSelector`, `HeadlineStats`, `JobsPerDayChart`, `TokenUsageChart`, `CostOverTimeChart`, `ModelDistribution`, `AvgDurationChart`, `SuccessRateChart`, `TopModels`, `TopDirectories` |

**Key implementation details:**
- All charts are **inline SVG** (no charting library). Chart colors:
  - Input tokens: `#79c0ff`, Output tokens: `#d2a8ff`
  - Completed: `#3fb950`, Failed: `#f85149`, Started: `#8b949e`
  - Cost line: `#58a6ff`, Grid lines: `#30363d`
- `JobsPerDayChart`: Stacked bar chart (completed/failed/started)
- `TokenUsageChart`: Area chart with two series (input/output)
- `CostOverTimeChart`: Line chart
- `ModelDistribution`: Donut chart
- `AvgDurationChart` + `SuccessRateChart`: Line charts
- `TopModels` + `TopDirectories`: Horizontal bar charts
- `TimeRangeSelector`: Buttons for 7d/30d/90d/all, drives all chart data
- Create a shared `SvgChart` helper for common patterns (axes, grid lines, tooltips) to reduce code duplication across the 8 charts

**CSS section marker**: `/* === DB: Analytics === */`

**API endpoints consumed**: `GET /api/db/analytics`, `GET /api/metrics/history`

**Wire up routing**: Replace placeholder for `#/db/analytics` route.

---

#### Agent D: Events Timeline

**Context budget**: ~65K of 200K (very safe)
**Flags**: `--map -f "ui/src/app.tsx" -f "ui/src/styles/layout.css"`

**Prompt**: Must include inline the requirements from Section 10 (Events Timeline). Tell the agent: "Read `src/dashboard/api/db.ts` to understand the API response shapes for `/api/db/events`. Read `docs/prds/database-explorer-ui.md` Section 10 ONLY if you need additional detail."

**Components to create:**

| File | Components |
|------|-----------|
| `ui/src/components/db/EventsTimeline.tsx` | `EventsTimeline`, `EventFilterBar`, `EventStats`, `EventsTable`, `EventsTable.Row`, `EventDetail` |

**Key implementation details:**
- `EventFilterBar`: Dropdowns for job, event type, tool + file path text search
- `EventStats`: 4 stat cards (total, tool_use, file_write, errors)
- `EventsTable`: Paginated (50 per page), click row to expand `EventDetail`
- `EventDetail`: Pretty-printed JSON viewer for `data_json`, with [View Job ->] link
- Reuse `.db-filter-bar`, `.db-table`, `.db-pagination`, `.db-stat-card`, `.db-detail-panel` CSS classes from Phase 1 foundation

**CSS section marker**: `/* === DB: Events === */`

**API endpoints consumed**: `GET /api/db/events`

**Wire up routing**: Replace placeholder for `#/db/events` route.

---

### Phase 2 Verification

After all 4 agents complete:
- [ ] All 6 views render with real data from the database
- [ ] Navigation: topbar "Database" link -> sub-tabs -> each view works
- [ ] Job History Browser: filters, search, sort, pagination all functional
- [ ] Job History Detail: tool calls expand with input/output previews
- [ ] Analytics: all 8 charts render with real daily_metrics data
- [ ] Tool Usage: summary table + error rate chart + recent calls with detail expand
- [ ] Events: filter by job/type/file, paginate, expand detail
- [ ] Responsive: test at 1440px, 1024px, 768px, 480px breakpoints
- [ ] Design consistency: colors, typography, spacing match UI_DESIGN_SPEC.md
- [ ] Performance: all pages load in <500ms

### Orchestrator Commands (Quick Reference)

```bash
# Phase 1 — full PRD injected (only agent that gets it)
cc-agent start "Implement Phase 1 (Foundation) of docs/prds/database-explorer-ui.md: all DB functions, all API endpoints, navigation shell, sub-tab bar, routing, command palette entries, and shared CSS foundation. Read the PRD thoroughly — the Implementation Strategy appendix has exact deliverables for Phase 1." --map -f "docs/prds/database-explorer-ui.md"

# Wait for Phase 1 completion + verify endpoints with curl

# Phase 2 — 4 agents, NO full PRD injection, requirements inlined in prompts
# IMPORTANT: Each prompt below must include the relevant PRD section content
# inlined (wireframes, component lists, interaction patterns). Do NOT use
# -f "docs/prds/database-explorer-ui.md" — that wastes ~10K tokens per agent
# on 80% irrelevant content. Agents can read specific PRD sections if needed.

cc-agent start "You are Agent A. Implement Database Overview and Job History Browser for the Database Explorer.

YOUR VIEWS: Read docs/prds/database-explorer-ui.md Section 5 (Database Overview) and Section 6 (Job History Browser) for full specs. Also read the Implementation Strategy appendix for Agent A details.

Read src/dashboard/api/db.ts to understand API response shapes.

Create components in ui/src/components/db/DbOverview.tsx and ui/src/components/db/JobHistoryBrowser.tsx.
Append CSS under marker '/* === DB: Overview + Job History === */' in layout.css.
Wire up #/db and #/db/jobs routes in app.tsx — replace the placeholder divs with your components.

Key: TableCard.Sparkline is inline SVG (30 data points). FilterBar has dropdowns for status/model/reasoning/cost/date/session. JobHistoryTable is sortable + paginated (50/page). QuickSearch navigates to #/db/jobs with search params." --map -f "ui/src/app.tsx" -f "ui/src/styles/layout.css"

cc-agent start "You are Agent B. Implement Job History Detail and Tool Usage Explorer for the Database Explorer.

YOUR VIEWS: Read docs/prds/database-explorer-ui.md Section 7 (Job History Detail) and Section 9 (Tool Usage Explorer) for full specs. Also read the Implementation Strategy appendix for Agent B details.

Read src/dashboard/api/db.ts to understand API response shapes.

Create components in ui/src/components/db/JobHistoryDetail.tsx and ui/src/components/db/ToolUsageExplorer.tsx.
Append CSS under marker '/* === DB: Job Detail + Tool Usage === */' in layout.css.
Wire up #/db/jobs/:id and #/db/tools routes in app.tsx — replace the placeholder divs with your components.

Key: JobHistoryDetail is two-column (55/45) at >=1200px. ToolCallsTable rows expand to show input/output previews. ErrorRateChart is horizontal stacked bar SVG (green=#3fb950, red=#f85149). CostBreakdown uses opus $15/$75 per 1M, sonnet $3/$15 per 1M." --map -f "ui/src/app.tsx" -f "ui/src/styles/layout.css"

cc-agent start "You are Agent C. Implement the Analytics Dashboard for the Database Explorer. This is the chart-heavy view — all 8 charts are inline SVG, no charting library.

YOUR VIEW: Read docs/prds/database-explorer-ui.md Section 8 (Analytics Dashboard) for full specs. Also read the Implementation Strategy appendix for Agent C details.

Read src/dashboard/api/db.ts to understand API response shapes for /api/db/analytics.

Create components in ui/src/components/db/AnalyticsDashboard.tsx.
Append CSS under marker '/* === DB: Analytics === */' in layout.css.
Wire up #/db/analytics route in app.tsx — replace the placeholder div with your component.

Charts to build (all inline SVG):
1. JobsPerDayChart — stacked bar (completed=#3fb950, failed=#f85149, started=#8b949e)
2. TokenUsageChart — area chart (input=#79c0ff, output=#d2a8ff)
3. CostOverTimeChart — line chart (cost=#58a6ff)
4. ModelDistribution — donut chart
5. AvgDurationChart — line chart
6. SuccessRateChart — line chart
7. TopModels — horizontal bar chart
8. TopDirectories — horizontal bar chart
Grid lines: #30363d. Create a shared SvgChart helper for axes/grid/tooltips." --map -f "ui/src/app.tsx" -f "ui/src/styles/layout.css"

cc-agent start "You are Agent D. Implement the Events Timeline for the Database Explorer.

YOUR VIEW: Read docs/prds/database-explorer-ui.md Section 10 (Events Timeline) for full specs. Also read the Implementation Strategy appendix for Agent D details.

Read src/dashboard/api/db.ts to understand API response shapes for /api/db/events.

Create components in ui/src/components/db/EventsTimeline.tsx.
Append CSS under marker '/* === DB: Events === */' in layout.css.
Wire up #/db/events route in app.tsx — replace the placeholder div with your component.

Key: EventFilterBar has dropdowns for job/event_type/tool + file path text search. EventStats shows 4 stat cards. EventsTable is paginated (50/page), click row to expand EventDetail with pretty-printed JSON. Reuse existing CSS classes: .db-filter-bar, .db-table, .db-pagination, .db-stat-card, .db-detail-panel." --map -f "ui/src/app.tsx" -f "ui/src/styles/layout.css"
```
