// REST API: Orchestrator task queue management

import { Hono } from "hono";
import { addQueueTask, getQueueTasks, removeQueueTask, updateQueueTask } from "../db.ts";

const queueApi = new Hono();

// GET /api/queue/tasks?status=pending
queueApi.get("/tasks", (c) => {
  const status = c.req.query("status") || undefined;
  const tasks = getQueueTasks(status);
  return c.json({ tasks });
});

// POST /api/queue/tasks — Add a task to the queue
queueApi.post("/tasks", async (c) => {
  const body = await c.req.json();
  const { prompt, priority, metadata } = body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return c.json({ error: "prompt is required" }, 400);
  }

  const id = addQueueTask({
    prompt: prompt.trim(),
    priority: typeof priority === "number" ? priority : undefined,
    metadata: metadata ?? undefined,
  });

  return c.json({ ok: true, id }, 201);
});

// DELETE /api/queue/tasks/:id — Remove a task
queueApi.delete("/tasks/:id", (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  if (removeQueueTask(id)) {
    return c.json({ ok: true });
  }
  return c.json({ error: "Task not found" }, 404);
});

// PATCH /api/queue/tasks/:id — Update a task
queueApi.patch("/tasks/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  const body = await c.req.json();
  const updated = updateQueueTask(id, {
    status: body.status,
    started_at: body.started_at,
    completed_at: body.completed_at,
  });

  if (updated) {
    return c.json({ ok: true });
  }
  return c.json({ error: "Task not found or no changes" }, 404);
});

export { queueApi };
