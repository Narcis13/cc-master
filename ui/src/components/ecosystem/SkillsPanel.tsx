import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { MarkdownViewer } from "./viewers/MarkdownViewer";
import { TextViewer } from "./viewers/TextViewer";

interface Entry { name: string; type: string; size: number; extension?: string; children_count?: number; }

export function SkillsPanel() {
  const [currentPath, setCurrentPath] = useState("skills");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<{ path: string; content: string; content_type: string } | null>(null);

  useEffect(() => {
    fetch(`/api/ecosystem/tree?path=${encodeURIComponent(currentPath)}`)
      .then((r) => r.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => {});
  }, [currentPath]);

  const openFile = (name: string) => {
    fetch(`/api/ecosystem/file?path=${encodeURIComponent(currentPath)}/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data) => setSelected(data))
      .catch(() => {});
  };

  return (
    <div class="eco-two-col">
      <div class="eco-tree-panel">
        {currentPath !== "skills" && (
          <div class="eco-tree-item eco-tree-dir" onClick={() => { setCurrentPath(currentPath.split("/").slice(0, -1).join("/") || "skills"); setSelected(null); }}>
            <span class="eco-tree-name">..</span>
          </div>
        )}
        {entries.map((e) => (
          <div key={e.name} class={`eco-tree-item ${e.type === "directory" ? "eco-tree-dir" : "eco-tree-file"}`} onClick={() => {
            if (e.type === "directory") { setCurrentPath(`${currentPath}/${e.name}`); setSelected(null); }
            else openFile(e.name);
          }}>
            <span class="eco-tree-name">{e.type === "directory" ? `${e.name}/` : e.name}</span>
          </div>
        ))}
        {entries.length === 0 && <div class="eco-tree-empty">No skills found</div>}
      </div>
      <div class="eco-viewer-panel">
        {selected ? (
          selected.content_type === "markdown" ? <MarkdownViewer content={selected.content} /> : <TextViewer content={selected.content} />
        ) : (
          <div class="db-placeholder">Select a skill to view</div>
        )}
      </div>
    </div>
  );
}
