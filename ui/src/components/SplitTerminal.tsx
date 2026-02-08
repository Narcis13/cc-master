/** @jsxRuntime classic */
import { h } from "preact";
import { useState } from "preact/hooks";
import type { JobEntry } from "../hooks/useJobs";
import { TerminalPanel } from "./TerminalPanel";

type Layout = "1x1" | "2x1" | "2x2";

export function SplitTerminal({ jobs }: { jobs: JobEntry[] }) {
  const runningJobs = jobs.filter((j) => j.status === "running");
  const allJobs = jobs.filter((j) => j.status === "running" || j.status === "completed" || j.status === "failed");
  const [layout, setLayout] = useState<Layout>("2x1");
  const [selected, setSelected] = useState<string[]>([]);

  // Auto-select running jobs up to layout capacity
  const capacity = layout === "1x1" ? 1 : layout === "2x1" ? 2 : 4;
  const activeIds = selected.length > 0 ? selected.slice(0, capacity) : runningJobs.slice(0, capacity).map((j) => j.id);

  const toggleJob = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= capacity) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  return (
    <div class="split-terminal">
      <div class="split-header">
        <h3>Split View: {activeIds.length} agent{activeIds.length !== 1 ? "s" : ""}</h3>
        <div class="split-controls">
          <div class="timeline-filters">
            {(["1x1", "2x1", "2x2"] as Layout[]).map((l) => (
              <button
                key={l}
                class={`timeline-filter-btn ${layout === l ? "active" : ""}`}
                onClick={() => setLayout(l)}
              >
                {l}
              </button>
            ))}
          </div>
          <a href="#/" class="back-link">&larr; Back</a>
        </div>
      </div>

      {allJobs.length > 0 && (
        <div class="split-job-picker">
          {allJobs.map((j) => (
            <button
              key={j.id}
              class={`split-job-chip ${activeIds.includes(j.id) ? "active" : ""} ${j.status === "running" ? "running" : ""}`}
              onClick={() => toggleJob(j.id)}
            >
              <span class={`status-dot status-dot--${j.status}`} />
              <span>{j.id.slice(0, 8)}</span>
            </button>
          ))}
        </div>
      )}

      {activeIds.length === 0 ? (
        <div class="empty-state">No running agents. Start agents to use split view.</div>
      ) : (
        <div class={`split-grid split-grid--${layout}`}>
          {activeIds.map((id) => {
            const job = jobs.find((j) => j.id === id);
            return (
              <div key={id} class="split-pane">
                <div class="split-pane-header">
                  <span class={`status-dot status-dot--${job?.status || "pending"}`} />
                  <code>{id.slice(0, 8)}</code>
                  <span class="split-pane-prompt">{job?.prompt.slice(0, 40)}</span>
                  <a href={`#/jobs/${id}`} class="split-pane-link">Open</a>
                </div>
                <TerminalPanel jobId={id} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
