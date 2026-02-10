import { h } from "preact";
import { useState } from "preact/hooks";
import type { SessionData, SessionMessage, ToolCall } from "../hooks/useSession";
import { ToolCallItem } from "./ToolCallItem";
import { formatTime } from "../lib/format";

type ConversationEntry =
  | { type: "message"; data: SessionMessage; index: number }
  | { type: "tool_call"; data: ToolCall; index: number };

function buildTimeline(session: SessionData): ConversationEntry[] {
  const entries: ConversationEntry[] = [];

  // Add messages
  session.messages.forEach((msg, i) => {
    entries.push({ type: "message", data: msg, index: i });
  });

  // Add tool calls
  session.tool_calls.forEach((tc, i) => {
    entries.push({ type: "tool_call", data: tc, index: i });
  });

  // Sort by timestamp (items without timestamps go to end)
  entries.sort((a, b) => {
    const tsA = a.type === "message" ? a.data.timestamp : a.data.timestamp;
    const tsB = b.type === "message" ? b.data.timestamp : b.data.timestamp;
    if (!tsA && !tsB) return 0;
    if (!tsA) return 1;
    if (!tsB) return -1;
    return new Date(tsA).getTime() - new Date(tsB).getTime();
  });

  return entries;
}

function MessageBubble({ msg }: { msg: SessionMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = msg.text.length > 500;
  const displayText = isLong && !expanded ? msg.text.slice(0, 500) + "..." : msg.text;

  return (
    <div class={`conv-message conv-message--${msg.role}`}>
      <div class="conv-message-header">
        <span class="conv-message-role">
          {msg.role === "assistant" ? "Assistant" : "User"}
        </span>
        {msg.timestamp && (
          <span class="conv-message-time">{formatTime(msg.timestamp)}</span>
        )}
      </div>
      <div class="conv-message-text">{displayText}</div>
      {isLong && (
        <button
          class="btn btn--ghost btn--sm conv-expand-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

export function ConversationView({ session }: { session: SessionData }) {
  const [showTools, setShowTools] = useState(true);
  const timeline = buildTimeline(session);

  const filteredTimeline = showTools
    ? timeline
    : timeline.filter((e) => e.type === "message");

  return (
    <div class="conversation-view">
      <div class="conv-controls">
        <label class="conv-toggle">
          <input
            type="checkbox"
            checked={showTools}
            onChange={(e) => setShowTools((e.target as HTMLInputElement).checked)}
          />
          <span>Show tool calls</span>
        </label>
        <span class="conv-count">
          {session.messages.length} messages, {session.tool_calls.length} tool calls
        </span>
      </div>

      <div class="conv-timeline">
        {filteredTimeline.map((entry, i) => {
          if (entry.type === "message") {
            return <MessageBubble key={`msg-${entry.index}`} msg={entry.data} />;
          }
          return (
            <div key={`tc-${entry.index}`} class="conv-tool-call">
              <ToolCallItem tc={entry.data} index={entry.index} />
            </div>
          );
        })}
      </div>

      {filteredTimeline.length === 0 && (
        <div class="empty-state">No conversation data available.</div>
      )}
    </div>
  );
}
