# CC-Orchestrator: Feature Proposals

**Date:** 2026-02-09
**Status:** Draft
**Author:** Claude (Orchestrator research session)

---

## Tier 1: High Impact, Fills Real Gaps

### 1. Agent Chaining / Pipelines

**Problem:** Today every agent is standalone. The orchestrator (Claude) manually checks completion and spawns the next agent. There's no way to say "when agent A finishes, start agent B with A's output."

**Proposal:**

```bash
cc-agent start "Review code" --map --on-complete "cc-agent start 'Fix issues found in {output}' --map"
```

- `--on-complete <command>` — run a command when the agent completes successfully
- `--on-fail <command>` — run a command on failure
- `{output}` placeholder injects the agent's summary/output
- Enables fully autonomous pipelines: research -> implement -> test

**Implementation notes:**
- Hook into `refreshJobStatus()` completion detection
- Store callbacks in job JSON
- Execute callback via `child_process.spawn` when status transitions to `completed`/`failed`

---

### 2. Agent Templates / Presets

**Problem:** The SKILL.md shows the same patterns repeated constantly (`--map -s read-only` for research, `--map` for implementation, `--map -f "docs/prds/*.md"` for PRD-driven work). Users and orchestrators repeat boilerplate.

**Proposal:**

```bash
# Save a template
cc-agent template save research --sandbox read-only --map --reasoning xhigh

# Use it
cc-agent start "Investigate auth flow" --template research

# Built-in presets
cc-agent start "..." --preset research    # read-only, xhigh, map
cc-agent start "..." --preset implement   # workspace-write, xhigh, map
cc-agent start "..." --preset review      # read-only, xhigh, map
cc-agent start "..." --preset test        # workspace-write, xhigh, map
```

**Storage:** `~/.cc-agent/templates/<name>.json`

**Implementation notes:**
- Templates are just saved option sets (sandbox, reasoning, model, files, map flag)
- Built-in presets are hardcoded in `config.ts`
- `--template` merges saved options with CLI overrides (CLI wins)

---

### 3. Cost Tracking & Budgets

**Problem:** Token data is only available for *completed* jobs (via `session-parser.ts`). Running jobs show no cost info. There's no budget enforcement. The dashboard tracks total tokens but doesn't translate to dollars.

**Proposal:**

- Real-time token tracking for running agents (poll session files periodically)
- `--budget <max_dollars>` flag to kill agents that exceed a cost threshold
- `cc-agent cost` — show total spend across all agents (today, this week, all time)
- `cc-agent cost <jobId>` — show cost breakdown for a specific job
- Add cost calculation to the dashboard metrics (using Anthropic pricing)

**Implementation notes:**
- Pricing table in `config.ts` (per-model input/output token rates)
- `cost` command reads from `dashboard.db` daily_metrics table
- Budget enforcement via periodic check in `refreshJobStatus()`
- Dashboard already has `daily_metrics` table — add `total_cost_usd` column

---

### 4. Agent Groups / Campaigns

**Problem:** When the orchestrator spawns 3 research agents in parallel, there's no way to group them. You can't say "wait for all research agents" or "kill all implementation agents."

**Proposal:**

```bash
# Tag agents into groups
cc-agent start "Research auth" --map -s read-only --group research-batch-1
cc-agent start "Research API"  --map -s read-only --group research-batch-1

# Operate on groups
cc-agent group status research-batch-1    # status of all agents in group
cc-agent group wait research-batch-1      # block until all complete
cc-agent group kill research-batch-1      # kill all in group
cc-agent jobs --group research-batch-1    # filter jobs by group
```

**Implementation notes:**
- Add `group?: string` field to `Job` interface
- `group wait` polls all jobs in group until none are `running`/`pending`
- `group status` is a filtered `jobs --json` view
- Groups are ephemeral (no separate storage, just a job field)

---

### 5. Retry / Resume Failed Agents

**Problem:** When an agent fails (`status: "failed"`), the only option is to start a completely new agent from scratch. The original context, partial progress, and the reason for failure are all lost.

**Proposal:**

```bash
cc-agent retry <jobId>                    # restart with same prompt + "Previous attempt failed: <error>"
cc-agent retry <jobId> --with "Also try X"  # retry with additional context
cc-agent resume <jobId>                   # reattach to tmux if session still exists
```

**Implementation notes:**
- `retry` reads the original job's prompt and error, constructs an enriched prompt
- `resume` checks if tmux session still exists (it lingers due to `read` at end of shell command)
- Could include last N lines of output as context for the retry

---

## Tier 2: Medium Impact, Quality of Life

### 6. Webhook / Notification on Completion

**Problem:** The orchestrator has to poll `cc-agent jobs --json` to know when agents finish. There's no push notification.

**Proposal:**

```bash
cc-agent start "..." --notify              # system notification on completion
cc-agent start "..." --webhook <url>       # POST to URL on completion
cc-agent start "..." --callback <command>  # run command on completion
```

**Implementation notes:**
- `--notify` uses `osascript` on macOS / `notify-send` on Linux
- `--webhook` POSTs the job JSON to the URL
- The hooks system (`hooks-manager.ts`) already captures `Stop` events — this just needs to be surfaced as a user-facing feature
- Overlaps with `--on-complete` from Agent Chaining (could be unified)

---

### 7. Agent Context Sharing / Handoff

**Problem:** Agents can't see what other agents have done. If agent A modifies files, agent B doesn't know about it unless the orchestrator manually tells it.

**Proposal:**

- `--context-from <jobId>` — inject another agent's summary and files_modified into the prompt
- `--context-from-group <group>` — inject summaries from all agents in a group
- Auto-generate a "handoff document" when an agent completes

**Implementation notes:**
- Reads completed job's session data via `loadSessionData()`
- Formats summary + files_modified as a "Previous Agent Context" section in prompt
- Could also include the agent's last N lines of output
- Handoff doc stored as `~/.cc-agent/jobs/<jobId>.handoff.md`

---

### 8. Prompt History & Replay

**Problem:** Prompts are stored in `.prompt` files but there's no way to browse, search, or replay them.

**Proposal:**

```bash
cc-agent history                          # list past prompts with job IDs
cc-agent history --search "auth"          # search prompt text
cc-agent replay <jobId>                   # re-run same prompt
cc-agent replay <jobId> --edit            # edit prompt before re-running
```

**Implementation notes:**
- `history` reads all `.prompt` files from jobs directory
- `--search` does substring/regex match on prompt content
- `replay` calls `startJob()` with the original prompt
- `--edit` opens `$EDITOR` with the prompt file, then starts the job
- Could also use `dashboard.db` job_history table for faster lookups

---

### 9. Git Integration

**Problem:** Agents modify files but there's no automatic git integration. The orchestrator has to manually check git status after agents complete.

**Proposal:**

```bash
cc-agent start "..." --auto-branch <name>   # create branch before agent starts
cc-agent start "..." --auto-commit          # agent auto-commits on completion
cc-agent diff <jobId>                       # show git diff of agent's changes
cc-agent pr <jobId> --title "..."           # create PR from agent's changes
```

**Implementation notes:**
- `--auto-branch` runs `git checkout -b <name>` before starting the agent
- `--auto-commit` uses the agent's summary as commit message on completion
- `diff` uses `files_modified` from session data to scope `git diff`
- `pr` shells out to `gh pr create`
- All git ops happen in the job's `cwd`

---

### 10. Agent Health Monitoring / Stall Detection

**Problem:** `isInactiveTimedOut()` exists but only checks log file mtime. A more sophisticated stall detector could watch for agents that are spinning (high token usage, no file modifications).

**Proposal:**

- Detect token burn with no progress (context_used_pct climbing, no files_modified)
- Detect repeated tool failures (from hook events)
- Auto-alert the orchestrator: "Agent X appears stuck - 50k tokens consumed, 0 files modified"
- `cc-agent status <jobId> --health` — show health indicators

**Implementation notes:**
- Health check runs during `refreshJobStatus()`
- Indicators: tokens consumed, files modified, time since last tool use, error rate
- Alert via system notification or dashboard event
- Could also add a `health` field to job JSON output

---

## Tier 3: Nice to Have

### 11. Config File

**Problem:** All defaults are hardcoded in `config.ts`. Users can't customize defaults without editing source.

**Proposal:** `~/.cc-agent/config.json`

```json
{
  "model": "opus",
  "reasoning": "xhigh",
  "sandbox": "workspace-write",
  "timeout": 60,
  "jobsListLimit": 20,
  "dashboard": {
    "port": 3131,
    "autoStart": true
  }
}
```

**Implementation notes:**
- Load config file in `config.ts`, merge with hardcoded defaults
- CLI flags still override config file values
- `cc-agent config set <key> <value>` for easy updates

---

### 12. Agent Labels / Tags

```bash
cc-agent start "..." --label "security-audit" --label "sprint-12"
cc-agent jobs --label security-audit
```

**Implementation notes:**
- Add `labels?: string[]` to `Job` interface
- Filter in `listJobs()` and `getJobsJson()`
- Overlaps with groups but is more flexible (multi-tag vs single group)

---

### 13. Export / Report Generation

```bash
cc-agent report --format markdown        # generate report of all agent activity
cc-agent report --session <date>         # report for a specific session
cc-agent export <jobId> --format json    # export full agent output as structured data
```

**Implementation notes:**
- Reads from `dashboard.db` for historical data
- Markdown report includes: jobs table, token totals, cost summary, files modified
- JSON export includes full session data, prompt, output

---

### 14. Remote Dashboard Access

The dashboard runs on `localhost:3131`. Add optional auth + tunnel support for remote monitoring when running agents on a server.

**Implementation notes:**
- `--host 0.0.0.0` flag for external access
- Simple token-based auth (stored in config)
- Could integrate with ngrok/cloudflared for tunnel support
- HTTPS via self-signed cert option

---

## Recommended Priority Order

If implementing incrementally, this order maximizes value delivered per session:

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Agent Templates/Presets | Low | High |
| 2 | Agent Groups | Medium | High |
| 3 | Cost Tracking | Medium | High |
| 4 | Config File | Low | Medium |
| 5 | Retry/Resume | Low | High |
| 6 | Agent Chaining | Medium | High |
| 7 | Notification on Completion | Low | Medium |
| 8 | Prompt History & Replay | Low | Medium |
| 9 | Context Sharing / Handoff | Medium | Medium |
| 10 | Git Integration | Medium | Medium |
| 11 | Agent Labels/Tags | Low | Low |
| 12 | Health Monitoring | Medium | Medium |
| 13 | Export/Reports | Medium | Low |
| 14 | Remote Dashboard | High | Low |
