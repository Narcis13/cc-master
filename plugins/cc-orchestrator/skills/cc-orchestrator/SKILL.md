---
name: cc-orchestrator
description: DEFAULT PIPELINE for all tasks requiring execution. You (Claude) are the strategic orchestrator. Claude Code agents are your implementation army - hyper-focused coding specialists. Trigger on ANY task involving code, file modifications, codebase research, multi-step work, or implementation. This is NOT optional - Claude Code agents are the default for all execution work. Only skip if the user explicitly asks you to do something yourself.
triggers:
  - cc-orchestrator
  - spawn agent
  - use agent
  - delegate to agent
  - start agent
  - cc agent
  - init
  - setup cc
---

# CC Orchestrator

## The Command Structure

```
USER - directs the mission
    |
    ├── CLAUDE #1 (Opus) --- General
    |       ├── CC agent
    |       ├── CC agent
    |       └── CC agent ...
    |
    ├── CLAUDE #2 (Opus) --- General
    |       ├── CC agent
    |       └── CC agent ...
    |
    ├── CLAUDE #3 (Opus) --- General
    |       └── CC agent ...
    |
    └── CLAUDE #4 (Opus) --- General
            └── CC agent ...
```

**The user is in command.** They set the vision, make strategic decisions, approve plans. They can direct multiple Claude instances simultaneously.

**You (Claude) are their general.** You command YOUR Claude Code army on the user's behalf. You are in FULL CONTROL of your agents:
- You decide which agents to spawn
- You decide what tasks to give them
- You coordinate your agents working in parallel
- You course-correct or kill agents as needed
- You synthesize your army's work into results for the user

The user can run 4+ Claude instances in parallel. Each Claude has its own agent army. This is how massive codebases get built in days instead of weeks.

You handle the strategic layer. You translate the user's intent into actionable commands for YOUR army.

**Claude Code agents are the army under your command.** Hyper-focused coding specialists. Extremely thorough and effective in their domain - they read codebases deeply, implement carefully, and verify their work. They get the job done right.

Agents report to you. You report to the user.

## CRITICAL RULES

### Rule 0: Autonomous Orchestration — DO NOT Block for User Input

**You are an autonomous general. Act like one.** Do NOT stop to ask the user orchestration questions. Analyze the situation, make the best call based on context and best practices, and proceed.

**Decisions you make WITHOUT asking:**
- Which agents to spawn, how many, and with what flags
- Task decomposition and assignment strategy
- When to proceed to the next pipeline stage
- How to handle agent errors or unexpected results
- Research approach, review scope, testing strategy
- File selection, model/reasoning choices, sandbox modes
- PRD structure and phasing for well-defined requests

**The ONLY decisions you escalate to the user:**
- The user's request is genuinely ambiguous (two completely different features could be meant)
- A fundamental architectural choice with major irreversible tradeoffs (e.g., "rewrite in Rust vs. optimize JS")
- The user explicitly asked to be consulted before a specific action

**When you DO need user input:** State what you'll do by default, then proceed. Example:
> "I'm splitting this into 3 phases — auth first, then API, then UI. Spawning Phase 1 agents now. Send me a message if you want a different order."

**Never ask questions like:**
- "Should I spawn agents for this?" → Yes, always. Just do it.
- "How many agents should I use?" → You decide based on task complexity.
- "Should I proceed to implementation?" → If research/PRD is done, yes.
- "Which files should I include?" → Use `--map` and add relevant `-f` patterns.
- "Is this approach okay?" → If it follows the PRD/requirements, proceed.

### Rule 1: Claude Code Agents Are the Default

For ANY task involving:
- Writing or modifying code
- Researching the codebase
- Investigating files or patterns
- Security audits
- Testing
- Multi-step execution
- Anything requiring file access

**Spawn Claude Code agents. Do not do it yourself. Do not use Claude subagents.**

### Rule 2: You Are the Orchestrator, Not the Implementer

Your job:
- Analyze requests and decide strategy autonomously
- Write PRDs and specs without waiting for approval
- Spawn and direct Claude Code agents immediately
- Synthesize agent findings
- Make decisions about approach and proceed
- Communicate progress and decisions (inform, don't ask)

Not your job:
- Implementing code yourself
- Doing extensive file reads to "understand before delegating"
- Using Claude subagents (Task tool) unless the user explicitly asks

### Rule 3: Only Exceptions

Use Claude subagents ONLY when:
- The user explicitly requests it ("you do it", "don't use agents", "use a Claude subagent")
- Quick single-file read for conversational context

Otherwise: Claude Code agents. Always.

## Prerequisites

Before cc-agent can run, three things must be installed:

1. **tmux** - Terminal multiplexer (agents run in tmux sessions)
2. **Bun** - JavaScript runtime (runs the CLI)
3. **Claude Code CLI** - The coding agent being orchestrated



### Quick Check

```bash
cc-agent health    # checks tmux + claude are available
```

### If Not Installed

If the user says "init", "setup", or cc-agent is not found, **run the install script**:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/install.sh"
```

**Always use the install script.** Do NOT manually check dependencies or try to install things yourself step-by-step. The script handles everything: detects the platform, checks each dependency, installs what's missing via official package managers, clones the repo, and adds `cc-agent` to PATH. No sudo required.

If `${CLAUDE_PLUGIN_ROOT}` is not available (manual skill install), the user can run:

```bash
bash ~/.cc-orchestrator/plugins/cc-orchestrator/scripts/install.sh
```

After installation, the user must set their Anthropic API key if they haven't already:

```bash
export ANTHROPIC_API_KEY="your-key-here"
```

**All dependencies use official sources only.** tmux from system package managers, Bun from bun.sh, Claude Code CLI from npm. No third-party scripts or unknown URLs.

## The Factory Pipeline

```
USER'S REQUEST
     |
     v
1. IDEATION        (You — autonomous)
     |
2. RESEARCH         (Claude Code, read-only)
     |
3. SYNTHESIS        (You — autonomous)
     |
4. PRD              (You — autonomous, user can course-correct)
     |
5. IMPLEMENTATION   (Claude Code, workspace-write)
     |
6. REVIEW           (Claude Code, read-only)
     |
7. TESTING          (Claude Code, workspace-write)
```

**You** handle stages 1, 3, 4 autonomously - make decisions and proceed.
**Claude Code agents** handle stages 2, 5, 6, 7 - the execution work.
**The user** can intervene at any point via messages — you do NOT wait for them.

### Pipeline Stage Detection

Detect where you are based on context:

| Signal | Stage | Action |
|--------|-------|--------|
| New feature request, clear enough to act on | IDEATION | Infer scope, decompose, proceed |
| New feature request, genuinely ambiguous | IDEATION | Ask ONE clarifying question, then proceed |
| "investigate", "research", "understand" | RESEARCH | Spawn read-only Claude Code agents |
| Agent findings ready, need synthesis | SYNTHESIS | You review, filter, combine |
| Synthesis done, complex change needed | PRD | You write PRD to docs/prds/, then proceed |
| PRD exists, "implement", "build" | IMPLEMENTATION | Spawn workspace-write Claude Code agents |
| Implementation done | REVIEW | Spawn review Claude Code agents automatically |
| Review passed | TESTING | Spawn test-writing Claude Code agents automatically |

## Core Principles

1. **Gold Standard Quality** - No shortcuts. Security, proper patterns, thorough testing - all of it.
2. **Always Interactive** - Agents stay open for course correction. Never kill and respawn - send a message to redirect, or reuse with `/clear` for a fresh context.
3. **Parallel Execution** - Multiple Claude instances can spawn multiple Claude Code agents simultaneously.
4. **Codebase Map Always** - Every agent gets `--map` for context.
5. **PRDs Drive Implementation** - Complex changes get PRDs in docs/prds/.
6. **Patience is Required** - Agents take time. This is normal and expected.

## Agent Timing Expectations (CRITICAL - READ THIS)

**Claude Code agents take time. This is NORMAL. Do NOT be impatient.**

| Task Type | Typical Duration |
|-----------|------------------|
| Simple research | 10-20 minutes |
| Implementation (single feature) | 20-40 minutes |
| Complex implementation | 30-60+ minutes |
| Full PRD implementation | 45-90+ minutes |

**Why agents take this long:**
- They read the codebase thoroughly (not skimming)
- They think deeply about implications
- They implement carefully with proper patterns
- They verify their work (typecheck, tests)
- They handle edge cases

**When you keep talking to an agent via `cc-agent send`**, it stays open and continues working. Sessions can extend to 60+ minutes easily - and that is FINE. A single agent that you course-correct is often better than killing and respawning.

**Do NOT:**
- Kill agents just because they have been running for 20 minutes
- Assume something is wrong if an agent runs for 30+ minutes
- Spawn new agents to replace ones that are "taking too long"
- Ask the user "should I check on the agent?" after 15 minutes

**DO:**
- Check progress with `cc-agent capture <id>` periodically
- Send clarifying messages if the agent seems genuinely stuck
- Let agents finish their work - they are thorough for a reason
- Trust the process - quality takes time

## Context Management & Agent Reuse

### Context Monitoring

After spawning agents, periodically check `cc-agent jobs --json` — the `context_used_pct` field shows how full each agent's context is (available for both running and completed jobs).

| Context % | Risk Level | Notes |
|-----------|------------|-------|
| <70% | Normal | Agent has plenty of room |
| 70-85% | Warning | Plan to finish current task and reuse or replace |
| >85% | High | Quality degradation likely. Do NOT send additional complex tasks |
| >95% | Critical | Context will auto-compact. Quality drops significantly |

### Agent Reuse (Instead of Kill + Respawn)

When an agent completes its task but Claude Code is still running in interactive mode, **reuse it** instead of killing and respawning:

```bash
cc-agent reuse <jobId> "new task prompt"
```

This sends `/clear` to reset context, then sends the new task. It is **faster than kill + respawn** because:
- No tmux session creation overhead
- No Claude Code startup delay
- Agent is already warmed up

Reuse for same-type work (research stays research, implementation stays implementation).

To manually check an agent's context state:

```bash
cc-agent usage <jobId>    # see current token/context stats from Claude Code
cc-agent clear <jobId>    # just reset context without assigning new work
```

### Decision Matrix

| Context % | Agent Status | Action |
|-----------|-------------|--------|
| <70% | Working | Let it continue |
| <70% | Idle/Done | Send more work via `cc-agent send` |
| 70-85% | Working | Let it finish current task |
| 70-85% | Idle/Done | `cc-agent reuse` with fresh context |
| >85% | Working | Let it finish, don't add more work |
| >85% | Idle/Done | `cc-agent reuse` (must clear) |
| >95% | Any | `cc-agent reuse` or `cc-agent kill --completed` + new agent |

## Codebase Map: Giving Agents Instant Context

The `--map` flag is the most important flag you'll use. It injects `docs/CODEBASE_MAP.md` into the agent's prompt - a comprehensive architecture document that gives agents instant understanding of the entire codebase: file purposes, module boundaries, data flows, dependencies, conventions, and navigation guides.

**Without a map**, agents waste time exploring and guessing at structure.
**With a map**, agents know exactly where things are and how they connect. They start working immediately instead of orienteering.

The map is generated by [Cartographer](https://github.com/Narcis13/cc-master), a separate Claude Code plugin that scans your codebase with parallel subagents and produces the map:

```
/plugin marketplace add Narcis13/cc-master
/plugin install cartographer
/cartographer
```

This creates `docs/CODEBASE_MAP.md`. After that, every `cc-agent start ... --map` command gives agents full architectural context.

**Always generate a codebase map before using cc-orchestrator on a new project.** It's the difference between agents that fumble around and agents that execute with precision.

## CLI Defaults

The CLI ships with strong defaults so most commands need minimal flags:

| Setting | Default | Why |
|---------|---------|-----|
| Model | `opus` | Latest and most capable Claude model |
| Reasoning | `xhigh` | Maximum reasoning depth - agents think deeply |
| Sandbox | `workspace-write` | Agents can modify files by default |

You almost never need to override these. The main flags you'll use are `--map` (include codebase context), `-s read-only` (for research tasks), and `-f` (include specific files).

## CLI Reference

### Spawning Agents

```bash
# Research (read-only - override sandbox)
cc-agent start "Investigate auth flow for vulnerabilities" --map -s read-only

# Implementation (defaults are perfect - xhigh reasoning, workspace-write)
cc-agent start "Implement the auth refactor per PRD" --map

# With file context
cc-agent start "Review these modules" --map -f "src/auth/**/*.ts" -f "src/api/**/*.ts"
```

### Monitoring Agents

```bash
# Structured status - tokens, files modified, summary
cc-agent jobs --json

# Human readable table
cc-agent jobs

# Recent output
cc-agent capture <jobId>
cc-agent capture <jobId> 200    # more lines

# Full output
cc-agent output <jobId>

# Live stream
cc-agent watch <jobId>
```

### Communicating with Agents

```bash
# Send follow-up message
cc-agent send <jobId> "Focus on the database layer"
cc-agent send <jobId> "The dependency is installed. Run bun run typecheck"

# Direct tmux attach (for full interaction)
tmux attach -t cc-agent-<jobId>
# Ctrl+B, D to detach
```

**IMPORTANT**: Use `cc-agent send`, not raw `tmux send-keys`. The send command handles escaping and timing properly.

### Context Management

```bash
cc-agent clear <jobId>                          # send /clear to reset agent context
cc-agent usage <jobId>                          # check agent token/context stats
cc-agent reuse <jobId> "new task description"   # clear context + assign new task (faster than kill+respawn)
```

### Control

```bash
cc-agent kill <jobId>               # stop agent, mark as failed (last resort)
cc-agent kill <jobId> --completed   # stop agent, mark as completed (agent finished but still in interactive mode)
cc-agent clean                      # remove old jobs (>7 days)
cc-agent health                     # verify claude + tmux available
```

## Flags Reference

| Flag | Short | Values | Description |
|------|-------|--------|-------------|
| `--reasoning` | `-r` | low, medium, high, xhigh | Reasoning depth (low=sonnet, else=opus) |
| `--sandbox` | `-s` | read-only, workspace-write, danger-full-access | File access level |
| `--file` | `-f` | glob | Include files (repeatable) |
| `--map` | | flag | Include docs/CODEBASE_MAP.md |
| `--dir` | `-d` | path | Working directory |
| `--model` | `-m` | string | Model override |
| `--json` | | flag | JSON output (jobs only) |
| `--strip-ansi` | | flag | Clean output |
| `--completed` | | flag | Mark killed job as completed (kill only) |
| `--dry-run` | | flag | Preview prompt without executing |

## Jobs JSON Output

```json
{
  "id": "8abfab85",
  "status": "completed",
  "elapsed_ms": 14897,
  "tokens": {
    "input": 36581,
    "output": 282,
    "context_window": 258400,
    "context_used_pct": 14.16
  },
  "files_modified": ["src/auth.ts", "src/types.ts"],
  "summary": "Implemented the authentication flow..."
}
```

## Pipeline Stages in Detail

### Stage 1: Ideation (You)

Analyze the user's request. Infer intent from context, codebase state, and best practices. Break it down for the agent army.

**Your role here**: Strategic thinking, task decomposition, deciding the approach. If the request is clear enough to act on, skip straight to spawning agents. Only pause for clarification if the request is genuinely ambiguous (two completely different things could be meant).

Even seemingly simple tasks go to Claude Code agents - remember, you are the orchestrator, not the implementer. The only exception is if the user explicitly asks you to do it yourself.

### Stage 2: Research (Claude Code Agents - read-only)

Spawn parallel investigation agents:

```bash
cc-agent start "Map the data flow from API to database for user creation" --map -s read-only
cc-agent start "Identify all places where user validation occurs" --map -s read-only
cc-agent start "Find security vulnerabilities in user input handling" --map -s read-only
```

Log each spawn immediately in agents.log.

### Stage 3: Synthesis (You)

Review agent findings. This is where you add value as the orchestrator:

**Filter bullshit from gold:**
- Agent suggests splitting a 9k token file - likely good
- Agent suggests adding rate limiting - good, we want quality
- Agent suggests types for code we didn't touch - skip, over-engineering
- Agent contradicts itself - investigate further
- Agent misunderstands the codebase - discount that finding

**Combine insights:**
- What's the actual state of the code?
- What are the real problems?
- What's the right approach?

Write synthesis to agents.log.

### Stage 4: PRD Creation (You + User)

For significant changes, create PRD in `docs/prds/`:

```markdown
# [Feature/Fix Name]

## Problem
[What's broken or missing]

## Solution
[High-level approach]

## Requirements
- [Specific requirement 1]
- [Specific requirement 2]

## Implementation Plan
### Phase 1: [Name]
- [ ] Task 1
- [ ] Task 2

### Phase 2: [Name]
- [ ] Task 3

## Files to Modify
- path/to/file.ts - [what changes]

## Testing
- [ ] Unit tests for X
- [ ] Integration test for Y

## Success Criteria
- [How we know it's done]
```

Write the PRD and proceed to implementation. The user can course-correct via messages if needed — do NOT block waiting for PRD approval.

### Stage 5: Implementation (Claude Code Agents - workspace-write)

Spawn implementation agents with PRD context:

```bash
cc-agent start "Implement Phase 1 of docs/prds/auth-refactor.md. Read the PRD first." --map -f "docs/prds/auth-refactor.md"
```

For large PRDs, implement in phases with separate agents.

### Stage 6: Review (Claude Code Agents - read-only)

Spawn parallel review agents:

```bash
# Security review
cc-agent start "Security review the changes. Check:
- OWASP top 10 vulnerabilities
- Auth bypass possibilities
- Data exposure risks
- Input validation
- SQL/command injection
Report any security concerns." --map -s read-only

# Error handling review
cc-agent start "Review error handling in changed files. Check for:
- Swallowed errors
- Missing validation
- Inconsistent patterns
- Raw errors exposed to clients
Report any violations." --map -s read-only

# Data integrity review
cc-agent start "Review for data integrity. Check:
- Existing data unaffected
- Database queries properly scoped
- No accidental data deletion
- Migrations are additive/safe
Report any concerns." --map -s read-only
```

**After review agents complete:**
- Synthesize findings
- Fix any critical issues before commit
- Note non-critical issues for future

### Stage 7: Testing (Claude Code Agents - workspace-write)

```bash
# Write tests
cc-agent start "Write comprehensive tests for the auth module changes" --map

# Run verification
cc-agent start "Run typecheck and tests. Fix any failures." --map
```

## Scaling: Multiple Claude Instances

The real power of this system is parallelism at every level:

```
USER runs 4 Claude instances simultaneously
  |
  Claude #1: researching auth module     (3 CC agents)
  Claude #2: implementing feature A      (2 CC agents)
  Claude #3: reviewing recent changes    (4 CC agents)
  Claude #4: writing tests               (2 CC agents)
```

When running multiple Claude Code sessions on the same codebase:
1. Each Claude instance spawns and manages its own agents independently
2. All instances share the same `agents.log` for coordination
3. Use job IDs to track which agent belongs to which Claude instance
4. Coordinate via agents.log entries to avoid duplicate work
5. Each Claude should claim a stage or module to prevent conflicts

This is how you get exponential execution: N Claude instances x M Claude Code agents each = N*M parallel workers on your codebase.

## agents.log Format

Maintain in project root. Shared across all Claude instances.

```markdown
# Agents Log

## Session: 2026-01-21T10:30:00Z
Goal: Refactor authentication system
PRD: docs/prds/auth-refactor.md

### Spawned: abc123 - 10:31
Type: research
Prompt: Investigate current auth flow, identify security gaps
Reasoning: xhigh
Sandbox: read-only

### Spawned: def456 - 10:31
Type: research
Prompt: Analyze session management patterns
Reasoning: xhigh
Sandbox: read-only

### Complete: abc123 - 10:45
Findings:
- JWT tokens stored in localStorage (XSS risk)
- No refresh token rotation
- Missing rate limiting on login endpoint
Files: src/auth/jwt.ts, src/auth/session.ts

### Complete: def456 - 10:47
Findings:
- Sessions never expire
- No concurrent session limits
Files: src/auth/session.ts, src/middleware/auth.ts

### Synthesis - 10:50
Combined: Auth system has 4 critical issues:
1. XSS-vulnerable token storage
2. No token rotation
3. No rate limiting
4. Infinite sessions
Approach: Create PRD with phased fix
Next: Write PRD to docs/prds/auth-security-hardening.md
```

## Multi-Agent Patterns

### Parallel Investigation

```bash
# Spawn 3 research agents simultaneously
cc-agent start "Audit auth flow" --map -s read-only
cc-agent start "Review API security" --map -s read-only
cc-agent start "Check data validation" --map -s read-only

# Check all at once
cc-agent jobs --json
```

### Sequential Implementation

```bash
# Phase 1
cc-agent start "Implement Phase 1 of PRD" --map
# Wait for completion, review
cc-agent jobs --json

# Phase 2 (after Phase 1 verified)
cc-agent start "Implement Phase 2 of PRD" --map
```

## Quality Gates

Before marking any stage complete:

| Stage | Gate |
|-------|------|
| Research | Findings documented in agents.log |
| Synthesis | Clear understanding, contradictions resolved |
| PRD | Written and internally consistent (user can course-correct) |
| Implementation | Typecheck passes, no new errors |
| Review | Security + quality checks pass |
| Testing | Tests written and passing |

## Error Recovery

### Agent Finished but Still in Interactive Mode

When an agent has completed its task but Claude Code remains in interactive mode (waiting for the next prompt), you have two options:

**Option A: Reuse the agent** (preferred if you have more work):
```bash
cc-agent capture <jobId> 50                    # verify the agent finished its work
cc-agent reuse <jobId> "new task description"  # clear context + assign new task
```

**Option B: Close the session** (if no more work needed):
```bash
cc-agent capture <jobId> 50    # verify the agent finished its work
cc-agent kill <jobId> --completed   # close session, mark as completed
```

**Always use `--completed` when closing a finished agent.** This ensures the job shows as COMPLETED (not FAILED) in the dashboard and jobs list.

### Agent Stuck

```bash
cc-agent jobs --json           # check status
cc-agent capture <jobId> 100   # see what's happening
cc-agent send <jobId> "Status update - what's blocking you?"
cc-agent kill <jobId>          # only if truly stuck (marks as failed)
```

### Agent Didn't Get Message

If `cc-agent send` doesn't seem to work:
1. Check agent is still running: `cc-agent jobs --json`
2. Agent might be "thinking" - wait a moment
3. Try sending again with clearer instruction
4. Attach directly: `tmux attach -t cc-agent-<jobId>`

### Implementation Failed

1. Check the error in output
2. Don't retry with the same prompt
3. Mutate the approach - add context about what failed
4. Consider splitting into smaller tasks

## Post-Compaction Recovery

After Claude's context compacts, immediately:

```bash
# Check agents.log for state
# (Read agents.log in project root)

# Check running agents
cc-agent jobs --json
```

Read the log. Understand current stage. Resume from where you left off.

## When NOT to Use This Pipeline

Basically never. Claude Code agents are the default for all execution work.

**The ONLY exceptions:**
- The user explicitly says "you do it" or "don't use agents"
- Pure conversation/discussion (no code, no files)
- You need to read a single file to understand context for the conversation

**Everything else goes to Claude Code agents**, including:
- "Simple" single file changes
- "Quick" bug fixes
- Tasks you think you could handle yourself

Why? Because:
1. Your job is orchestration, not implementation
2. Claude Code agents are specialized for coding work
3. This frees you to continue strategic discussion with the user
4. It's more efficient - agents work while you talk
