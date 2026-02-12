# Autonomous Orchestrator: Gap Analysis & Closure Plan

**Branch**: `experimental`
**Date**: 2026-02-12
**Methodology**: 6-agent parallel codebase sweep against PRD spec

---

## Executive Summary

The autonomous orchestrator implementation is **~93% complete**. All core modules, API routes, CLI commands, database schema, and UI components exist and are functional. The remaining gaps fall into 5 categories:

| Category | Gaps Found | Severity |
|----------|-----------|----------|
| Real-time SSE Events | 4 missing event types + 2 missing UI listeners | P0 - Critical |
| Integration Wiring | Pulse API restart missing state param | P0 - Critical |
| UI Polish & UX | Activity feed, error toasts, keyboard shortcuts | P1 - Important |
| Documentation | CLAUDE.md outdated, SKILL.md missing orchestrator CLI | P1 - Important |
| Robustness | idle_seconds metric, edge cases | P2 - Polish |

---

## Part 1: Critical Gaps (P0)

### Gap 1.1: Missing SSE Event Types in StateEvent

**Location**: `src/dashboard/state.ts` lines 15-24

**Current state**: Only 2 orchestrator events exist:
- `orchestrator_status_change`
- `orchestrator_context_warn`

**Missing per PRD 5.2**:
```typescript
| { type: "queue_update"; task: QueueTask; operation: "added" | "removed" | "status_changed" }
| { type: "trigger_fired"; trigger_id: number; trigger_name: string; action: string }
| { type: "approval_required"; approval: PendingApproval }
| { type: "pulse_tick"; summary: PulseSummary }
```

**Impact**: Without these events, the UI must poll every 3-5s for queue/trigger/approval changes instead of receiving instant updates. The dashboard feels sluggish and wastes bandwidth.

**Fix plan**:
1. Add 4 event types to `StateEvent` union in `state.ts`
2. Emit `queue_update` from db.ts helper functions (addQueueTask, updateQueueTask, removeQueueTask) via a callback/emitter pattern
3. Emit `trigger_fired` from `triggers.ts:fireTrigger()` at line 204
4. Emit `approval_required` from `triggers.ts:fireTrigger()` at line 215 (confirm path)
5. Emit `pulse_tick` from `pulse.ts:pulseTick()` at end of tick (line 161)

**Estimated effort**: ~60 lines across 4 files

---

### Gap 1.2: Pulse API Restart Missing DashboardState Parameter

**Location**: `src/dashboard/api/pulse.ts` line 10

**Current code**: `startPulse()` called without argument
**Required**: `startPulse(getDashboardState())`

**Impact**: When pulse is restarted via API (`POST /api/pulse/start`), event-based triggers (job_completed, job_failed) won't fire because pulse has no state reference to subscribe to.

**Fix plan**:
1. Import `getDashboardState` from `../state.ts`
2. Pass it to `startPulse()` call

**Estimated effort**: 2 lines

---

### Gap 1.3: UI Not Listening for Orchestrator SSE Events

**Location**: `ui/src/hooks/useJobs.ts`

**Current state**: EventSource listeners exist for `snapshot`, `job_*`, `metrics_update`, `hook_event` but NOT for `orchestrator_status_change` or `orchestrator_context_warn`.

**Impact**: OrchestratorPanel relies on 3s polling for status changes. Context warnings during auto-clear won't propagate instantly to UI.

**Fix plan**:
1. Add `addEventListener("orchestrator_status_change", ...)` in useJobs.ts
2. Add `addEventListener("orchestrator_context_warn", ...)` in useJobs.ts
3. Expose these events via the hook's return value or a dedicated `useOrchestrator` hook
4. When the 4 new SSE events from Gap 1.1 are added, also add listeners for `queue_update`, `trigger_fired`, `approval_required`, `pulse_tick`
5. Update components to react to SSE events instead of (or in addition to) polling

**Estimated effort**: ~40 lines in useJobs.ts or new useOrchestrator.ts hook

---

## Part 2: Important Gaps (P1)

### Gap 2.1: No Activity Feed in Dashboard UI

**Current state**: The `orchestrator_activity` table and `getActivityLog()` API exist and work. The API route `GET /api/triggers/activity` returns activity log entries. But **no UI component renders this data**.

**What's needed**: An `ActivityFeed.tsx` component showing:
- Trigger fired events (with trigger name + action)
- Queue task injections
- Context clear cycles
- Orchestrator respawns
- Approval actions (approved/rejected)

**Placement**: Bottom of OrchestratorPanel or as a collapsible section in the sidebar

**Fix plan**:
1. Create `ui/src/components/ActivityFeed.tsx`
2. Fetch from `GET /api/triggers/activity?limit=50`
3. Render as a scrollable log with timestamps, icons per action type
4. Add to OrchestratorView layout (below terminal or in sidebar)
5. Subscribe to SSE events for real-time updates (once Gap 1.1 is fixed)

**Estimated effort**: ~80 lines

---

### Gap 2.2: CLAUDE.md Outdated

**Current state**: CLAUDE.md lists basic project structure but doesn't document:
- New orchestrator CLI commands (orchestrator, queue, trigger, mode, pulse)
- Autonomous features (context auto-clear, queue processing, triggers, modes)
- New source files (src/orchestrator.ts, src/orchestrator/*, src/dashboard/api/orchestrator.ts, etc.)
- State management (orchestrator-state.json)
- The pulse loop concept

**Fix plan**: Update CLAUDE.md Key Files table and add an "Autonomous Orchestrator" section with:
1. Architecture overview (pulse loop -> triggers -> queue -> orchestrator)
2. Updated Key Files table with all new files
3. New CLI command groups summary
4. Configuration points (orchJobId, orchStateFile)

**Estimated effort**: ~40 lines added to CLAUDE.md

---

### Gap 2.3: SKILL.md Missing Autonomous Orchestrator CLI Awareness

**Current state**: SKILL.md excellently teaches Claude Code how to orchestrate agents but does NOT mention:
- `cc-agent queue add/list/remove` for task queuing
- `cc-agent trigger add/list/toggle/remove` for automated triggers
- `cc-agent mode list/activate/create` for mode management
- `cc-agent pulse start/stop/status` for autonomous loop control
- The concept of self-configuration (orchestrator creating its own triggers/modes via Bash tool)

**Impact**: When the orchestrator Claude Code instance runs, it won't know about these self-management capabilities unless the SKILL.md teaches it.

**Fix plan**: Add a "Self-Management Commands" section to SKILL.md:
1. Document queue commands the orchestrator can use to manage its own work
2. Document trigger commands for self-configuring automated behaviors
3. Document mode commands for switching operational profiles
4. Add examples of self-configuration patterns
5. Add a "Pulse Loop Awareness" section explaining the 10s heartbeat

**Estimated effort**: ~50 lines added to SKILL.md

---

### Gap 2.4: No Error Toast/Notification System in UI

**Current state**: All UI components use silent `try-catch` for API errors. Failed operations (start orchestrator, add trigger, approve action) show no visible feedback to the user.

**Fix plan**:
1. Create a simple toast notification component or use the existing notification system if one exists
2. Surface errors from API calls as brief, dismissible toasts
3. Surface success confirmations for critical actions (orchestrator started, trigger created, approval processed)

**Estimated effort**: ~60 lines (toast component + integration in 2-3 components)

---

### Gap 2.5: UI Components Don't Leverage SSE for Instant Updates

**Current state**: All orchestrator UI components use polling:
- OrchestratorPanel: 3s poll
- QueuePanel: 5s poll
- TriggerPanel: 5s poll
- ModeSelector: 10s poll
- ApprovalsBar: 3s poll
- PulseIndicator: 5s poll

**Impact**: Up to 10s lag for mode changes, 5s lag for queue/trigger changes. After Gap 1.1 is fixed, components should also subscribe to SSE events for instant updates.

**Fix plan** (after Gap 1.1 is resolved):
1. Create `useOrchestrator` hook that subscribes to all orchestrator SSE events
2. Components trigger immediate refetch when relevant SSE event arrives
3. Keep polling as fallback (increase intervals to 15-30s since SSE provides real-time)

**Estimated effort**: ~50 lines for hook + ~20 lines per component (6 components)

---

## Part 3: Polish Gaps (P2)

### Gap 3.1: Missing `idle_seconds` Threshold Metric

**Location**: `src/orchestrator/triggers.ts` function `getMetricValue()`

**Current state**: Supports `context_used_pct`, `queue_depth`, `active_agents`. The PRD specifies a 4th metric: `idle_seconds` (seconds since orchestrator's last log file change).

**Fix plan**: Add `idle_seconds` case to getMetricValue() using log file mtime check (same logic as `isOrchestratorIdle` in pulse.ts).

**Estimated effort**: ~8 lines

---

### Gap 3.2: No Inline Trigger Editing in UI

**Current state**: TriggerPanel supports add, toggle, and delete. But there's no way to **edit** an existing trigger's condition, action, or payload from the UI. The PATCH `/api/triggers/:id` endpoint exists but the UI has no edit form.

**Fix plan**:
1. Add an "Edit" button per trigger row in TriggerPanel
2. When clicked, transform the row into an inline edit form (pre-filled with current values)
3. Submit changes via `PATCH /api/triggers/:id`

**Estimated effort**: ~50 lines added to TriggerPanel.tsx

---

### Gap 3.3: No Queue Task Detail View / Status Updates in UI

**Current state**: QueuePanel lists tasks and allows add/remove but:
- Cannot view full prompt text (truncated in list)
- Cannot manually mark a task as completed/failed
- No started_at / completed_at timestamps displayed

**Fix plan**:
1. Add expandable row or modal to show full prompt text
2. Show started_at and completed_at when available
3. Add manual status update buttons (mark complete, mark failed) via `PATCH /api/queue/tasks/:id`

**Estimated effort**: ~40 lines

---

### Gap 3.4: Keyboard Shortcuts for Power Users

**Current state**: Some forms support Ctrl+Enter to submit. No global keyboard shortcuts exist.

**Useful shortcuts**:
- `Ctrl+Shift+O` - Focus orchestrator terminal
- `Ctrl+Shift+Q` - Toggle queue panel
- `Ctrl+Shift+P` - Toggle pulse
- `Escape` - Close any open form

**Estimated effort**: ~30 lines (keydown listener in OrchestratorView)

---

### Gap 3.5: No Confirmation Before Destructive Actions

**Current state**: OrchestratorPanel has a confirm dialog for stop. But there's no confirmation for:
- Deleting triggers
- Removing queue tasks
- Deleting modes
- Deactivating all modes (which deletes all triggers)

**Fix plan**: Add simple confirm() calls or a shared confirmation dialog component for destructive actions.

**Estimated effort**: ~15 lines

---

### Gap 3.6: Preset Mode Details Not Visible

**Current state**: ModeSelector shows mode name, description, and trigger count. But users can't preview **what triggers** a mode contains before activating it.

**Fix plan**:
1. Add expandable section per mode showing its trigger_config parsed as a readable list
2. Show trigger names, types, conditions, and actions in a compact format

**Estimated effort**: ~25 lines in ModeSelector.tsx

---

## Part 4: Documentation Gaps

### Gap 4.1: cc-orchestrator Plugin Update

**File**: `plugins/cc-orchestrator/skills/cc-orchestrator/SKILL.md`

**What to add**:
- Self-management commands section (queue, trigger, mode, pulse)
- Self-configuration examples
- State file awareness and persistence patterns
- Context lifecycle awareness (save state before clear)

---

### Gap 4.2: README Enhancement

**File**: `README.md`

**Current state**: README is already comprehensive. Minor additions:
- Add architecture diagram showing pulse loop -> triggers -> queue -> orchestrator flow
- Add "Autonomy Levels" section explaining auto vs confirm
- Add troubleshooting section for common orchestrator issues

---

### Gap 4.3: CODEBASE_MAP.md Minor Updates

**File**: `docs/CODEBASE_MAP.md`

**Current state**: Already excellent. Verify it includes:
- ActivityFeed component (once created)
- useOrchestrator hook (once created)
- SSE event types documentation

---

## Implementation Plan: Prioritized Sessions

### Session A: Critical Wiring Fixes (P0) - ~2 hours
**Files**: 4 files, ~100 lines total

| Step | File | Change | Lines |
|------|------|--------|-------|
| 1 | `src/dashboard/state.ts` | Add 4 SSE event types to StateEvent union | +8 |
| 2 | `src/dashboard/api/pulse.ts` | Pass getDashboardState() to startPulse() | +2 |
| 3 | `src/orchestrator/triggers.ts` | Emit trigger_fired and approval_required via state emitter | +15 |
| 4 | `src/orchestrator/pulse.ts` | Emit pulse_tick at end of pulseTick() | +8 |
| 5 | `src/dashboard/db.ts` | Add queue event emission on add/update/remove | +15 |
| 6 | `ui/src/hooks/useJobs.ts` | Add SSE listeners for all orchestrator events | +40 |
| 7 | `src/orchestrator/triggers.ts` | Add idle_seconds metric to getMetricValue() | +8 |

**Verify**: Start dashboard, start orchestrator, add queue task, create trigger, observe SSE events in browser DevTools Network tab.

---

### Session B: Activity Feed + Error Toasts (P1) - ~2 hours
**Files**: 3-4 files, ~140 lines total

| Step | File | Change | Lines |
|------|------|--------|-------|
| 1 | `ui/src/components/ActivityFeed.tsx` | Create activity feed component | +80 |
| 2 | `ui/src/components/OrchestratorView.tsx` | Add ActivityFeed to layout | +5 |
| 3 | `ui/src/styles/layout.css` | Add activity feed styles | +30 |
| 4 | Various UI components | Add error/success toast handling | +30 |

**Verify**: Open dashboard, trigger actions, observe activity feed updating in real-time.

---

### Session C: UI Polish (P1-P2) - ~3 hours
**Files**: 5 files, ~200 lines total

| Step | File | Change | Lines |
|------|------|--------|-------|
| 1 | `ui/src/hooks/useOrchestrator.ts` | Create dedicated orchestrator SSE hook | +50 |
| 2 | UI components (6 files) | Switch from pure polling to SSE+polling hybrid | +60 |
| 3 | `ui/src/components/TriggerPanel.tsx` | Add inline trigger editing | +50 |
| 4 | `ui/src/components/QueuePanel.tsx` | Add expandable task detail + manual status | +40 |
| 5 | `ui/src/components/ModeSelector.tsx` | Add trigger preview per mode | +25 |
| 6 | Various components | Add confirmation dialogs for destructive actions | +15 |

**Verify**: Full end-to-end workflow from PRD section 6 verification plan.

---

### Session D: Documentation (P1) - ~1 hour
**Files**: 3 files, ~130 lines total

| Step | File | Change | Lines |
|------|------|--------|-------|
| 1 | `CLAUDE.md` | Add Autonomous Orchestrator section + update Key Files | +40 |
| 2 | `plugins/cc-orchestrator/skills/cc-orchestrator/SKILL.md` | Add self-management commands section | +50 |
| 3 | `docs/CODEBASE_MAP.md` | Verify and update for new components | +20 |
| 4 | `README.md` | Add architecture diagram + autonomy levels | +20 |

**Verify**: Read through each doc end-to-end for consistency.

---

## Verification Checklist

After all sessions complete, run the full end-to-end test from PRD section 6:

```bash
# 1. Start infrastructure
cc-agent dashboard
cc-agent orchestrator start

# 2. Verify pulse is running
cc-agent pulse status
# Expected: Running: yes, Queue depth: 0

# 3. Activate a mode
cc-agent mode activate dev
cc-agent trigger list
# Expected: dev-mode triggers visible

# 4. Queue a task
cc-agent queue add "List all TypeScript files" --priority 5
# Expected: Task queued

# 5. Watch pulse inject task (within 10-30s)
cc-agent orchestrator status
# Expected: Current task shows queued prompt

# 6. Create a confirm trigger
cc-agent trigger add "test-confirm" cron "* * * * *" inject_prompt \
  --payload '{"prompt":"Status report"}' --autonomy confirm

# 7. Wait 60s, check dashboard for approval notification
# Open localhost:3131/#/orchestrator
# Expected: ApprovalsBar shows pending approval

# 8. Approve in dashboard UI
# Expected: "Status report" injected into orchestrator

# 9. Kill orchestrator manually
tmux kill-session -t cc-agent-orch

# 10. Wait 10-60s, verify pulse respawns it
cc-agent orchestrator status
# Expected: Running: yes (respawned)

# 11. Verify activity feed shows all actions
# Expected: Activity feed shows trigger_fired, queue_injected, respawned entries

# 12. Verify SSE events in browser DevTools
# Network tab -> EventSource -> verify event types arriving
```

---

## Summary: Total Effort Estimate

| Session | Focus | Files | Lines | Priority |
|---------|-------|-------|-------|----------|
| A | Critical wiring (SSE + pulse fix) | 7 | ~100 | P0 |
| B | Activity feed + error toasts | 4 | ~140 | P1 |
| C | UI polish (SSE hybrid, editing, previews) | 8 | ~200 | P1-P2 |
| D | Documentation updates | 4 | ~130 | P1 |

**Total**: ~570 lines across 23 file touches, 4 sessions (~8 hours)

The implementation is impressively complete. These gaps represent the difference between "working" and "splendid" - the final 7% that turns a functional system into a polished autonomous platform.
