import { h } from "preact";
import { useState } from "preact/hooks";

function JsonNode({ name, value, depth }: { name?: string; value: any; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const type = Array.isArray(value) ? "array" : typeof value;

  if (value === null) {
    return (
      <div class="eco-json-row" style={{ paddingLeft: `${depth * 16}px` }}>
        {name != null && <span class="eco-json-key">{name}: </span>}
        <span class="eco-json-null">null</span>
      </div>
    );
  }

  if (type === "object" || type === "array") {
    const entries = type === "array"
      ? value.map((v: any, i: number) => [String(i), v] as [string, any])
      : Object.entries(value);
    const bracket = type === "array" ? ["[", "]"] : ["{", "}"];
    return (
      <div>
        <div class="eco-json-row eco-json-toggle" style={{ paddingLeft: `${depth * 16}px` }} onClick={() => setOpen(!open)}>
          <span class="eco-json-arrow">{open ? "▾" : "▸"}</span>
          {name != null && <span class="eco-json-key">{name}: </span>}
          <span class="eco-json-bracket">{bracket[0]}</span>
          {!open && <span class="eco-json-collapsed"> {entries.length} items {bracket[1]}</span>}
        </div>
        {open && entries.map(([k, v]) => <JsonNode key={k} name={k} value={v} depth={depth + 1} />)}
        {open && <div class="eco-json-row" style={{ paddingLeft: `${depth * 16}px` }}><span class="eco-json-bracket">{bracket[1]}</span></div>}
      </div>
    );
  }

  const colorClass = type === "string" ? "eco-json-string" : type === "number" ? "eco-json-number" : type === "boolean" ? "eco-json-bool" : "";
  const display = type === "string" ? `"${value}"` : String(value);

  return (
    <div class="eco-json-row" style={{ paddingLeft: `${depth * 16}px` }}>
      {name != null && <span class="eco-json-key">{name}: </span>}
      <span class={colorClass}>{display}</span>
    </div>
  );
}

export function JsonViewer({ content }: { content: string }) {
  const [raw, setRaw] = useState(false);
  try {
    const parsed = JSON.parse(content);
    return (
      <div class="eco-json-viewer">
        <div class="eco-json-toolbar">
          <button class={`eco-json-btn ${!raw ? "active" : ""}`} onClick={() => setRaw(false)}>Tree</button>
          <button class={`eco-json-btn ${raw ? "active" : ""}`} onClick={() => setRaw(true)}>Raw</button>
        </div>
        {raw ? <pre class="eco-text-pre"><code>{JSON.stringify(parsed, null, 2)}</code></pre> : <JsonNode value={parsed} depth={0} />}
      </div>
    );
  } catch {
    return <pre class="eco-text-pre"><code>{content}</code></pre>;
  }
}
