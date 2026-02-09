# CC Orchestrator

CLI tool for delegating tasks to Claude Code agents via tmux sessions. Designed for Claude Code orchestration with bidirectional communication.

**Stack**: TypeScript, Bun, tmux, Claude Code CLI

**Structure**: Shell wrapper -> CLI entry point -> Job management -> tmux sessions

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

- **Runtime**: Bun, tmux, claude CLI
- **NPM**: glob (file matching)

## Notes

- Jobs stored in `~/.cc-agent/jobs/`
- Dashboard auto-starts in background when agents are started (pidfile: `~/.cc-agent/dashboard.pid`)
- Stop dashboard with `cc-agent dashboard-stop`
- Uses `script` command for output logging
- Completion detected via marker string in output
- Bun is the TypeScript runtime - never use npm/yarn/pnpm for running
