# Dashboard Implementation Progress

> Living checkpoint file. Read this FIRST at the start of every session.
> Strategy reference: `.planning/STRATEGY.md`
> PRD reference: `UI-PROPOSAL.md`
> Wireframes reference: `docs/UI_DESIGN_SPEC.md`

---

## Current Status

**Next session:** Session 3 - Terminal Streaming
**Last completed:** Session 2 - Core Dashboard (UI)
**Overall progress:** 3 / 7 sessions

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

### Session 3: Terminal Streaming — PENDING

**Goal:** Click job → live xterm.js terminal output.

**Tasks:**
- [ ] `src/dashboard/terminal-stream.ts` — tmux capture + delta
- [ ] `src/dashboard/api/terminal.ts` — WebSocket endpoint
- [ ] `ui/src/components/JobDetail.tsx` — detail view
- [ ] `ui/src/components/TerminalPanel.tsx` — xterm.js wrapper
- [ ] `ui/src/hooks/useTerminal.ts` — WebSocket hook
- [ ] Client-side routing: /jobs/:id
- [ ] Visual verify with live agent
- [ ] Commit

---

### Session 4: Bidirectional Communication — PENDING

**Goal:** Send messages, kill agents, start new agents from UI.

**Tasks:**
- [ ] `src/dashboard/api/actions.ts` — POST send/kill/create
- [ ] `ui/src/components/MessageInput.tsx`
- [ ] `ui/src/components/NewJobForm.tsx`
- [ ] Kill confirmation dialog
- [ ] Keyboard shortcuts
- [ ] Verify: send message to running agent from browser
- [ ] Commit

---

### Session 5: Hooks Integration — PENDING

**Goal:** Real-time event timeline from Claude Code hooks.

**Tasks:**
- [ ] `~/.cc-agent/hooks/relay-event.sh` — relay script
- [ ] `src/dashboard/hooks-manager.ts` — install/remove
- [ ] `src/dashboard/events.ts` — JSONL tail-follow
- [ ] `--setup-hooks` / `--remove-hooks` CLI commands
- [ ] `ui/src/components/Timeline.tsx`
- [ ] `ui/src/components/NotificationCenter.tsx`
- [ ] Verify with hooks enabled
- [ ] Commit

---

### Session 6: Analytics + Polish — PENDING

**Goal:** Historical data, responsive, split terminals, command palette.

**Tasks:**
- [ ] `src/dashboard/db.ts` — bun:sqlite + schema
- [ ] Job completion → SQLite auto-record
- [ ] `GET /api/metrics/history`
- [ ] `ui/src/components/MetricsChart.tsx`
- [ ] Split-pane multi-terminal view
- [ ] Command palette (Ctrl+K)
- [ ] Responsive breakpoints
- [ ] Pipeline timeline view
- [ ] Final visual verify
- [ ] Commit

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
