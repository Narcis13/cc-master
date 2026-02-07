// REST API: GET /api/jobs, GET /api/jobs/:id

import { Hono } from "hono";
import { getJobsJson, loadJob, refreshJobStatus } from "../../jobs.ts";
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

export { jobsApi };
