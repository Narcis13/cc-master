// REST API: GET /api/metrics

import { Hono } from "hono";
import { getDashboardState } from "../state.ts";

const metricsApi = new Hono();

// GET /api/metrics — current aggregate metrics
metricsApi.get("/", (c) => {
  const state = getDashboardState();
  const { metrics } = state.getSnapshot();
  return c.json(metrics);
});

export { metricsApi };
