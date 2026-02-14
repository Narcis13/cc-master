# cc-capture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create two Claude Code skills (`cc-capture` and `cc-capture-generate`) that record structured workflow traces and convert them into parameterized, replayable workflows.

**Architecture:** Pure skill files (SKILL.md) — no TypeScript runtime code. The skills instruct Claude's behavior via structured markdown. All trace I/O uses Claude's existing Read/Write/Edit tools.

**Tech Stack:** Markdown (SKILL.md), JSON (trace/workflow files)

**Design doc:** `docs/plans/2026-02-14-cc-capture-design.md`

---

### Task 1: Create cc-capture SKILL.md

**Files:**
- Create: `plugins/cc-orchestrator/skills/cc-capture/SKILL.md`

**Step 1: Write the skill file**

Create `plugins/cc-orchestrator/skills/cc-capture/SKILL.md` with the following content:

```markdown
---
name: cc-capture
description: Activate workflow tracing mode. Claude maintains a structured workflow-trace.json file in real-time as it works, capturing decisions, tool calls, and auto-detected parameters. Invoke before starting a task you want to record for replay. Use cc-capture-generate afterward to produce a replayable workflow.
---

# CC Capture — Workflow Tracing

Record a structured, machine-readable trace of your work session.

## Activation

When this skill is invoked:

1. **Ask the user** what task they are about to work on (one sentence description)
2. **Create `workflow-trace.json`** in the project root with this initial structure:

```json
{
  "version": "1.0",
  "session": {
    "id": "capture-YYYYMMDD-HHmmss",
    "started": "<ISO 8601 timestamp>",
    "task": "<user's task description>",
    "cwd": "<current working directory>"
  },
  "params": {},
  "steps": [],
  "summary": null
}
```

3. **Confirm to the user** that tracing is active, then proceed with their task.

## Tracing Discipline

As you work on the user's task, follow this rhythm for every meaningful decision:

**Think → Decide → Act → Record**

After completing a logical group of actions (not every micro-step), append a step to the `steps` array in `workflow-trace.json` using the Edit tool.

### Per-Step Checklist

Before writing each step entry, answer these four questions internally:

1. **Intent** — What was I trying to accomplish? (1 sentence)
2. **Reasoning** — Why this approach over alternatives? (1 sentence)
3. **Execution type** — Could this step be replayed mechanically (`deterministic`), or does it require judgment (`reasoning`)?
4. **Parameters** — Did I use any project-specific values that would change in a different context?

### Step Schema

```json
{
  "id": <sequential integer starting at 1>,
  "type": "decision",
  "intent": "<what you were trying to accomplish>",
  "reasoning": "<why this approach>",
  "execution": "deterministic" | "reasoning",
  "actions": [
    {
      "tool": "<tool name: Read, Write, Edit, Bash, Glob, Grep, etc.>",
      "input": { <key tool parameters, with {{param_name}} for detected params> },
      "output_summary": "<1-2 sentence summary of what the tool returned>",
      "param_refs": ["<param names referenced in this action's input>"]
    }
  ],
  "outcome": "<what was learned or produced, 1 sentence>"
}
```

### What Constitutes a "Step"

A step is a **decision**, not a single tool call. One step may contain multiple actions. Group actions by intent:

- GOOD: "Understand the routing structure" → 3 Glob/Read actions → 1 step
- BAD: Each Glob call is its own step

Aim for 5-15 steps per session, not 50.

## Parameter Auto-Detection

When you encounter a value that is specific to this project/context and would need to change for replay, register it in the root `params` object:

```json
"params": {
  "<param_name>": {
    "category": "paths" | "names" | "config" | "identifiers" | "content",
    "value": "<the literal value>",
    "first_seen": <step id where first encountered>,
    "description": "<what this parameter represents>"
  }
}
```

**Detection rules:**

| Category | Register when you see... |
|----------|--------------------------|
| `paths` | Absolute paths, repeated relative paths to key files |
| `names` | Project name, module names, git branch names |
| `config` | Port numbers, URLs, DB strings, env var values |
| `identifiers` | Function/class/table names you create or modify |
| `content` | Literal strings, templates, prompts you write into files |

**Do NOT parameterize:**
- Tool names and JSON structure
- Generic glob patterns (`**/*.ts`)
- Step ordering and logical flow
- Your reasoning text

Once a param is registered, use `{{param_name}}` in subsequent action inputs when referencing that value.

## Incremental Writing

- Write to `workflow-trace.json` after each step completes, not at the end
- If the session ends unexpectedly, the trace up to that point is still valid
- Use the Edit tool to append steps to the `steps` array
- Use the Edit tool to add new entries to the `params` object as detected

## Finalization

When the user's task is complete:

1. **Write the summary** to `workflow-trace.json`:

```json
"summary": {
  "completed": "<ISO 8601 timestamp>",
  "total_steps": <count>,
  "deterministic_steps": <count>,
  "reasoning_steps": <count>,
  "params_detected": <count>,
  "outcome": "<1 sentence: what was built/accomplished>"
}
```

2. **Tell the user**: "Trace complete. Run `/cc-capture-generate` to produce a parameterized, replayable workflow from this trace."

## Rules

- **Do not let tracing slow you down.** The trace is a lightweight byproduct of work, not the focus.
- **Do not capture full tool outputs.** Summaries only (1-2 sentences).
- **Do not ask the user to confirm trace entries.** Write them silently.
- **Do not generate the replayable workflow.** That is `/cc-capture-generate`'s job.
- **Do proceed with the user's actual task.** Tracing augments your work, it does not replace it.
```

**Step 2: Verify the file was created**

Run: `cat plugins/cc-orchestrator/skills/cc-capture/SKILL.md | head -5`
Expected: The YAML frontmatter header with `name: cc-capture`

**Step 3: Commit**

```bash
git add plugins/cc-orchestrator/skills/cc-capture/SKILL.md
git commit -m "feat: add cc-capture skill for workflow tracing"
```

---

### Task 2: Create cc-capture-generate SKILL.md

**Files:**
- Create: `plugins/cc-orchestrator/skills/cc-capture-generate/SKILL.md`

**Step 1: Write the skill file**

Create `plugins/cc-orchestrator/skills/cc-capture-generate/SKILL.md` with the following content:

```markdown
---
name: cc-capture-generate
description: Generate a parameterized, replayable workflow from a workflow-trace.json file. Produces parameterized-workflow.json (machine-readable) and optionally a SKILL.md (Claude-executable). Run after a cc-capture session completes.
---

# CC Capture Generate — Workflow Replay Builder

Convert a raw workflow trace into a parameterized, replayable workflow.

## Activation

When this skill is invoked:

1. **Read `workflow-trace.json`** from the project root. If not found, tell the user to run `/cc-capture` first.
2. **Validate** the trace has a `summary` field (i.e., the capture session completed). If missing, warn that the trace appears incomplete and ask whether to proceed anyway.
3. **Run Phase 1** (parameterized workflow), then **Phase 2** (replayable skill).

## Phase 1: Parameterized Workflow

Read the trace and produce `parameterized-workflow.json` in the project root.

### Process

1. **Consolidate parameters:**
   - Read all entries from `params`
   - Merge any duplicates (same value, different names) — keep the more descriptive name
   - Classify each as `required` (used in 2+ steps) or `optional` (used in 1 step)
   - Extract defaults where the value is a common convention (e.g., port 3000, `src/` paths)

2. **Show detected parameters to user:**

   Present a table:
   ```
   | Parameter | Category | Value | Required | Default |
   ```

   Ask: "Are these the right parameters for replay? Should I add, remove, or rename any?"

   Apply user feedback before continuing.

3. **Build parameterized steps:**
   - Copy all steps from the trace
   - In each action's `input`, replace literal parameter values with `{{param_name}}` placeholders
   - Ensure all `param_refs` arrays are accurate

4. **Write `parameterized-workflow.json`:**

```json
{
  "version": "1.0",
  "generated_from": "<trace session id>",
  "generated_at": "<ISO 8601 timestamp>",
  "original_task": "<session.task from trace>",
  "replay_config": {
    "params_required": ["<param names used in 2+ steps>"],
    "params_optional": ["<param names used in 1 step>"],
    "defaults": { "<param>": "<default value>" },
    "total_steps": <count>,
    "deterministic_steps": <count>,
    "reasoning_steps": <count>
  },
  "params": {
    "<param_name>": {
      "category": "<category>",
      "description": "<what this parameter represents>",
      "default": "<default or null>"
    }
  },
  "steps": [ <parameterized steps> ]
}
```

## Phase 2: Replayable Skill

Generate a Claude Code SKILL.md from the parameterized workflow.

### Process

1. **Derive skill name** from `original_task`:
   - Lowercase, hyphenated, max 4 words
   - e.g., "Add user authentication to Express" → `add-express-auth`

2. **Ask user** where to save the skill:
   - Default: `plugins/cc-orchestrator/skills/<skill-name>/SKILL.md`
   - User can choose any path

3. **Generate the SKILL.md** with this structure:

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
| (one row per required param) |
| (optional params marked as "Optional") |

## Workflow

(For each step in the parameterized workflow:)

### Step N: <intent>

**Why:** <reasoning from original trace>

(If execution == "deterministic":)

**Actions:**
1. <tool>: <exact instruction with {{param}} placeholders>
2. <tool>: <exact instruction with {{param}} placeholders>
...

**Expected outcome:** <outcome>

(If execution == "reasoning":)

**Goal:** <intent>
**Context from original session:** <reasoning + outcome>
**Approach:** Analyze the current codebase and determine the best way to achieve this goal. The original session <brief description of what was done>, but adapt to the current project's structure.
```

4. **Commit both files** (`parameterized-workflow.json` and the generated `SKILL.md`).

## Rules

- **Two user confirmations only:** parameter review and save location. Do not over-ask.
- **Preserve the original trace.** Never modify `workflow-trace.json`.
- **Keep generated skills concise.** Deterministic steps are specific instructions. Reasoning steps are goals with context, not essays.
- **Param placeholders use `{{double_braces}}`** — consistent with the trace format.
```

**Step 2: Verify the file was created**

Run: `cat plugins/cc-orchestrator/skills/cc-capture-generate/SKILL.md | head -5`
Expected: The YAML frontmatter header with `name: cc-capture-generate`

**Step 3: Commit**

```bash
git add plugins/cc-orchestrator/skills/cc-capture-generate/SKILL.md
git commit -m "feat: add cc-capture-generate skill for workflow replay"
```

---

### Task 3: Register skills in plugin marketplace

**Files:**
- Modify: `plugins/cc-orchestrator/.claude-plugin/plugin.json`

**Step 1: Check current plugin.json**

Read `plugins/cc-orchestrator/.claude-plugin/plugin.json` to see if skills are registered there or auto-discovered.

**Step 2: Verify skill discovery**

Skills in the `plugins/cc-orchestrator/skills/` directory follow the same pattern as existing skills (`cc-orchestrator`, `cartographer`, `cco-update`, `cc-master`). Verify that the new skills appear in Claude Code's skill list.

Run: `ls plugins/cc-orchestrator/skills/`
Expected: `cartographer  cc-capture  cc-capture-generate  cc-master  cc-orchestrator  cco-update`

**Step 3: Commit (if plugin.json was modified)**

```bash
git add plugins/cc-orchestrator/.claude-plugin/plugin.json
git commit -m "chore: register cc-capture skills in plugin"
```

---

### Task 4: End-to-end smoke test

**Step 1: Verify skill loads**

Start a new Claude Code session and invoke `/cc-capture`. Verify:
- Claude asks for task description
- `workflow-trace.json` is created with correct schema
- Claude proceeds with the task while tracing

**Step 2: Verify trace output**

After a short task (e.g., "List all TypeScript files and count lines"), check:
- `workflow-trace.json` has steps with intent/reasoning/actions/outcome
- `params` contains detected parameters (at minimum `project_root`)
- `summary` is written on completion

**Step 3: Verify generate**

Invoke `/cc-capture-generate`. Verify:
- Reads `workflow-trace.json` successfully
- Shows parameter table for review
- Produces `parameterized-workflow.json` with `replay_config`
- Generates a SKILL.md with the correct structure
- Both deterministic and reasoning steps are formatted correctly

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: cc-capture skill pair complete — workflow tracing and replay generation"
```
