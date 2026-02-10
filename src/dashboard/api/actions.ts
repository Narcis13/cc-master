// REST API: POST actions — send, kill, create jobs

import { Hono } from "hono";
import { startJob, killJob, sendToJob, loadJob } from "../../jobs.ts";

const actionsApi = new Hono();

// POST /api/actions/jobs — Start a new agent
actionsApi.post("/jobs", async (c) => {
  const body = await c.req.json();
  const { prompt, model, reasoning, sandbox, cwd } = body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return c.json({ error: "prompt is required" }, 400);
  }

  const job = startJob({
    prompt: prompt.trim(),
    model: model || undefined,
    reasoningEffort: reasoning || undefined,
    sandbox: sandbox || undefined,
    cwd: cwd || undefined,
  });

  return c.json({ ok: true, job: { id: job.id, status: job.status } }, 201);
});

// POST /api/actions/jobs/:id/send — Send message to running agent
actionsApi.post("/jobs/:id/send", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { message } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return c.json({ error: "message is required" }, 400);
  }

  const job = loadJob(id);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  if (job.status !== "running") {
    return c.json({ error: "Job is not running" }, 400);
  }

  const sent = sendToJob(id, message.trim());
  if (!sent) {
    return c.json({ error: "Failed to send message" }, 500);
  }

  return c.json({ ok: true });
});

// POST /api/actions/jobs/:id/kill — Kill a running agent
// Body: { completed?: boolean } — if true, marks as completed instead of failed
actionsApi.post("/jobs/:id/kill", async (c) => {
  const id = c.req.param("id");

  const job = loadJob(id);
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  if (job.status !== "running" && job.status !== "pending") {
    return c.json({ error: "Job is not running" }, 400);
  }

  let markCompleted = false;
  try {
    const body = await c.req.json();
    markCompleted = body?.completed === true;
  } catch {
    // No body is fine, defaults to failed
  }

  const killed = killJob(id, markCompleted);
  if (!killed) {
    return c.json({ error: "Failed to kill job" }, 500);
  }

  return c.json({ ok: true });
});

export { actionsApi };
