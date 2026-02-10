# PRD: Dashboard Refactor — Session Intelligence

## Problem

The cc-agent dashboard currently shows jobs as opaque boxes: status, tokens, elapsed time, terminal output. When an agent finishes (or fails), the user has almost no insight into *what it actually did*. The session JSONL file — which contains every tool call, every message, every file edit, every bash command, and every piece of thinking — is now archived per-job via the hooks bridge, but none of this data surfaces in the UI.

A user running 5 agents in parallel needs to quickly answer:
- What did this agent actually do? (not "it completed" — what tools, what files, what commands)
- Was it efficient? (how many tool calls, how much context used, any failed tools)
- Where did it go wrong? (which tool call failed, what was the error)
- How does this agent compare to others? (cost, speed, tool usage patterns)
- Can I replay the conversation? (see the full user/assistant exchange, not just terminal noise)

## Data Sources (What We Have)

### Already archived per job (`~/.cc-agent/jobs/`)

| File | Content | Status |
|------|---------|--------|
| `{id}.json` | Job metadata (status, model, prompt, timing) | Served via API |
| `{id}.log` | Raw terminal output (ANSI + `script` capture) | Served via WebSocket |
| `{id}.prompt` | Original prompt text | Not served |
| `{id}.session.jsonl` | **Full session transcript** (NEW — via Stop hook) | **Not served** |
| `{id}-subagents/` | **Subagent transcripts** (NEW) | **Not served** |

### Inside the session JSONL (per record)

```
{ type: "user",      message: { role: "user", content: [...] },      timestamp }
{ type: "assistant",  message: { role: "assistant", content: [...] }, timestamp }
{ type: "system",     subtype: "local_command", content, level }
{ type: "file-history-snapshot", snapshot: { trackedFileBackups } }
```

Each assistant message `content` array contains blocks:

| Block type | Contains |
|-----------|----------|
| `text` | Claude's text response (markdown) |
| `thinking` | Extended thinking / reasoning (when enabled) |
| `tool_use` | Tool name + full input (Bash command, file path, search query, etc.) |
| `tool_result` (in user turn) | Full tool output (command stdout, file contents, search results) |

### Parsed by `parseFullSession()` (available now)

```typescript
{
  tokens: { input, output, context_window, context_used_pct },
  files_modified: string[],
  summary: string,
  tool_calls: [{ name, input, output, timestamp }],
  messages: [{ role, text, timestamp }],
  model: string,
  session_id: string,
  duration_ms: number,
}
```

### From hook events (already in SQLite + SSE)

```typescript
{
  timestamp, session_id, event_type, tool_name,
  job_id, cwd, transcript_path, data: { raw hook input }
}
```

---

## Design Principles

1. **Session replay over terminal scraping.** The JSONL is structured data; the terminal log is a noisy artifact of the TUI. Prefer rendering parsed content.
2. **Progressive disclosure.** Overview first (what happened), then drill into details (individual tool calls, thinking blocks).
3. **Comparison is the killer feature.** Side-by-side jobs, aggregated tool usage patterns, cost breakdowns.
4. **Zero new dependencies.** The UI already renders with Preact + Canvas + CSS. Keep it that way.
5. **API-first.** Every new UI view is backed by a dedicated API endpoint returning structured JSON.

---

## Scope

### Phase 1: Session Data API + Enriched Job Detail (Core)

The minimum viable refactor — surface all the new session data.

#### 1.1 New API Endpoint: `GET /api/jobs/:id/session`

Returns the full parsed session data for a completed job.

```json
{
  "job_id": "abc123",
  "session_id": "uuid",
  "model": "claude-opus-4-20250514",
  "duration_ms": 142000,
  "tokens": { "input": 45000, "output": 12000, "context_window": 200000, "context_used_pct": 28.5 },
  "messages": [
    { "role": "user", "text": "Review this code...", "timestamp": "..." },
    { "role": "assistant", "text": "I'll analyze the code...", "timestamp": "..." }
  ],
  "tool_calls": [
    { "name": "Glob", "input": { "pattern": "src/**/*.ts" }, "output": "...", "timestamp": "..." },
    { "name": "Read", "input": { "file_path": "/src/jobs.ts" }, "output": "...", "timestamp": "..." },
    { "name": "Bash", "input": { "command": "bun test" }, "output": "...", "timestamp": "..." }
  ],
  "files_modified": ["src/jobs.ts", "src/config.ts"],
  "summary": "Reviewed code and found...",
  "tool_stats": {
    "total_calls": 24,
    "by_tool": { "Read": 8, "Glob": 5, "Bash": 4, "Edit": 3, "Grep": 2, "Write": 1, "Task": 1 },
    "failed_calls": 1,
    "unique_files_read": 12
  },
  "subagents": [
    { "id": "agent-xxx", "tool_calls": 15, "messages": 4 }
  ]
}
```

Implementation: Add route in `src/dashboard/api/jobs.ts` calling `getJobSession()` from `jobs.ts`.

#### 1.2 Refactored Job Detail Page (`#/jobs/:id`)

Replace the current simple layout with a tabbed interface:

**Tab: Overview** (default)
- Status header (unchanged)
- Info grid: model, reasoning, sandbox, directory, timing (unchanged)
- **NEW: Session Stats card** — total tool calls, breakdown by tool (bar chart), failed count, files read vs. modified, context usage gauge
- **NEW: Cost estimate** — based on token counts and model (opus vs sonnet pricing)
- Summary text
- Modified files list (clickable — jumps to tool call that modified it)

**Tab: Conversation**
- Full rendered conversation: user prompts and assistant responses
- Markdown rendering for assistant text (code blocks, headers, lists)
- Tool call blocks inline (collapsed by default):
  - Tool name + icon
  - Input summary (e.g., "Read: src/jobs.ts", "Bash: bun test", "Glob: src/**/*.ts")
  - Expandable to show full input + output
  - Color-coded: green for success, red for failures
  - Duration (if available from timestamps)
- Thinking blocks (collapsed by default, expandable)
- Timestamp gutter on the left

**Tab: Tools**
- Full tool call timeline (vertical list)
- Each entry shows: timestamp, tool name, input summary, status (success/fail)
- Click to expand: full input, full output (scrollable)
- Filter by tool name (checkboxes)
- Filter by status (all / success / failed)
- Aggregate stats at top: total calls, duration, tool distribution pie/bar

**Tab: Terminal** (existing)
- xterm.js terminal (current implementation, unchanged)
- Message input for running jobs (unchanged)

**Tab: Events** (existing hook events, moved from sidebar)
- Timeline component (existing, moved from sidebar to its own tab)
- Richer: now shows transcript_path in event data

#### 1.3 Enriched Job Cards on Dashboard

Update `JobCard.tsx` to show richer data when available:

- **Tool call count badge** — e.g., "24 tools" in small text
- **Primary tool indicator** — show the most-used tool name (e.g., "Mostly: Read")
- **Failed tool indicator** — red dot if any tool calls failed
- **Cost estimate badge** — e.g., "$0.42" (based on model + tokens)

#### 1.4 Session Data Hook: `useSession(jobId)`

New Preact hook that lazily fetches session data:

```typescript
function useSession(jobId: string) {
  // Fetches /api/jobs/:id/session on mount
  // Returns: { session, loading, error }
  // Caches per jobId to avoid refetching on tab switches
}
```

---

### Phase 2: Comparison & Cross-Job Analysis

#### 2.1 Job Comparison View (`#/compare/:id1/:id2`)

Side-by-side comparison of two completed jobs:

| Metric | Job A | Job B |
|--------|-------|-------|
| Duration | 2m 14s | 4m 01s |
| Input tokens | 45K | 89K |
| Output tokens | 12K | 23K |
| Cost | $0.42 | $0.91 |
| Tool calls | 24 | 47 |
| Files modified | 3 | 7 |
| Context used | 28% | 62% |

Tool usage comparison bar chart. Conversation length comparison. Files overlap (Venn-style or list diff).

Entry point: checkbox selection on Dashboard job cards, "Compare" button appears when exactly 2 selected.

#### 2.2 Aggregate Analytics Enhancement

Extend the existing `#/analytics` page:

- **Tool Usage Over Time** — stacked area chart showing tool distribution across jobs
- **Cost Tracking** — cumulative cost per day/week (by model tier)
- **Efficiency Metrics** — tokens per tool call, tools per file modified, context usage distribution
- **Model Comparison** — if user runs both opus and sonnet jobs, show side-by-side metrics

#### 2.3 Enhanced Pipeline View

Extend `#/pipeline` Gantt chart to show tool calls as sub-bars within each job bar. Color-coded by tool type. Shows which agent was doing what when — critical for understanding parallel agent execution.

---

### Phase 3: Session Replay & Deep Inspection

#### 3.1 Session Replay Mode

A mode in the Conversation tab that replays the session step-by-step:

- Play/pause/speed controls
- Steps through messages and tool calls chronologically
- Shows tool calls appearing in real-time with a typing effect on the output
- Progress bar showing position in the session
- Jump to any point by clicking the progress bar

Use case: reviewing what an agent did, training, debugging. Like a flight recorder playback.

#### 3.2 Thinking Block Explorer

For sessions with extended thinking enabled:

- Dedicated section showing Claude's reasoning process
- Collapsed by default (can be large)
- Searchable (grep within thinking)
- Linked to the tool call or response that followed

#### 3.3 File Change Viewer

For files modified by the agent:

- Show a unified diff view (before → after) for each modified file
- Reconstructed from the Edit/Write tool call inputs
- Syntax-highlighted code blocks
- Jump to the tool call that made the change

#### 3.4 Subagent Explorer

When a job spawns Task subagents:

- Tree view showing main agent → subagents
- Click a subagent to see its full session data (same tabs: overview, conversation, tools)
- Aggregate stats: total tools across all agents, total tokens
- Timeline showing parent and child agents in parallel

---

## API Changes Summary

### New Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/jobs/:id/session` | Full parsed session data (FullSessionData) |
| GET | `/api/jobs/:id/session/tools` | Just tool calls (for lazy loading) |
| GET | `/api/jobs/:id/session/messages` | Just messages (for lazy loading) |
| GET | `/api/jobs/:id/session/subagents` | Subagent session summaries |
| GET | `/api/jobs/compare?ids=a,b` | Side-by-side comparison data |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /api/jobs` | Add `tool_call_count`, `has_session`, `estimated_cost` to each job entry |
| `GET /api/jobs/:id` | Add `has_session: boolean` field |
| `GET /api/metrics` | Add `totalEstimatedCost`, `avgToolCallsPerJob` |
| `GET /api/metrics/history` | Add `daily_cost`, `daily_tool_calls` columns |

### Modified Types

```typescript
// JobsJsonEntry — add fields
type JobsJsonEntry = {
  // ... existing fields ...
  tool_call_count: number | null;     // NEW
  has_session: boolean;                // NEW
  estimated_cost: number | null;       // NEW (USD)
  failed_tool_calls: number | null;    // NEW
};
```

---

## UI Component Changes

### New Components

| Component | Purpose |
|-----------|---------|
| `SessionOverview.tsx` | Stats cards + tool distribution chart for session |
| `ConversationView.tsx` | Rendered conversation with inline tool calls |
| `ToolCallList.tsx` | Filterable list of all tool calls with expand/collapse |
| `ToolCallItem.tsx` | Single tool call: name, input summary, expandable detail |
| `SessionTabs.tsx` | Tab container for the job detail page |
| `CostBadge.tsx` | Token-based cost estimate display |
| `CompareView.tsx` | Side-by-side job comparison (Phase 2) |
| `SessionReplay.tsx` | Playback controls for session replay (Phase 3) |

### Modified Components

| Component | Changes |
|-----------|---------|
| `JobDetail.tsx` | Replace flat layout with `SessionTabs`. Load session data lazily. |
| `JobCard.tsx` | Add tool count badge, cost estimate, failed tool indicator |
| `Dashboard.tsx` | Add job selection for comparison. Show aggregate tool stats in status bar. |
| `MetricsChart.tsx` | Add tool usage + cost chart types (Phase 2) |
| `PipelineView.tsx` | Add tool call sub-bars within job bars (Phase 2) |

### New Hooks

| Hook | Purpose |
|------|---------|
| `useSession(jobId)` | Lazy-fetch session data, cache per job |
| `useCompare(ids)` | Fetch comparison data for two jobs (Phase 2) |

---

## Data Schema Changes

### SQLite: `job_history` table — add columns

```sql
ALTER TABLE job_history ADD COLUMN tool_call_count INTEGER DEFAULT NULL;
ALTER TABLE job_history ADD COLUMN failed_tool_calls INTEGER DEFAULT NULL;
ALTER TABLE job_history ADD COLUMN estimated_cost REAL DEFAULT NULL;
ALTER TABLE job_history ADD COLUMN has_session INTEGER DEFAULT 0;
```

### SQLite: `daily_metrics` table — add columns

```sql
ALTER TABLE daily_metrics ADD COLUMN total_tool_calls INTEGER DEFAULT 0;
ALTER TABLE daily_metrics ADD COLUMN total_estimated_cost REAL DEFAULT 0;
```

---

## Cost Estimation Formula

Simple token-based cost (updatable as pricing changes):

```typescript
const PRICING = {
  "opus": { input_per_1m: 15, output_per_1m: 75 },
  "sonnet": { input_per_1m: 3, output_per_1m: 15 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const tier = model.includes("opus") ? "opus" : "sonnet";
  const rates = PRICING[tier];
  return (inputTokens / 1_000_000) * rates.input_per_1m
       + (outputTokens / 1_000_000) * rates.output_per_1m;
}
```

---

## Implementation Order

### Sprint 1: API + Data Foundation
1. Add `GET /api/jobs/:id/session` endpoint
2. Add `has_session`, `tool_call_count`, `estimated_cost` to job listing API
3. SQLite schema migration (add columns)
4. Update `recordJobCompletion()` to persist session stats
5. `useSession()` hook on frontend

### Sprint 2: Job Detail Refactor
1. `SessionTabs` component (tab container)
2. `SessionOverview` component (stats + tool chart)
3. `ConversationView` component (messages + inline tools)
4. `ToolCallList` + `ToolCallItem` components
5. Integrate into `JobDetail` page
6. Cost estimation display

### Sprint 3: Enriched Dashboard
1. Update `JobCard` with tool count, cost, failure indicators
2. Update `StatusBar` with aggregate stats
3. Update `Dashboard` with job selection for comparison
4. CSS for all new components

### Sprint 4: Comparison & Analytics (Phase 2)
1. `CompareView` component + route
2. Comparison API endpoint
3. Analytics page: tool usage over time, cost tracking
4. Pipeline view enhancement

### Sprint 5: Replay & Deep Inspection (Phase 3)
1. `SessionReplay` component
2. File change viewer
3. Subagent explorer
4. Thinking block viewer

---

## Success Criteria

**Phase 1 complete when:**
- User can click any completed job and see the full conversation with tool calls
- Tool calls show input/output with expand/collapse
- Session stats visible: total tools, distribution, files, cost
- Job cards show tool count and cost at a glance
- API serves structured session data for any job with an archived transcript

**Phase 2 complete when:**
- User can select 2 jobs and see a side-by-side comparison
- Analytics page shows tool usage trends and cost over time
- Pipeline view shows tool activity within job bars

**Phase 3 complete when:**
- User can replay any session step-by-step
- File diffs are reconstructable from tool calls
- Subagent sessions are explorable from the parent job

---

## Non-Goals

- **Real-time session parsing for running jobs.** We only parse the transcript on Stop/SessionEnd. Running jobs use the existing terminal stream.
- **Editing or re-running sessions.** This is read-only inspection.
- **External integrations.** No Slack, GitHub, or other service hooks.
- **Authentication.** Dashboard is local-only (localhost:3131). No auth needed.
- **Custom theming.** Stick with the existing GitHub dark theme.
