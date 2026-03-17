# SUPER_CODEX

Full specification for a tool-agnostic, recovery-first, evolving agentic coding system for Claude Code and Codex.

---

## 1. Purpose

SUPER_CODEX is a specification for a coding system made of:

- a deterministic orchestrator
- equal first-class runtime adapters for Claude Code and Codex
- a composable set of specialized agents and skills
- an in-repo Markdown vault for long-lived project memory
- a headless execution loop optimized for minimum babysitting, high code quality, and reproducible recovery

This system is intentionally designed around the actual strengths and weaknesses of modern coding agents, not around an idealized fantasy of perfect autonomy.

The system is tool-agnostic at the architecture level. It can be implemented in this repository, but the specification is not tied to one vendor, one CLI, or one orchestration UI.

---

## 2. Design Inputs

SUPER_CODEX takes inspiration from four main sources:

### 2.1 Night Shift Workflow

Transferred principles:

- Human time is the scarce resource.
- Agents should work headlessly as much as possible.
- Humans should not babysit or continuously reprompt agents.
- Human review should happen at meaningful boundaries, not every micro-step.
- Every failure should improve docs, workflow, and validation before fixing the symptom.

### 2.2 GSD 2

Transferred principles:

- Decompose work into bounded units.
- Use milestone and slice thinking, not vague todo lists.
- Make state deterministic and file-backed.
- Build fresh context per unit.
- Separate LLM judgment from deterministic orchestration.
- Prefer verification of outcomes over completion theater.
- Make recovery, crash survival, and resumability first-class.

### 2.3 Existing `cc-master` / `cc-orchestrator` ideas in this repo

Transferred principles:

- A strategic brain should not be overloaded with implementation detail.
- Worker agents should receive tightly scoped tasks.
- `STRATEGY.md`-style artifacts are useful, but must evolve into a fuller hierarchy.
- tmux sessions, hooks, logs, event streams, and persistent job state are already valuable primitives.

### 2.4 AI self-introspection

This is the most important input.

The system is shaped by the realities of LLM coding agents:

- limited attention, even before hard context limits
- unreliable self-assessment of completion
- tendency to overfit to stale context
- fragile long-horizon memory
- good local reasoning, weaker global continuity
- strong iteration when feedback is fast
- weak handling of ambiguous intent unless ambiguity is surfaced explicitly
- high variance in quality when context is bloated or poorly structured

SUPER_CODEX exists to operationalize these truths.

---

## 3. AI Self-Introspection

## 3.1 Strengths To Exploit

AI coding agents are good at:

- fast local analysis of code and text
- generating and editing code when the task is bounded
- drafting tests quickly
- pattern matching across similar files
- summarizing progress and extracting structured artifacts
- iterating when given immediate tool-based feedback
- reviewing diffs from a defined perspective
- following structured output contracts when the contract is clear

## 3.2 Limitations To Design Around

AI coding agents are weak at:

- holding a large project in active attention for long periods
- preserving exact intent across many sessions without external memory
- knowing when they are wrong
- managing their own workflow reliably through prompt text alone
- distinguishing current truth from stale tool output
- resolving ambiguous requirements safely without an explicit policy
- preserving semantic consistency across parallel branches
- avoiding false confidence after partial success
- protecting long-term context from drift and compaction loss

## 3.3 Derived Design Axioms

These axioms are mandatory and non-negotiable:

1. The LLM must only do what requires judgment.
2. Deterministic code must own state transitions, dispatch, parsing, and policy enforcement.
3. Context is a designed cache, not a chat transcript.
4. Every task must fit inside a clean reasoning window.
5. Testing and verification are part of the task, not post-task cleanup.
6. The codebase is the lossless source of truth; summaries are lossy caches.
7. Recovery paths matter more than happy-path demos.
8. Human involvement must be high leverage and low frequency.
9. Assumptions should be logged rather than silently buried.
10. The system must improve its docs, skills, and checks over time.

## 3.4 Consequences For This Spec

Therefore SUPER_CODEX must:

- use explicit work decomposition
- persist state outside the chat session
- create fresh task contexts
- prefer small composable skills over giant monolith prompts
- enforce TDD by default where practical
- maintain an append-only decision log
- audit memory fidelity periodically
- route tasks to runtimes and agents by capability, not habit
- pause only for real blockers, not for routine uncertainty

---

## 4. Primary Goals

The system is optimized for three top-level outcomes:

1. Minimum babysitting
2. High code quality
3. Reproducible recovery

More specific goals:

- autonomous headless execution over long runs
- strong milestone and slice discipline
- rich verification with default TDD
- composable agent and skill topology
- local, inspectable, versioned project memory
- graceful handling of ambiguity, interruptions, and failures
- compounding improvement in skills, docs, patterns, and process

---

## 5. Non-Goals

SUPER_CODEX is not trying to be:

- a prompt-only framework
- a black-box SaaS memory layer
- a vector-database-first architecture
- a fully self-modifying agent with no human governance
- a production deployment robot
- a replacement for engineering judgment

It is an orchestration and memory system for bounded, inspectable, high-quality AI software development.

---

## 6. Canonical Work Hierarchy

SUPER_CODEX adds a higher layer above GSD's model:

```text
Vision -> Roadmap -> Milestone -> Slice -> Task -> Attempt
```

### 6.1 Vision

The maximal product objective.

Questions answered:

- What are we building?
- Why does it matter?
- What does success look like in the real world?

Artifact:

- `vault/vision.md`

### 6.2 Roadmap

The ordered set of capabilities needed to reach the vision.

Questions answered:

- What major capabilities must exist?
- In what sequence should they be built?
- What can be deferred?

Artifact:

- `vault/roadmap.md`

### 6.3 Milestone

A shippable increment with clear external value.

Question answered:

- What meaningful version of the product exists after this?

Artifacts:

- `vault/milestones/M###/milestone.md`
- `vault/milestones/M###/boundary-map.md`
- `vault/milestones/M###/summary.md`
- `vault/milestones/M###/uat.md`

### 6.4 Slice

A demoable vertical capability.

Question answered:

- What can a human observe or do after this slice exists?

Artifacts:

- `vault/milestones/M###/slices/S##/slice.md`
- `research.md`
- `plan.md`
- `review.md`
- `summary.md`

### 6.5 Task

A context-window-sized unit of work.

Iron rule:

- if it does not fit in one fresh working window with its tests and verification, it is not one task

Artifacts:

- `vault/milestones/M###/slices/S##/tasks/T##.md`

### 6.6 Attempt

One runtime execution against one task or review unit.

Artifacts:

- `.supercodex/runs/<run-id>/dispatch.json`
- `.supercodex/runs/<run-id>/prompt.md`
- `.supercodex/runs/<run-id>/result.json`
- `.supercodex/runs/<run-id>/events.jsonl`
- `.supercodex/runs/<run-id>/continue.md`

---

## 7. Repository Layout

SUPER_CODEX uses two storage domains:

- `vault/` for human-readable long-lived knowledge
- `.supercodex/` for machine state, dispatch, and run artifacts

Recommended layout:

```text
AGENTS.md
CLAUDE.md
SUPER_CODEX.md

vault/
  index.md
  vision.md
  roadmap.md
  architecture.md
  constraints.md
  decisions.md
  assumptions.md
  patterns/
  onboarding/
  feedback/
    QUESTIONS.md
    BLOCKERS.md
    ANSWERS.md
  milestones/
    M001/
      milestone.md
      boundary-map.md
      summary.md
      uat.md
      slices/
        S01/
          slice.md
          research.md
          plan.md
          review.md
          summary.md
          tasks/
            T01.md
            T02.md

.supercodex/
  state/
    current.json
    queue.json
    locks/
  runtime/
    adapters.json
    routing.json
    policies.json
  prompts/
    next-action.md
    dispatch.json
  runs/
    <run-id>/
      dispatch.json
      prompt.md
      result.json
      transcript.md
      events.jsonl
      continue.md
  audits/
  metrics/
  temp/
  schemas/
```

Notes:

- The vault is plain Markdown so it remains Git-friendly and Obsidian-compatible if desired.
- `AGENTS.md` and `CLAUDE.md` should be small router files, not giant manuals.
- Runtime-specific instructions belong in referenced docs, not in the router itself.

---

## 8. Canonical Artifacts

## 8.1 Root Router Files

`AGENTS.md` and `CLAUDE.md` must:

- state the project operating rules briefly
- point to `SUPER_CODEX.md`
- point to the current roadmap, active milestone, and feedback files
- enumerate skill directories and when to load them
- stay intentionally small

They must not:

- duplicate the full spec
- contain stale operational detail
- become a dumping ground for every project note

## 8.2 Decision Log

`vault/decisions.md` is append-only.

It preserves:

- major architectural decisions
- rationale
- rejected alternatives
- consequences

It must never be summarized away.

## 8.3 Assumption Ledger

`vault/assumptions.md` records interpretive decisions made without blocking the run.

Each entry should include:

- timestamp
- scope
- assumption
- confidence
- blast radius
- whether it requires later human review

## 8.4 Boundary Maps

Each milestone and slice must declare:

- what it produces
- what it consumes
- what behavioral contracts apply

Boundary maps must include semantics, not just type names.

Bad:

- `getUser(): User | null`

Good:

- `getUser(): User | null`, where `null` means "not found, not error"; callers must not log it as a failure

## 8.5 Task Files

Each task file must include:

- objective
- why now
- exact acceptance criteria
- TDD mode
- likely files
- verification plan
- dependencies
- safety class
- status
- summary after completion

## 8.6 Run Artifacts

Every attempt must persist enough information to reconstruct what happened without relying on ephemeral chat memory.

Minimum run records:

- runtime used
- agent role
- exact dispatch packet
- exact prompt or prompt reference
- exit code / status
- files changed
- tests run
- evidence
- blockers
- assumptions made
- continuation guidance if interrupted

---

## 9. Deterministic vs LLM Split

This is the architectural core.

## 9.1 Deterministic Layer Owns

- state machine transitions
- file and directory scaffolding
- dispatch selection
- context assembly
- token and budget policies
- runtime selection policies
- structured parsing of results
- work queue ordering
- lock management
- checkpointing
- retry policy
- safety gating
- audit scheduling
- metric collection

## 9.2 LLM Layer Owns

- clarifying intent
- decomposing work
- making architectural tradeoffs
- writing code
- writing tests
- diagnosing failures
- reviewing diffs
- summarizing outcomes
- extracting lessons and patterns

## 9.3 Rule

If an `if/else` could handle it reliably, it does not belong in agent reasoning.

---

## 10. Runtime Abstraction: Claude Code and Codex as Equal First-Class Executors

SUPER_CODEX must not treat one runtime as primary and the other as an afterthought.

## 10.1 Runtime Adapter Contract

Each runtime adapter must expose a normalized interface:

- `probe()` -> capabilities, availability, version
- `dispatch(packet)` -> run headless execution for one unit
- `resume(run-id)` -> best-effort continuation
- `cancel(run-id)`
- `collect(run-id)` -> transcript, outputs, metrics
- `supports(capability)` -> browser, patching, long shell, images, subagents, etc.
- `normalize(result)` -> common result schema

## 10.2 Shared Dispatch Packet

Every task or review unit should be expressed in a runtime-neutral packet with:

- unit id
- role
- objective
- context references
- acceptance criteria
- files or directories in scope
- tests to write or run
- constraints
- safety class
- output contract
- stop conditions
- expected artifacts to update

## 10.3 Shared Result Schema

Every runtime result must normalize to:

- `status`: success | failed | blocked | interrupted
- `summary`
- `files_changed`
- `tests_written`
- `tests_run`
- `verification_evidence`
- `assumptions`
- `blockers`
- `followups`
- `raw_ref`

## 10.4 Routing Policy

Runtime selection should be based on:

- task type
- observed quality for similar tasks
- cost ceiling
- runtime capabilities
- recent failure history

Examples:

- planning and ambiguity resolution -> strongest reasoning runtime available
- bounded implementation and test writing -> whichever runtime shows better cost-per-success for that project
- summarization and archival tasks -> cheapest reliable runtime

The system must track success by task class so routing improves over time.

---

## 11. Agent and Skill Topology

SUPER_CODEX is a system of narrow agents, not one giant omniscient agent.

## 11.1 Core Agents

### Conductor

Owns orchestration, state transitions, dispatch decisions, and recovery.

### Interviewer

Runs interactive requirement discovery at the beginning of a project or milestone.

### Strategist

Converts vision into roadmap, milestones, and slices.

### Mapper

Produces codebase maps, local conventions, and relevant dependency surfaces.

### Researcher

Scouts docs, library specifics, pitfalls, and "do not hand-roll this" findings.

### Slice Planner

Turns a slice into tasks, contracts, and must-haves.

### Task Framer

Produces the exact dispatch packet for a specific unit.

### Implementer

Writes code and tests within a bounded unit.

### Verifier

Executes verification ladders and rejects unsupported claims of completion.

### Integrator

Handles convergence, integration tests, and semantic contract reconciliation.

## 11.2 Review Personas

These run after planning and after implementation diff generation:

- Architect
- Domain Expert
- Code Quality Reviewer
- Security Reviewer
- Performance Reviewer
- UX / Human Advocate
- Maintainability Reviewer

Each reviewer owns a narrow concern and a small context slice.

## 11.3 Maintenance Agents

- Memory Auditor
- Postmortem Analyst
- Pattern Extractor
- Skill Curator
- Recovery Agent
- Release / UAT Packager

## 11.4 Skill Design Rules

Every skill must:

- be concise
- use progressive disclosure
- avoid duplicating general model knowledge
- include references only when they materially improve behavior
- stay domain-specific and task-specific

Each skill may contain:

- `SKILL.md`
- `references/`
- `scripts/`
- `assets/`

Each skill must declare:

- when to trigger
- when not to trigger
- what files to read first
- what output contract it expects

---

## 12. The Operating Model

## 12.1 Day Shift / Night Shift Adaptation

The human owns:

- objectives
- taste
- hard constraints
- milestone-level review
- safety approvals for irreversible actions
- manual product validation at meaningful checkpoints

The system owns:

- research
- decomposition
- task dispatch
- implementation
- review
- verification
- summarization
- recovery
- updating docs and checks based on failures

## 12.2 Headless Default

The default mode is headless execution with local-file communication.

The system should run autonomously until:

- a hard blocker is encountered
- an irreversible action is ready
- a contradiction with high blast radius is detected
- the work queue is empty

## 12.3 Local-File Communication

Human-agent asynchronous communication uses:

- `vault/feedback/QUESTIONS.md`
- `vault/feedback/BLOCKERS.md`
- `vault/feedback/ANSWERS.md`

Protocol:

1. Agent appends a structured question or blocker.
2. State changes to `awaiting_human` only if safe defaults are not acceptable.
3. Human answers in `ANSWERS.md`.
4. Conductor ingests the answer, links it to the relevant question, updates state, and continues.

If ambiguity is low risk, the agent proceeds and logs an assumption instead of blocking.

---

## 13. Context Engineering

SUPER_CODEX treats context as product design.

## 13.1 Context Layers

```text
L0: System rules and runtime policy
L1: Current unit packet
L2: Current milestone and slice context
L3: Relevant decisions, contracts, and recent summaries
L4: Filesystem and tools as ground truth
```

## 13.2 Fresh Session Per Unit

Every task, review pass, research pass, and recovery pass gets a fresh working context.

The system must not carry old tool chatter forward by default.

## 13.3 Context Composition Rules

Always include:

- current unit objective
- acceptance criteria
- safety class
- TDD mode
- relevant contracts
- exact files likely in play
- latest failure context if retrying

Usually include:

- milestone summary
- slice plan
- related decision log entries
- recent task summaries from direct dependencies

Usually exclude:

- stale terminal output
- unrelated prior attempts
- giant documents not relevant to the current unit
- every previous file read

## 13.4 Context Profiles

SUPER_CODEX supports three context profiles:

- `budget`
- `balanced`
- `quality`

These govern:

- amount of preloaded context
- runtime selection
- phase skipping rules
- depth of reviewer passes

## 13.5 Golden Rules

1. Less but more relevant context beats more context.
2. Never summarize summaries indefinitely.
3. Rebuild summaries from lower layers and code state periodically.
4. Keep router files small.
5. Use files for memory, not chat history.

---

## 14. The Next Action Synthesis Loop

This is the center of the whole system.

The main job of SUPER_CODEX is not "write code."
Its main job is:

- read project state
- reason about what is most correct next
- generate the best next prompt packet
- dispatch it to the right runtime and role
- absorb results
- adapt

## 14.1 Loop

```text
1. Read current structured state
2. Reconcile state against filesystem, git, and active runs
3. Determine the next eligible unit
4. Classify complexity, risk, and safety class
5. Select runtime and agent role
6. Assemble context packet
7. Generate next-action prompt
8. Persist dispatch packet before execution
9. Execute in headless mode
10. Parse and normalize result
11. Verify evidence
12. Update task, slice, milestone, and state artifacts
13. Run review or audit passes if required
14. Decide whether to continue, retry, replan, block, or complete
15. Write continuation packet if interrupted
16. Loop
```

## 14.2 Dispatch Unit Types

Units may be:

- discovery
- mapping
- research
- slice planning
- task execution
- verification
- review
- integration
- summarization
- roadmap reassessment
- memory audit
- postmortem

## 14.3 Expected Behavior

The system should feel like a disciplined staff officer:

- always oriented
- never guessing state from memory
- never coding blindly
- never calling something done without evidence
- always preparing the next move before taking it

---

## 15. State Machine

Canonical states:

- `intake`
- `clarify`
- `map`
- `research`
- `plan`
- `dispatch`
- `implement`
- `verify`
- `review`
- `integrate`
- `complete_task`
- `complete_slice`
- `reassess`
- `recover`
- `awaiting_human`
- `blocked`
- `complete`

### 15.1 State Rules

- Only one primary state may be active per milestone worker.
- Every transition must be persisted.
- Every transition must be explainable from disk state alone.

### 15.2 Transition Triggers

Examples:

- `plan -> dispatch` when the task list is accepted and artifacts exist
- `implement -> verify` when code and tests are written
- `verify -> review` when verification passes
- `verify -> implement` when failures are fixable within the same task
- `review -> implement` when reviewer findings are actionable
- `review -> complete_task` when all required reviewer passes are green
- `any -> recover` on interruption or context reset
- `any -> awaiting_human` on hard blocker or irreversible action boundary

---

## 16. Planning and Decomposition Rules

## 16.1 Decomposition Heuristics

The system must prefer:

- outcomes over implementation checklists
- vertical slices over horizontal layers
- interface-first thinking
- risk-first sequencing
- one-task-one-window discipline

## 16.2 Task Sizing Rule

A valid task must have:

- a clear start
- a clear finish
- a bounded file surface
- a bounded test plan
- bounded verification

If any of these are fuzzy, the planner must decompose further.

## 16.3 Slice Completion Rule

A slice is not complete because all tasks are checked off.
A slice is complete only when:

- its demo sentence is true
- its acceptance criteria are verified
- its UAT script is written
- its summary is updated
- its reviewers are satisfied

---

## 17. TDD and Verification Policy

## 17.1 Default Policy

Default mode is:

- TDD unless brownfield reality makes strict red-green impractical

## 17.2 TDD Modes

Each task must declare one of:

- `strict_tdd`
- `brownfield_tdd`
- `verification_first`

### `strict_tdd`

Required for greenfield or isolated code work:

1. write or update tests first
2. observe red
3. implement
4. observe green
5. refactor if needed

### `brownfield_tdd`

Used when legacy code or missing harness makes pure TDD unrealistic:

1. capture baseline behavior
2. add protective characterization tests
3. add failing or target tests where possible
4. implement
5. verify no regressions

### `verification_first`

Allowed only for non-code or infrastructure prep tasks where tests are not yet meaningful.

Every non-strict mode requires a brief reason in the task artifact.

## 17.3 Verification Ladder

The strongest affordable verification should be used:

1. Static: files, exports, imports, lint, types, stubs
2. Focused tests: unit or targeted integration
3. Behavioral checks: app runs, CLI outputs, browser flow, API response
4. Slice-level regression
5. Milestone-level regression
6. Human UAT only when machine verification cannot fully prove the outcome

## 17.4 Contract Tests

Boundary contracts must be converted into tests early, especially before parallel work.

## 17.5 Reviewer Passes

At minimum, implementation units must pass:

- correctness / code quality
- maintainability
- security

Additional reviewer passes are triggered by task type.

---

## 18. Ambiguity Handling

Ambiguity is a major failure mode and must be classified.

## 18.1 Ambiguity Classes

- `clear`: proceed
- `decidable`: proceed, log assumption
- `contradictory`: pause or escalate
- `irreversible-impact`: always escalate

## 18.2 Assumption Policy

If a choice:

- affects only local implementation details and safe defaults exist -> proceed and log
- affects interface contracts, security posture, user-visible semantics, or irreversible operations -> do not silently decide

## 18.3 Local Escalation Files

Questions and blockers must be structured, not vague.

Each question entry should include:

- issue
- why the system cannot safely decide
- options considered
- recommended default if no answer is provided
- latest responsible pause point

---

## 19. Brownfield Onboarding Policy

For existing codebases, the system must observe before modifying.

Initial brownfield pass:

1. map relevant areas
2. detect local coding conventions
3. find current tests and harnesses
4. capture baseline behavior
5. identify fragile hotspots
6. prefer local consistency over imported ideals

Refactors must start with characterization tests when practical.

The system must default to boring code and existing conventions unless the milestone explicitly includes a design reset.

---

## 20. Safety and Trust Boundaries

Maximum autonomy does not mean unlimited authority.

## 20.1 Action Classes

### Reversible

- code edits
- tests
- docs
- local refactors

Policy:

- fully autonomous

### Semi-Reversible

- dependency addition
- schema files
- non-production migrations prepared locally
- branch or worktree operations

Policy:

- autonomous with checkpoints and explicit logging

### Irreversible

- production database migrations
- production deployment execution
- changes with destructive data consequences
- secret rotation
- billing or external side-effect actions
- destructive git history rewrite outside isolated branches

Policy:

- agent prepares package, human executes

## 20.2 Security Rules

The system must:

- avoid direct production access
- avoid embedding secrets in prompts or logs
- treat external side effects conservatively
- preserve audit trails
- classify dependency additions and security-impacting changes explicitly

---

## 21. Recovery and Resumability

Recovery is a first-class feature.

## 21.1 Checkpointing

The system should checkpoint:

- before each task
- before major review loops
- before any semi-reversible action
- before context resets

## 21.2 Continuation Packets

If a run is interrupted, it must write `continue.md` with:

- unit objective
- what was completed
- what remains
- current best hypothesis
- exact first next step
- files in play
- known pitfalls

## 21.3 Recovery Algorithm

On resume:

1. read current state
2. read latest continuation packet if present
3. reconcile with actual code and git status
4. detect drift between planned and actual state
5. either continue, restart the task, or replan

## 21.4 Reproducibility Requirement

A different agent instance should be able to continue from disk state alone with no hidden chat dependency.

That is the real recovery standard.

---

## 22. Memory Fidelity and Audits

All summaries drift over time unless audited.

## 22.1 Memory Layers

- Manifest-like current state: frequently rewritten
- Decision log: append-only
- Task summaries: compressed but retrievable
- Slice summaries: regenerated from tasks
- Milestone summaries: regenerated from slices

## 22.2 Audit Rule

The system must periodically compare:

- current summaries
- declared interfaces
- actual code

Suggested triggers:

- every completed slice
- every 5-10 tasks
- after major refactors
- after recovery from interruption

## 22.3 Golden Rule

Never build long chains of summary-of-summary-of-summary without regeneration from lower layers and code state.

---

## 23. Parallelization Strategy

Parallelism is useful but must be earned.

## 23.1 Default Policy

- serialize planning
- parallelize only after contracts exist
- serialize convergence and integration

## 23.2 Safe Parallelism Requirements

Parallel work requires:

- explicit boundary maps
- file ownership or lock discipline
- integration tests prepared in advance
- a convergence agent or integration phase

## 23.3 Anti-Patterns

Do not parallelize:

- tasks editing the same files
- tasks making interacting architectural decisions
- review loops that depend on unstable upstream outputs

## 23.4 Semantic Conflict Detection

The system must look for conflicts that merge cleanly but behave differently.

Integration agents must compare:

- contracts
- implementations
- tests
- edge-case behavior

---

## 24. Quality Bar for Code and Docs

SUPER_CODEX should optimize for boring, clear, maintainable code.

## 24.1 Code Quality Requirements

Prefer:

- standard framework patterns
- named intermediates over dense chaining
- small coherent modules
- clear tests with behavior-driven naming
- comments that explain why, not what

Avoid:

- novelty for novelty's sake
- clever abstractions
- giant files created to reduce "coordination"
- testless code marked complete
- unreviewed complexity growth

## 24.2 Documentation Requirements

Every slice completion should leave behind:

- an accurate summary
- updated contracts if relevant
- updated decisions if architecture changed
- a human-readable UAT script

---

## 25. Feedback Loop and Compound Improvement

The system must improve itself, but in a disciplined way.

## 25.1 Postmortem-First Rule

When the system misbehaves:

1. inspect why it made the wrong choice
2. update docs, skills, policies, or tests first
3. then fix the code issue

This is mandatory because process improvements compound.

## 25.2 Pattern Extraction

When a solution succeeds with:

- low intervention
- clean review
- high test confidence
- no near-term rework

it becomes a candidate for extraction into:

- a reusable skill
- a pattern note
- a template
- a verification checklist

## 25.3 Skill Health

Track:

- trigger frequency
- success rate
- token cost
- stale skills
- skills correlated with repeated failures

Skills must never auto-edit themselves without human review.

## 25.4 Roadmap Reassessment

After each slice, the system may:

- reorder upcoming slices
- add a newly discovered prerequisite
- split an oversized slice
- archive a no-longer-relevant idea

Roadmap changes must be explicit and logged.

---

## 26. Metrics

## 26.1 Primary Metrics

These align directly with your priorities:

- babysitting minutes per slice
- code quality score per slice
- recovery reproducibility score

### Babysitting minutes per slice

Measure:

- number of human interventions
- total active human minutes required outside milestone review

### Code quality score

Composite of:

- first-pass verification success
- reviewer findings severity
- survival of code through subsequent slices
- test coverage or test density delta
- maintainability heuristics

### Recovery reproducibility score

Measure:

- percent of interrupted runs resumed from disk with no hidden context
- mean time to successful resume
- number of recovery mismatches found during reconcile

## 26.2 Secondary Metrics

- cost per successful task
- retry count by task class
- blocker frequency
- assumption count by slice
- integration defect rate
- context packet size by successful vs failed attempt
- skill effectiveness
- human UAT failure rate

---

## 27. Implementation Roadmap For Building SUPER_CODEX

This section is normative for the initial build-out of the system.

## Phase 0: Spec and Router Foundation

Deliverables:

- `SUPER_CODEX.md`
- slim `AGENTS.md`
- slim `CLAUDE.md`
- initial `vault/` scaffold
- initial `.supercodex/` scaffold

Goal:

- create a stable operating contract before automation expands

## Phase 1: Vault and State Engine

Deliverables:

- `vault/vision.md`
- `vault/roadmap.md`
- decision log
- assumption ledger
- structured `current.json`
- queue and lock files

Goal:

- make state derive from disk, not memory

## Phase 2: Runtime Adapter Layer

Deliverables:

- normalized Claude Code adapter
- normalized Codex adapter
- shared dispatch and result schemas
- runtime capability registry

Goal:

- make both runtimes truly interchangeable at the orchestrator boundary

## Phase 3: Next Action Synthesizer

Deliverables:

- dispatch selector
- context assembler
- prompt builder
- retry and escalation policy
- run artifact persistence

Goal:

- automate "read state -> decide next -> dispatch"

## Phase 4: Planning and Slice Engine

Deliverables:

- vision to roadmap flow
- milestone and slice planners
- boundary map generation
- task file generation

Goal:

- move from ad hoc prompts to structured decomposition

## Phase 5: TDD and Verification Pipeline

Deliverables:

- TDD mode support
- focused test execution policy
- verifier agent
- reviewer agent suite
- UAT generator

Goal:

- stop trusting unsupported completion claims

## Phase 6: Recovery and Audit Layer

Deliverables:

- checkpointing
- continuation packets
- reconciliation logic
- memory fidelity audits
- postmortem pipeline

Goal:

- guarantee resumability and reduce silent drift

## Phase 7: Parallelism and Integration

Deliverables:

- boundary-aware parallel scheduling
- file locks or ownership protocol
- integrator agent
- semantic conflict checks

Goal:

- scale beyond serial execution without destroying coherence

## Phase 8: Compound Learning

Deliverables:

- skill health telemetry
- pattern extraction queue
- roadmap reassessment engine
- process improvement reports

Goal:

- make the system better over time, not just busier

---

## 28. V1 Acceptance Criteria

SUPER_CODEX v1 should not be considered real until all of the following are true:

1. A project can be initialized from `vision.md` and `roadmap.md`.
2. The system can create milestones, slices, and tasks as disk artifacts.
3. The conductor can read state and synthesize the next action automatically.
4. Claude Code and Codex can both execute the same normalized dispatch packet.
5. The system defaults to TDD unless a task explicitly records a valid exception.
6. Every completed task has machine-verifiable evidence attached.
7. Interruptions can be resumed from disk with no hidden chat dependency.
8. Human interaction happens through local feedback files at boundaries, not constant chat steering.
9. A failure triggers postmortem and process improvement artifacts.
10. A completed slice yields summary, review result, and UAT instructions.

---

## 29. Recommended Default Policies

Until project-specific overrides exist, use these defaults:

- context profile: `balanced`
- autonomy: maximum for reversible and semi-reversible actions
- runtime routing: strongest reasoner for planning, best observed executor for tasks
- TDD mode: `strict_tdd` unless brownfield
- planning style: vertical slices
- review style: mandatory security + maintainability + correctness
- roadmap reassessment: after each slice
- memory audit: every slice
- integration: serial convergence

---

## 30. Reference Implementation Mapping To This Repository

This specification is tool-agnostic, but this repository already contains useful primitives for a first implementation.

## 30.1 Existing Assets In `cc-master`

The following parts of the current codebase are already aligned with SUPER_CODEX:

- `src/orchestrator.ts`
  - can evolve into the conductor shell
- `src/orchestrator/pulse.ts`
  - can evolve into the headless dispatch heartbeat
- `src/jobs.ts`
  - already models persistent run units and lifecycle
- `src/tmux.ts`
  - already provides terminal-backed worker execution
- `src/dashboard/`
  - can become visibility and metrics infrastructure
- `src/dashboard/db.ts`
  - can persist runs, findings, audits, and skill telemetry
- `src/dashboard/events-reader.ts`
  - can ingest run events into a durable stream
- `plugins/cc-orchestrator/skills/`
  - can host early skill implementations

## 30.2 Suggested Module Mapping

Recommended additions:

- `src/supercodex/state.ts`
  - derive and persist `.supercodex/state/current.json`
- `src/supercodex/vault.ts`
  - scaffold and validate `vault/`
- `src/supercodex/runtime/`
  - `claude.ts`
  - `codex.ts`
  - `types.ts`
- `src/supercodex/dispatch.ts`
  - next action synthesis and packet assembly
- `src/supercodex/recovery.ts`
  - continuation packets and resume logic
- `src/supercodex/verify.ts`
  - verification ladder orchestration
- `src/supercodex/review.ts`
  - reviewer dispatch and findings merge
- `src/supercodex/audit.ts`
  - memory fidelity and postmortem flow

## 30.3 Recommended Build Order In This Repo

If implemented here, the fastest credible sequence is:

1. vault and state scaffold
2. Claude/Codex runtime adapters
3. next action synthesis loop
4. task and slice artifact generation
5. verification and review pipeline
6. recovery and audits
7. dashboard and telemetry upgrades

This sequence maximizes early end-to-end usefulness while keeping the architecture extensible.

---

## 31. Appendix: Minimal Schemas

These are reference examples, not final locked schemas.

## 31.1 `current.json`

```json
{
  "version": 1,
  "project_root": "/absolute/path/to/project",
  "context_profile": "balanced",
  "phase": "dispatch",
  "active_runtime": "codex",
  "active_milestone": "M001",
  "active_slice": "S03",
  "active_task": "T02",
  "current_run_id": "20260317-142210-codex-impl-m001-s03-t02",
  "queue_head": "M001/S03/T02",
  "blocked": false,
  "awaiting_human": false,
  "last_transition_at": "2026-03-17T14:22:10Z",
  "last_verified_commit": "abc1234",
  "recovery_ref": ".supercodex/runs/20260317-142210-codex-impl-m001-s03-t02/continue.md",
  "metrics": {
    "human_interventions": 0,
    "completed_tasks": 12,
    "failed_attempts": 3,
    "recovered_runs": 1
  }
}
```

## 31.2 Task File Template

```markdown
---
id: M001-S03-T02
title: Add auth middleware verification path
status: ready
depends_on:
  - M001-S03-T01
tdd_mode: strict_tdd
safety_class: reversible
owner_role: implementer
reviewers:
  - correctness
  - security
  - maintainability
likely_files:
  - src/auth/middleware.ts
  - test/auth/middleware.test.ts
verification:
  - npm test -- middleware
  - npm run lint
  - npm run typecheck
---

## Objective

Implement the middleware branch that rejects expired tokens and prove it with tests.

## Why Now

Slice S03 cannot be demoed until auth rejection semantics are correct.

## Acceptance Criteria

- Expired tokens are rejected with the agreed status code.
- Valid tokens continue through middleware.
- Existing auth tests remain green.

## Notes

- Must preserve contract from `boundary-map.md`.

## Completion Summary

- Filled in after completion.
```

## 31.3 Dispatch Packet Example

```json
{
  "unit_id": "M001-S03-T02",
  "unit_type": "task_execution",
  "runtime": "codex",
  "role": "implementer",
  "objective": "Implement and verify auth middleware rejection for expired tokens",
  "context_refs": [
    "vault/milestones/M001/slices/S03/plan.md",
    "vault/milestones/M001/boundary-map.md",
    "vault/decisions.md",
    "vault/milestones/M001/slices/S03/tasks/T02.md"
  ],
  "files_in_scope": [
    "src/auth/middleware.ts",
    "test/auth/middleware.test.ts"
  ],
  "acceptance_criteria": [
    "Expired tokens are rejected with agreed status code",
    "Valid tokens continue through middleware",
    "Existing auth tests remain green"
  ],
  "verification_plan": [
    "run focused auth middleware tests",
    "run lint",
    "run typecheck"
  ],
  "safety_class": "reversible",
  "output_contract": {
    "must_update_task_file": true,
    "must_produce_evidence": true,
    "must_not_claim_done_without_test_results": true
  }
}
```

---

## 32. Appendix: Local File Protocols

## 32.1 Question Entry Format

Suggested structure for `vault/feedback/QUESTIONS.md`:

```markdown
## Q-2026-03-17-001

- Scope: M001 / S03 / T02
- Severity: high
- Type: contradiction
- Issue: The roadmap says session auth, but the milestone boundary map assumes JWT middleware.
- Why blocked: This choice changes interfaces and downstream tests.
- Options:
  - A: session cookie middleware
  - B: JWT middleware
- Recommended default: B
- Latest responsible pause point: before task dispatch
```

## 32.2 Answer Entry Format

Suggested structure for `vault/feedback/ANSWERS.md`:

```markdown
## A-2026-03-17-001

- Responds to: Q-2026-03-17-001
- Decision: Use JWT middleware
- Reason: Simpler first milestone; session auth can be a later milestone
- Entered by: human
- Entered at: 2026-03-17T18:05:00Z
```

## 32.3 Blocker Entry Format

Suggested structure for `vault/feedback/BLOCKERS.md`:

```markdown
## B-2026-03-17-001

- Scope: M001 / S04
- Type: irreversible-action
- Blocker: Production schema migration package prepared and validated locally
- Required human action: review and execute migration manually
- Prepared artifacts:
  - db/migrations/20260317_add_sessions.sql
  - vault/milestones/M001/slices/S04/review.md
- Resume condition: human marks execution complete in ANSWERS.md
```

---

## 33. Appendix: Error Taxonomy And Routing

Different errors require different handlers.

## 33.1 Syntax / Type Errors

Context needed:

- error output
- offending file
- nearby types or imports

Default handler:

- deterministic fix first

Escalation:

- runtime agent only if mechanical fix fails

## 33.2 Logic Errors

Context needed:

- failing test
- expected vs actual behavior
- implementation
- acceptance criteria

Default handler:

- implementer or debugger agent with focused context

## 33.3 Design Errors

Context needed:

- roadmap
- slice plan
- boundary contracts
- reviewer findings

Default handler:

- strategist or planner plus reviewer loop

## 33.4 Security Errors

Context needed:

- diff
- static analysis result
- security policy

Default handler:

- security reviewer

Additional rule:

- always flag for explicit review even if auto-fixed

## 33.5 Environment Errors

Context needed:

- command output
- environment delta
- dependency changes

Default handler:

- recovery or environment specialist path

## 33.6 Flaky Tests

Context needed:

- multiple reruns
- pass/fail distribution

Default handler:

- quarantine classification

Critical rule:

- do not trigger standard code-fix loops until flakiness is confirmed or ruled out

---

## 34. Final Statement

SUPER_CODEX is not a prompt. It is a disciplined operating system for AI-assisted software development.

Its core philosophy is simple:

- keep human attention precious
- keep agent context lean
- keep state on disk
- keep tasks small
- keep tests central
- keep recovery explicit
- keep assumptions visible
- keep code boring and maintainable
- keep the system improving itself

If implemented faithfully, this system should let Claude Code and Codex operate as equal members of a structured agent workforce, with the human acting as strategist and judge rather than full-time babysitter.
