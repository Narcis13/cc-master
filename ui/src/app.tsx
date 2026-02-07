import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useJobs } from "./hooks/useJobs";
import { Dashboard } from "./components/Dashboard";
import { JobDetail } from "./components/JobDetail";

export function App() {
  const { jobs, metrics, connected } = useJobs();
  const [route, setRoute] = useState(window.location.hash || "#/");

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const jobMatch = route.match(/^#\/jobs\/(.+)$/);

  return (
    <div class="shell">
      <header class="topbar">
        <a href="#/" class="topbar-title">CC-Agent Dashboard</a>
        <span class="topbar-version">v1.0</span>
        <span class={`connection-dot ${connected ? "connected" : "disconnected"}`} />
      </header>
      <main class="content">
        {jobMatch ? (
          <JobDetail jobId={jobMatch[1]} jobs={jobs} />
        ) : (
          <Dashboard jobs={jobs} metrics={metrics} />
        )}
      </main>
    </div>
  );
}
