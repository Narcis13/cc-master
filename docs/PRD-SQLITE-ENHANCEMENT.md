# PRD: SQLite Persistence Layer Enhancement

**Status**: Approved
**Date**: 2026-02-10
**Scope**: `src/dashboard/db.ts`, `src/dashboard/state.ts`, `src/jobs.ts`

---

## Problem

The SQLite persistence layer loses the majority of data available at runtime. Of ~25 fields computed per job in `getJobsJson()` and `parseFullSession()`, only 10 land in the database. Rich data (tool calls, file paths, cost, subagents, conversation stats) exists only in ephemeral `.jsonl` files and in-memory state. Once jobs are cleaned up (`cleanupOldJobs`), that data is gone permanently.

### Current gap inventory

| Data | Runtime source | SQLite today |
|---|---|---|
| `estimated_cost` | `JobsJsonEntry` | Not stored |
| `tool_call_count` | `JobsJsonEntry` | Not stored |
| `failed_tool_calls` | `JobsJsonEntry` | Not stored |
| `primary_tool` | `JobsJsonEntry` | Not stored |
| `files_modified` (paths) | `string[]` | **Count only** |
| `prompt` (full) | `Job.prompt` | **Truncated to 200 chars** |
| `summary` (full) | `ParsedSessionData` | **Truncated to 500 chars** |
| `session_id` | `FullSessionData` | Not stored |
| `context_window` | `SessionTokens` | Not stored |
| `has_session` | `JobsJsonEntry` | Not stored |
| `message_count` | `FullSessionData.messages.length` | Not stored |
| Tool call details | `ToolCall[]` | Not stored |
| Subagent data | `Subagent[]` | Not stored |
| `reuseCount` / `originalPrompt` | `Job` | Not stored |
| `pipeline_stage` column | Schema exists | **Never written** |
| `sandbox` column | Schema exists | **Never written** (always `''`) |

---

## Goal

SQLite becomes the **single source of truth** for all completed job data. Three use cases:

1. **Historical analytics** - Cost trends, tool usage patterns, model comparisons over time via aggregate queries
2. **Post-mortem replay** - Re-render job detail pages from SQLite alone after `.jsonl` cleanup
3. **Search & filter** - Query past jobs by tool used, files touched, cost range, error patterns

---

## Decisions (from requirements gathering)

| Decision | Choice | Rationale |
|---|---|---|
| Storage approach | **Hybrid** | Structured `tool_calls` table (high query value), JSON blobs for less-queried data, aggregates for stats |
| Tool call depth | **Summary per call** | name, is_error, timestamp, truncated input/output (500 chars each) |
| Message storage | **Count + last assistant** | `message_count`, `user_message_count`, final summary. No full conversation blob |
| Files modified | **JSON array column** | `files_modified_json TEXT` on `job_history`, queryable via `json_each()` |
| Subagents | **Summary table** | `job_subagents(job_id, subagent_id, tool_call_count, message_count)` |
| Persistence timing | **On completion only** | Batch write when job completes/fails. No incremental writes |
| Migration strategy | **Drop and recreate** | Clean slate on startup. No ALTER TABLE complexity |
| Backfill | **Future only** | New schema applies to newly completed jobs only |
| `daily_metrics` | **Keep as-is** | No changes. Detailed analytics derived from enriched `job_history` + `tool_calls` |
| Dead columns | **Remove** | Drop `pipeline_stage`, `sandbox` |

---

## Schema

### `job_history` (enhanced)

```sql
CREATE TABLE IF NOT EXISTS job_history (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  model TEXT NOT NULL,
  reasoning_effort TEXT NOT NULL,
  cwd TEXT,
  prompt TEXT,                    -- full prompt, no truncation
  summary TEXT,                   -- full summary, no truncation
  session_id TEXT,
  started_at TEXT,
  completed_at TEXT,
  elapsed_ms INTEGER,
  -- tokens
  input_tokens INTEGER,
  output_tokens INTEGER,
  context_used_pct REAL,
  context_window INTEGER,
  -- cost
  estimated_cost REAL,
  -- tool stats
  tool_call_count INTEGER,
  failed_tool_calls INTEGER,
  primary_tool TEXT,
  -- files
  files_modified_count INTEGER,
  files_modified_json TEXT,       -- JSON array of file paths
  -- conversation stats
  message_count INTEGER,
  user_message_count INTEGER,
  -- session metadata
  has_session INTEGER DEFAULT 0,
  -- reuse tracking
  reuse_count INTEGER DEFAULT 0,
  original_prompt TEXT,
  -- bookkeeping
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Removed**: `pipeline_stage`, `sandbox` (dead columns).

### `tool_calls` (new)

```sql
CREATE TABLE IF NOT EXISTS tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_error INTEGER NOT NULL DEFAULT 0,
  timestamp TEXT,
  input_preview TEXT,             -- first 500 chars of JSON-serialized input
  output_preview TEXT,            -- first 500 chars of JSON-serialized output
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_job ON tool_calls(job_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(name);
```

### `job_subagents` (new)

```sql
CREATE TABLE IF NOT EXISTS job_subagents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  subagent_id TEXT NOT NULL,
  tool_call_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subagents_job ON job_subagents(job_id);
```

### `events` (unchanged)

```sql
-- No changes to schema or write path
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  job_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  tool_name TEXT,
  file_path TEXT,
  data_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### `daily_metrics` (unchanged)

```sql
-- No changes to schema or write path
CREATE TABLE IF NOT EXISTS daily_metrics (
  date TEXT PRIMARY KEY,
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

## Implementation Changes

### 1. `src/dashboard/db.ts`

**`initSchema()`**: Drop all tables, recreate with new schema. Add `tool_calls` and `job_subagents` table creation.

```
DROP TABLE IF EXISTS job_history;
DROP TABLE IF EXISTS tool_calls;
DROP TABLE IF EXISTS job_subagents;
-- then CREATE TABLE statements above
```

Note: `events` and `daily_metrics` are NOT dropped (they accumulate independently and have no schema changes).

**`recordJobCompletion()`**: Expand the input interface and INSERT to cover all new fields. The function signature grows to accept:

```typescript
export function recordJobCompletion(job: {
  id: string;
  status: string;
  model: string;
  reasoning: string;
  cwd: string;
  prompt: string;               // full, no truncation
  summary: string | null;       // full, no truncation
  session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  elapsed_ms: number;
  tokens: {
    input: number;
    output: number;
    context_used_pct: number;
    context_window: number;
  } | null;
  estimated_cost: number | null;
  tool_call_count: number | null;
  failed_tool_calls: number | null;
  primary_tool: string | null;
  files_modified: string[] | null;
  message_count: number | null;
  user_message_count: number | null;
  has_session: boolean;
  reuse_count: number;
  original_prompt: string | null;
  // For bulk insert into tool_calls table
  tool_calls: Array<{
    name: string;
    is_error: boolean;
    timestamp: string | null;
    input_preview: string | null;
    output_preview: string | null;
  }>;
  // For bulk insert into job_subagents table
  subagents: Array<{
    id: string;
    tool_call_count: number;
    message_count: number;
  }>;
})
```

Inside the function:
1. INSERT OR REPLACE into `job_history` with all fields
2. Bulk INSERT into `tool_calls` (delete existing rows for job_id first, then insert)
3. Bulk INSERT into `job_subagents` (same pattern)
4. Upsert `daily_metrics` (unchanged logic)

**New query functions** (for future UI consumption):

```typescript
// Get tool_calls for a specific job
export function getJobToolCalls(jobId: string): ToolCallRecord[]

// Get subagents for a specific job
export function getJobSubagents(jobId: string): SubagentRecord[]

// Search jobs by file path (uses json_each)
export function searchJobsByFile(filePath: string): JobHistoryRecord[]

// Search jobs by tool name
export function searchJobsByTool(toolName: string): JobHistoryRecord[]
```

### 2. `src/dashboard/state.ts`

**`persistJob()`**: Expand to gather all the new data before calling `recordJobCompletion()`. This means:

1. Load the `Job` object for `reuseCount` and `originalPrompt`
2. Load `FullSessionData` (already done for tool counts in `getJobsJson`) for:
   - `session_id`
   - `tool_calls` array (map to summary format with 500-char previews)
   - `messages` array (compute `message_count`, `user_message_count`)
   - Subagents (compute from tool call patterns or session data)
3. Compute `estimated_cost` from tokens + model
4. Pass everything to the enhanced `recordJobCompletion()`

The `persistJob` method currently receives a `JobsJsonEntry` which already has most fields. The gaps are:
- `session_id` — need to load `FullSessionData`
- `tool_calls` details — need `FullSessionData.tool_calls`
- `messages` stats — need `FullSessionData.messages`
- `subagents` — need `FullSessionData` or `SessionData.subagents`
- `reuse_count` / `original_prompt` — need raw `Job` object
- `context_window` — inside `tokens` on `FullSessionData`

### 3. `src/jobs.ts`

No changes to `getJobsJson()`. The runtime data flow stays the same. SQLite persistence is purely a write-side enhancement in `state.ts` + `db.ts`.

---

## What does NOT change

- **`events` table** — schema and write path unchanged
- **`daily_metrics` table** — schema and write path unchanged
- **`getJobsJson()`** — still reads from `.json` files + `.session.jsonl`, not from SQLite
- **Persistence timing** — still on completion/failure only
- **UI components** — no changes in this phase (future work can switch reads to SQLite)
- **Hook events writer** — `recordHookEvent()` unchanged

---

## File change summary

| File | Change |
|---|---|
| `src/dashboard/db.ts` | New schema, enhanced `recordJobCompletion`, new query functions, updated types |
| `src/dashboard/state.ts` | Enhanced `persistJob` to gather full data before writing |

Two files total.

---

## Future work (out of scope)

- Switch dashboard reads from `.jsonl` parsing to SQLite queries
- Add API endpoints for job search/filter backed by SQLite
- Add cost and tool usage charts to the dashboard using `job_history` data
- Retention policy (auto-delete SQLite rows older than N days)
- Export/import of SQLite data
