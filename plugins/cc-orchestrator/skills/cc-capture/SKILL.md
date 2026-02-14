---
name: cc-capture
description: Activate workflow tracing mode. Claude maintains a structured workflow-trace.json file in real-time as it works, capturing decisions, tool calls, and auto-detected parameters. Invoke before starting a task you want to record for replay. Use cc-capture-generate afterward to produce a replayable workflow.
---

# cc-capture

Structured workflow tracing. You work normally while maintaining a machine-readable trace of your decisions and actions.

## Activation

When the user invokes this skill:

1. Ask the user what task they're about to work on (1 sentence description).
2. Create `workflow-trace.json` in the project root with this initial structure:

```json
{
  "version": "1.0",
  "session": {
    "id": "capture-YYYYMMDD-HHmmss",
    "started": "<ISO 8601>",
    "task": "<user's description>",
    "cwd": "<cwd>"
  },
  "params": {},
  "steps": [],
  "summary": null
}
```

Replace `YYYYMMDD-HHmmss` with the current date/time, `<ISO 8601>` with the current timestamp, `<cwd>` with the working directory, and `<user's description>` with what the user said.

3. Confirm tracing is active, then proceed with the user's task immediately.

## Tracing Discipline

**Rhythm: Think -> Decide -> Act -> Record.**

After each meaningful decision (not every micro-step), append a step to the `steps` array in `workflow-trace.json`.

A step = a decision, not a single tool call. One step may contain multiple actions. Group actions by intent. Aim for **5-15 steps per session**, not 50.

**GOOD:** "Understand the routing structure" → 3 Glob/Read actions → 1 step
**BAD:** Each Glob call is its own separate step

### Per-Step Checklist

Before recording, answer these four questions:

1. **Intent** -- What was I trying to accomplish? (1 sentence)
2. **Reasoning** -- Why this approach? (1 sentence)
3. **Execution type** -- Could this be replayed mechanically (`deterministic`), or does it need Claude's judgment (`reasoning`)?
4. **New parameters?** -- Did I encounter any context-specific values to register?

## Step Schema

Each step in the `steps` array follows this structure:

```json
{
  "id": 1,
  "type": "decision",
  "intent": "<what, 1 sentence>",
  "reasoning": "<why, 1 sentence>",
  "execution": "deterministic | reasoning",
  "actions": [
    {
      "tool": "<tool name>",
      "input": { "<key params, use {{param_name}} for detected params>" },
      "output_summary": "<1-2 sentences>",
      "param_refs": ["<param names referenced>"]
    }
  ],
  "outcome": "<result, 1 sentence>"
}
```

### Field Notes

- **`id`**: Sequential integer starting at 1.
- **`execution`**: `"deterministic"` means replay can follow instructions literally. `"reasoning"` means replay needs Claude to apply judgment to a new context.
- **`actions`**: The tool calls within this decision. Summarize outputs -- never capture full tool output.
- **`param_refs`**: List parameter names that appear in this action's inputs (as `{{param_name}}` placeholders).
- **`outcome`**: What was learned or produced. One sentence.

## Parameter Auto-Detection

As you work, detect context-specific values and register them in the root `params` object. These are values that would change if someone replayed this workflow in a different project.

### Categories

| Category | Examples |
|----------|----------|
| `paths` | Project root, key file paths, directories |
| `names` | Project name, module names, branch names |
| `config` | Port numbers, URLs, DB connection strings |
| `identifiers` | Function names, class names, table names |
| `content` | Error messages, prompts, template text |

### Param Schema

```json
"param_name": {
  "category": "paths | names | config | identifiers | content",
  "value": "<the actual value>",
  "first_seen": 1,
  "description": "<what this value represents>"
}
```

### Usage

- When you first encounter a context-specific value, add it to `params` and note which step it appeared in (`first_seen`).
- In subsequent action inputs, reference it as `{{param_name}}` instead of the literal value.

### What NOT to Parameterize

- Tool names
- Generic patterns (e.g., `**/*.ts`, `src/**`)
- Step ordering and logical flow
- Reasoning text

## Incremental Writing

- Write to `workflow-trace.json` after each step, not at the end.
- Use the Edit tool to append new steps to the `steps` array and new entries to `params`.
- A partial trace is valid. If the session ends early, whatever has been written is useful.

## Finalization

When the task is complete:

1. Write a `summary` object to `workflow-trace.json`:

```json
"summary": {
  "completed": "<ISO 8601 timestamp>",
  "total_steps": 8,
  "deterministic_steps": 5,
  "reasoning_steps": 3,
  "params_detected": 4,
  "outcome": "<what was accomplished, 1 sentence>"
}
```

2. Tell the user: "Workflow trace complete. Run `/cc-capture-generate` to produce a replayable workflow."

## Rules

- **Do proceed with the user's actual task.** Tracing is secondary to getting the work done.
- **Don't let tracing slow you down.** Record after acting, not before. Keep summaries terse.
- **Don't capture full tool outputs.** Summaries only (1-2 sentences).
- **Don't ask the user to confirm trace entries.** Write them silently.
- **Don't generate the replayable workflow.** That is the job of `cc-capture-generate`.
