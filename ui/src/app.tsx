import { h } from "preact";
import { useJobs } from "./hooks/useJobs";
import { Dashboard } from "./components/Dashboard";

export function App() {
  const { jobs, metrics, connected } = useJobs();

  return (
    <div class="shell">
      <header class="topbar">
        <h1 class="topbar-title">CC-Agent Dashboard</h1>
        <span class="topbar-version">v1.0</span>
        <span class={`connection-dot ${connected ? "connected" : "disconnected"}`} />
      </header>
      <main class="content">
        <Dashboard jobs={jobs} metrics={metrics} />
      </main>
    </div>
  );
}
