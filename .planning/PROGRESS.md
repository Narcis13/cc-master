# Dashboard Implementation Progress

> Living checkpoint file. Read this FIRST at the start of every session.
> Strategy reference: `.planning/STRATEGY.md`
> PRD reference: `UI-PROPOSAL.md`
> Wireframes reference: `docs/UI_DESIGN_SPEC.md`

---

## Current Status

**Next session:** Session 7 - Final Polish (optional)
**Last completed:** Session 6 - Analytics + Polish
**Overall progress:** 7 / 7 sessions (feature complete)

---

## Session Log

### Session 0: Foundation — COMPLETE

**Goal:** `cc-agent dashboard` opens a dark-themed page at localhost:3131

**Tasks:**
- [x] Install dependencies (hono, preact, xterm packages)
- [x] Create `src/dashboard/server.ts` (Hono app, static serving, auto-builds UI)
- [x] Create `ui/src/index.tsx` (Preact app shell)
- [x] Create `ui/src/app.tsx` (App component with topbar layout)
- [x] Create `ui/src/styles/theme.css` (dark theme from spec — all CSS vars)
- [x] Set up bun build pipeline (ui/src → ui/dist, inline in server.ts)
- [x] Add `dashboard` command to `src/cli.ts`
- [x] Create `tsconfig.json` (classic JSX with Preact `h` factory)
- [x] Test: server starts and serves page at :3131
- [x] Visual verify: dark-themed page renders correctly in browser
- [ ] Commit

**Notes:**
- Bun.build doesn't follow tsconfig paths, so used classic JSX pragma (`h` from preact) instead of `react-jsx` mode
- Build pipeline is integrated into `startDashboard()` — auto-builds UI on server start
- `serveStatic` from `hono/bun` serves ui/dist, with SPA fallback for client-side routing
- `--port` flag available via CLI args

---

### Session 1: Core Dashboard (Server) — COMPLETE

**Goal:** GET /api/jobs returns live data. SSE pushes updates.

**Tasks:**
- [x] `src/dashboard/state.ts` — fs.watch, in-memory state, EventEmitter
- [x] `src/dashboard/api/jobs.ts` — GET /api/jobs, GET /api/jobs/:id
- [x] `src/dashboard/api/events.ts` — SSE stream (snapshot + deltas + heartbeat)
- [x] `src/dashboard/api/metrics.ts` — GET /api/metrics (aggregate counters)
- [x] Wire routes into server.ts (imports + app.route())
- [x] Test with curl — all endpoints return valid JSON/SSE
- [ ] Commit

**Notes:**
- `DashboardState` uses EventEmitter to broadcast changes; fs.watch debounced at 200ms
- 5s polling interval catches tmux session completions that fs.watch misses
- SSE sends `snapshot` on connect, then `job_created/updated/completed/failed` + `metrics_update` on changes
- 30s heartbeat keeps SSE connections alive
- `streamSSE` from `hono/streaming` handles proper SSE formatting

---

### Session 2: Core Dashboard (UI) — COMPLETE

**Goal:** Browser shows job cards with live SSE updates.

**Tasks:**
- [x] `ui/src/app.tsx` — layout shell with topbar, connection indicator, useJobs hook
- [x] `ui/src/components/Dashboard.tsx` — job grid with filter/sort/search
- [x] `ui/src/components/JobCard.tsx` — status badge, token bar, prompt preview, live elapsed timer
- [x] `ui/src/components/StatusBar.tsx` — aggregate metrics (active/completed/failed/total/tokens)
- [x] `ui/src/hooks/useJobs.ts` — SSE subscription (EventSource, handles all event types)
- [x] `ui/src/lib/api.ts` + `format.ts` — fetch helpers + duration/token/time formatters
- [x] `ui/src/styles/layout.css` — responsive grid, card styles, status colors, animations
- [x] Updated `src/dashboard/server.ts` — copies layout.css to dist, linked in HTML
- [x] Visual verify in browser — dark theme, job card renders, filters work, SSE live
- [ ] Commit

**Notes:**
- SSE hook uses `EventSource` with listeners for snapshot, job_created, job_updated, job_completed, job_failed, metrics_update
- JobCard has live elapsed timer (1s interval) for running jobs
- Filter by status (all/running/pending/completed/failed), sort by recent/status/duration, text search
- Connection dot in topbar (green=connected, red=disconnected)
- Status-colored left borders on cards (blue=running, amber=pending, green=completed, red=failed)
- Pulsing animation on running status dots
- Responsive grid: auto-fill with min 340px columns

---

### Session 3: Terminal Streaming — COMPLETE

**Goal:** Click job → live xterm.js terminal output.

**Tasks:**
- [x] `src/dashboard/terminal-stream.ts` — log file streaming with byte-offset delta detection
- [x] WebSocket endpoint integrated into `src/dashboard/server.ts` via Bun.serve websocket handler
- [x] `ui/src/components/JobDetail.tsx` — detail view (info, prompt, terminal, tokens, files, summary)
- [x] `ui/src/components/TerminalPanel.tsx` — xterm.js wrapper with dark theme colors
- [x] `ui/src/hooks/useTerminal.ts` — WebSocket hook with writer ref pattern
- [x] Client-side routing: hash-based (#/jobs/:id) in app.tsx
- [x] JobCard click → navigates to detail view
- [x] Visual verify: detail view renders, terminal shows ANSI output, back navigation works
- [ ] Commit

**Notes:**
- Terminal streaming reads the `.log` file (written by `script` command) instead of tmux capture-pane — preserves raw ANSI codes that xterm.js renders natively
- TerminalStreamer class tracks byte offset in log file, polls every 500ms, sends deltas as JSON over WebSocket
- WebSocket upgrade handled directly in Bun.serve's fetch handler (not a separate Hono route) since Bun has native WS support
- Used writer ref pattern: useTerminal hook writes to a ref that TerminalPanel sets to `term.write()` after xterm.js initializes
- xterm.css copied to ui/dist during build alongside theme.css and layout.css
- No separate `api/terminal.ts` file needed — WebSocket handler lives in server.ts alongside Hono (simpler)
- Fragment import required for JSX fragments (`<>...</>`) in Preact with classic JSX pragma mode

---

### Session 4: Bidirectional Communication — COMPLETE

**Goal:** Send messages, kill agents, start new agents from UI.

**Tasks:**
- [x] `src/dashboard/api/actions.ts` — POST send/kill/create (3 endpoints)
- [x] `ui/src/components/MessageInput.tsx` — text input + Send button, disabled when not running
- [x] `ui/src/components/NewJobForm.tsx` — modal with prompt, model, reasoning, sandbox, cwd
- [x] Kill confirmation dialog — inline confirm in detail header (Yes, Kill / Cancel)
- [x] Keyboard shortcuts — N (new agent), / (focus search), ? (help modal), Esc (close)
- [x] WebSocket input forwarding — `{ type: 'input', data }` messages forwarded to tmux
- [x] "+ New Agent" button in topbar
- [x] Visual verify: all endpoints tested via curl + Playwright screenshots
- [ ] Commit

**Notes:**
- Actions API mounted at `/api/actions/` (separate from existing `/api/jobs/` read routes)
- WebSocket message handler now parses `{ type: 'input', data }` and calls `sendToJob()`
- Kill button only shows for running jobs; two-step confirm prevents accidental kills
- NewJobForm uses Cmd+Enter / Ctrl+Enter to submit, Esc to close
- Message input disabled with "Agent is not running" placeholder for non-running jobs
- CSS adds btn system (primary, ghost, danger, danger-outline), modal, form elements, shortcut kbd styles

---

### Session 5: Hooks Integration — COMPLETE

**Goal:** Real-time event timeline from Claude Code hooks.

**Tasks:**
- [x] `src/dashboard/hooks-relay.sh` — relay script (copies to `~/.cc-agent/hooks/`)
- [x] `src/dashboard/hooks-manager.ts` — install/remove hooks in `~/.claude/settings.json`
- [x] `src/dashboard/events-reader.ts` — JSONL tail-follow with byte-offset tracking
- [x] `src/dashboard/api/hook-events.ts` — GET /api/hook-events REST endpoint
- [x] Hook events wired into DashboardState + SSE stream (`hook_event` event type)
- [x] `cc-agent setup-hooks` / `cc-agent remove-hooks` CLI commands
- [x] `ui/src/components/Timeline.tsx` — chronological event timeline with filters
- [x] `ui/src/components/NotificationCenter.tsx` — alerts panel with severity/categories
- [x] Topbar navigation (Jobs / Timeline / Alerts) with notification badge
- [x] Activity indicators on job cards (shows latest tool call for running jobs)
- [x] Per-job timeline in JobDetail sidebar
- [x] useJobs hook extended with hookEvents, notifications, read/dismiss actions
- [x] Server starts, UI builds, all endpoints return valid JSON
- [ ] Commit

**Notes:**
- Relay script at `src/dashboard/hooks-relay.sh` gets copied to `~/.cc-agent/hooks/relay-event.sh` on install
- Hooks manager is idempotent — re-running `setup-hooks` skips already installed hooks
- EventsReader uses same byte-offset pattern as TerminalStreamer — only reads new lines
- Notifications generated client-side from job state transitions (no server-side notification state)
- Timeline supports "All / Tools / Lifecycle" filters
- NotificationCenter supports "All / Completions / Errors / Info" filters
- `hook_event` SSE event type added alongside existing job/metrics events
- Activity indicator shows pulsing dot + tool name (e.g. "Using Bash...") on running job cards

---

### Session 6: Analytics + Polish — COMPLETE

**Goal:** Historical data, responsive, split terminals, command palette.

**Tasks:**
- [x] `src/dashboard/db.ts` — bun:sqlite setup (job_history, events, daily_metrics tables)
- [x] Job completion → SQLite auto-record (DashboardState persists on complete/fail)
- [x] `GET /api/metrics/history` — daily metrics by range (7d/30d/90d)
- [x] `GET /api/metrics/jobs` — historical job records
- [x] `ui/src/components/MetricsChart.tsx` — canvas-based charts (Tokens/Jobs/Duration)
- [x] `ui/src/components/SplitTerminal.tsx` — multi-terminal split view (1x1/2x1/2x2 layouts)
- [x] `ui/src/components/CommandPalette.tsx` — Ctrl+K palette with fuzzy search
- [x] `ui/src/components/PipelineView.tsx` — Gantt-style pipeline timeline
- [x] Responsive breakpoints (1200px/1024px/768px/480px)
- [x] Updated topbar navigation (Jobs/Timeline/Alerts/Analytics/Split/Pipeline)
- [x] Visual verify: all views render correctly in browser
- [ ] Commit

**Notes:**
- SQLite DB at `~/.cc-agent/dashboard.db` with WAL mode for concurrent reads
- `recordJobCompletion()` called from DashboardState on `job_completed` and `job_failed` events
- `recordHookEvent()` also persists hook events to SQLite for historical queries
- MetricsChart uses canvas 2D rendering (no chart library deps) with DPR-aware scaling
- Command palette: navigation, new agent, job search, kill actions — keyboard-driven (arrows + enter)
- Split terminal reuses TerminalPanel with job picker chips and grid layout toggles
- Pipeline view shows time-scaled Gantt bars colored by status, clickable to job detail
- Responsive: 4 breakpoints, topbar nav hides on mobile, grid collapses gracefully

---

## Architecture Decisions Made

_Record decisions here as they're made during implementation:_

| Decision | Choice | Session | Why |
|---|---|---|---|
| JSX pragma | Classic `h` + `jsxFactory` in tsconfig (not `react-jsx`) | 0 | Bun.build doesn't resolve tsconfig paths for react/jsx-runtime |
| Build pipeline | Integrated into `startDashboard()`, auto-builds on serve | 0 | Simpler than separate build step, always fresh |
| SSE library | `hono/streaming` `streamSSE` | 1 | Built into Hono, proper SSE formatting, handles cleanup |
| State pattern | EventEmitter singleton with fs.watch + polling | 1 | Simple, no extra deps, handles both file changes and tmux lifecycle |
| SSE client | Native `EventSource` API in useJobs hook | 2 | Browser-native, auto-reconnects, no extra deps |
| CSS approach | Separate layout.css copied to dist (no bundled CSS) | 2 | Simple, no CSS-in-JS deps, follows theme.css pattern from Session 0 |
| State management | Preact useState + SSE events (no signals/stores) | 2 | Sufficient at current scale, avoids extra abstractions |
| Terminal data source | Log file polling (not tmux capture-pane) | 3 | Preserves raw ANSI codes; xterm.js renders them natively |
| WebSocket integration | Bun.serve websocket handler (not separate Hono route) | 3 | Bun has native WS; cleaner than Hono WS adapter |
| Client routing | Hash-based (#/jobs/:id) with useState | 3 | No router dep needed; simple for 2 views |
| Terminal writer | Ref-based writer pattern between hook and component | 3 | Decouples WebSocket lifecycle from xterm.js lifecycle |
| Actions API route | Separate `/api/actions/` Hono sub-app | 4 | Keeps read (jobs) and write (actions) routes cleanly separated |
| Kill UX | Inline two-step confirm (not modal) | 4 | Faster than modal; visible in context of the job header |
| WS input forwarding | Parse JSON `{ type, data }` in message handler | 4 | Matches PRD protocol; extensible for future message types |
| Relay script location | `src/dashboard/hooks-relay.sh` copied to `~/.cc-agent/hooks/` on install | 5 | Script lives in repo for versioning; installed to user's home for hooks to find |
| Event file format | JSONL (one JSON object per line) at `~/.cc-agent/events.jsonl` | 5 | Append-only, easy to tail-follow, matches PRD spec |
| Events reader pattern | Byte-offset tail-follow (same as terminal-stream.ts) | 5 | Proven pattern; only reads new data; handles file truncation |
| Notifications | Client-side generation from job state transitions | 5 | No server-side notification state needed; simpler, stateless |
| Topbar navigation | Hash-based tabs (Jobs / Timeline / Alerts) | 5 | Extends existing hash routing; no new router needed |
| Hook event SSE type | New `hook_event` event type on SSE stream | 5 | Keeps hook events separate from job events; UI can handle independently |
| Historical storage | bun:sqlite with WAL mode | 6 | Built into Bun, zero deps, WAL for concurrent reads during SSE writes |
| Chart rendering | Canvas 2D API (no library) | 6 | Zero deps, DPR-aware, sufficient for bar charts; avoids chart.js/d3 overhead |
| Command palette | Ctrl+K modal with fuzzy filter | 6 | Standard shortcut; lists nav, actions, and jobs; keyboard-driven |
| Split terminal layout | CSS Grid with layout toggles (1x1/2x1/2x2) | 6 | Reuses TerminalPanel; grid auto-adjusts with responsive breakpoints |
| Pipeline view | Absolute-positioned bars in relative container | 6 | Time-proportional widths; clickable to job detail; overflow clipped |
| Responsive strategy | 4 breakpoints (1200/1024/768/480px) | 6 | Progressive collapse: grid → single col, nav hidden on mobile |

## Known Issues

_Track issues discovered during implementation:_

- _(none yet)_

## Files Created

_Track new files as they're created:_

- `.planning/STRATEGY.md` — Implementation strategy
- `.planning/PROGRESS.md` — This file
- `tsconfig.json` — TypeScript config with Preact JSX factory
- `src/dashboard/server.ts` — Hono server + UI build pipeline
- `ui/src/index.tsx` — Preact entry point
- `ui/src/app.tsx` — App shell component
- `ui/src/styles/theme.css` — Dark theme CSS variables
- `src/dashboard/state.ts` — In-memory state manager with fs.watch + EventEmitter
- `src/dashboard/api/jobs.ts` — REST endpoints for job data
- `src/dashboard/api/events.ts` — SSE stream endpoint
- `src/dashboard/api/metrics.ts` — Aggregate metrics endpoint
- `ui/src/lib/format.ts` — Duration, token, time formatters
- `ui/src/lib/api.ts` — Fetch helpers
- `ui/src/hooks/useJobs.ts` — SSE subscription hook (EventSource)
- `ui/src/components/StatusBar.tsx` — Aggregate metrics display
- `ui/src/components/JobCard.tsx` — Job status card with live timer
- `ui/src/components/Dashboard.tsx` — Job grid with filter/sort/search
- `ui/src/styles/layout.css` — Grid layout, card styles, responsive
- `src/dashboard/terminal-stream.ts` — Log file streamer with byte-offset deltas
- `ui/src/hooks/useTerminal.ts` — WebSocket hook for terminal data
- `ui/src/components/TerminalPanel.tsx` — xterm.js wrapper with dark theme
- `ui/src/components/JobDetail.tsx` — Full job detail view with terminal
- `src/dashboard/api/actions.ts` — POST endpoints for send, kill, create jobs
- `ui/src/components/MessageInput.tsx` — Send message input bar
- `ui/src/components/NewJobForm.tsx` — New agent modal form
- `src/dashboard/hooks-relay.sh` — Hook relay bash script
- `src/dashboard/hooks-manager.ts` — Install/remove hooks in ~/.claude/settings.json
- `src/dashboard/events-reader.ts` — JSONL tail-follow reader with byte-offset tracking
- `src/dashboard/api/hook-events.ts` — GET /api/hook-events REST endpoint
- `ui/src/components/Timeline.tsx` — Chronological event timeline
- `ui/src/components/NotificationCenter.tsx` — Alerts panel with severity filtering
- `src/dashboard/db.ts` — bun:sqlite setup + schema (job_history, events, daily_metrics)
- `ui/src/components/MetricsChart.tsx` — Canvas-based analytics charts
- `ui/src/components/SplitTerminal.tsx` — Multi-terminal split view
- `ui/src/components/CommandPalette.tsx` — Ctrl+K command palette
- `ui/src/components/PipelineView.tsx` — Gantt-style pipeline timeline
