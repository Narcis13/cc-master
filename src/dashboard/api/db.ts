// REST API: Database Explorer endpoints — /api/db/*

import { Hono } from "hono";
import {
  getDbOverview,
  getJobHistoryFiltered,
  getJobToolCalls,
  getJobSubagents,
  getAnalytics,
  getToolStats,
  getToolCallsFiltered,
  getEventsFiltered,
  getDb,
} from "../db.ts";
import type { JobHistoryRecord } from "../db.ts";

const dbApi = new Hono();

// GET /api/db/overview — table counts, DB size, top values
dbApi.get("/overview", (c) => {
  const overview = getDbOverview();
  return c.json(overview);
});

// GET /api/db/jobs — filtered, sorted, paginated job history
dbApi.get("/jobs", (c) => {
  const result = getJobHistoryFiltered({
    status: c.req.query("status") || undefined,
    model: c.req.query("model") || undefined,
    reasoning: c.req.query("reasoning") || undefined,
    cost_min: c.req.query("cost_min") ? parseFloat(c.req.query("cost_min")!) : undefined,
    cost_max: c.req.query("cost_max") ? parseFloat(c.req.query("cost_max")!) : undefined,
    since: c.req.query("since") || undefined,
    until: c.req.query("until") || undefined,
    has_session: c.req.query("has_session") === "true" ? true : c.req.query("has_session") === "false" ? false : undefined,
    search: c.req.query("search") || undefined,
    search_mode: (c.req.query("search_mode") as any) || undefined,
    sort: c.req.query("sort") || undefined,
    order: (c.req.query("order") as any) || undefined,
    page: c.req.query("page") ? parseInt(c.req.query("page")!, 10) : undefined,
    limit: c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : undefined,
  });
  return c.json(result);
});

// GET /api/db/jobs/:id — single job history record
dbApi.get("/jobs/:id", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const job = db
    .query<JobHistoryRecord, [string]>(
      `SELECT * FROM job_history WHERE id = ?`
    )
    .get(id);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  return c.json(job);
});

// GET /api/db/jobs/:id/tool-calls — tool calls for a job
dbApi.get("/jobs/:id/tool-calls", (c) => {
  const id = c.req.param("id");
  const toolCalls = getJobToolCalls(id);
  return c.json({ tool_calls: toolCalls });
});

// GET /api/db/jobs/:id/subagents — subagents for a job
dbApi.get("/jobs/:id/subagents", (c) => {
  const id = c.req.param("id");
  const subagents = getJobSubagents(id);
  return c.json({ subagents });
});

// GET /api/db/analytics — computed analytics aggregations
dbApi.get("/analytics", (c) => {
  const range = c.req.query("range") || "7d";
  const analytics = getAnalytics(range);
  return c.json(analytics);
});

// GET /api/db/tool-stats — aggregated tool usage statistics
dbApi.get("/tool-stats", (c) => {
  const stats = getToolStats();
  return c.json(stats);
});

// GET /api/db/tool-calls — filtered, paginated tool calls
dbApi.get("/tool-calls", (c) => {
  const result = getToolCallsFiltered({
    tool: c.req.query("tool") || undefined,
    is_error: c.req.query("is_error") === "true" ? true : c.req.query("is_error") === "false" ? false : undefined,
    job_id: c.req.query("job_id") || undefined,
    page: c.req.query("page") ? parseInt(c.req.query("page")!, 10) : undefined,
    limit: c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : undefined,
  });
  return c.json(result);
});

// GET /api/db/events — filtered, paginated events
dbApi.get("/events", (c) => {
  const result = getEventsFiltered({
    job_id: c.req.query("job_id") || undefined,
    event_type: c.req.query("event_type") || undefined,
    tool_name: c.req.query("tool_name") || undefined,
    file_path: c.req.query("file_path") || undefined,
    page: c.req.query("page") ? parseInt(c.req.query("page")!, 10) : undefined,
    limit: c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : undefined,
  });
  return c.json(result);
});

export { dbApi };
