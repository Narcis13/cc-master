import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { TextViewer } from "./viewers/TextViewer";
import { MarkdownViewer } from "./viewers/MarkdownViewer";
import { JsonViewer } from "./viewers/JsonViewer";
import { JsonlViewer } from "./viewers/JsonlViewer";

interface TreeEntry {
  name: string;
  type: string;
  size: number;
  modified: string;
  extension?: string;
  children_count?: number;
}

interface FileData {
  path: string;
  content_type: string;
  content: string;
  size: number;
  modified: string;
  truncated: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function FileBrowser() {
  const [currentPath, setCurrentPath] = useState(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    return params.get("path") || "";
  });
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch directory listing
  useEffect(() => {
    fetch(`/api/ecosystem/tree?path=${encodeURIComponent(currentPath)}`)
      .then((r) => r.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => setEntries([]));
  }, [currentPath]);

  // Update hash when path changes
  useEffect(() => {
    const base = "#/ecosystem/browse";
    const hash = currentPath ? `${base}?path=${encodeURIComponent(currentPath)}` : base;
    if (window.location.hash !== hash) {
      history.replaceState(null, "", hash);
    }
  }, [currentPath]);

  const openFile = (filePath: string) => {
    setLoading(true);
    const linesParam = filePath.endsWith(".jsonl") ? "&lines=200" : "";
    fetch(`/api/ecosystem/file?path=${encodeURIComponent(filePath)}${linesParam}`)
      .then((r) => r.json())
      .then((data) => { setSelectedFile(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const navigateDir = (dirPath: string) => {
    setCurrentPath(dirPath);
    setSelectedFile(null);
  };

  // Breadcrumbs
  const parts = currentPath ? currentPath.split("/") : [];
  const breadcrumbs = [{ label: "~/.claude", path: "" }];
  parts.forEach((p, i) => {
    breadcrumbs.push({ label: p, path: parts.slice(0, i + 1).join("/") });
  });

  return (
    <div class="eco-browser">
      <div class="eco-breadcrumb">
        {breadcrumbs.map((b, i) => (
          <span key={i}>
            {i > 0 && <span class="eco-breadcrumb-sep">/</span>}
            <a class="eco-breadcrumb-link" onClick={() => navigateDir(b.path)}>{b.label}</a>
          </span>
        ))}
      </div>
      <div class="eco-two-col">
        <div class="eco-tree-panel">
          {entries.map((e) => (
            <div
              key={e.name}
              class={`eco-tree-item ${e.type === "directory" ? "eco-tree-dir" : "eco-tree-file"}`}
              onClick={() => {
                const fullPath = currentPath ? `${currentPath}/${e.name}` : e.name;
                e.type === "directory" ? navigateDir(fullPath) : openFile(fullPath);
              }}
            >
              <span class="eco-tree-icon">{e.type === "directory" ? "\u{1F4C1}" : "\u{1F4C4}"}</span>
              <span class="eco-tree-name">{e.name}</span>
              <span class="eco-tree-meta">
                {e.type === "directory" ? `${e.children_count} items` : formatBytes(e.size)}
              </span>
            </div>
          ))}
          {entries.length === 0 && <div class="eco-tree-empty">Empty directory</div>}
        </div>
        <div class="eco-viewer-panel">
          {loading ? (
            <div class="db-placeholder">Loading...</div>
          ) : selectedFile ? (
            <div>
              <div class="eco-viewer-header">
                <span class="eco-viewer-filename">{selectedFile.path}</span>
                <span class="eco-viewer-size">{formatBytes(selectedFile.size)}</span>
              </div>
              {selectedFile.content_type === "markdown" ? (
                <MarkdownViewer content={selectedFile.content} />
              ) : selectedFile.content_type === "json" ? (
                <JsonViewer content={selectedFile.content} />
              ) : selectedFile.content_type === "jsonl" ? (
                <JsonlViewer content={selectedFile.content} />
              ) : (
                <TextViewer content={selectedFile.content} />
              )}
              {selectedFile.truncated && <div class="eco-viewer-truncated">File truncated</div>}
            </div>
          ) : (
            <div class="db-placeholder">Select a file to view</div>
          )}
        </div>
      </div>
    </div>
  );
}
