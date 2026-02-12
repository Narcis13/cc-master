// REST API: Orchestrator trigger management + pending approvals

import { Hono } from "hono";
import {
  getTriggers,
  addTrigger,
  updateTrigger,
  removeTrigger,
  toggleTrigger,
  getActivityLog,
} from "../db.ts";
import {
  getPendingApprovals,
  approveAction,
  rejectAction,
} from "../../orchestrator/triggers.ts";

const triggersApi = new Hono();

// GET /api/triggers — List all triggers
triggersApi.get("/", (c) => {
  const enabledOnly = c.req.query("enabled") === "true";
  const triggers = getTriggers(enabledOnly || undefined);
  return c.json({ triggers });
});

// POST /api/triggers — Create a trigger
triggersApi.post("/", async (c) => {
  const body = await c.req.json();
  const { name, type, condition, action, action_payload, autonomy, cooldown_seconds } = body;

  if (!name || !type || !condition || !action) {
    return c.json({ error: "name, type, condition, and action are required" }, 400);
  }

  const validTypes = ["cron", "event", "threshold"];
  if (!validTypes.includes(type)) {
    return c.json({ error: `type must be one of: ${validTypes.join(", ")}` }, 400);
  }

  const validActions = ["inject_prompt", "clear_context", "start_orchestrator", "queue_task", "notify"];
  if (!validActions.includes(action)) {
    return c.json({ error: `action must be one of: ${validActions.join(", ")}` }, 400);
  }

  try {
    const id = addTrigger({
      name,
      type,
      condition,
      action,
      action_payload: action_payload ? (typeof action_payload === "string" ? action_payload : JSON.stringify(action_payload)) : undefined,
      autonomy,
      cooldown_seconds,
    });
    return c.json({ ok: true, id }, 201);
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) {
      return c.json({ error: `Trigger name "${name}" already exists` }, 409);
    }
    throw err;
  }
});

// PATCH /api/triggers/:id — Update a trigger
triggersApi.patch("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  const body = await c.req.json();
  const updates: Record<string, any> = {};

  for (const key of ["name", "type", "condition", "action", "action_payload", "autonomy", "enabled", "cooldown_seconds"]) {
    if (body[key] !== undefined) {
      if (key === "action_payload" && typeof body[key] !== "string") {
        updates[key] = JSON.stringify(body[key]);
      } else {
        updates[key] = body[key];
      }
    }
  }

  if (updateTrigger(id, updates)) {
    return c.json({ ok: true });
  }
  return c.json({ error: "Trigger not found or no changes" }, 404);
});

// DELETE /api/triggers/:id — Remove a trigger
triggersApi.delete("/:id", (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  if (removeTrigger(id)) {
    return c.json({ ok: true });
  }
  return c.json({ error: "Trigger not found" }, 404);
});

// POST /api/triggers/:id/toggle — Toggle enabled/disabled
triggersApi.post("/:id/toggle", (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  if (toggleTrigger(id)) {
    return c.json({ ok: true });
  }
  return c.json({ error: "Trigger not found" }, 404);
});

// --- Pending Approvals ---

// GET /api/triggers/approvals — List pending approvals
triggersApi.get("/approvals", (c) => {
  return c.json({ approvals: getPendingApprovals() });
});

// POST /api/triggers/approvals/:id/approve
triggersApi.post("/approvals/:id/approve", (c) => {
  const id = c.req.param("id");
  if (approveAction(id)) {
    return c.json({ ok: true });
  }
  return c.json({ error: "Approval not found" }, 404);
});

// POST /api/triggers/approvals/:id/reject
triggersApi.post("/approvals/:id/reject", (c) => {
  const id = c.req.param("id");
  if (rejectAction(id)) {
    return c.json({ ok: true });
  }
  return c.json({ error: "Approval not found" }, 404);
});

// --- Activity Log ---

// GET /api/triggers/activity — Recent activity log
triggersApi.get("/activity", (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  return c.json({ activity: getActivityLog(limit) });
});

export { triggersApi };
