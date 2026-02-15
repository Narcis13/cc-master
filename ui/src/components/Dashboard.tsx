import { h } from "preact";
import { useState, useMemo } from "preact/hooks";
import type { JobEntry, Metrics, HookEvent } from "../hooks/useJobs";
import { StatusBar } from "./StatusBar";
import { JobCard } from "./JobCard";
import { ProjectGroup } from "./ProjectGroup";
import { cleanupJobs } from "../lib/api";
import { getProjectName, getProjectColor, getProjectBg, groupJobsByProject } from "../lib/project";

type StatusFilter = "all" | "running" | "completed" | "failed" | "pending";
type SortField = "recent" | "status" | "elapsed";

export function Dashboard({
  jobs,
  metrics,
  hookEvents,
  projectDir,
}: {
  jobs: JobEntry[];
  metrics: Metrics | null;
  hookEvents: HookEvent[];
  projectDir?: string | null;
}) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortField>("recent");
  const [search, setSearch] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [groupByProject, setGroupByProject] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const handleCleanup = async () => {
    if (!confirm("Remove completed/failed jobs older than 7 days?")) return;
    setCleaning(true);
    try {
      const result = await cleanupJobs(7);
      if (result.cleaned > 0) {
        alert(`Cleaned ${result.cleaned} old jobs`);
      } else {
        alert("No old jobs to clean up");
      }
    } catch {
      alert("Cleanup failed");
    } finally {
      setCleaning(false);
    }
  };

  // Build a map of latest activity per job from hook events
  const jobActivity = new Map<string, HookEvent>();
  for (const event of hookEvents) {
    if (event.job_id && !jobActivity.has(event.job_id)) {
      jobActivity.set(event.job_id, event);
    }
  }

  // Unique project names for the project filter dropdown
  const projectNames = useMemo(() => {
    const names = new Set<string>();
    for (const j of jobs) names.add(getProjectName(j.cwd));
    return Array.from(names).sort();
  }, [jobs]);

  const currentProjectName = projectDir ? getProjectName(projectDir) : null;

  const filtered = jobs.filter((j) => {
    if (filter !== "all" && j.status !== filter) return false;
    if (projectFilter !== "all" && getProjectName(j.cwd) !== projectFilter) return false;
    if (search && !j.prompt.toLowerCase().includes(search.toLowerCase()) && !j.id.includes(search)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "status") {
      const order = { running: 0, pending: 1, failed: 2, completed: 3 };
      return (order[a.status] ?? 4) - (order[b.status] ?? 4);
    }
    if (sort === "elapsed") return b.elapsed_ms - a.elapsed_ms;
    // "recent" — by created_at descending
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const projectGroups = useMemo(() => groupJobsByProject(sorted), [sorted]);

  return (
    <div class="dashboard">
      <StatusBar metrics={metrics} />

      <div class="dashboard-toolbar">
        <div class="filter-group">
          <select
            class="filter-select"
            value={filter}
            onChange={(e) => setFilter((e.target as HTMLSelectElement).value as StatusFilter)}
          >
            <option value="all">All Status</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          {projectNames.length > 1 && (
            <select
              class="filter-select"
              value={projectFilter}
              onChange={(e) => setProjectFilter((e.target as HTMLSelectElement).value)}
            >
              <option value="all">All Projects</option>
              {projectNames.map((name) => (
                <option key={name} value={name}>
                  {name}{name === currentProjectName ? " (current)" : ""}
                </option>
              ))}
            </select>
          )}

          <select
            class="filter-select"
            value={sort}
            onChange={(e) => setSort((e.target as HTMLSelectElement).value as SortField)}
          >
            <option value="recent">Recent</option>
            <option value="status">Status</option>
            <option value="elapsed">Duration</option>
          </select>
        </div>

        <input
          class="search-input"
          type="text"
          placeholder="Search jobs..."
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
        />

        {projectNames.length > 1 && (
          <button
            class={`btn btn--sm ${groupByProject ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setGroupByProject(!groupByProject)}
            title="Group jobs by project"
          >
            Group by Project
          </button>
        )}

        <button
          class="btn btn--ghost btn--sm"
          onClick={handleCleanup}
          disabled={cleaning}
          title="Remove completed/failed jobs older than 7 days"
        >
          {cleaning ? "Cleaning..." : "Clean Old Jobs"}
        </button>
      </div>

      {/* Project filter chips (when multiple projects exist) */}
      {projectNames.length > 1 && !groupByProject && (
        <div class="project-chips">
          <button
            class={`project-chip ${projectFilter === "all" ? "project-chip--active" : ""}`}
            onClick={() => setProjectFilter("all")}
          >
            All
          </button>
          {projectNames.map((name) => (
            <button
              key={name}
              class={`project-chip ${projectFilter === name ? "project-chip--active" : ""}`}
              style={{
                "--chip-color": getProjectColor(name),
                "--chip-bg": getProjectBg(name),
              } as any}
              onClick={() => setProjectFilter(projectFilter === name ? "all" : name)}
            >
              {name}
              {name === currentProjectName && <span class="project-current-dot" />}
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <div class="empty-state">
          {jobs.length === 0
            ? "No jobs yet. Start an agent with cc-agent start."
            : "No jobs match your filters."}
        </div>
      ) : groupByProject ? (
        <div class="project-groups">
          {projectGroups.map((pg) => (
            <ProjectGroup
              key={pg.name}
              project={pg}
              jobActivity={jobActivity}
              isCurrent={pg.name === currentProjectName}
            />
          ))}
        </div>
      ) : (
        <div class="job-grid">
          {sorted.map((job) => (
            <JobCard key={job.id} job={job} activity={jobActivity.get(job.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
