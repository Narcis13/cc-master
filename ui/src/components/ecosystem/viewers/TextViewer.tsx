import { h } from "preact";

export function TextViewer({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div class="eco-text-viewer">
      <pre class="eco-text-pre">
        <span class="eco-text-lines">{lines.map((_, i) => `${i + 1}\n`).join("")}</span>
        <code>{content}</code>
      </pre>
    </div>
  );
}
