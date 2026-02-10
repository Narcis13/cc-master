import { h } from "preact";
import { useState } from "preact/hooks";
import type { ToolCall, ToolStats } from "../hooks/useSession";
import { ToolCallItem } from "./ToolCallItem";

export function ToolCallList({
  toolCalls,
  toolStats,
}: {
  toolCalls: ToolCall[];
  toolStats: ToolStats;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [showCount, setShowCount] = useState(50);

  // Get unique tool names for filter
  const toolNames = Object.keys(toolStats.by_tool).sort(
    (a, b) => (toolStats.by_tool[b] || 0) - (toolStats.by_tool[a] || 0)
  );

  const filtered =
    filter === "all"
      ? toolCalls
      : filter === "errors"
        ? toolCalls.filter((tc) => tc.is_error)
        : toolCalls.filter((tc) => tc.name === filter);

  const visible = filtered.slice(0, showCount);
  const hasMore = filtered.length > showCount;

  return (
    <div class="tool-call-list">
      <div class="tool-call-stats">
        <span class="tool-stat">
          <span class="tool-stat-value">{toolStats.total_calls}</span> calls
        </span>
        {toolStats.failed_calls > 0 && (
          <span class="tool-stat tool-stat--error">
            <span class="tool-stat-value">{toolStats.failed_calls}</span> failed
          </span>
        )}
        <span class="tool-stat">
          <span class="tool-stat-value">{toolStats.unique_files_read}</span> files read
        </span>
      </div>

      <div class="tool-call-bar-chart">
        {toolNames.slice(0, 8).map((name) => {
          const count = toolStats.by_tool[name] || 0;
          const pct = toolStats.total_calls > 0
            ? (count / toolStats.total_calls) * 100
            : 0;
          return (
            <div
              key={name}
              class={`tool-bar-row ${filter === name ? "active" : ""}`}
              onClick={() => setFilter(filter === name ? "all" : name)}
            >
              <span class="tool-bar-name">{name}</span>
              <div class="tool-bar-track">
                <div class="tool-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <span class="tool-bar-count">{count}</span>
            </div>
          );
        })}
      </div>

      <div class="tool-call-filters">
        <button
          class={`timeline-filter-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All ({toolCalls.length})
        </button>
        {toolStats.failed_calls > 0 && (
          <button
            class={`timeline-filter-btn ${filter === "errors" ? "active" : ""}`}
            onClick={() => setFilter("errors")}
          >
            Errors ({toolStats.failed_calls})
          </button>
        )}
      </div>

      <div class="tool-call-items">
        {visible.map((tc, i) => (
          <ToolCallItem key={i} tc={tc} index={i} />
        ))}
      </div>

      {hasMore && (
        <button
          class="btn btn--ghost btn--sm tool-call-load-more"
          onClick={() => setShowCount((c) => c + 50)}
        >
          Show more ({filtered.length - showCount} remaining)
        </button>
      )}

      {filtered.length === 0 && (
        <div class="tool-call-empty">No tool calls match this filter.</div>
      )}
    </div>
  );
}
