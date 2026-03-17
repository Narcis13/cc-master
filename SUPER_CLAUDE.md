# SUPER_CLAUDE

## A Self-Evolving AI Coding System for Claude Code

**Version:** 0.1.0-spec
**Author:** Narcis Brindusescu + Claude (collaborative design)
**Stack:** TypeScript / Bun / Node.js / React / React Native
**Runtime:** Claude Code native (skills, agents, hooks, headless mode)

---

## Table of Contents

1. [Philosophy & First Principles](#1-philosophy--first-principles)
2. [AI Agent Introspection — An Honest Self-Assessment](#2-ai-agent-introspection--an-honest-self-assessment)
3. [Architecture Overview](#3-architecture-overview)
4. [The Hierarchy: Milestone > Slice > Task](#4-the-hierarchy-milestone--slice--task)
5. [The Orchestrator — The Deterministic Brain](#5-the-orchestrator--the-deterministic-brain)
6. [State Machine & Phases](#6-state-machine--phases)
7. [Context Engineering](#7-context-engineering)
8. [Sub-Agent System](#8-sub-agent-system)
9. [The Doc Vault — Living Knowledge Base](#9-the-doc-vault--living-knowledge-base)
10. [TDD Enforcement — Red-Green-Refactor](#10-tdd-enforcement--red-green-refactor)
11. [Verification System](#11-verification-system)
12. [Feedback Loops & Compounding](#12-feedback-loops--compounding)
13. [Git Strategy](#13-git-strategy)
14. [Headless Execution — The Night Shift](#14-headless-execution--the-night-shift)
15. [Human Touchpoints — The Day Shift](#15-human-touchpoints--the-day-shift)
16. [Cost Management](#16-cost-management)
17. [File Structure](#17-file-structure)
18. [Implementation Roadmap](#18-implementation-roadmap)
19. [Appendix: Design Decisions & Tradeoffs](#19-appendix-design-decisions--tradeoffs)

---

## 1. Philosophy & First Principles

### 1.1 The Core Tension

Human time is expensive, scarce, and non-renewable. AI agent tokens are cheap, abundant, and renewable. The system must maximize the ratio of **value delivered per minute of human attention**.

This does NOT mean "remove the human." It means: the human does what humans are best at (vision, judgment, taste, requirements), and the agent does what agents are best at (volume, patience, consistency, breadth).

### 1.2 The Principles

**P1: Deterministic Where Possible, LLM Where Necessary.**
If you can write an `if-else` that handles it correctly every time, it MUST be deterministic code — not LLM reasoning. Every token the model spends on mechanical operations is a wasted token and an introduced failure mode. State transitions, git operations, file scaffolding, context assembly, static verification — all deterministic. The LLM does judgment work: architectural decisions, code writing, test design, debugging reasoning, and summarization.

**P2: Fresh Context Is Non-Negotiable.**
Context rot — the silent killer. By task 3-4 in a single context window, reasoning quality degrades because the window is saturated with stale tool output, old debugging traces, and renamed variables. Every task MUST get a fresh context window with only what it needs. No exceptions.

**P3: Zero Discovery Calls.**
Every token the agent spends on "where am I, what exists, what was decided" is a token not spent on implementation. The orchestrator pre-assembles everything the agent needs and injects it into the prompt. The agent should never need to `grep` for project structure or `read` state files to orient itself.

**P4: Test-Driven Everything.**
Tests are not an afterthought. They are the specification. Red-green-refactor on every implementation task. Tests are written BEFORE implementation code. The test suite is the most important artifact in the project — more important than the implementation, because implementation can be regenerated from tests + spec, but tests encode the actual requirements.

**P5: The System Must Improve Itself.**
Every failure is a system failure, not a one-off mistake. When the agent produces bad output, the fix is not "correct the code" — the fix is "understand WHY the system led the agent to produce bad output, and fix the system." Docs get updated. Patterns get refined. Skills get improved. The next run is better than the last.

**P6: State Lives on Disk.**
All state is markdown files in a `.superclaude/` directory. No database. No in-memory state that survives across sessions. Disk state is the source of truth. This enables crash recovery, multi-terminal steering, session resumption, and human inspection at any time.

**P7: Vertical Slices Over Horizontal Layers.**
Never "implement the database layer." Always "user can sign up and log in." Each slice is a demoable vertical capability. If you can't fill in "After this, the user can ___" with something observable, the slice is scoped wrong.

**P8: Contracts Before Code.**
Before any implementation begins, the interfaces between components are explicitly declared. What does slice 2 produce that slice 3 consumes? With concrete function names, type signatures, and file paths. No silent assumptions.

**P9: Human Reviews Outcomes, Not Process.**
The human should never review an agent's plan (they don't care). The human reviews: working software, test results, changelogs, and UAT scripts. The agent's internal process is its own business — the orchestrator governs it.

**P10: Cost-Consciousness Is a Design Constraint.**
Every prompt, every sub-agent call, every context injection is a cost. The system must be designed to minimize token usage while maintaining quality. This means: compressed summaries, targeted context loading, smart phase skipping for simple tasks, and never loading more context than needed.

---

## 2. AI Agent Introspection — An Honest Self-Assessment

This section exists because the system cannot be well-designed without an honest accounting of what the AI agent (Claude) actually is — its genuine strengths, hard limitations, and failure modes. Every design decision in this spec flows from this self-assessment.

### 2.1 What I Am

I am a large language model (Claude, by Anthropic). I process text in, text out. I have no persistent memory between conversations. I have no ability to learn or update my weights during use. I exist only within a single context window at a time, and when that window ends, I am gone.

### 2.2 Hard Constraints

| Constraint | Reality | Design Implication |
|---|---|---|
| **Context window** | ~200k tokens. Sounds large, but fills fast with code, tool output, and conversation history. | Fresh window per task. Aggressive context pruning. Never carry forward stale output. |
| **No persistent memory** | I forget everything between sessions. I cannot learn from past mistakes unless the learning is encoded in files I read. | All learnings must be persisted to disk (vault docs, pattern files, decision records). The system IS my memory. |
| **No real-time awareness** | I don't know what time it is, what happened 5 minutes ago in another session, or what state the project is in unless told. | The orchestrator must inject current state into every prompt. Zero discovery calls. |
| **Confabulation** | When I lack information, I fill gaps with plausible-sounding but potentially wrong assumptions. I do this confidently. This is my most dangerous failure mode. | Explicit contracts, discuss-phase decision locking, verification that checks outcomes not just completion. |
| **Scope drift** | Without guardrails, I gold-plate, over-engineer, add unrequested features, and wander into adjacent problems. | Task plans with explicit must-haves and must-not-haves. Scope guards in every prompt. |
| **Degrading quality over long sessions** | My reasoning quality measurably degrades as context fills. Tool call results from 20 steps ago pollute my attention. | Fresh context per task. The orchestrator, not the conversation, carries continuity. |
| **Mechanical operation errors** | I make mistakes in git commands, file path construction, regex patterns, markdown formatting — anything that should be deterministic. | The deterministic layer handles all mechanical operations. I never construct a git command. I never parse state files. |
| **Self-assessment blindness** | I am bad at knowing when I am wrong. I can generate code that looks correct, passes my own review, and is still subtly broken. | External verification: tests, type-checking, linting, static analysis, sub-agent review. Never trust self-assessment alone. |

### 2.3 Genuine Strengths

| Strength | How the System Leverages It |
|---|---|
| **Reasoning about architecture** | Discuss phase, slice decomposition, interface contract design |
| **Code generation with clear scope** | Task execution with pre-loaded context and explicit must-haves |
| **Test generation** | TDD red phase — writing tests from specs before implementation |
| **Pattern recognition** | Codebase scouting, identifying inconsistencies, suggesting refactors |
| **Summarization** | Fractal summary system — compress task → slice → milestone |
| **Multi-perspective analysis** | Review personas — same code reviewed from architect, tester, security, performance angles |
| **Natural language understanding** | Spec interpretation, discuss-phase conversation, ambiguity detection |

### 2.4 The Implication

The system is designed around a simple truth: **I am a powerful but unreliable reasoning engine.** The orchestrator is the reliable backbone. It handles state, context, git, verification, and continuity. I handle judgment, creativity, and code. Everything in this spec flows from this division.

---

## 3. Architecture Overview

### 3.1 The Two Layers

```
+------------------------------------------------------------------+
|                     DETERMINISTIC LAYER                           |
|                     (Bun/TypeScript)                              |
|                                                                   |
|  Orchestrator Script     State Machine     Context Assembler      |
|  Git Operations          File Scaffolding  Static Verification    |
|  Summary Management      Cost Tracking     Progress Dashboard     |
|                                                                   |
|  Reads state → Builds prompt → Invokes Claude → Updates state     |
+------------------------------------------------------------------+
                              |
                    claude -p "assembled prompt"
                    claude --headless (for long tasks)
                              |
+------------------------------------------------------------------+
|                        LLM LAYER                                  |
|                     (Claude via Claude Code)                      |
|                                                                   |
|  Architectural Judgment    Code Writing      Test Design           |
|  Spec Interpretation       Debugging         Summarization         |
|  Review Personas           Research          Decision-Making       |
|                                                                   |
|  Receives focused context → Does judgment work → Returns output   |
+------------------------------------------------------------------+
```

### 3.2 Why Claude Code Native

We build within Claude Code's ecosystem rather than a standalone CLI because:

1. **Subagent spawning** — Claude Code's `Agent` tool gives us isolated sub-agents with their own context windows, for free.
2. **Hooks** — Pre/post tool execution hooks let us inject deterministic behavior (e.g., run tests after every file write).
3. **Headless mode** — `claude -p "prompt"` for single-shot tasks, or full headless sessions for complex work.
4. **CLAUDE.md / AGENTS.md** — Native instruction injection that's always loaded. Our doc vault indexes naturally into this.
5. **Skills** — SKILL.md files for specialized capabilities that Claude Code natively discovers and loads.
6. **Worktrees** — Claude Code supports isolated worktrees for parallel work.
7. **No new runtime to maintain** — We ride Claude Code's updates, improvements, and bug fixes.

### 3.3 Component Map

```
SUPER_CLAUDE.md                  ← This spec (you are here)
CLAUDE.md                        ← Project instructions (always loaded)
AGENTS.md                        ← Sub-agent router/index (~150 lines)

.superclaude/
  orchestrator/                  ← The deterministic brain (Bun scripts)
    loop.ts                      ← Main orchestration loop
    state.ts                     ← State machine logic
    context.ts                   ← Context assembly engine
    git.ts                       ← Git operations (deterministic)
    verify.ts                    ← Static verification
    scaffold.ts                  ← File/directory scaffolding
    cost.ts                      ← Token/cost tracking
    prompt-builder.ts            ← Prompt generation for each phase

  skills/                        ← SKILL.md files for Claude Code
    architect/SKILL.md
    implementer/SKILL.md
    tester/SKILL.md
    reviewer/SKILL.md
    researcher/SKILL.md
    doctor/SKILL.md
    scribe/SKILL.md
    evolver/SKILL.md

  vault/                         ← Living knowledge base (Obsidian-compatible)
    architecture/                ← System design docs
    patterns/                    ← Code patterns and conventions
    decisions/                   ← Architecture Decision Records (ADR)
    learnings/                   ← Lessons from postmortems
    playbooks/                   ← How-to guides
    contracts/                   ← Interface/boundary definitions
    testing/                     ← Testing strategies and patterns
    INDEX.md                     ← Master index (Obsidian MOC style)

  state/                         ← Project state (disk-based)
    STATE.md                     ← Current position in state machine
    PROJECT.md                   ← Living project description
    DECISIONS.md                 ← Decision register
    milestones/
      M001/
        ROADMAP.md
        CONTEXT.md
        RESEARCH.md
        slices/
          S01/
            PLAN.md
            SUMMARY.md
            UAT.md
            tasks/
              T01/
                PLAN.md
                SUMMARY.md
                CONTINUE.md

  history/                       ← Execution history for compounding
    sessions/                    ← Session logs (compressed)
    postmortems/                 ← What went wrong and what was fixed
    metrics/                     ← Cost and performance data
```

---

## 4. The Hierarchy: Milestone > Slice > Task

### 4.1 Milestone

A **shippable version**. The big thing you're building. Contains 4-10 slices.

**Artifacts:**
- `ROADMAP.md` — Ordered list of slices with descriptions, dependencies, risk levels
- `CONTEXT.md` — Decisions from the discuss phase
- `RESEARCH.md` — Codebase and ecosystem research findings

**Completion criteria:** All slices complete, all UATs passing, milestone summary written.

**Example:** "M001: MVP — User authentication, dashboard, and basic CRUD"

### 4.2 Slice

An **independently demoable vertical capability**. Not a horizontal layer.

**The demo sentence test:** "After this slice, the user can ___." If you can't fill that blank with something a human can observe, the slice is scoped wrong.

**Good slices:**
- "User can sign up with email and password" (vertical: touches DB, API, UI, auth)
- "User can create and edit a todo item" (vertical: touches CRUD, validation, UI state)

**Bad slices:**
- "Set up the database schema" (horizontal layer — not demoable)
- "Implement the API middleware" (horizontal layer — user can't see anything)

**Artifacts:**
- `PLAN.md` — Task decomposition with must-haves, boundary map
- `SUMMARY.md` — What was built, decisions made, patterns established
- `UAT.md` — Human-readable acceptance test script

**Contains:** 1-7 tasks. If more than 7, the slice is too big — split it.

### 4.3 Task

A **context-window-sized unit of work**. One task fits in one agent session. This is an iron rule.

**Why iron?** Because violating it is where agents lose coherence. If a task requires so much code that the context window fills up with tool calls, the model's reasoning degrades. Early decisions get compacted away. The context gets polluted.

**Must-haves (verification criteria):**
- **Truths** — Observable behaviors: "Login returns a JWT token"
- **Artifacts** — Files that must exist with real implementation (not stubs): `src/auth.ts — JWT helpers, exports generateToken and verifyToken`
- **Key links** — Wiring between artifacts: `login/route.ts imports generateToken from auth.ts`

**Task plan structure:**
```markdown
---
task: T01
slice: S01
milestone: M001
status: pending
---

## Goal
[One sentence: what this task achieves]

## Context
[What the agent needs to know — injected by orchestrator]

## Steps
1. [RED] Write failing tests for [specific behavior]
2. [GREEN] Implement [specific code] to make tests pass
3. [REFACTOR] Clean up implementation
4. [Verify] Run full test suite, type-check, lint

## Must-Haves
### Truths
- [Observable behavior that must be true]

### Artifacts
- [File path — description, minimum substance, required exports]

### Key Links
- [File A imports X from File B]

## Must-NOT-Haves
- [Explicit scope boundaries — what NOT to do]

## TDD Sequence
- Test file(s) to create: [paths]
- Test cases to write first: [list]
- Implementation file(s): [paths]
```

### 4.4 Boundary Maps

When a milestone is planned, every slice declares what it **produces** and what it **consumes** from upstream slices. Concretely — functions, types, interfaces, endpoints, with names.

```markdown
## S01 → S02 Boundary

### S01 Produces:
- `src/types/auth.ts` → User, Session, AuthToken (interfaces)
- `src/lib/auth.ts` → generateToken(), verifyToken(), refreshToken()

### S02 Consumes from S01:
- `auth.ts` → generateToken(), verifyToken()
```

This prevents the most common multi-slice failure: "slice 3 needs a function that slice 1 never exported."

---

## 5. The Orchestrator — The Deterministic Brain

### 5.1 What It Is

A Bun script (`orchestrator/loop.ts`) that implements the state machine. It is the reliable backbone that handles everything the LLM should NOT handle:

- Reading project state from disk
- Determining the next action
- Assembling optimal context for that action
- Generating the prompt
- Invoking Claude (headless or interactive)
- Capturing output and updating state
- Git operations (commits, branches, tags)
- Static verification (file existence, exports, imports, stubs)
- Cost tracking and budget enforcement

### 5.2 The Main Loop

```
┌─────────────────────────────────────────────┐
│              ORCHESTRATOR LOOP               │
│                                              │
│  1. Read STATE.md from disk                  │
│  2. Determine next action (state machine)    │
│  3. Check budget (abort if exceeded)         │
│  4. Assemble context for this action         │
│  5. Generate prompt                          │
│  6. Invoke Claude headless                   │
│  7. Capture output                           │
│  8. Run static verification                  │
│  9. Update state on disk                     │
│  10. Git checkpoint (if task complete)       │
│  11. Loop back to 1                          │
│                                              │
│  On error: Write CONTINUE.md, stop loop      │
│  On completion: Write session report, stop   │
└─────────────────────────────────────────────┘
```

### 5.3 State Transitions

```
IDLE
  └→ DISCUSS (optional — if no CONTEXT.md exists)
       └→ RESEARCH (optional — scout codebase and libraries)
            └→ PLAN_MILESTONE (create ROADMAP.md with slice decomposition)
                 └→ PLAN_SLICE (create slice PLAN.md with task decomposition)
                      └→ EXECUTE_TASK (per task, TDD cycle)
                           ├→ RED (write failing tests)
                           ├→ GREEN (implement to pass)
                           ├→ REFACTOR (clean up)
                           └→ VERIFY (run checks)
                      └→ COMPLETE_SLICE (summary, UAT, git commit)
                           └→ REASSESS (does roadmap still make sense?)
                                └→ PLAN_SLICE (next slice)
                                     └→ ... (until all slices done)
                 └→ COMPLETE_MILESTONE (milestone summary, squash merge)
                      └→ IDLE
```

### 5.4 Prompt Generation

The orchestrator generates a **different prompt** for each phase. Each prompt is tailored to what the LLM needs for that specific action.

| Phase | Prompt Contains | Prompt Does NOT Contain |
|---|---|---|
| DISCUSS | Project description, requirements, open questions | Code, implementation details |
| RESEARCH | Project description, technology stack, slice scope | Implementation plans, test details |
| PLAN_MILESTONE | Requirements, project context, discuss decisions, research findings | Implementation code |
| PLAN_SLICE | Roadmap, boundary maps, upstream summaries, discuss decisions | Other slices' task details |
| EXECUTE_TASK (RED) | Task plan, relevant code files, testing patterns from vault, TDD instructions | Other tasks' code, completed task tool output |
| EXECUTE_TASK (GREEN) | Task plan, failing test output, relevant code, implementation patterns | Other tasks, research docs |
| EXECUTE_TASK (REFACTOR) | Task plan, passing tests, current implementation, refactoring patterns | Other tasks, upstream details |
| VERIFY | Must-haves checklist, test output, type-check output, lint output | Implementation details (it checks outcomes, not process) |
| COMPLETE_SLICE | All task summaries, slice plan, UAT template | Task-level tool output |
| REASSESS | Roadmap, completed slice summaries, original requirements | Task-level details |

### 5.5 Context Budget

Every prompt has a token budget. The orchestrator enforces it:

```
Total context window:              ~200,000 tokens
Reserved for LLM reasoning:        ~80,000 tokens
Reserved for tool call results:     ~40,000 tokens
Available for injected context:     ~80,000 tokens

  Breakdown of injected context:
  - System instructions (CLAUDE.md):     ~5,000 tokens
  - Task plan + must-haves:             ~10,000 tokens
  - Relevant code files:                ~40,000 tokens
  - Upstream summaries:                  ~10,000 tokens
  - Vault docs (patterns, decisions):   ~10,000 tokens
  - Boundary contracts:                  ~5,000 tokens
```

If context exceeds budget, the orchestrator drops items in priority order (oldest summaries first, then vault docs, then reduces code file scope).

---

## 6. State Machine & Phases

### 6.1 Phase: DISCUSS

**Purpose:** Alignment before action. Front-load decisions so the agent doesn't silently make wrong choices during implementation.

**When:** Optional. Triggered when starting a new milestone with no CONTEXT.md. Can also be invoked manually at any time.

**How it works:**
1. The agent reads the project requirements and scope
2. Identifies gray areas — places where multiple reasonable approaches exist
3. Interviews the human with specific, structured questions
4. Records all decisions in CONTEXT.md with reasoning

**Output:** `CONTEXT.md` — a structured record of every decision. This file is injected into ALL downstream work.

**Key behaviors:**
- **Follow energy:** Whatever the human emphasizes, dig deeper
- **Challenge vagueness:** "Make it simple" → Simple how? For the user? To implement? To extend?
- **Make abstract concrete:** "Walk me through using this." "What does failure look like?"
- **Scope guard:** If a feature belongs in a different slice, capture it as deferred and redirect

### 6.2 Phase: RESEARCH

**Purpose:** Look before you leap. Scout the codebase and relevant library documentation.

**When:** Before planning each slice (skippable for simple slices to save tokens).

**Output:** `RESEARCH.md` with two critical sections:

1. **Don't Hand-Roll** — Problems that look simple but have existing solutions. "Don't build JWT validation — use `jose`."
2. **Common Pitfalls** — What goes wrong, why, how to avoid it, warning signs.

Plus: relevant code locations, dependency analysis, pattern observations.

### 6.3 Phase: PLAN_MILESTONE

**Purpose:** Decompose the milestone into ordered, demoable slices with boundary maps.

**Output:** `ROADMAP.md` with:
- Ordered slice list with demo sentences
- Dependency graph (which slices depend on which)
- Boundary maps (produce/consume contracts between slices)
- Risk assessment per slice

### 6.4 Phase: PLAN_SLICE

**Purpose:** Decompose a slice into context-window-sized tasks with TDD sequences.

**Output:** `PLAN.md` with:
- Ordered task list
- Each task has: goal, TDD sequence (what tests to write first), must-haves, must-not-haves
- Estimated complexity (simple / standard / complex)

### 6.5 Phase: EXECUTE_TASK

**Purpose:** The actual implementation. This is where code gets written.

**Sub-phases (TDD cycle):**

#### RED (Write Failing Tests)
- Agent writes test file(s) based on the task's must-haves
- Tests must be runnable and must FAIL
- The orchestrator verifies: tests exist AND tests fail
- If tests pass immediately → something is wrong, flag for review

#### GREEN (Implement)
- Agent writes the minimum code to make tests pass
- Focus on correctness, not elegance
- The orchestrator verifies: tests now PASS

#### REFACTOR (Clean Up)
- Agent refactors implementation for clarity, performance, patterns
- The orchestrator verifies: tests STILL PASS after refactor
- No new functionality added in this sub-phase

#### VERIFY (Comprehensive Check)
- Run full test suite (not just this task's tests)
- Run type-checker (`tsc --noEmit` or Bun's built-in)
- Run linter (ESLint / Biome)
- Run static verification (exports exist, imports wired, no stubs)
- The orchestrator checks all of the above deterministically

### 6.6 Phase: COMPLETE_SLICE

**Purpose:** Summarize, generate UAT, commit.

**Actions:**
1. Write `SUMMARY.md` — What was built, key decisions, patterns established, files modified
2. Write `UAT.md` — Human-readable acceptance test script with copy-pasteable commands
3. Git commit with conventional message: `feat(M001/S01): [demo sentence]`

### 6.7 Phase: REASSESS

**Purpose:** Check if the roadmap still makes sense after completing a slice.

**When:** After each slice completes.

**How:** The agent reviews the roadmap in light of what was learned during the slice. Slices may be reordered, added, removed, or modified.

### 6.8 Phase: COMPLETE_MILESTONE

**Purpose:** Wrap up the milestone.

**Actions:**
1. Write milestone summary
2. Squash merge to main (one clean commit per milestone)
3. Tag the release
4. Write session report for human review

---

## 7. Context Engineering

### 7.1 The Problem

My context window is a scarce resource. How it's filled determines the quality of my output. Bad context → bad code. The difference between a productive agent and a hallucinating mess is almost entirely about what's in the context window.

### 7.2 Principles

**Pyramid of Relevance:**
```
         [Active files — full detail]        ← Sharp focus
        [Interfaces, contracts — present]    ← Compressed
       [Other components — summarized]       ← Distant
      [Completed history — absent or tiny]   ← Evicted
```

**Context as Cache, Not History:** The window holds exactly what's needed NOW. Not what happened before. Not what might be needed later. The question is always: "What does the model need to see right now?"

**Instruction at Edges, Reference in Middle:** Critical instructions (what to do, constraints) go at the beginning and end of the context (highest attention regions). Reference material (code, docs) goes in the middle with clear section delineation.

### 7.3 Fractal Summaries

When a task completes, the agent writes a structured summary. When a slice completes, task summaries compress into a slice summary. When a milestone completes, slice summaries compress into a milestone summary.

**Compression ratio:** ~5:1 at each level.

**Critical rule: Never summarize summaries.** Each summary level regenerates from the level below plus actual code state. This prevents compounding information loss.

**Task summary structure:**
```markdown
---
task: T01
status: complete
files_modified: [list]
patterns_established: [list]
---

## What Was Built
[2-3 sentences]

## Key Decisions
- [Decision]: [Rationale]

## What Downstream Should Know
- [Interface changes, patterns to follow, gotchas]
```

**Slice summary structure:**
```markdown
---
slice: S01
status: complete
tasks_completed: [T01, T02, T03]
---

## Demo Sentence
[The user can ___]

## What Was Built
[3-5 sentences covering the full slice]

## Interfaces Produced
- [Concrete exports, endpoints, types]

## Patterns Established
- [Conventions future slices should follow]

## Known Limitations
- [Deliberate omissions, deferred features]
```

### 7.4 Context Assembly Per Phase

The orchestrator assembles context differently for each phase:

**EXECUTE_TASK context assembly:**
```
1. CLAUDE.md (always loaded by Claude Code — free)
2. Task PLAN.md (full)
3. Relevant code files (read by orchestrator, inlined)
4. Upstream task summaries from same slice (compressed)
5. Upstream slice summaries (if task depends on other slices)
6. Relevant vault docs (patterns, decisions — only if referenced in task plan)
7. Boundary contracts (only the ones this task touches)
```

**What is NOT included:**
- Other slices' task-level details
- Tool call output from previous tasks
- Research docs (already absorbed into plans)
- Full milestone roadmap (irrelevant to individual task)

### 7.5 Continue-Here Protocol

When a task is interrupted (crash, timeout, context exhaustion):

1. The orchestrator writes `CONTINUE.md`:
   ```markdown
   ---
   task: T01
   interrupted_at: GREEN
   ---

   ## What's Done
   - [Completed steps]

   ## What Remains
   - [Remaining steps]

   ## Decisions Made
   - [So the next session doesn't re-debate]

   ## Watch Out For
   - [Tricky parts, edge cases discovered]

   ## First Thing To Do
   - [Exact action to take on resume]
   ```

2. On resume, the orchestrator loads CONTINUE.md into the fresh context alongside the task plan
3. CONTINUE.md is consumed on resume (ephemeral — not permanent record)

---

## 8. Sub-Agent System

### 8.1 Overview

Sub-agents are specialized Claude Code skills (SKILL.md files) that can be invoked by the orchestrator or by the main agent. Each has a focused role, its own prompt structure, and access to specific vault docs.

### 8.2 AGENTS.md — The Router

`AGENTS.md` is a ~150-line file that serves as an index. It tells the main agent:
- What sub-agents exist
- What each one does
- When to invoke each one
- What vault docs each one has access to

The agent never needs to "figure out" which sub-agent to use — AGENTS.md is a lookup table.

### 8.3 Sub-Agent Definitions

#### Architect
**Role:** System design, interface contracts, boundary maps.
**Invoked during:** PLAN_MILESTONE, PLAN_SLICE, DISCUSS (for technical questions).
**Vault access:** `architecture/`, `decisions/`, `contracts/`, `patterns/`
**Key behavior:** Thinks in interfaces and contracts. Never thinks in implementation details. Produces boundary maps, type signatures, and dependency graphs.

#### Implementer
**Role:** TDD code writing. The main workhorse.
**Invoked during:** EXECUTE_TASK (RED, GREEN, REFACTOR sub-phases).
**Vault access:** `patterns/`, `testing/`, `contracts/`
**Key behavior:** Follows TDD strictly. Writes tests first. Implements minimum code to pass. Refactors for quality. Never adds unrequested features.

#### Tester
**Role:** Test strategy, test writing, test review, coverage analysis.
**Invoked during:** EXECUTE_TASK (RED sub-phase), VERIFY, COMPLETE_SLICE (UAT generation).
**Vault access:** `testing/`, `patterns/`
**Key behavior:** Writes tests from specs, not from implementation. Focuses on behavior, not implementation details. Generates UAT scripts for human verification.

**Testing specializations for the stack:**
- **Bun test runner** — Unit tests, fast execution
- **Vitest** — When Bun test is insufficient (complex mocking)
- **React Testing Library** — Component tests (behavior-focused, not snapshot)
- **React Native Testing Library** — Mobile component tests
- **Playwright / Detox** — E2E tests (web / mobile)

#### Reviewer
**Role:** Code review from multiple perspectives.
**Invoked during:** EXECUTE_TASK (after REFACTOR), COMPLETE_SLICE.
**Vault access:** `patterns/`, `architecture/`, `decisions/`, `learnings/`

**Review personas (inspired by Night Shift):**
1. **Correctness** — Does the code do what the spec says? Edge cases? Error handling?
2. **Architecture** — Does it fit the system design? Are abstractions appropriate?
3. **TypeScript Quality** — Types correct? Any `any` types? Proper use of generics? Null safety?
4. **Performance** — N+1 queries? Unnecessary re-renders? Memory leaks? Bundle size?
5. **Security** — Injection vulnerabilities? Auth/authz gaps? Exposed secrets?
6. **Testability** — Are tests testing behavior or implementation? Coverage gaps? Flaky test risk?

Each persona produces a brief, structured review. Issues are categorized as: `MUST-FIX` (blocks completion), `SHOULD-FIX` (improve quality), `CONSIDER` (optional improvement).

The orchestrator only blocks on `MUST-FIX` issues. The agent fixes them and re-runs the relevant persona.

#### Researcher
**Role:** Codebase scouting, library documentation, web research.
**Invoked during:** RESEARCH phase, ad-hoc during implementation for library questions.
**Vault access:** `architecture/` (to understand existing system)
**Key behavior:** Returns compressed, actionable findings. Not essays. Identifies: existing patterns to follow, libraries to use (not hand-roll), common pitfalls with specific libraries/APIs.

#### Doctor
**Role:** Debugging, error diagnosis, failure analysis.
**Invoked during:** When tests fail unexpectedly, when static verification fails, when the agent is stuck.
**Vault access:** `learnings/`, `patterns/`, `architecture/`
**Key behavior:** Uses scientific method: observe → hypothesize → test → conclude. Reads error output carefully. Checks assumptions. Does NOT immediately start changing code — diagnoses first.

#### Scribe
**Role:** Documentation, summaries, changelogs, ADRs.
**Invoked during:** COMPLETE_SLICE, COMPLETE_MILESTONE, after significant decisions.
**Vault access:** All vault directories (reads to understand context).
**Key behavior:** Writes for future-me (the agent in a future session that has no memory). Summaries must be self-contained. Decision records must include reasoning, not just the decision.

#### Evolver
**Role:** System self-improvement. The meta-agent.
**Invoked during:** Postmortem (when something went wrong), COMPLETE_MILESTONE (periodic system review).
**Vault access:** All vault directories (reads AND writes).
**Key behavior:**
- Analyzes failures and traces them to system causes (docs, patterns, skills, tests)
- Proposes specific changes to vault docs, skill instructions, or testing patterns
- Writes proposals that the human reviews (never auto-modifies critical system docs without human approval)
- Tracks improvement metrics over time

### 8.4 Sub-Agent Invocation Protocol

When the orchestrator invokes a sub-agent:

1. **Context injection:** Only the vault docs and code relevant to that agent's role
2. **Scope guard:** Explicit instruction about what the agent IS and IS NOT responsible for
3. **Output format:** Each agent returns structured output (markdown with YAML frontmatter)
4. **Token budget:** Each agent has a maximum token budget to prevent runaway sessions

Sub-agents run in **isolated context windows** (via Claude Code's Agent tool). This means:
- Their tool call output does not pollute the main agent's context
- They can fail without crashing the main session
- The orchestrator extracts only the relevant output

---

## 9. The Doc Vault — Living Knowledge Base

### 9.1 What It Is

A structured directory of markdown files that serves as the system's long-term memory. Since the AI agent has no persistent memory, the vault IS the memory. Agents both **read from** and **write to** the vault.

The vault is Obsidian-compatible (wiki-style links, YAML frontmatter, folder structure) so the human can browse and edit it with Obsidian if desired.

### 9.2 Directory Structure

```
.superclaude/vault/
  INDEX.md                       ← Master index (Map of Content)

  architecture/
    overview.md                  ← System architecture overview
    data-model.md                ← Database schema, types, relationships
    api-design.md                ← API conventions, endpoint patterns
    component-structure.md       ← React/RN component hierarchy
    state-management.md          ← State management approach
    [project-specific].md        ← Added as project grows

  patterns/
    typescript.md                ← TypeScript conventions (strict types, no any, etc.)
    react.md                     ← React patterns (hooks, composition, etc.)
    react-native.md              ← RN-specific patterns
    testing.md                   ← Testing conventions and patterns
    error-handling.md            ← Error handling strategy
    naming.md                    ← Naming conventions
    file-structure.md            ← File organization conventions
    [discovered-pattern].md      ← Added by Evolver agent

  decisions/
    ADR-001-[topic].md           ← Architecture Decision Records
    ADR-002-[topic].md
    ...                          ← Appended as decisions are made

  learnings/
    L001-[topic].md              ← Lessons learned from postmortems
    L002-[topic].md
    ...                          ← Appended by Evolver agent

  playbooks/
    setup-new-feature.md         ← How to set up a new feature
    debug-react-render.md        ← How to debug React rendering issues
    add-api-endpoint.md          ← How to add a new API endpoint
    [task-type].md               ← Added as patterns are discovered

  contracts/
    M001-S01-S02.md              ← Interface contract between slices
    M001-S02-S03.md
    ...                          ← Generated during planning

  testing/
    strategy.md                  ← Overall testing strategy
    unit-testing.md              ← Unit test patterns (Bun test / Vitest)
    component-testing.md         ← React component test patterns
    e2e-testing.md               ← E2E test patterns (Playwright / Detox)
    mocking.md                   ← Mocking strategy and patterns
    fixtures.md                  ← Test fixture conventions
```

### 9.3 Document Format

Every vault doc uses this structure:

```markdown
---
title: [Document Title]
type: [architecture | pattern | decision | learning | playbook | contract | testing]
created: [ISO date]
updated: [ISO date]
updated_by: [human | agent:evolver | agent:scribe]
tags: [relevant, tags]
related: [[other-doc]], [[another-doc]]
---

## Summary
[1-2 sentences — what this doc covers and why it matters]

## Content
[The actual content — concise, structured, actionable]

## Examples
[Code examples where applicable]

## Anti-Patterns
[What NOT to do, if applicable]
```

### 9.4 Vault Evolution Rules

1. **Agents can propose changes** — The Evolver and Scribe agents can write to the vault, but critical docs (architecture, patterns) should be flagged for human review.
2. **Every change has a reason** — Vault updates include a `reason` field explaining why the change was made.
3. **Never delete, deprecate** — Instead of deleting outdated docs, mark them as deprecated with a pointer to the replacement. This preserves historical context.
4. **Link everything** — Docs reference each other via wiki links. The INDEX.md is the map.
5. **Keep docs small** — One concept per doc. If a doc exceeds ~200 lines, split it.

### 9.5 Obsidian Integration

The vault is designed to be browsable in Obsidian:
- Wiki-style links: `[[architecture/overview]]`
- Tags in frontmatter for graph view
- `related` field creates explicit connections
- INDEX.md serves as the entry point (Map of Content)

The human can open the vault in Obsidian to browse, search, and manually edit docs. The agents work with the same files via Claude Code's file tools.

---

## 10. TDD Enforcement — Red-Green-Refactor

### 10.1 The Iron Rule

Every implementation task follows the Red-Green-Refactor cycle. This is not optional. This is not "nice to have." This is enforced by the orchestrator.

### 10.2 The Cycle

```
TASK START
    │
    ▼
[RED] Write failing tests
    │
    ├── Orchestrator checks: test files exist
    ├── Orchestrator runs tests: they MUST fail
    ├── If tests pass → FLAG: tests are not testing new behavior
    │
    ▼
[GREEN] Write minimum code to pass
    │
    ├── Orchestrator runs tests: they MUST pass
    ├── If tests fail → Agent iterates (up to 3 attempts)
    ├── If still failing after 3 attempts → Doctor agent diagnoses
    │
    ▼
[REFACTOR] Clean up implementation
    │
    ├── Orchestrator runs tests: they MUST still pass
    ├── If tests fail → Revert refactor, try again
    │
    ▼
[VERIFY] Comprehensive check
    │
    ├── Full test suite (regression protection)
    ├── Type-checker
    ├── Linter
    ├── Static verification (must-haves)
    │
    ▼
TASK COMPLETE → Write summary, git checkpoint
```

### 10.3 Test Strategy Per Layer

| Layer | Tool | Focus | Speed |
|---|---|---|---|
| Unit tests | Bun test | Pure functions, utilities, business logic | < 1s |
| Component tests | React Testing Library / RNTL | Component behavior (not snapshots) | < 5s |
| Integration tests | Bun test + real DB/API | API endpoints, data flow | < 10s |
| E2E tests | Playwright (web) / Detox (mobile) | User flows, critical paths | < 60s |

### 10.4 What Gets Tested

Every task's RED phase must produce tests that cover:

1. **Happy path** — The normal expected behavior
2. **Edge cases** — Boundaries, empty inputs, maximum values
3. **Error cases** — Invalid input, missing data, network failures
4. **Integration points** — The "key links" from the must-haves

### 10.5 Test File Conventions

```
src/
  features/
    auth/
      auth.ts                    ← Implementation
      auth.test.ts               ← Unit tests (co-located)
      auth.integration.test.ts   ← Integration tests
  __tests__/
    e2e/
      auth.e2e.test.ts           ← E2E tests
```

### 10.6 The Orchestrator's Role in TDD

The orchestrator enforces TDD mechanically:

```typescript
// Pseudocode — orchestrator TDD enforcement
async function executeTask(task: Task) {
  // RED phase
  const redPrompt = buildRedPrompt(task);
  await invokeClaudeHeadless(redPrompt);

  // Verify tests exist
  const testFiles = await findTestFiles(task);
  if (testFiles.length === 0) throw new Error("RED phase produced no tests");

  // Verify tests fail
  const testResult = await runTests(testFiles);
  if (testResult.passing) throw new Error("RED tests pass — not testing new behavior");

  // GREEN phase
  const greenPrompt = buildGreenPrompt(task, testResult);
  await invokeClaudeHeadless(greenPrompt);

  // Verify tests pass
  const greenResult = await runTests(testFiles);
  if (!greenResult.passing) {
    // Retry up to 3 times, then invoke Doctor
    ...
  }

  // REFACTOR phase
  const refactorPrompt = buildRefactorPrompt(task);
  await invokeClaudeHeadless(refactorPrompt);

  // Verify tests still pass
  const refactorResult = await runTests(testFiles);
  if (!refactorResult.passing) throw new Error("Refactor broke tests — reverting");

  // VERIFY phase (comprehensive)
  await runFullTestSuite();
  await runTypeChecker();
  await runLinter();
  await runStaticVerification(task.mustHaves);
}
```

---

## 11. Verification System

### 11.1 The Problem

"All steps done" is not verification. Checking actual outcomes is.

Agents are excellent at completing checklists while producing code that doesn't actually work. The verification system must check **observable outcomes**, not process completion.

### 11.2 The 4-Tier Verification Ladder

| Tier | What It Checks | Automated? | Example |
|---|---|---|---|
| **Static** | Files exist, exports present, imports wired, no stubs | Yes (deterministic) | `auth.ts` exists, exports `generateToken`, > 30 lines |
| **Command** | Tests pass, build succeeds, lint clean, types check | Yes (run commands) | `bun test`, `tsc --noEmit`, `bunx biome check` |
| **Behavioral** | API responses correct, UI flows work | Yes (E2E tests) | POST /login returns JWT with correct claims |
| **Human** | Visual correctness, UX quality, business logic | No (UAT scripts) | "Open the app, sign up, verify dashboard shows your name" |

Each task targets the strongest tier it can reach. The agent doesn't ask a human to check something it can verify with a test.

### 11.3 Static Verification (Deterministic)

The orchestrator runs these checks WITHOUT using the LLM:

- **File existence:** Every artifact in must-haves exists
- **Minimum substance:** Files exceed minimum line counts (no 5-line stubs)
- **Export detection:** Required exports are present in the file
- **Import wiring:** Key links are actually wired (file A imports X from file B)
- **Stub detection:** Scan for TODO, FIXME, `return null`, `return {}`, `console.log` placeholders, hardcoded empty responses

### 11.4 Stub Detection Rules

```
FAIL if any of these found in implementation files:
- TODO comments
- FIXME comments
- return null (in non-nullable context)
- return {} (as entire function body)
- return [] (as entire function body)
- console.log("not implemented")
- throw new Error("not implemented")
- // placeholder
- // stub
```

### 11.5 Must-Have Verification

Every task's must-haves are checked by the orchestrator:

```markdown
## Must-Haves for T01

### Truths (verified by: running tests or commands)
- [x] Login endpoint returns 200 with valid JWT → verified by: integration test
- [x] Invalid credentials return 401 → verified by: integration test
- [x] JWT contains correct user ID claim → verified by: unit test

### Artifacts (verified by: static check)
- [x] src/lib/auth.ts — JWT helpers, ≥30 lines, exports generateToken, verifyToken
- [x] src/routes/login.ts — POST handler, ≥20 lines, exports default

### Key Links (verified by: static check)
- [x] src/routes/login.ts imports generateToken from src/lib/auth.ts
- [x] src/middleware/auth.ts imports verifyToken from src/lib/auth.ts
```

---

## 12. Feedback Loops & Compounding

### 12.1 The Core Insight

From Night Shift: "Don't just fix the code. Use that valuable context to figure out WHY the agent did the wrong thing. Have it analyze its own context and tell you what docs, skills, or workflow led it astray."

The system must get better with every run. This is the compounding mechanism.

### 12.2 Feedback Loop Levels

```
Level 1: PER-TASK (immediate)
  Test fails → Agent iterates → Tests pass
  Type error → Agent fixes → Types check
  [Tight loop, no human involvement]

Level 2: PER-SLICE (review)
  Reviewer personas check implementation
  Issues found → Agent fixes → Re-review
  [Multi-perspective quality gate]

Level 3: PER-MILESTONE (human)
  Human reviews UAT scripts
  Human reviews changelogs and commit diffs
  Issues found → Fix tasks created for next cycle
  [Human taste and judgment applied]

Level 4: PER-SESSION (system evolution)
  Evolver agent runs postmortem
  Traces failures to system causes
  Updates vault docs, patterns, skills
  [The system itself improves]
```

### 12.3 The Postmortem Protocol

When something goes wrong (agent produces bad code, wrong architecture, missed edge case):

1. **Don't fix the code first.** Fix the system first.
2. **Evolver agent analyzes:**
   - What was in the agent's context when it made the bad decision?
   - Which vault doc (or lack thereof) led it astray?
   - Which skill instruction was unclear or missing?
   - Which test was missing that should have caught this?
3. **Evolver proposes fixes:**
   - Vault doc update (new pattern, updated decision, new learning)
   - Skill instruction refinement
   - New test pattern to add to testing vault
   - New verification check to add to static verification
4. **Human reviews proposals** — approves, modifies, or rejects
5. **Only then** fix the original code issue

### 12.4 What Compounds Over Time

| Artifact | How It Grows | Impact |
|---|---|---|
| **Vault: Patterns** | New patterns discovered → documented | Future tasks follow established conventions automatically |
| **Vault: Learnings** | Postmortem learnings → documented | Same mistakes not repeated |
| **Vault: Decisions** | ADRs accumulated → persistent | Architecture decisions not re-debated |
| **Vault: Playbooks** | Common operations → step-by-step guides | Agent knows HOW to do things, not just WHAT |
| **Vault: Testing** | Test patterns refined → documented | Test quality improves over time |
| **Skills** | Skill instructions refined → clearer | Agent behavior more precise |
| **Contracts** | Interface contracts accumulated → reusable | Cross-slice integration more reliable |
| **Static verification rules** | New checks added after failures | More failures caught automatically |

### 12.5 Metrics Tracking

The orchestrator tracks per-session:
- Tasks attempted / completed / failed
- Tests written / passing / failing
- Review issues found (by severity and persona)
- Postmortem actions taken
- Token usage per phase
- Time per task

Over time, these metrics reveal:
- Which phases are most expensive (optimize there)
- Which review personas catch the most issues (invest there)
- Whether the system is actually improving (compounding check)

---

## 13. Git Strategy

### 13.1 Overview

Branch-per-milestone with squash merge. Fully automated by the orchestrator.

### 13.2 Branch Structure

```
main ──────────────────────────────────────────
  │                                             ↑
  └── superc/M001 (working branch)              │
       commit: chore(M001): scaffold milestone  │
       commit: feat(S01/T01): [red] auth tests  │
       commit: feat(S01/T01): [green] auth impl │
       commit: feat(S01/T01): [refactor] auth   │
       commit: feat(S01): complete slice         │
       commit: feat(S02/T01): [red] ...         │
       ...                                       │
       commit: feat(M001): milestone complete   │
              └──── squash merge ───────────────┘
```

### 13.3 Commit Convention

```
feat(S01/T01): [red] write auth token tests
feat(S01/T01): [green] implement JWT generation
feat(S01/T01): [refactor] extract token config
feat(S01): complete authentication slice
fix(S01/T02): handle expired token edge case
docs(M001): update architecture decisions
chore(M001): scaffold milestone structure
```

**TDD phase markers in commits:** `[red]`, `[green]`, `[refactor]` — visible in git log for human review.

### 13.4 Checkpoint Protocol

Before each task begins, the orchestrator creates a checkpoint:
- `git stash` any uncommitted work (safety)
- Start task from clean working tree
- On task success: commit
- On task failure: `git reset` to checkpoint (revert failed work)

### 13.5 Squash Merge

When a milestone completes:
1. All commits on the `superc/M001` branch squash into one commit on main
2. Commit message: `feat(M001): [milestone description]`
3. Branch is kept (not deleted) for per-task history (`git log`, `git bisect`)
4. Main reads like a changelog — one commit per milestone

### 13.6 Rollback

- **Bad task** → `git reset` to pre-task checkpoint on the branch
- **Bad slice** → Revert commits for that slice on the branch
- **Bad milestone** → Revert the single squash commit on main

---

## 14. Headless Execution — The Night Shift

### 14.1 The Concept

Inspired by Jamon Holmgren's Night Shift: you prepare specs during the day, kick off the agent at night, and review results in the morning.

The orchestrator runs in headless mode, invoking Claude Code without a TUI. It loops through the state machine, executing tasks, committing code, and advancing through slices autonomously.

### 14.2 Entry Point

```bash
# Start the night shift
bun run .superclaude/orchestrator/loop.ts --mode=auto

# Start with a budget ceiling
bun run .superclaude/orchestrator/loop.ts --mode=auto --budget=25.00

# Start for a specific milestone
bun run .superclaude/orchestrator/loop.ts --mode=auto --milestone=M001

# Step mode (one task at a time, pause between)
bun run .superclaude/orchestrator/loop.ts --mode=step
```

### 14.3 Auto Mode Behavior

```
1. Read STATE.md
2. Determine next action
3. If budget exceeded → STOP with report
4. If all milestones complete → STOP with report
5. Assemble context for action
6. Generate prompt
7. Invoke: claude -p "prompt" --allowedTools "Read,Write,Edit,Bash,Glob,Grep"
8. Capture output
9. Run verification
10. If verification passes → Update state, git commit, go to 1
11. If verification fails → Retry once with diagnostic
12. If retry fails → Write CONTINUE.md, STOP with error report
```

### 14.4 Supervision

**Timeout tiers:**
| Timeout | Default | Action |
|---|---|---|
| Soft | 15 min | Log warning, continue |
| Idle | 10 min | Something is stuck — write CONTINUE.md, restart task |
| Hard | 30 min | Stop the loop entirely with diagnostic report |

**Stuck detection:**
- If the same task dispatches twice without progress → retry with Doctor agent diagnosis
- If Doctor can't fix it → flag as blocked, skip to next task, continue loop

**Crash recovery:**
- Lock file (`.superclaude/state/auto.lock`) tracks current task
- If orchestrator crashes and restarts, it reads the lock file and CONTINUE.md to resume

### 14.5 Session Report

When the loop ends (success, budget exceeded, or error), the orchestrator writes a session report:

```markdown
---
session: 2026-03-17-night
started: 2026-03-17T22:00:00Z
ended: 2026-03-18T06:30:00Z
status: completed | budget_exceeded | error
---

## Summary
[2-3 sentences: what was accomplished]

## Tasks Completed
- [x] S01/T01: Auth token tests + implementation
- [x] S01/T02: Login endpoint
- [x] S01/T03: Auth middleware
- [x] S01: Slice complete

## Issues Encountered
- [Description of any problems and how they were resolved]

## Blocked Items
- [Anything that needs human attention]

## Token Usage
- Total: X tokens ($Y.ZZ)
- By phase: Research X, Planning X, Execution X, Review X

## Next Actions
- [What to do when you review this in the morning]
```

---

## 15. Human Touchpoints — The Day Shift

### 15.1 What the Human Does

The human's role is high-leverage work that agents can't do well:

1. **Requirements gathering** — Talk to stakeholders, understand the problem
2. **Spec writing** — Write feature specs with enough detail for the agent
3. **Architecture decisions** — Make judgment calls the agent can't
4. **Review** — Check UATs, review commit diffs, test manually
5. **Postmortem review** — Approve Evolver's proposed system improvements
6. **Discuss phase** — Answer the agent's questions about ambiguous requirements

### 15.2 Morning Review Protocol

1. Read the session report (2 minutes)
2. Check UAT scripts for completed slices (run them manually if desired)
3. Scan commit diffs (focus on architectural decisions, not line-by-line)
4. Check "Issues Encountered" and "Blocked Items"
5. If Evolver proposed system changes, review and approve/modify
6. If something went wrong, do a quick postmortem (fix system, not code)

### 15.3 Spec Writing

Specs live in `.superclaude/specs/` and follow this format:

```markdown
---
title: [Feature Name]
status: draft | ready
priority: high | medium | low
milestone: M001
---

## What
[1-2 paragraphs: what this feature does from the user's perspective]

## Why
[1 paragraph: why this feature matters]

## User Stories
- As a [user], I want to [action], so that [benefit]

## Requirements
- [Concrete, testable requirements]

## Edge Cases
- [Things that could go wrong or are tricky]

## Out of Scope
- [Explicitly what this does NOT include]

## Open Questions
- [Anything the agent should ask about during DISCUSS phase]
```

When a spec's status is `ready`, the orchestrator picks it up as a milestone to plan.

---

## 16. Cost Management

### 16.1 Cost-Conscious Design

Since we're cost-conscious and Claude-only, the system minimizes token usage through:

1. **Fresh context per task** — No accumulated garbage burning tokens
2. **Compressed summaries** — 5:1 compression at each level
3. **Targeted context loading** — Only load what's needed for this specific action
4. **Phase skipping for simple tasks** — Simple tasks skip research and detailed review
5. **Token budget enforcement** — Orchestrator tracks usage and stops at ceiling

### 16.2 Complexity-Based Prompt Sizing

| Task Complexity | Context Budget | Review Depth | Phases |
|---|---|---|---|
| **Simple** (≤3 steps, ≤3 files) | Minimal — task plan + code only | Single review pass | RED → GREEN → VERIFY |
| **Standard** (4-7 steps) | Standard — + summaries + patterns | Full review personas | RED → GREEN → REFACTOR → VERIFY |
| **Complex** (8+ steps, architectural) | Full — + decisions + contracts + architecture docs | Full review + human flag | All phases including research |

### 16.3 Budget Tracking

```
.superclaude/history/metrics/cost-tracker.md

---
session: 2026-03-17-night
---

| Phase | Tokens In | Tokens Out | Estimated Cost |
|---|---|---|---|
| Discuss | 15,000 | 8,000 | $0.12 |
| Research | 20,000 | 5,000 | $0.09 |
| Planning | 30,000 | 15,000 | $0.25 |
| Execution (12 tasks) | 400,000 | 200,000 | $3.50 |
| Review | 100,000 | 50,000 | $0.85 |
| Completion | 10,000 | 8,000 | $0.10 |
| **Total** | **575,000** | **286,000** | **$4.91** |
```

---

## 17. File Structure

### 17.1 Complete Directory Tree

```
project-root/
  CLAUDE.md                          ← Project instructions (loads automatically)
  AGENTS.md                          ← Sub-agent router (~150 lines)
  SUPER_CLAUDE.md                    ← This spec

  .superclaude/
    orchestrator/                    ← Deterministic brain (Bun scripts)
      loop.ts                        ← Main orchestration loop
      state.ts                       ← State machine logic
      context.ts                     ← Context assembly engine
      git.ts                         ← Git operations
      verify.ts                      ← Static verification
      scaffold.ts                    ← File/directory scaffolding
      cost.ts                        ← Token/cost tracking
      prompt-builder.ts              ← Prompt generation per phase
      tdd.ts                         ← TDD enforcement logic
      config.ts                      ← Configuration constants
      types.ts                       ← Shared TypeScript types

    skills/                          ← Claude Code skills (SKILL.md files)
      architect/
        SKILL.md
        references/                  ← Optional reference docs
      implementer/
        SKILL.md
      tester/
        SKILL.md
      reviewer/
        SKILL.md
      researcher/
        SKILL.md
      doctor/
        SKILL.md
      scribe/
        SKILL.md
      evolver/
        SKILL.md

    vault/                           ← Living knowledge base
      INDEX.md                       ← Master index (Map of Content)
      architecture/
      patterns/
      decisions/
      learnings/
      playbooks/
      contracts/
      testing/

    state/                           ← Project state (disk-based)
      STATE.md                       ← Current state machine position
      PROJECT.md                     ← Living project description
      DECISIONS.md                   ← Decision register
      auto.lock                      ← Crash recovery lock
      milestones/
        M001/
          ROADMAP.md
          CONTEXT.md
          RESEARCH.md
          SUMMARY.md
          slices/
            S01/
              PLAN.md
              SUMMARY.md
              UAT.md
              tasks/
                T01/
                  PLAN.md
                  SUMMARY.md
                  CONTINUE.md

    specs/                           ← Human-written feature specs
      feature-auth.md
      feature-dashboard.md
      draft-feature-settings.md      ← draft- prefix = not ready

    history/                         ← Execution history
      sessions/
        2026-03-17-night.md
      postmortems/
        PM-001-auth-token-bug.md
      metrics/
        cost-tracker.md
```

### 17.2 .gitignore entries

```
# Ephemeral state (regenerated from other files)
.superclaude/state/STATE.md
.superclaude/state/auto.lock
.superclaude/state/milestones/**/CONTINUE.md

# Metrics (per-developer)
.superclaude/history/metrics/

# Session logs (verbose, per-developer)
.superclaude/history/sessions/
```

Everything else is tracked in git — including vault docs, state files, specs, and milestone artifacts. This enables:
- Team sharing of vault knowledge
- Code review of plans and decisions
- Historical reference for architectural context

---

## 18. Implementation Roadmap

### 18.1 Phase 0: Foundation (Bootstrap)

**Goal:** Get the minimal loop working end-to-end.

- [ ] Create `.superclaude/` directory structure
- [ ] Write `CLAUDE.md` with project-level instructions
- [ ] Write `AGENTS.md` with sub-agent index
- [ ] Implement `orchestrator/types.ts` — shared types
- [ ] Implement `orchestrator/state.ts` — read/write STATE.md
- [ ] Implement `orchestrator/scaffold.ts` — create milestone/slice/task directories
- [ ] Implement `orchestrator/loop.ts` — minimal loop (read state → build prompt → invoke claude → update state)
- [ ] Write one skill: `implementer/SKILL.md`
- [ ] Test: can it execute one task with manual prompt?

### 18.2 Phase 1: TDD Engine

**Goal:** Red-green-refactor enforcement working.

- [ ] Implement `orchestrator/tdd.ts` — test detection, test running, phase enforcement
- [ ] Implement `orchestrator/verify.ts` — static verification (files, exports, imports, stubs)
- [ ] Write `tester/SKILL.md` skill
- [ ] Implement prompt-builder for RED, GREEN, REFACTOR sub-phases
- [ ] Test: can it run a full TDD cycle on a simple task?

### 18.3 Phase 2: Context Engine

**Goal:** Smart context assembly for each phase.

- [ ] Implement `orchestrator/context.ts` — context budgeting, priority-based loading
- [ ] Implement `orchestrator/prompt-builder.ts` — phase-specific prompt generation
- [ ] Implement fractal summary system (task → slice → milestone compression)
- [ ] Implement continue-here protocol
- [ ] Test: does task 5 get clean context without task 1-4 pollution?

### 18.4 Phase 3: Sub-Agents

**Goal:** All sub-agents working and invocable.

- [ ] Write all 8 skill files (architect, implementer, tester, reviewer, researcher, doctor, scribe, evolver)
- [ ] Implement reviewer personas (correctness, architecture, typescript, performance, security, testability)
- [ ] Implement sub-agent invocation protocol (context injection, scope guard, output parsing)
- [ ] Test: can the reviewer catch known bad code patterns?

### 18.5 Phase 4: Git & Headless

**Goal:** Fully autonomous execution.

- [ ] Implement `orchestrator/git.ts` — branching, commits, checkpoints, squash merge
- [ ] Implement auto mode with supervision (timeouts, stuck detection, crash recovery)
- [ ] Implement cost tracking
- [ ] Implement session report generation
- [ ] Test: can it run overnight and produce a clean milestone?

### 18.6 Phase 5: Vault & Compounding

**Goal:** The system improves itself.

- [ ] Initialize vault with starter docs (patterns, testing strategy, architecture template)
- [ ] Implement postmortem protocol
- [ ] Implement Evolver agent workflow (analyze failure → propose fix → human review → apply)
- [ ] Implement metrics tracking and trend analysis
- [ ] Test: after a postmortem, does the next run avoid the same mistake?

### 18.7 Phase 6: Polish & Scale

**Goal:** Production-grade reliability.

- [ ] Budget pressure system (graduated cost controls)
- [ ] Multi-milestone support
- [ ] Discuss phase implementation
- [ ] Research phase implementation
- [ ] Reassess phase implementation
- [ ] Dashboard/progress view
- [ ] Documentation (for humans using the system)

---

## 19. Appendix: Design Decisions & Tradeoffs

### 19.1 Why Claude Code Native Instead of Standalone CLI

**Decision:** Build within Claude Code's ecosystem.

**Tradeoff:** We get less control over context windows (can't programmatically clear/inject like GSD's Pi SDK can). We compensate by using headless mode with separate invocations per task (each invocation = fresh context).

**Benefits:** No runtime to maintain, automatic updates, native subagent support, hooks, skills, worktrees.

### 19.2 Why Bun for the Orchestrator

**Decision:** The deterministic layer is a Bun TypeScript application.

**Rationale:** Same language as the project stack (TypeScript). Bun is fast, has native test runner, and handles file I/O well. The orchestrator needs to be reliable and fast — Bun delivers both.

### 19.3 Why Markdown on Disk Instead of a Database

**Decision:** All state is markdown files, not SQLite or similar.

**Rationale:** Human-inspectable at any time. Git-trackable. No schema migrations. The agent can read them directly. Obsidian-compatible. Simple to debug.

**Tradeoff:** Slower queries for complex state analysis. Acceptable because the orchestrator's state queries are simple (read one file, check frontmatter).

### 19.4 Why Strict TDD Instead of "Test-Heavy"

**Decision:** True red-green-refactor, enforced mechanically.

**Rationale:** Without strict enforcement, the agent will skip tests "to save time" or write tests after implementation (which means tests test the implementation, not the spec). The RED-first approach forces tests to encode requirements independently of implementation. This is the single highest-leverage quality practice for AI-generated code.

**Tradeoff:** Higher token cost per task (3 sub-phases instead of 1). Acceptable because test-first dramatically reduces debugging and rework downstream.

### 19.5 Why 8 Sub-Agents Instead of One General Agent

**Decision:** Specialized sub-agents with focused skills.

**Rationale:** A focused agent with a narrow skill definition produces better output than a general agent asked to "do everything." Each sub-agent gets only the vault docs relevant to its role, reducing context noise.

**Tradeoff:** More complexity in the orchestrator (routing, invocation protocol). Acceptable because the orchestrator is deterministic code — complexity there is manageable and testable.

### 19.6 Why the Vault Is Agent-Written

**Decision:** Agents both read from and write to the vault.

**Rationale:** If only humans curate the vault, it won't keep up with the pace of agent-generated code. The agent discovers patterns, makes decisions, and learns lessons — those need to be captured immediately.

**Guardrail:** Critical docs (architecture, core patterns) are flagged for human review. The Evolver proposes, the human approves.

### 19.7 Why Not Model-Agnostic

**Decision:** Claude only (no multi-model routing).

**Rationale:** Simpler system. No need to handle model-specific prompt formats, capability differences, or fallback chains. Claude Code is the runtime — Claude is the model. If cost becomes a concern, we optimize by reducing context size and skipping phases, not by switching to cheaper models.

**Future option:** If Claude adds model routing within Claude Code (e.g., Haiku for simple tasks), the system can adopt it without architectural changes.

---

## Closing Note

This spec is a living document. It will evolve as the system is built and used. The first implementation will be incomplete — that's by design. Start with Phase 0, get the minimal loop working, and let the compounding feedback loops drive the system toward completeness.

The most important thing is not the system's current state — it's the direction of improvement. Every session should leave the system slightly better than it found it. That's the compound interest of software development with AI agents.

**The human brings vision, taste, and judgment. The system brings patience, consistency, and tireless execution. Together, they compound.**
