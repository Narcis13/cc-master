import { h } from "preact";
import { useState } from "preact/hooks";
import type { ToolCall } from "../hooks/useSession";
import { formatTime } from "../lib/format";

const TOOL_ICONS: Record<string, string> = {
  Read: "R",
  Write: "W",
  Edit: "E",
  Bash: "$",
  Glob: "G",
  Grep: "?",
  Task: "T",
  WebFetch: "F",
  WebSearch: "S",
};

function truncateInput(input: unknown, maxLen: number = 120): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") {
    return input.length > maxLen ? input.slice(0, maxLen) + "..." : input;
  }
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    // Show the most relevant field for common tools
    if (typeof obj.file_path === "string") return obj.file_path;
    if (typeof obj.command === "string") {
      const cmd = obj.command as string;
      return cmd.length > maxLen ? cmd.slice(0, maxLen) + "..." : cmd;
    }
    if (typeof obj.pattern === "string") return `pattern: ${obj.pattern}`;
    if (typeof obj.content === "string") {
      return obj.content.length > 60 ? obj.content.slice(0, 60) + "..." : obj.content;
    }
    const json = JSON.stringify(obj);
    return json.length > maxLen ? json.slice(0, maxLen) + "..." : json;
  }
  return String(input);
}

function formatOutput(output: unknown, maxLen: number = 200): string {
  if (output === null || output === undefined) return "";
  if (typeof output === "string") {
    return output.length > maxLen ? output.slice(0, maxLen) + "..." : output;
  }
  if (Array.isArray(output)) {
    // tool_result content blocks
    const texts = output
      .filter((b: any) => b && typeof b.text === "string")
      .map((b: any) => b.text as string);
    const joined = texts.join("\n");
    return joined.length > maxLen ? joined.slice(0, maxLen) + "..." : joined;
  }
  const json = JSON.stringify(output);
  return json.length > maxLen ? json.slice(0, maxLen) + "..." : json;
}

export function ToolCallItem({ tc, index, id }: { tc: ToolCall; index: number; id?: string }) {
  const [expanded, setExpanded] = useState(false);

  const icon = TOOL_ICONS[tc.name] || tc.name.charAt(0).toUpperCase();
  const inputPreview = truncateInput(tc.input);

  return (
    <div id={id} class={`tool-call-item ${tc.is_error ? "tool-call-item--error" : ""}`}>
      <div class="tool-call-row" onClick={() => setExpanded(!expanded)}>
        <span class={`tool-call-icon ${tc.is_error ? "tool-call-icon--error" : ""}`}>
          {icon}
        </span>
        <span class="tool-call-name">{tc.name}</span>
        <span class="tool-call-preview">{inputPreview}</span>
        {tc.is_error && <span class="tool-call-error-badge">err</span>}
        {tc.timestamp && (
          <span class="tool-call-time">{formatTime(tc.timestamp)}</span>
        )}
        <span class="tool-call-expand">{expanded ? "\u25B4" : "\u25BE"}</span>
      </div>
      {expanded && (
        <div class="tool-call-detail">
          {tc.input !== null && tc.input !== undefined && (
            <div class="tool-call-block">
              <div class="tool-call-block-label">Input</div>
              <pre class="tool-call-block-content">
                {typeof tc.input === "string"
                  ? tc.input
                  : JSON.stringify(tc.input, null, 2)}
              </pre>
            </div>
          )}
          {tc.output !== null && tc.output !== undefined && (
            <div class="tool-call-block">
              <div class="tool-call-block-label">
                Output {tc.is_error && <span class="tool-call-error-badge">error</span>}
              </div>
              <pre class="tool-call-block-content">
                {formatOutput(tc.output, 2000)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
