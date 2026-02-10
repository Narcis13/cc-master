// REST API: GET /api/jobs, GET /api/jobs/:id, GET /api/jobs/:id/session

import { Hono } from "hono";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { getJobsJson, getJobSession, loadJob, refreshJobStatus } from "../../jobs.ts";
import { parseFullSession } from "../../session-parser.ts";
import { config } from "../../config.ts";
import { getDashboardState } from "../state.ts";

const jobsApi = new Hono();

// GET /api/jobs — list all jobs with enriched data
jobsApi.get("/", (c) => {
  const data = getJobsJson();
  return c.json(data);
});

// GET /api/jobs/:id — single job with enriched data
jobsApi.get("/:id", (c) => {
  const id = c.req.param("id");

  // Refresh status for running jobs before returning
  refreshJobStatus(id);

  const data = getJobsJson();
  const job = data.jobs.find((j) => j.id === id);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json(job);
});

// GET /api/jobs/:id/session — full parsed session data with tool stats
jobsApi.get("/:id/session", (c) => {
  const id = c.req.param("id");
  const session = getJobSession(id);

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  // Compute tool_stats from tool_calls
  const byTool: Record<string, number> = {};
  let failedCalls = 0;
  const filesRead = new Set<string>();

  for (const tc of session.tool_calls) {
    byTool[tc.name] = (byTool[tc.name] || 0) + 1;
    if (tc.is_error) failedCalls++;
    if (tc.name === "Read" && tc.input && typeof tc.input === "object" && !Array.isArray(tc.input)) {
      const filePath = (tc.input as Record<string, unknown>).file_path;
      if (typeof filePath === "string") filesRead.add(filePath);
    }
  }

  // Scan subagents directory
  const subagents: { id: string; tool_calls: number; messages: number }[] = [];
  const subagentDir = join(config.jobsDir, `${id}-subagents`);
  if (existsSync(subagentDir)) {
    const files = readdirSync(subagentDir).filter(f => f.endsWith(".jsonl") || f.endsWith(".json"));
    for (const file of files) {
      const sub = parseFullSession(join(subagentDir, file));
      if (sub) {
        subagents.push({
          id: file.replace(/\.session\.jsonl$|\.jsonl$|\.json$/, ""),
          tool_calls: sub.tool_calls.length,
          messages: sub.messages.length,
        });
      }
    }
  }

  return c.json({
    job_id: id,
    session_id: session.session_id,
    model: session.model,
    duration_ms: session.duration_ms,
    tokens: session.tokens,
    messages: session.messages,
    tool_calls: session.tool_calls,
    files_modified: session.files_modified,
    summary: session.summary,
    tool_stats: {
      total_calls: session.tool_calls.length,
      by_tool: byTool,
      failed_calls: failedCalls,
      unique_files_read: filesRead.size,
    },
    subagents,
  });
});

export { jobsApi };
