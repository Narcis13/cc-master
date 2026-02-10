import { h } from "preact";
import type { SessionData } from "../hooks/useSession";
import { CostBadge } from "./CostBadge";
import { ToolCallList } from "./ToolCallList";
import { formatTokens, formatDuration } from "../lib/format";

export function SessionOverview({
  session,
  estimatedCost,
}: {
  session: SessionData;
  estimatedCost: number | null;
}) {
  return (
    <div class="session-overview">
      {/* Token + Cost summary row */}
      <div class="session-stats-row">
        {session.tokens && (
          <div class="detail-section session-tokens-card">
            <h3>Token Usage</h3>
            <div class="token-detail">
              <div class="token-row">
                <span class="token-label">Input</span>
                <span class="token-in">{formatTokens(session.tokens.input)}</span>
              </div>
              <div class="token-row">
                <span class="token-label">Output</span>
                <span class="token-out">{formatTokens(session.tokens.output)}</span>
              </div>
              <div class="token-row">
                <span class="token-label">Total</span>
                <span>{formatTokens(session.tokens.input + session.tokens.output)}</span>
              </div>
              <div class="context-bar-lg">
                <div
                  class="context-bar-fill"
                  style={{ width: `${Math.min(session.tokens.context_used_pct, 100)}%` }}
                />
              </div>
              <span class="context-pct-lg">
                {session.tokens.context_used_pct.toFixed(1)}% of{" "}
                {formatTokens(session.tokens.context_window)} context
              </span>
            </div>
            {estimatedCost !== null && (
              <div class="session-cost-row">
                <span class="token-label">Cost</span>
                <CostBadge cost={estimatedCost} />
              </div>
            )}
          </div>
        )}

        <div class="detail-section session-meta-card">
          <h3>Session Info</h3>
          <div class="detail-info-grid">
            {session.model && (
              <>
                <span class="info-label">Model</span>
                <span>{session.model}</span>
              </>
            )}
            {session.duration_ms !== null && (
              <>
                <span class="info-label">Duration</span>
                <span>{formatDuration(session.duration_ms)}</span>
              </>
            )}
            <span class="info-label">Messages</span>
            <span>{session.messages.length}</span>
            <span class="info-label">Tool Calls</span>
            <span>
              {session.tool_stats.total_calls}
              {session.tool_stats.failed_calls > 0 && (
                <span class="session-failed-count">
                  {" "}({session.tool_stats.failed_calls} failed)
                </span>
              )}
            </span>
            {session.subagents.length > 0 && (
              <>
                <span class="info-label">Subagents</span>
                <span>{session.subagents.length}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Files modified */}
      {session.files_modified && session.files_modified.length > 0 && (
        <div class="detail-section">
          <h3>Files Modified ({session.files_modified.length})</h3>
          <ul class="files-list">
            {session.files_modified.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Subagents */}
      {session.subagents.length > 0 && (
        <div class="detail-section">
          <h3>Subagents ({session.subagents.length})</h3>
          <div class="subagent-list">
            {session.subagents.map((sa) => (
              <div key={sa.id} class="subagent-item">
                <code class="subagent-id">{sa.id}</code>
                <span class="subagent-stat">{sa.tool_calls} tool calls</span>
                <span class="subagent-stat">{sa.messages} messages</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {session.summary && (
        <div class="detail-section">
          <h3>Summary</h3>
          <p class="summary-text">{session.summary}</p>
        </div>
      )}

      {/* Tool Calls */}
      {session.tool_calls.length > 0 && (
        <div class="detail-section">
          <h3>Tool Calls</h3>
          <ToolCallList
            toolCalls={session.tool_calls}
            toolStats={session.tool_stats}
          />
        </div>
      )}
    </div>
  );
}
