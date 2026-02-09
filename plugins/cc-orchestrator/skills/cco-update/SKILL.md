---
name: cco-update
description: Update cc-orchestrator runtime and plugin to latest from GitHub. Run this after pushing changes to the cc-master repo.
triggers:
  - cco-update
  - update cco
  - update orchestrator
  - sync orchestrator
---

# CCO Update

Pull the latest cc-orchestrator code from GitHub into both the runtime and plugin installations.

## Locations

| Location | Purpose |
|---|---|
| `~/.cc-orchestrator/` | **Runtime** - where `cc-agent` executes from |
| `~/.claude/plugins/marketplaces/cc-orchestrator-marketplace/` | **Plugin** - where Claude Code reads skills and source |

## Procedure

Run these steps in order. Use Bash for all commands.

### 1. Pull runtime

```bash
git -C ~/.cc-orchestrator fetch origin main && git -C ~/.cc-orchestrator reset --hard origin/main
```

Use `reset --hard` instead of `pull --ff-only` to handle untracked files like `bun.lock` that block fast-forward merges.

### 2. Pull plugin marketplace

```bash
git -C ~/.claude/plugins/marketplaces/cc-orchestrator-marketplace fetch origin main && git -C ~/.claude/plugins/marketplaces/cc-orchestrator-marketplace reset --hard origin/main
```

### 3. Reinstall dependencies (runtime only)

```bash
cd ~/.cc-orchestrator && bun install
```

### 4. Report

Show the user:
- The new HEAD commit (short hash + message) from `git -C ~/.cc-orchestrator log --oneline -1`
- Confirmation that both locations are updated
- Remind them to restart Claude Code for skill changes to take effect
