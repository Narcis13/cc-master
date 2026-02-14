---
name: cc-capture-generate
description: Generate a parameterized, replayable workflow from a workflow-trace.json file. Produces parameterized-workflow.json (machine-readable) and optionally a SKILL.md (Claude-executable). Run after a cc-capture session completes.
---

# cc-capture-generate

Transform a workflow trace into a parameterized, replayable workflow. Consumes `workflow-trace.json` produced by `cc-capture` and outputs two artifacts: a machine-readable `parameterized-workflow.json` and a Claude-executable `SKILL.md`.

## Activation

When the user invokes this skill:

1. Read `workflow-trace.json` from the project root.
   - If the file does not exist, tell the user: "No workflow-trace.json found. Run `/cc-capture` first to record a workflow."
   - Stop here if the file is missing.

2. Validate the trace has a `summary` field with a `completed` timestamp (ISO 8601). This confirms the capture session finished.
   - If `summary` is `null` or missing, warn: "This trace appears incomplete -- the capture session did not finalize. The summary is missing."
   - Ask: "Proceed with the incomplete trace anyway? (y/n)"
   - Stop if the user declines.

3. Run **Phase 1** (Parameterized Workflow), then **Phase 2** (Replayable Skill).

## Phase 1: Parameterized Workflow

Produce `parameterized-workflow.json` in the project root.

### Step 1a: Consolidate Parameters

Read all entries from the trace's root `params` object. Each param has this schema (from cc-capture):

```json
"param_name": {
  "category": "paths | names | config | identifiers | content",
  "value": "<the actual value>",
  "first_seen": 1,
  "description": "<what this value represents>"
}
```

Process them:

- **Merge duplicates**: If two params have the same `value` but different names, keep the more descriptive name and drop the other.
- **Classify as required or optional**: A param is `required` if it is referenced in 2 or more steps (count appearances across all `actions[].param_refs` arrays). Otherwise it is `optional`.
- **Extract defaults**: If a param's `value` is a common convention (e.g., port `3000`, path `src/`, branch `main`), record it as the default. Otherwise default is `null`.

### Step 1b: User Confirmation -- Parameter Review

Display all detected parameters to the user in a table:

```
| Parameter | Category | Value | Required | Default |
|-----------|----------|-------|----------|---------|
| project_name | names | my-app | Yes | null |
| port | config | 3000 | No | 3000 |
```

Ask: "Are these the right parameters for replay? Should I add, remove, or rename any?"

Apply the user's feedback before continuing. This is **confirmation 1 of 2**.

### Step 1c: Build Parameterized Steps

- Copy the `steps` array from the trace.
- In each action's `input` object, replace literal parameter values with `{{param_name}}` placeholders.
- Verify all `param_refs` arrays are accurate -- they must list exactly the param names whose placeholders appear in that action's inputs.

### Step 1d: Write parameterized-workflow.json

Write the file to the project root with this structure:

```json
{
  "version": "1.0",
  "generated_from": "<session.id from trace>",
  "generated_at": "<ISO 8601 timestamp>",
  "original_task": "<session.task from trace>",
  "replay_config": {
    "params_required": ["<names of required params>"],
    "params_optional": ["<names of optional params>"],
    "defaults": {
      "<param_name>": "<default value>"
    },
    "total_steps": "<count>",
    "deterministic_steps": "<count>",
    "reasoning_steps": "<count>"
  },
  "params": {
    "<param_name>": {
      "category": "<category>",
      "description": "<description>",
      "default": "<default or null>"
    }
  },
  "steps": [
    {
      "id": 1,
      "type": "decision",
      "intent": "<intent>",
      "reasoning": "<reasoning>",
      "execution": "deterministic | reasoning",
      "actions": [
        {
          "tool": "<tool name>",
          "input": { "<keys with {{param_name}} placeholders>" },
          "output_summary": "<1-2 sentences>",
          "param_refs": ["<param names referenced>"]
        }
      ],
      "outcome": "<outcome>"
    }
  ]
}
```

Fill in `replay_config` counts from the actual steps:
- `total_steps`: length of `steps` array
- `deterministic_steps`: count of steps where `execution` is `"deterministic"`
- `reasoning_steps`: count of steps where `execution` is `"reasoning"`

## Phase 2: Replayable Skill

Generate a SKILL.md that Claude can execute to replay the workflow with new parameter values.

### Step 2a: Derive Skill Name

From `original_task`, derive a short skill name:
- Lowercase, hyphenated
- Maximum 4 words
- Example: "Set up ESLint with Prettier" becomes `setup-eslint-prettier`

### Step 2b: User Confirmation -- Save Location

Ask the user where to save the generated SKILL.md.

Default: `plugins/cc-orchestrator/skills/<skill-name>/SKILL.md`

Apply the user's choice. This is **confirmation 2 of 2**.

### Step 2c: Generate SKILL.md

Create the skill file with this structure:

```markdown
---
name: <skill-name>
description: <one-line description derived from original_task>
---

# <Skill Title>

> Auto-generated from workflow trace `<session.id>`.
> Original task: <original_task>

## Required Inputs

Before starting, collect these values from the user:

| Parameter | Description | Default |
|-----------|-------------|---------|
| <param_name> | <description> | <default or "none"> |

## Workflow

### Step 1: <intent>

**Why:** <reasoning>
```

For each step, format based on its `execution` type:

**Deterministic steps:**

```markdown
### Step N: <intent>

**Why:** <reasoning>

**Actions:**
1. <tool>: <instruction with {{param_name}} placeholders>
2. <tool>: <instruction with {{param_name}} placeholders>

**Expected outcome:** <outcome>
```

**Reasoning steps:**

```markdown
### Step N: <intent>

**Why:** <reasoning>

**Goal:** <intent>
**Context from original session:** <reasoning + outcome>
**Approach:** Analyze the current codebase and determine the best way to achieve this goal. The original session achieved this by the actions described above, but adapt to the current project's structure.
```

### Step 2d: Finalize

Tell the user: "Generated files are ready: `parameterized-workflow.json` and `<skill-name>/SKILL.md`. You may want to review and commit them."

## Rules

- **Two user confirmations only**: parameter review (Step 1b) and save location (Step 2b). Everything else runs without asking.
- **Never modify `workflow-trace.json`**. It is a read-only input.
- **Keep generated skills concise**. Summaries, not novels.
- **Param placeholders use `{{double_braces}}`** everywhere -- in `parameterized-workflow.json` and in generated SKILL.md files.
