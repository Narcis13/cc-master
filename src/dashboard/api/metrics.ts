// REST API: GET /api/metrics, GET /api/metrics/history

import { Hono } from "hono";
import { getDashboardState } from "../state.ts";
import { getMetricsHistory, getJobHistory } from "../db.ts";

const metricsApi = new Hono();

// GET /api/metrics — current aggregate metrics
metricsApi.get("/", (c) => {
  const state = getDashboardState();
  const { metrics } = state.getSnapshot();
  return c.json(metrics);
});

// GET /api/metrics/history — historical daily metrics
metricsApi.get("/history", (c) => {
  const range = (c.req.query("range") as string) || "7d";
  const history = getMetricsHistory(range);
  return c.json({ range, data: history });
});

// GET /api/metrics/jobs — historical job records
metricsApi.get("/jobs", (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const jobs = getJobHistory(limit);
  return c.json({ jobs });
});

export { metricsApi };
