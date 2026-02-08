import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useJobs } from "./hooks/useJobs";
import { Dashboard } from "./components/Dashboard";
import { JobDetail } from "./components/JobDetail";
import { NewJobForm } from "./components/NewJobForm";

export function App() {
  const { jobs, metrics, connected } = useJobs();
  const [route, setRoute] = useState(window.location.hash || "#/");
  const [showNewJob, setShowNewJob] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setShowNewJob(true);
      } else if (e.key === "/") {
        e.preventDefault();
        const searchInput = document.querySelector(".search-input") as HTMLInputElement;
        searchInput?.focus();
      } else if (e.key === "?") {
        e.preventDefault();
        setShowHelp((p) => !p);
      } else if (e.key === "Escape") {
        setShowHelp(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const jobMatch = route.match(/^#\/jobs\/(.+)$/);

  return (
    <div class="shell">
      <header class="topbar">
        <a href="#/" class="topbar-title">CC-Agent Dashboard</a>
        <span class="topbar-version">v1.0</span>
        <button class="btn btn--primary btn--sm topbar-new" onClick={() => setShowNewJob(true)}>
          + New Agent
        </button>
        <span class={`connection-dot ${connected ? "connected" : "disconnected"}`} />
      </header>
      <main class="content">
        {jobMatch ? (
          <JobDetail jobId={jobMatch[1]} jobs={jobs} />
        ) : (
          <Dashboard jobs={jobs} metrics={metrics} />
        )}
      </main>

      {showNewJob && <NewJobForm onClose={() => setShowNewJob(false)} />}

      {showHelp && (
        <div class="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div class="modal modal--sm" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>Keyboard Shortcuts</h2>
              <button class="modal-close" onClick={() => setShowHelp(false)}>✕</button>
            </div>
            <div class="modal-body">
              <div class="shortcut-list">
                <div class="shortcut-row"><kbd>N</kbd><span>New agent</span></div>
                <div class="shortcut-row"><kbd>/</kbd><span>Focus search</span></div>
                <div class="shortcut-row"><kbd>?</kbd><span>Toggle this help</span></div>
                <div class="shortcut-row"><kbd>Esc</kbd><span>Close dialog</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
