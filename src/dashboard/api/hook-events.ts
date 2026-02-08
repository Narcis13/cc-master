// REST endpoint: GET /api/hook-events
// Returns recent hook events from events.jsonl

import { Hono } from "hono";
import { getEventsReader } from "../events-reader.ts";

const hookEventsApi = new Hono();

hookEventsApi.get("/", (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const jobId = c.req.query("job_id");

  const reader = getEventsReader();
  let events = reader.getRecentEvents(limit * 2); // fetch extra in case we filter

  if (jobId) {
    events = events.filter((e) => e.job_id === jobId);
  }

  return c.json({ events: events.slice(-limit) });
});

export { hookEventsApi };
