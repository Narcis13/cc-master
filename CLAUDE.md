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
| `src/dashboard/` | Dashboard server (Hono), state, SQLite, SSE, hooks |
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

## Notes

- Jobs stored in `~/.cc-agent/jobs/`
- Dashboard auto-starts in background when agents are started (pidfile: `~/.cc-agent/dashboard.pid`)
- Stop dashboard with `cc-agent dashboard-stop`
- Uses `script` command for output logging
- Completion detected via marker string in output
- Bun is the TypeScript runtime - never use npm/yarn/pnpm for running
