# Dashboard Implementation Progress

> Living checkpoint file. Read this FIRST at the start of every session.
> Strategy reference: `.planning/STRATEGY.md`
> PRD reference: `UI-PROPOSAL.md`
> Wireframes reference: `docs/UI_DESIGN_SPEC.md`

---

## Current Status

**Next session:** Session 1 - Core Dashboard (Server)
**Last completed:** Session 0 - Foundation
**Overall progress:** 1 / 7 sessions

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

### Session 1: Core Dashboard (Server) — PENDING

**Goal:** GET /api/jobs returns live data. SSE pushes updates.

**Tasks:**
- [ ] `src/dashboard/state.ts` — fs.watch, in-memory state
- [ ] `src/dashboard/api/jobs.ts` — REST endpoints
- [ ] `src/dashboard/api/events.ts` — SSE stream
- [ ] `src/dashboard/api/metrics.ts` — aggregate metrics
- [ ] Wire routes into server.ts
- [ ] Test with curl
- [ ] Commit

---

### Session 2: Core Dashboard (UI) — PENDING

**Goal:** Browser shows job cards with live SSE updates.

**Tasks:**
- [ ] `ui/src/app.tsx` — layout shell, sidebar, routing
- [ ] `ui/src/components/Dashboard.tsx` — job grid
- [ ] `ui/src/components/JobCard.tsx` — status card
- [ ] `ui/src/components/StatusBar.tsx` — aggregate metrics
- [ ] `ui/src/hooks/useJobs.ts` — SSE subscription
- [ ] `ui/src/lib/api.ts` + `format.ts` — helpers
- [ ] `ui/src/styles/layout.css` — grid layout
- [ ] Visual verify in browser
- [ ] Commit

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
