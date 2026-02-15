import { h } from "preact";
import { useState } from "preact/hooks";
import type { HookEvent } from "../hooks/useJobs";
import type { ProjectStats } from "../lib/project";
import { getProjectColor, getProjectBg } from "../lib/project";
import { formatTokens } from "../lib/format";
import { JobCard } from "./JobCard";

export function ProjectGroup({
  project,
  jobActivity,
  isCurrent,
}: {
  project: ProjectStats;
  jobActivity: Map<string, HookEvent>;
  isCurrent: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const color = getProjectColor(project.name);
  const bg = getProjectBg(project.name);

  return (
    <div class="project-group">
      <div
        class="project-group-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span class="project-group-chevron">{collapsed ? "\u25b6" : "\u25bc"}</span>
        <span
          class="project-badge project-badge--header"
          style={{ color, background: bg, borderColor: color }}
        >
          {project.name}
        </span>
        {isCurrent && <span class="project-current-tag">current</span>}
        <span class="project-group-count">
          {project.jobCount} job{project.jobCount !== 1 ? "s" : ""}
        </span>
        <div class="project-group-stats">
          {project.runningCount > 0 && (
            <span class="project-stat project-stat--running">
              {project.runningCount} running
            </span>
          )}
          {project.totalCost > 0 && (
            <span class="project-stat project-stat--cost">
              ${project.totalCost.toFixed(2)}
            </span>
          )}
          {(project.totalTokensIn > 0 || project.totalTokensOut > 0) && (
            <span class="project-stat project-stat--tokens">
              {formatTokens(project.totalTokensIn + project.totalTokensOut)} tokens
            </span>
          )}
        </div>
      </div>
      {!collapsed && (
        <div class="project-group-jobs job-grid">
          {project.jobs.map((job) => (
            <JobCard key={job.id} job={job} activity={jobActivity.get(job.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
