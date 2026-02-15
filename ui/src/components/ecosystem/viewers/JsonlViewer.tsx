import { h } from "preact";
import { useState } from "preact/hooks";

const PAGE_SIZE = 50;

function JsonlLine({ line, index }: { line: string; index: number }) {
  const [expanded, setExpanded] = useState(false);
  let parsed: any;
  try { parsed = JSON.parse(line); } catch { parsed = null; }

  return (
    <div class="eco-jsonl-line">
      <div class="eco-jsonl-header" onClick={() => setExpanded(!expanded)}>
        <span class="eco-jsonl-num">{index + 1}</span>
        <span class="eco-jsonl-arrow">{expanded ? "▾" : "▸"}</span>
        <span class="eco-jsonl-preview">{line.length > 120 ? line.slice(0, 120) + "..." : line}</span>
      </div>
      {expanded && parsed && (
        <pre class="eco-jsonl-expanded">{JSON.stringify(parsed, null, 2)}</pre>
      )}
    </div>
  );
}

export function JsonlViewer({ content }: { content: string }) {
  const allLines = content.split("\n").filter((l) => l.trim());
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? allLines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : allLines;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageLines = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div class="eco-jsonl-viewer">
      <div class="eco-jsonl-toolbar">
        <input
          class="eco-jsonl-filter"
          type="text"
          placeholder="Filter lines..."
          value={filter}
          onInput={(e) => { setFilter((e.target as HTMLInputElement).value); setPage(0); }}
        />
        <span class="eco-jsonl-count">{filtered.length} lines</span>
      </div>
      {pageLines.map((line, i) => (
        <JsonlLine key={page * PAGE_SIZE + i} line={line} index={page * PAGE_SIZE + i} />
      ))}
      {totalPages > 1 && (
        <div class="eco-jsonl-pagination">
          <button class="eco-jsonl-page-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
          <span>{page + 1} / {totalPages}</span>
          <button class="eco-jsonl-page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
