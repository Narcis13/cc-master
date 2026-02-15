import type { JobEntry } from "../hooks/useJobs";

/** Extract a short project name from a full cwd path */
export function getProjectName(cwd: string): string {
  const parts = cwd.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || cwd;
}

/** 8 visually distinct hues for project color coding */
const PROJECT_HUES = [210, 150, 30, 280, 350, 180, 60, 320];

/** Deterministic color from project name (returns an HSL string) */
export function getProjectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const hue = PROJECT_HUES[Math.abs(hash) % PROJECT_HUES.length];
  return `hsl(${hue}, 60%, 65%)`;
}

/** Background variant (low opacity) for badges */
export function getProjectBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const hue = PROJECT_HUES[Math.abs(hash) % PROJECT_HUES.length];
  return `hsla(${hue}, 60%, 65%, 0.12)`;
}

export type ProjectStats = {
  name: string;
  cwd: string;
  jobCount: number;
  runningCount: number;
  completedCount: number;
  failedCount: number;
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  jobs: JobEntry[];
};

/** Group jobs by project, sorted by most recent job first */
export function groupJobsByProject(jobs: JobEntry[]): ProjectStats[] {
  const map = new Map<string, ProjectStats>();

  for (const job of jobs) {
    const name = getProjectName(job.cwd);
    let group = map.get(name);
    if (!group) {
      group = {
        name,
        cwd: job.cwd,
        jobCount: 0,
        runningCount: 0,
        completedCount: 0,
        failedCount: 0,
        totalCost: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        jobs: [],
      };
      map.set(name, group);
    }
    group.jobCount++;
    if (job.status === "running") group.runningCount++;
    if (job.status === "completed") group.completedCount++;
    if (job.status === "failed") group.failedCount++;
    if (job.estimated_cost) group.totalCost += job.estimated_cost;
    if (job.tokens) {
      group.totalTokensIn += job.tokens.input;
      group.totalTokensOut += job.tokens.output;
    }
    group.jobs.push(job);
  }

  // Sort groups: groups with running jobs first, then by most recent job
  return Array.from(map.values()).sort((a, b) => {
    if (a.runningCount > 0 && b.runningCount === 0) return -1;
    if (b.runningCount > 0 && a.runningCount === 0) return 1;
    const aLatest = new Date(a.jobs[0]?.created_at || 0).getTime();
    const bLatest = new Date(b.jobs[0]?.created_at || 0).getTime();
    return bLatest - aLatest;
  });
}
