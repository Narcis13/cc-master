import { h, Fragment } from "preact";
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

/** Simple markdown → Preact VNodes renderer (no deps). */
function MarkdownText({ text }: { text: string }) {
  // Split by fenced code blocks first
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const parts: Array<{ type: "text" | "code"; lang?: string; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", lang: match[1] || undefined, content: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "code") {
          return (
            <pre key={i} class="md-code-block">
              {part.lang && <span class="md-code-lang">{part.lang}</span>}
              <code>{part.content}</code>
            </pre>
          );
        }
        return <InlineMarkdown key={i} text={part.content} />;
      })}
    </>
  );
}

/** Render inline markdown: headers, lists, bold, italic, inline code. */
function InlineMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: preact.VNode[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul class="md-list" key={elements.length}>
          {listItems.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ul>
      );
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      flushList();
      const level = headerMatch[1].length;
      const Tag = `h${level + 2}` as "h3" | "h4" | "h5"; // offset so h1→h3 in context
      elements.push(<Tag key={elements.length} class="md-heading">{renderInline(headerMatch[2])}</Tag>);
      continue;
    }

    // List items
    const listMatch = line.match(/^\s*[-*]\s+(.+)/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }

    flushList();

    // Empty lines → spacing
    if (!line.trim()) {
      continue;
    }

    // Regular paragraph text
    elements.push(<span key={elements.length} class="md-line">{renderInline(line)}{"\n"}</span>);
  }

  flushList();
  return <>{elements}</>;
}

/** Render inline formatting: **bold**, *italic*, `code` */
function renderInline(text: string): preact.VNode {
  const parts: Array<string | preact.VNode> = [];
  // Match: `code`, **bold**, *italic*
  const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = inlineRegex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const token = m[0];
    if (token.startsWith("`")) {
      parts.push(<code class="md-inline-code" key={parts.length}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      parts.push(<strong key={parts.length}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      parts.push(<em key={parts.length}>{token.slice(1, -1)}</em>);
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));

  return <>{parts}</>;
}

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div class="conv-thinking">
      <button
        class="conv-thinking-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span class="conv-thinking-icon">{expanded ? "\u25B4" : "\u25BE"}</span>
        <span class="conv-thinking-label">Thinking</span>
      </button>
      {expanded && (
        <pre class="conv-thinking-text">{text}</pre>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: SessionMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = msg.text.length > 500;
  const displayText = isLong && !expanded ? msg.text.slice(0, 500) + "..." : msg.text;
  const isAssistant = msg.role === "assistant";

  return (
    <div class={`conv-message conv-message--${msg.role}`}>
      <div class="conv-message-header">
        <span class="conv-message-role">
          {isAssistant ? "Assistant" : "User"}
        </span>
        {msg.timestamp && (
          <span class="conv-message-time">{formatTime(msg.timestamp)}</span>
        )}
      </div>
      {msg.thinking && <ThinkingBlock text={msg.thinking} />}
      <div class="conv-message-text">
        {isAssistant ? <MarkdownText text={displayText} /> : displayText}
      </div>
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
