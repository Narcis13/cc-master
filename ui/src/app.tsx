import { h, Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useJobs } from "./hooks/useJobs";
import { Dashboard } from "./components/Dashboard";
import { JobDetail } from "./components/JobDetail";
import { NewJobForm } from "./components/NewJobForm";
import { Timeline } from "./components/Timeline";
import { NotificationCenter } from "./components/NotificationCenter";
import { MetricsChart } from "./components/MetricsChart";
import { SplitTerminal } from "./components/SplitTerminal";
import { CommandPalette } from "./components/CommandPalette";
import { PipelineView } from "./components/PipelineView";
import { EventsTimeline } from "./components/db/EventsTimeline";
import { DbOverview } from "./components/db/DbOverview";
import { JobHistoryBrowser } from "./components/db/JobHistoryBrowser";
import { JobHistoryDetail } from "./components/db/JobHistoryDetail";
import { ToolUsageExplorer } from "./components/db/ToolUsageExplorer";
import { AnalyticsDashboard } from "./components/db/AnalyticsDashboard";

// Database sub-navigation tab bar
function DbSubNav({ route }: { route: string }) {
  const tabs = [
    { hash: "#/db", label: "Overview" },
    { hash: "#/db/jobs", label: "Job History" },
    { hash: "#/db/analytics", label: "Analytics" },
    { hash: "#/db/tools", label: "Tool Usage" },
    { hash: "#/db/events", label: "Events" },
  ];

  return (
    <nav class="db-sub-nav">
      {tabs.map((tab) => {
        const isActive =
          tab.hash === "#/db"
            ? route === "#/db" || route === "#/db/"
            : route.startsWith(tab.hash);
        return (
          <a
            key={tab.hash}
            href={tab.hash}
            class={`db-sub-nav-link ${isActive ? "active" : ""}`}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}

// Database layout wrapper
function DbLayout({ route }: { route: string }) {
  const dbJobMatch = route.match(/^#\/db\/jobs\/(.+)$/);

  let content;
  if (dbJobMatch) {
    content = <JobHistoryDetail jobId={dbJobMatch[1]} />;
  } else if (route.startsWith("#/db/jobs")) {
    content = <JobHistoryBrowser />;
  } else if (route.startsWith("#/db/analytics")) {
    content = <AnalyticsDashboard />;
  } else if (route.startsWith("#/db/tools")) {
    content = <ToolUsageExplorer />;
  } else if (route.startsWith("#/db/events")) {
    content = <EventsTimeline />;
  } else {
    content = <DbOverview />;
  }

  return (
    <div class="db-layout">
      <DbSubNav route={route} />
      <div class="db-content">{content}</div>
    </div>
  );
}

export function App() {
  const {
    jobs,
    metrics,
    connected,
    hookEvents,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllRead,
    dismissNotification,
  } = useJobs();
  const [route, setRoute] = useState(window.location.hash || "#/");
  const [showNewJob, setShowNewJob] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs (except Escape and Cmd+K)
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // Command palette: Ctrl+K / Cmd+K always works
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((p) => !p);
        return;
      }

      if (isInput) return;

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
        setShowPalette(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const jobMatch = route.match(/^#\/jobs\/(.+)$/);
  const isTimeline = route === "#/timeline";
  const isNotifications = route === "#/notifications";
  const isAnalytics = route === "#/analytics";
  const isSplit = route === "#/split";
  const isPipeline = route === "#/pipeline";
  const isDatabase = route.startsWith("#/db");
  const isHome = !jobMatch && !isTimeline && !isNotifications && !isAnalytics && !isSplit && !isPipeline && !isDatabase;

  return (
    <div class="shell">
      <header class="topbar">
        <a href="#/" class="topbar-title">CC-Agent Dashboard</a>
        <span class="topbar-version">v1.0</span>
        <nav class="topbar-nav">
          <a href="#/" class={`topbar-nav-link ${isHome ? "active" : ""}`}>
            Jobs
          </a>
          <a href="#/timeline" class={`topbar-nav-link ${isTimeline ? "active" : ""}`}>
            Timeline
          </a>
          <a href="#/notifications" class={`topbar-nav-link ${isNotifications ? "active" : ""}`}>
            Alerts
            {unreadCount > 0 && <span class="notification-badge">{unreadCount}</span>}
          </a>
          <a href="#/analytics" class={`topbar-nav-link ${isAnalytics ? "active" : ""}`}>
            Analytics
          </a>
          <a href="#/split" class={`topbar-nav-link ${isSplit ? "active" : ""}`}>
            Split
          </a>
          <a href="#/pipeline" class={`topbar-nav-link ${isPipeline ? "active" : ""}`}>
            Pipeline
          </a>
          <a href="#/db" class={`topbar-nav-link ${isDatabase ? "active" : ""}`}>
            Database
          </a>
        </nav>
        <button class="btn btn--ghost btn--sm topbar-palette" onClick={() => setShowPalette(true)} title="Command Palette (Ctrl+K)">
          <kbd class="palette-kbd">Ctrl+K</kbd>
        </button>
        <button class="btn btn--primary btn--sm topbar-new" onClick={() => setShowNewJob(true)}>
          + New Agent
        </button>
        <span class={`connection-dot ${connected ? "connected" : "disconnected"}`} />
      </header>
      <main class="content">
        {isDatabase ? (
          <DbLayout route={route} />
        ) : isAnalytics ? (
          <MetricsChart />
        ) : isSplit ? (
          <SplitTerminal jobs={jobs} />
        ) : isPipeline ? (
          <PipelineView jobs={jobs} />
        ) : isTimeline ? (
          <Timeline events={hookEvents} />
        ) : isNotifications ? (
          <NotificationCenter
            notifications={notifications}
            onMarkAllRead={markAllRead}
            onDismiss={dismissNotification}
            onMarkRead={markNotificationRead}
          />
        ) : jobMatch ? (
          <JobDetail jobId={jobMatch[1]} jobs={jobs} hookEvents={hookEvents} />
        ) : (
          <Dashboard jobs={jobs} metrics={metrics} hookEvents={hookEvents} />
        )}
      </main>

      {showNewJob && <NewJobForm onClose={() => setShowNewJob(false)} />}
      {showPalette && (
        <CommandPalette
          jobs={jobs}
          onClose={() => setShowPalette(false)}
          onNewAgent={() => setShowNewJob(true)}
        />
      )}

      {showHelp && (
        <div class="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div class="modal modal--sm" onClick={(e) => e.stopPropagation()}>
            <div class="modal-header">
              <h2>Keyboard Shortcuts</h2>
              <button class="modal-close" onClick={() => setShowHelp(false)}>x</button>
            </div>
            <div class="modal-body">
              <div class="shortcut-list">
                <div class="shortcut-row"><kbd>Ctrl+K</kbd><span>Command palette</span></div>
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
