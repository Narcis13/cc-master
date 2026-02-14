# cc-capture Design

> Two-phase skill pair for intentional workflow tracing and deterministic replay.

## Overview

**Problem:** After a Claude Code session, reconstructing what happened requires reverse-engineering from git diffs, session files, and memory. There's no clean, machine-readable record of intent + actions.

**Solution:** A skill that instructs Claude to maintain a structured trace (`workflow-trace.json`) as it works, capturing both decisions and tool-level actions. A second skill converts that trace into a parameterized, replayable workflow.

## Skills

| Skill | Invocation | Purpose |
|-------|-----------|---------|
| `cc-capture` | `/cc-capture` | Activate tracing mode, write `workflow-trace.json` incrementally |
| `cc-capture-generate` | `/cc-capture-generate` | Read trace, extract params, produce `parameterized-workflow.json` + `SKILL.md` |

Both live in `plugins/cc-orchestrator/skills/`.

## Trace File Structure

`workflow-trace.json` in project root, written incrementally:

```json
{
  "version": "1.0",
  "session": {
    "id": "capture-20260214-143022",
    "started": "2026-02-14T14:30:22Z",
    "task": "Add user authentication to the Express app",
    "cwd": "/Users/me/my-project"
  },
  "params": {},
  "steps": [],
  "summary": null
}
```

### Step Schema

Each step is a decision-level entry with nested actions:

```json
{
  "id": 1,
  "type": "decision",
  "intent": "Understand current auth setup",
  "reasoning": "Need to check if any auth middleware exists before adding new one",
  "execution": "deterministic",
  "actions": [
    {
      "tool": "Glob",
      "input": { "pattern": "src/**/*auth*" },
      "output_summary": "No auth files found",
      "param_refs": []
    },
    {
      "tool": "Read",
      "input": { "file_path": "{{project_root}}/src/server.ts" },
      "output_summary": "Express server, no middleware, 45 lines",
      "param_refs": ["project_root"]
    }
  ],
  "outcome": "No existing auth — building from scratch"
}
```

### Fields

- **`execution`**: `"deterministic"` (replay mechanically) or `"reasoning"` (needs Claude on replay)
- **`intent`**: What Claude was trying to accomplish (1 sentence)
- **`reasoning`**: Why this approach (1 sentence)
- **`actions`**: Tool calls with summarized outputs
- **`param_refs`**: Which auto-detected params appear in each action's inputs
- **`outcome`**: What was learned or produced (1 sentence)

## Parameter Auto-Detection

Claude detects parameters by categorizing context-specific values:

| Category | Examples | Detection rule |
|----------|----------|----------------|
| `paths` | Project root, key files, directories | Any absolute path or repeated relative path |
| `names` | Project name, module names, branch names | Values derived from directory/file names |
| `config` | Port numbers, URLs, DB connection strings | Values read from config files or env vars |
| `identifiers` | Function names, class names, table names | Names Claude creates or modifies |
| `content` | Error messages, prompts, template text | Literal strings Claude writes into files |

Accumulated in root `params` object:

```json
"params": {
  "project_root": {
    "category": "paths",
    "value": "/Users/me/my-project",
    "first_seen": 1,
    "description": "Working directory for the project"
  },
  "app_port": {
    "category": "config",
    "value": "3000",
    "first_seen": 3,
    "description": "Server listening port from .env"
  }
}
```

**What stays hardcoded** (not parameterized):
- Tool names and tool structure
- Generic glob patterns (e.g. `**/*.ts`)
- Logical flow and step ordering
- Reasoning text (captured as-is for context)

## cc-capture Behavior

On `/cc-capture` invocation:

1. **Initialize** — Create `workflow-trace.json` with session header. Ask user what task they're about to work on.
2. **Work normally, trace intentionally** — Perform the task. After each meaningful decision, append a step via Edit. Rhythm: think -> decide -> act -> record.
3. **Lightweight per-step checklist:**
   - What was my intent? (1 sentence)
   - Why this approach? (1 sentence)
   - Deterministic or reasoning on replay?
   - Any new parameter values?
4. **Incremental writes** — Trace grows in real-time. Partial trace is valid if session ends early.
5. **Finalize** — Write `summary` field: total steps, params detected, deterministic vs reasoning counts. Tell user to run `/cc-capture-generate`.

**Does NOT:**
- Slow down with verbose logging
- Capture tool outputs verbatim (summaries only)
- Ask user to confirm each trace entry
- Generate the replayable workflow (that's the other skill)

## cc-capture-generate Behavior

On `/cc-capture-generate` invocation:

### Phase 1: Parameterized Workflow

Reads `workflow-trace.json`, produces `parameterized-workflow.json`:

- Consolidates `params` registry (merge duplicates, validate refs)
- Replaces literal values with `{{param}}` placeholders in action inputs
- Adds `replay_config` header:

```json
{
  "replay_config": {
    "params_required": ["project_root", "server_file", "app_port"],
    "params_optional": ["db_url"],
    "defaults": { "app_port": "3000" },
    "total_steps": 8,
    "deterministic_steps": 5,
    "reasoning_steps": 3
  },
  "steps": [ ]
}
```

### Phase 2: Replayable Skill

Generates a `SKILL.md` from the workflow:

- Deterministic steps become explicit instructions ("Read `{{server_file}}`, create file X with content Y")
- Reasoning steps become intent descriptions with context ("Analyze the existing middleware chain and decide where to insert auth")
- Parameters become a "Required Inputs" section at the top
- Skill name derived from `session.task`

### User Interaction

Two confirmations only:
1. "Are these the right parameters for replay, or should I add/remove any?"
2. "Where should I save the generated skill?" (default: `plugins/cc-orchestrator/skills/{name}/`)

## Hybrid Replay Model

On replay, execution strategy is per-step:

- **Deterministic steps**: Claude follows the instructions literally, substituting `{{params}}` with user-provided values
- **Reasoning steps**: Claude reads the original intent + reasoning for context, then applies its own judgment to the new codebase — the trace provides the "what and why", Claude figures out the "how" for the new context

## File Locations

```
plugins/cc-orchestrator/
  skills/
    cc-capture/
      SKILL.md            # tracing skill
    cc-capture-generate/
      SKILL.md            # workflow generation skill
```

Output files (in user's project):
```
workflow-trace.json           # raw trace (cc-capture output)
parameterized-workflow.json   # parameterized version (cc-capture-generate output)
```

Generated skills saved to user-chosen location (default: `plugins/cc-orchestrator/skills/{name}/`).
