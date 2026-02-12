# CC Orchestrator

CLI tool for delegating tasks to Claude Code agents via tmux sessions. Includes a real-time web dashboard, terminal streaming, analytics, and a plugin marketplace.

**Stack**: TypeScript, Bun, tmux, Claude Code CLI, Hono (server), Preact (UI), SQLite, xterm.js

**Structure**: Shell wrapper -> CLI entry point -> Job management -> tmux sessions -> Dashboard (Hono + Preact + SSE/WebSocket)

For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Development

```bash
# Run directly
bun run src/cli.ts --help

# Or via shell wrapper
./bin/cc-agent --help

# Health check
bun run src/cli.ts health
```

## Key Files

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI commands, argument parsing, dashboard auto-start |
| `src/jobs.ts` | Job lifecycle and persistence |
| `src/tmux.ts` | tmux session management |
| `src/config.ts` | Configuration constants |
| `src/files.ts` | File loading for context injection |
| `src/session-parser.ts` | Parse Claude session files for metadata |
| `src/orchestrator.ts` | Orchestrator lifecycle: start/stop/status/inject, state persistence |
| `src/orchestrator/pulse.ts` | Pulse loop: 10s heartbeat, queue processing, respawn, idle detection |
| `src/orchestrator/triggers.ts` | Trigger engine: cron/event/threshold evaluation, approval workflow |
| `src/orchestrator/modes.ts` | Preset trigger configurations (dev, review, monitor modes) |
| `src/dashboard/` | Dashboard server (Hono), state, SQLite, SSE, hooks |
| `src/dashboard/state.ts` | In-memory state + SSE event emission (includes orchestrator events) |
| `src/dashboard/event-bus.ts` | Internal EventEmitter for cross-module orchestrator event propagation |
| `src/dashboard/db.ts` | SQLite persistence: jobs, hooks, metrics, queue, triggers, modes, activity |
| `src/dashboard/api/orchestrator.ts` | REST API: orchestrator start/stop/status/inject |
| `src/dashboard/api/queue.ts` | REST API: queue task CRUD |
| `src/dashboard/api/triggers.ts` | REST API: trigger CRUD + activity log |
| `src/dashboard/api/modes.ts` | REST API: mode CRUD + activation |
| `src/dashboard/api/pulse.ts` | REST API: pulse start/stop/status |
| `ui/src/` | Preact UI: components, hooks, styles |
| `plugins/` | Claude Code plugin (marketplace structure) |

## Plugin Structure

This repo doubles as a Claude Code plugin marketplace:

```
.claude-plugin/marketplace.json     # marketplace registry
plugins/cc-orchestrator/            # the plugin
  .claude-plugin/plugin.json        # plugin metadata
  skills/cc-orchestrator/           # the orchestration skill
    SKILL.md                        # skill instructions
  scripts/install.sh                # dependency installer
```

## Dependencies

- **Runtime**: Bun, tmux, claude CLI, jq (for hooks)
- **NPM**: glob, hono, preact, @xterm/xterm

## Autonomous Orchestrator

The orchestrator runs a dedicated Claude Code instance (`cc-agent-orch` tmux session) that processes queued tasks, responds to triggers, and manages itself via a pulse loop.

### Architecture

```
Pulse Loop (10s) ──> Evaluate Triggers ──> Fire Actions
       │                                       │
       ├── Check orchestrator health            ├── inject_prompt
       ├── Process queue (idle + pending)       ├── clear_context
       ├── Respawn if crashed                   ├── start_orchestrator
       └── Emit pulse_tick SSE event            ├── queue_task
                                                └── notify
```

### CLI Command Groups

| Command Group | Subcommands | Purpose |
|--------------|-------------|---------|
| `cc-agent orchestrator` | `start`, `stop`, `status`, `inject` | Manage the orchestrator Claude Code instance |
| `cc-agent queue` | `add`, `list`, `remove` | Task queue for orchestrator to process |
| `cc-agent trigger` | `add`, `list`, `toggle`, `remove` | Automated actions (cron, event, threshold) |
| `cc-agent mode` | `list`, `activate`, `create`, `delete` | Preset trigger configurations |
| `cc-agent pulse` | `start`, `stop`, `status` | Control the 10s autonomous heartbeat loop |

### State Management

- Orchestrator state persisted to `orchestrator-state.json` (current task, active agents, history)
- State saved automatically before context clear and on task transitions
- Triggers, queue tasks, modes stored in SQLite (`~/.cc-agent/dashboard.db`)
- Pending approvals held in-memory by the trigger engine

### SSE Events

The dashboard broadcasts orchestrator events via SSE for real-time UI updates:

`orchestrator_status_change`, `orchestrator_context_warn`, `queue_update`, `trigger_fired`, `approval_required`, `pulse_tick`

## Notes

- Jobs stored in `~/.cc-agent/jobs/`
- Dashboard auto-starts in background when agents are started (pidfile: `~/.cc-agent/dashboard.pid`)
- Stop dashboard with `cc-agent dashboard-stop`
- Uses `script` command for output logging
- Completion detected via marker string in output
- Bun is the TypeScript runtime - never use npm/yarn/pnpm for running
