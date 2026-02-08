/** @jsxRuntime classic */
import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import type { JobEntry } from "../hooks/useJobs";

interface PaletteAction {
  id: string;
  label: string;
  category: string;
  onSelect: () => void;
}

export function CommandPalette({
  jobs,
  onClose,
  onNewAgent,
}: {
  jobs: JobEntry[];
  onClose: () => void;
  onNewAgent: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build action list
  const actions: PaletteAction[] = [
    { id: "nav-jobs", label: "Go to Jobs", category: "Navigation", onSelect: () => { window.location.hash = "#/"; onClose(); } },
    { id: "nav-timeline", label: "Go to Timeline", category: "Navigation", onSelect: () => { window.location.hash = "#/timeline"; onClose(); } },
    { id: "nav-alerts", label: "Go to Alerts", category: "Navigation", onSelect: () => { window.location.hash = "#/notifications"; onClose(); } },
    { id: "nav-analytics", label: "Go to Analytics", category: "Navigation", onSelect: () => { window.location.hash = "#/analytics"; onClose(); } },
    { id: "nav-split", label: "Go to Split View", category: "Navigation", onSelect: () => { window.location.hash = "#/split"; onClose(); } },
    { id: "nav-pipeline", label: "Go to Pipeline", category: "Navigation", onSelect: () => { window.location.hash = "#/pipeline"; onClose(); } },
    { id: "action-new", label: "New Agent", category: "Actions", onSelect: () => { onClose(); onNewAgent(); } },
    ...jobs.map((j) => ({
      id: `job-${j.id}`,
      label: `${j.id.slice(0, 8)} — ${j.prompt.slice(0, 50)}`,
      category: j.status === "running" ? "Running" : "Jobs",
      onSelect: () => { window.location.hash = `#/jobs/${j.id}`; onClose(); },
    })),
    ...jobs
      .filter((j) => j.status === "running")
      .map((j) => ({
        id: `kill-${j.id}`,
        label: `Kill ${j.id.slice(0, 8)}`,
        category: "Actions",
        onSelect: () => {
          if (confirm(`Kill agent ${j.id.slice(0, 8)}?`)) {
            fetch(`/api/actions/jobs/${j.id}/kill`, { method: "POST" });
          }
          onClose();
        },
      })),
  ];

  // Fuzzy filter
  const q = query.toLowerCase();
  const filtered = q
    ? actions.filter((a) => a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
    : actions;

  // Clamp selected index
  const clamped = Math.min(selectedIdx, filtered.length - 1);
  if (clamped !== selectedIdx) setSelectedIdx(Math.max(0, clamped));

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      filtered[Math.min(selectedIdx, filtered.length - 1)]?.onSelect();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="command-palette" onClick={(e) => e.stopPropagation()}>
        <div class="palette-input-wrap">
          <input
            ref={inputRef}
            class="palette-input"
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setSelectedIdx(0); }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div class="palette-results">
          {filtered.length === 0 ? (
            <div class="palette-empty">No results</div>
          ) : (
            filtered.slice(0, 12).map((action, idx) => (
              <button
                key={action.id}
                class={`palette-item ${idx === selectedIdx ? "selected" : ""}`}
                onClick={action.onSelect}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <span class="palette-category">{action.category}</span>
                <span class="palette-label">{action.label}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
