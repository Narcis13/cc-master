# Dashboard Implementation Strategy: Vertical Sprint Sessions

> The optimal coding workflow for building the CC-Agent Monitoring Dashboard.
> Born from deep introspection on agent strengths, weaknesses, and what actually works.
> Reference: `UI-PROPOSAL.md` (the PRD) and `docs/UI_DESIGN_SPEC.md` (wireframes).

---

## Philosophy

Every session builds a **complete vertical slice** - from data layer through server to UI - that you can see working in the browser before the session ends. No session leaves half-built infrastructure.

---

## Agent Self-Assessment (Why This Approach)

### Strengths to Leverage

- Full codebase fits in context (~9K tokens - trivial to hold)
- Strong at writing complete TypeScript in one pass
- Existing patterns are clean - easy to extend
- Server-side code has immediate feedback (curl, bun run)
- Deep knowledge of Hono, Preact, WebSocket/SSE, xterm.js

### Weaknesses to Mitigate

| Weakness | Mitigation |
|---|---|
| Can't see the UI | Use browser MCP tools for visual verification after each session |
| Lose 100% context between sessions | PROGRESS.md checkpoint file - read first every session |
| Large implementations degrade quality | One phase per session, focused vertical slices |
| Complex CSS without visual feedback | Build theme system once in Session 0, reference spec colors exactly |

---

## Why Other Approaches Fall Short

| Approach | Problem |
|---|---|
| **cc-orchestrator (multi-agent)** | Dashboard components are tightly coupled. Server types flow into client. Two agents can't build `/api/jobs` and `<JobCard>` independently without a shared type contract that doesn't exist yet. Coordination cost > parallelism gain. |
| **LPL/GSD full pipeline** | The PRD already exists (UI-PROPOSAL.md, 1,270 lines). Research/planning phases are ceremony on top of a spec that's already exhaustively detailed. |
| **One massive session** | UI-PROPOSAL + existing code + new server + new UI + iterations = context explosion. Quality degrades past ~100K tokens. |
| **Horizontal layers (all APIs then all UI)** | Integration problems discovered late. Can't test or see anything until both layers exist. |

---

## Session Structure (Repeat for Each Phase)

```
1. ORIENT        Read PROGRESS.md + last checkpoint (30 seconds)
2. REFERENCE     Read relevant UI-PROPOSAL.md sections for this phase
3. IMPLEMENT     Build the vertical slice (bulk of session)
4. TEST SERVER   curl/bun verification of APIs
5. BUILD UI      bun build the frontend
6. VISUAL VERIFY Open browser, screenshot, iterate if needed
7. COMMIT        Atomic commit of working state
8. CHECKPOINT    Update PROGRESS.md with what's done + what's next
```

---

## The Sessions

### Session 0: Foundation

**Goal:** `cc-agent dashboard` opens a page in the browser. Nothing else.

**This is the most critical session.** If the build pipeline is broken, everything downstream is broken. This is the riskiest session - everything else is feature work on a working base.

```
Tasks:
├── bun add hono preact @xterm/xterm @xterm/addon-fit @xterm/addon-webgl @xterm/addon-search
├── Create src/dashboard/server.ts       - Hono app, static serving, single route
├── Create ui/src/index.tsx              - Preact app shell, minimal "hello world"
├── Create ui/src/styles/theme.css       - Dark theme CSS variables from spec
├── Set up bun build pipeline            - ui/src/ → ui/dist/ (built assets)
├── Add "dashboard" command to cli.ts    - starts Hono server, serves ui/dist/
├── Test: bun run src/cli.ts dashboard   - opens http://localhost:3131
└── Update PROGRESS.md
```

**Success criteria:** Browser shows a dark-themed page at localhost:3131 with "CC-Agent Dashboard" heading.

**UI-PROPOSAL.md sections to reference:**
- Section 5: Technology Stack (file structure, package selection)
- Section 6: Color Theme CSS variables

---

### Session 1: Core Dashboard (Server)

**Goal:** REST API returns live job data. SSE pushes status updates to connected clients.

```
Tasks:
├── src/dashboard/state.ts           - fs.watch on jobs dir, in-memory job state
├── src/dashboard/api/jobs.ts        - GET /api/jobs, GET /api/jobs/:id (wraps existing getJobsJson)
├── src/dashboard/api/events.ts      - GET /api/events (SSE stream: snapshot + deltas)
├── src/dashboard/api/metrics.ts     - GET /api/metrics (aggregate counters)
├── Wire routes into server.ts
├── Test: curl localhost:3131/api/jobs | jq
├── Test: curl -N localhost:3131/api/events (see SSE stream)
└── Update PROGRESS.md
```

**Success criteria:** `curl /api/jobs` returns JSON. SSE stream sends snapshot on connect and updates when job files change.

**UI-PROPOSAL.md sections to reference:**
- Section 3: Data Model (MonitoredJob, DashboardMetrics interfaces)
- Section 7: Real-time Architecture (SSE protocol)
- Section 9: API Reference (REST endpoints)

---

### Session 2: Core Dashboard (UI)

**Goal:** Browser shows job cards with live status updates via SSE.

```
Tasks:
├── ui/src/app.tsx                       - Layout shell with sidebar + topbar
├── ui/src/components/Dashboard.tsx       - Job grid with filter/sort
├── ui/src/components/JobCard.tsx         - Status badge, token bar, prompt preview, actions
├── ui/src/components/StatusBar.tsx       - Aggregate metrics (running/complete/failed/tokens)
├── ui/src/hooks/useJobs.ts              - SSE subscription hook (EventSource)
├── ui/src/lib/api.ts                    - Fetch helpers
├── ui/src/lib/format.ts                 - Duration, token count, date formatters
├── ui/src/styles/layout.css             - Grid/flexbox layout
├── VISUAL VERIFY: open browser, check job cards render with live data
└── Update PROGRESS.md
```

**Success criteria:** Dashboard shows all jobs as cards with colored status badges, auto-updates when job status changes.

**UI-PROPOSAL.md sections to reference:**
- Section 6: View 1 (Dashboard Overview wireframe + component table)
- Section 6: Keyboard Shortcuts table
- docs/UI_DESIGN_SPEC.md: Section 2 (Dashboard component list, refresh strategy, interaction patterns)

---

### Session 3: Terminal Streaming

**Goal:** Click a job, see its live terminal output rendered in xterm.js.

```
Tasks:
├── src/dashboard/terminal-stream.ts     - tmux capture polling + delta computation
├── src/dashboard/api/terminal.ts        - WebSocket endpoint /api/terminal/:id
├── ui/src/components/JobDetail.tsx       - Full detail view (info, prompt, token gauge)
├── ui/src/components/TerminalPanel.tsx   - xterm.js wrapper with ANSI rendering
├── ui/src/hooks/useTerminal.ts          - WebSocket hook for terminal data
├── Client-side routing: /jobs/:id → JobDetail
├── VISUAL VERIFY: start a cc-agent job, watch output stream in browser
└── Update PROGRESS.md
```

**Success criteria:** Click any running job card → see live terminal output in xterm.js. Output updates in real-time. Completed jobs show log file content.

**UI-PROPOSAL.md sections to reference:**
- Section 6: View 2 (Agent Detail wireframe)
- Section 7: WebSocket Protocol (client/server messages)
- Section 7: Server-Side Terminal Streaming (TerminalStreamer class)
- docs/UI_DESIGN_SPEC.md: Section 3 (Agent Detail) + Section 5 (Terminal Panel, ANSI rendering)

---

### Session 4: Bidirectional Communication

**Goal:** Full agent lifecycle from the browser - send messages, kill agents, start new ones.

```
Tasks:
├── src/dashboard/api/actions.ts         - POST /api/jobs/:id/send, POST /api/jobs/:id/kill
├── POST /api/jobs                       - Start new agent (wraps startJob)
├── ui/src/components/MessageInput.tsx   - Text input with send button per job
├── ui/src/components/NewJobForm.tsx     - Modal: prompt, model, reasoning, sandbox, files, map
├── Kill confirmation dialog
├── Keyboard shortcuts (N=new, R=refresh, 1-9=select, /=search, ?=help)
├── VERIFY: send message to running agent from browser, start new agent from browser
└── Update PROGRESS.md
```

**Success criteria:** Can start a new agent, send it a follow-up message, and kill it - all from the dashboard UI.

**UI-PROPOSAL.md sections to reference:**
- Section 6: View 5 (New Agent Form wireframe)
- Section 9: API Reference (POST endpoints)
- docs/UI_DESIGN_SPEC.md: Appendix B (New Agent Modal), Appendix C (Kill confirmation)

---

### Session 5: Hooks Integration

**Goal:** Real-time event timeline showing every tool call, file edit, and agent decision.

```
Tasks:
├── Create ~/.cc-agent/hooks/relay-event.sh  - Hook relay script (from spec)
├── src/dashboard/hooks-manager.ts           - Install/remove hooks in ~/.claude/settings.json
├── src/dashboard/events.ts                  - JSONL tail-follow reader
├── Add --setup-hooks / --remove-hooks to dashboard CLI command
├── ui/src/components/Timeline.tsx           - Chronological event timeline
├── ui/src/components/NotificationCenter.tsx - Alert panel (completions, errors, conflicts)
├── Tool call activity indicators on job cards
├── VERIFY: run agent with hooks enabled, see events populate timeline
└── Update PROGRESS.md
```

**Success criteria:** Timeline shows real-time tool calls as they happen. Notifications fire on job completion/failure.

**UI-PROPOSAL.md sections to reference:**
- Section 4: Claude Code Hooks Integration (full section - architecture, relay script, hook config)
- Section 6: View 6 (Notification Center wireframe)
- docs/UI_DESIGN_SPEC.md: Section 6 (Notification types, delivery)

---

### Session 6: Analytics + Polish

**Goal:** Historical data, responsive design, split-pane terminals, command palette.

```
Tasks:
├── src/dashboard/db.ts              - bun:sqlite setup + schema from spec
├── Job completion → SQLite persistence (auto-record)
├── src/dashboard/api/metrics.ts     - GET /api/metrics/history (daily/weekly)
├── ui/src/components/MetricsChart.tsx - Token usage + duration charts (Canvas-based)
├── Split-pane multi-terminal view (View 3 from spec)
├── Command palette (Ctrl+K) with fuzzy search
├── Responsive breakpoints (3col → 2col → 1col → mobile)
├── Pipeline timeline/Gantt view (View 4 from spec)
├── Desktop notifications (Notification API)
├── VISUAL VERIFY: check responsive behavior, test split terminals
└── FINAL PROGRESS.md update
```

**Success criteria:** Full dashboard feature-complete per UI-PROPOSAL.md Phase 1-5.

**UI-PROPOSAL.md sections to reference:**
- Section 3: Historical Data (SQLite schema)
- Section 6: View 3 (Multi-Terminal Split) + View 4 (Pipeline Timeline)
- Section 8: Implementation Roadmap Phase 5-6
- docs/UI_DESIGN_SPEC.md: Section 4 (Multi-Instance), Section 7 (Settings), Section 8 (Navigation Shell)

---

## When to Use cc-agent Agents Within Sessions

Most work stays with the primary Claude instance. But spawn cc-agents for genuinely independent tasks:

| Session | Parallelizable Task | Agent Type |
|---|---|---|
| Session 5 | Write relay-event.sh while building JSONL reader | workspace-write |
| Session 6 | SQLite schema + seed data while building metrics API | workspace-write |
| Any session | Post-phase review of new code | read-only |
| Any session | Research a library API (Hono SSE, xterm.js options) | read-only |

---

## File Locations

```
.planning/
├── STRATEGY.md          ← This file (reference, don't modify)
└── PROGRESS.md          ← Living checkpoint (update every session)

src/dashboard/           ← Server-side dashboard code
├── server.ts            ← Hono app, route mounting, static serving
├── state.ts             ← In-memory state, fs.watch
├── terminal-stream.ts   ← tmux capture + delta + WebSocket push
├── events.ts            ← SSE broadcasting, JSONL tail
├── hooks-manager.ts     ← Install/remove Claude Code hooks
├── db.ts                ← bun:sqlite historical data
└── api/
    ├── jobs.ts          ← REST: GET /api/jobs, GET /api/jobs/:id
    ├── events.ts        ← SSE: GET /api/events
    ├── terminal.ts      ← WS: /api/terminal/:id
    ├── metrics.ts       ← REST: GET /api/metrics
    └── actions.ts       ← REST: POST send/kill/create

ui/
├── src/
│   ├── index.tsx        ← Preact entry point
│   ├── app.tsx          ← Layout shell, routing
│   ├── components/      ← All UI components
│   ├── hooks/           ← useJobs, useTerminal, useMetrics
│   ├── lib/             ← api client, formatters
│   └── styles/          ← theme.css, layout.css
└── dist/                ← Built output (gitignored)
```

---

## Key Technical Decisions (Pre-Made)

These are locked in from the UI-PROPOSAL.md. Don't re-evaluate.

| Decision | Choice | Rationale |
|---|---|---|
| Server framework | Hono on Bun | Native Bun adapter, 14KB, built-in WS/SSE |
| UI framework | Preact | 3KB, React-compatible, fast |
| Terminal emulation | xterm.js | Industry standard, full ANSI support |
| Real-time (status) | SSE via EventSource | Auto-reconnects, simpler than WS for one-way |
| Real-time (terminal) | WebSocket | Bidirectional needed for terminal I/O |
| Historical storage | bun:sqlite | Built into Bun, zero deps |
| Build tool | bun build | Built into Bun, no webpack/Vite needed |
| Styling | CSS variables + minimal CSS | No Tailwind dep, matches spec exactly |
| State management | Preact signals or simple useState | No Zustand needed at this scale |
| Port | 3131 | Non-conflicting default |

---

## Quality Gates

Before marking any session complete:

| Check | How |
|---|---|
| Server starts without errors | `bun run src/cli.ts dashboard` |
| API returns valid JSON | `curl localhost:3131/api/jobs \| jq` |
| UI builds without errors | `bun build ui/src/index.tsx` succeeds |
| UI renders in browser | Visual check via browser MCP or manual |
| No TypeScript errors | `bun run typecheck` (if configured) |
| Atomic commit made | `git log -1` shows the session's work |
| PROGRESS.md updated | Checkpoint reflects reality |
