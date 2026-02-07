import { h } from "preact";
import { useState } from "preact/hooks";
import type { JobEntry, Metrics } from "../hooks/useJobs";
import { StatusBar } from "./StatusBar";
import { JobCard } from "./JobCard";

type StatusFilter = "all" | "running" | "completed" | "failed" | "pending";
type SortField = "recent" | "status" | "elapsed";

export function Dashboard({ jobs, metrics }: { jobs: JobEntry[]; metrics: Metrics | null }) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortField>("recent");
  const [search, setSearch] = useState("");

  const filtered = jobs.filter((j) => {
    if (filter !== "all" && j.status !== filter) return false;
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
            <option value="all">All</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

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
      </div>

      {sorted.length === 0 ? (
        <div class="empty-state">
          {jobs.length === 0
            ? "No jobs yet. Start an agent with cc-agent start."
            : "No jobs match your filters."}
        </div>
      ) : (
        <div class="job-grid">
          {sorted.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
