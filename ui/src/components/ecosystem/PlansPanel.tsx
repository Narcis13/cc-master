import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { MarkdownViewer } from "./viewers/MarkdownViewer";
import { TextViewer } from "./viewers/TextViewer";

interface Entry { name: string; type: string; size: number; extension?: string; }

export function PlansPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<{ path: string; content: string; content_type: string } | null>(null);

  useEffect(() => {
    fetch("/api/ecosystem/tree?path=plans")
      .then((r) => r.json())
      .then((data) => setEntries((data.entries || []).filter((e: Entry) => e.type === "file")))
      .catch(() => {});
  }, []);

  const openFile = (name: string) => {
    fetch(`/api/ecosystem/file?path=plans/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data) => setSelected(data))
      .catch(() => {});
  };

  return (
    <div class="eco-two-col">
      <div class="eco-tree-panel">
        {entries.map((e) => (
          <div key={e.name} class="eco-tree-item eco-tree-file" onClick={() => openFile(e.name)}>
            <span class="eco-tree-name">{e.name}</span>
          </div>
        ))}
        {entries.length === 0 && <div class="eco-tree-empty">No plans found</div>}
      </div>
      <div class="eco-viewer-panel">
        {selected ? (
          selected.content_type === "markdown" ? <MarkdownViewer content={selected.content} /> : <TextViewer content={selected.content} />
        ) : (
          <div class="db-placeholder">Select a plan to view</div>
        )}
      </div>
    </div>
  );
}
