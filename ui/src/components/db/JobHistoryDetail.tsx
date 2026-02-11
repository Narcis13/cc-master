import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { formatDuration, formatTokens, formatRelativeTime } from "../../lib/format";

interface JobHistoryRecord {
  id: string;
  status: string;
  model: string;
  reasoning_effort: string;
  cwd: string;
  prompt: string;
  summary: string | null;
  session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  elapsed_ms: number;
  input_tokens: number;
  output_tokens: number;
  context_used_pct: number;
  context_window: number;
  estimated_cost: number | null;
  tool_call_count: number;
  failed_tool_calls: number;
  primary_tool: string | null;
  files_modified_count: number;
  files_modified_json: string | null;
  message_count: number;
  user_message_count: number;
  has_session: number;
  reuse_count: number;
  original_prompt: string | null;
}

interface ToolCallRecord {
  id: number;
  job_id: string;
  name: string;
  is_error: number;
  timestamp: string | null;
  input_preview: string | null;
  output_preview: string | null;
}

interface SubagentRecord {
  id: number;
  job_id: string;
  subagent_id: string;
  tool_call_count: number;
  message_count: number;
}

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  opus: { input: 15, output: 75 },
  sonnet: { input: 3, output: 15 },
};

function computeCost(model: string, inputTokens: number, outputTokens: number) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.opus;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return { inputCost, outputCost, totalCost: inputCost + outputCost };
}

function JobDetailHeader({ job }: { job: JobHistoryRecord }) {
  return (
    <div class="jd-header">
      <div class="jd-header-top">
        <code class="jd-header-id">{job.id}</code>
        <span class={`db-status-badge db-status-badge--${job.status}`}>
          {job.status}
        </span>
        <span class="jd-header-elapsed">{formatDuration(job.elapsed_ms)}</span>
      </div>
      <div class="jd-header-meta">
        <span>Model: <strong>{job.model}</strong></span>
        <span class="jd-meta-sep">|</span>
        <span>Reasoning: <strong>{job.reasoning_effort}</strong></span>
        {job.cwd && (
          <>
            <span class="jd-meta-sep">|</span>
            <span>Dir: <code class="jd-header-cwd">{job.cwd}</code></span>
          </>
        )}
      </div>
      {job.session_id && (
        <div class="jd-header-meta">
          <span>Session: <code>{job.session_id}</code></span>
          <span class="jd-meta-sep">|</span>
          <span>Reuse count: {job.reuse_count}</span>
        </div>
      )}
      <div class="jd-header-meta">
        {job.started_at && <span>Started: {new Date(job.started_at).toLocaleString()}</span>}
        {job.started_at && job.completed_at && <span class="jd-meta-sep">|</span>}
        {job.completed_at && <span>Completed: {new Date(job.completed_at).toLocaleString()}</span>}
      </div>
    </div>
  );
}

function PromptDisplay({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="jd-section">
      <div class="jd-section-header">
        <h3>Prompt</h3>
        <button class="btn btn--ghost btn--sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy Prompt"}
        </button>
      </div>
      <div class="jd-prompt-text">{prompt}</div>
    </div>
  );
}

function SummaryPanel({ summary }: { summary: string | null }) {
  if (!summary) return null;
  return (
    <div class="jd-section">
      <h3>Summary</h3>
      <div class="jd-summary-text">{summary}</div>
    </div>
  );
}

function TokenUsagePanel({ job }: { job: JobHistoryRecord }) {
  const cost = computeCost(job.model, job.input_tokens, job.output_tokens);
  const ctxPct = job.context_used_pct || 0;

  return (
    <div class="jd-section">
      <h3>Token Usage</h3>
      <div class="jd-token-rows">
        <div class="jd-token-row">
          <span class="jd-token-label">Input:</span>
          <span class="jd-token-value">{formatTokens(job.input_tokens)} tokens</span>
          <span class="jd-token-cost">(${cost.inputCost.toFixed(2)})</span>
        </div>
        <div class="jd-token-row">
          <span class="jd-token-label">Output:</span>
          <span class="jd-token-value">{formatTokens(job.output_tokens)} tokens</span>
          <span class="jd-token-cost">(${cost.outputCost.toFixed(2)})</span>
        </div>
        <div class="jd-token-row jd-token-row--total">
          <span class="jd-token-label">Total:</span>
          <span class="jd-token-value">{formatTokens(job.input_tokens + job.output_tokens)} tokens</span>
          <span class="jd-token-cost">(${cost.totalCost.toFixed(2)})</span>
        </div>
      </div>
      {job.context_window > 0 && (
        <div class="jd-context-section">
          <div class="jd-token-row">
            <span class="jd-token-label">Context Window:</span>
            <span class="jd-token-value">{formatTokens(job.context_window)}</span>
          </div>
          <div class="jd-context-label">Context Used:</div>
          <div class="jd-context-bar-wrap">
            <div class="context-bar-lg">
              <div class="context-bar-fill" style={{ width: `${Math.min(100, ctxPct)}%` }} />
            </div>
            <span class="context-pct-lg">{ctxPct.toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CostBreakdown({ job }: { job: JobHistoryRecord }) {
  const pricing = MODEL_PRICING[job.model] || MODEL_PRICING.opus;
  const cost = computeCost(job.model, job.input_tokens, job.output_tokens);

  return (
    <div class="jd-section">
      <h3>Cost Breakdown</h3>
      <div class="jd-token-rows">
        <div class="jd-token-row">
          <span class="jd-token-label">Input:</span>
          <span class="jd-token-value">${cost.inputCost.toFixed(2)}</span>
          <span class="jd-token-cost">({formatTokens(job.input_tokens)} * ${pricing.input}/1M)</span>
        </div>
        <div class="jd-token-row">
          <span class="jd-token-label">Output:</span>
          <span class="jd-token-value">${cost.outputCost.toFixed(2)}</span>
          <span class="jd-token-cost">({formatTokens(job.output_tokens)} * ${pricing.output}/1M)</span>
        </div>
        <div class="jd-token-row jd-token-row--total">
          <span class="jd-token-label">Total:</span>
          <span class="jd-token-value">${cost.totalCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function FilesModifiedList({ filesJson }: { filesJson: string | null }) {
  if (!filesJson) return null;

  let files: string[] = [];
  try { files = JSON.parse(filesJson); } catch { return null; }
  if (files.length === 0) return null;

  return (
    <div class="jd-section">
      <h3>Files Modified ({files.length})</h3>
      <ul class="files-list">
        {files.map((f) => (
          <li key={f}>
            <span class="jd-file-prefix">M</span> {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageStats({ job }: { job: JobHistoryRecord }) {
  return (
    <div class="jd-section">
      <h3>Messages</h3>
      <div class="jd-message-stats">
        <div class="jd-token-row">
          <span class="jd-token-label">Total:</span>
          <span class="jd-token-value">{job.message_count} messages</span>
        </div>
        <div class="jd-token-row">
          <span class="jd-token-label">User messages:</span>
          <span class="jd-token-value">{job.user_message_count}</span>
        </div>
      </div>
    </div>
  );
}

function SubagentsList({ subagents }: { subagents: SubagentRecord[] }) {
  return (
    <div class="jd-section">
      <h3>Subagents ({subagents.length})</h3>
      {subagents.length === 0 ? (
        <div class="jd-empty">No subagents spawned</div>
      ) : (
        <div class="subagent-list">
          {subagents.map((sa) => (
            <div class="subagent-item" key={sa.id}>
              <span class="subagent-id">{sa.subagent_id}</span>
              <span class="subagent-stat">{sa.tool_call_count} tools</span>
              <span class="subagent-stat">{sa.message_count} msgs</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallRow({
  tc,
  index,
  expanded,
  onToggle,
}: {
  tc: ToolCallRecord;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div class={`tool-call-item ${tc.is_error ? "tool-call-item--error" : ""}`}>
      <div class="tool-call-row" onClick={onToggle}>
        <span class="jd-tc-num">{index + 1}</span>
        <span class={`tool-call-icon ${tc.is_error ? "tool-call-icon--error" : ""}`}>
          {tc.name.slice(0, 2).toUpperCase()}
        </span>
        <span class="tool-call-name">{tc.name}</span>
        <span class="tool-call-preview">
          {tc.input_preview ? tc.input_preview.slice(0, 60) : ""}
        </span>
        {tc.is_error ? <span class="tool-call-error-badge">ERR</span> : null}
        {tc.timestamp && (
          <span class="tool-call-time">
            {new Date(tc.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
        <span class="tool-call-expand">{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>
      {expanded && (
        <div class="tool-call-detail">
          {tc.input_preview && (
            <div class="tool-call-block">
              <span class="tool-call-block-label">Input Preview:</span>
              <div class="tool-call-block-content">{tc.input_preview}</div>
            </div>
          )}
          {tc.output_preview && (
            <div class="tool-call-block">
              <span class="tool-call-block-label">Output Preview:</span>
              <div class="tool-call-block-content">{tc.output_preview}</div>
            </div>
          )}
          <div class="jd-tc-meta">
            Status: {tc.is_error ? "Error" : "Success"} | Error: {tc.is_error ? "Yes" : "No"}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolCallsTable({ toolCalls }: { toolCalls: ToolCallRecord[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "errors">("all");

  const filtered = filter === "errors" ? toolCalls.filter((tc) => tc.is_error) : toolCalls;

  return (
    <div class="jd-section">
      <div class="jd-section-header">
        <h3>Tool Calls ({toolCalls.length})</h3>
        <div class="jd-tc-filters">
          <button
            class={`btn btn--ghost btn--sm ${filter === "all" ? "jd-tc-filter-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            Show All
          </button>
          <button
            class={`btn btn--ghost btn--sm ${filter === "errors" ? "jd-tc-filter-active" : ""}`}
            onClick={() => setFilter("errors")}
          >
            Errors Only
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div class="jd-empty">
          {filter === "errors" ? "No errors found" : "No tool calls recorded"}
        </div>
      ) : (
        <div class="jd-tc-list">
          {filtered.map((tc, i) => (
            <ToolCallRow
              key={tc.id}
              tc={tc}
              index={i}
              expanded={expandedId === tc.id}
              onToggle={() => setExpandedId(expandedId === tc.id ? null : tc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JobHistoryDetail({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobHistoryRecord | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallRecord[]>([]);
  const [subagents, setSubagents] = useState<SubagentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/db/jobs/${jobId}`).then((r) => {
        if (!r.ok) throw new Error("Job not found");
        return r.json();
      }),
      fetch(`/api/db/jobs/${jobId}/tool-calls`).then((r) => r.json()),
      fetch(`/api/db/jobs/${jobId}/subagents`).then((r) => r.json()),
    ])
      .then(([jobData, tcData, saData]) => {
        setJob(jobData);
        setToolCalls(tcData.tool_calls || []);
        setSubagents(saData.subagents || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [jobId]);

  if (loading) {
    return (
      <div>
        <div class="db-breadcrumb">
          <a href="#/db">Database</a>
          <span class="db-breadcrumb-sep">&gt;</span>
          <a href="#/db/jobs">Job History</a>
          <span class="db-breadcrumb-sep">&gt;</span>
          <span>{jobId}</span>
        </div>
        <div class="jd-loading">Loading job details...</div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div>
        <div class="db-breadcrumb">
          <a href="#/db">Database</a>
          <span class="db-breadcrumb-sep">&gt;</span>
          <a href="#/db/jobs">Job History</a>
          <span class="db-breadcrumb-sep">&gt;</span>
          <span>{jobId}</span>
        </div>
        <div class="jd-error">{error || "Job not found"}</div>
      </div>
    );
  }

  return (
    <div class="jd-view">
      <div class="db-breadcrumb">
        <a href="#/db">Database</a>
        <span class="db-breadcrumb-sep">&gt;</span>
        <a href="#/db/jobs">Job History</a>
        <span class="db-breadcrumb-sep">&gt;</span>
        <span>{job.id}</span>
      </div>

      <JobDetailHeader job={job} />

      <div class="db-two-col">
        <div class="db-two-col-left">
          <PromptDisplay prompt={job.prompt || ""} />
          <SummaryPanel summary={job.summary} />
          <ToolCallsTable toolCalls={toolCalls} />
        </div>
        <div class="db-two-col-right">
          <TokenUsagePanel job={job} />
          <CostBreakdown job={job} />
          <FilesModifiedList filesJson={job.files_modified_json} />
          <MessageStats job={job} />
          <SubagentsList subagents={subagents} />
        </div>
      </div>
    </div>
  );
}
