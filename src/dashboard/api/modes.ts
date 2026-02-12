// REST API: Orchestrator mode management

import { Hono } from "hono";
import {
  getModes,
  getModeById,
  activateMode,
  deleteMode,
  deactivateAllModes,
  getActiveMode,
  createMode,
} from "../db.ts";
import { createModeFromCurrent } from "../../orchestrator/modes.ts";

const modesApi = new Hono();

// GET /api/modes — List all modes
modesApi.get("/", (c) => {
  const modes = getModes();
  return c.json({ modes });
});

// GET /api/modes/active — Get currently active mode
modesApi.get("/active", (c) => {
  const mode = getActiveMode();
  return c.json({ mode });
});

// POST /api/modes — Create a new mode
modesApi.post("/", async (c) => {
  const body = await c.req.json();
  const { name, description, trigger_config, from_current } = body;

  if (!name) {
    return c.json({ error: "name is required" }, 400);
  }

  try {
    let id: number;
    if (from_current) {
      id = createModeFromCurrent(name, description);
    } else {
      if (!trigger_config) {
        return c.json({ error: "trigger_config is required (or set from_current: true)" }, 400);
      }
      id = createMode({
        name,
        description,
        trigger_config: typeof trigger_config === "string" ? trigger_config : JSON.stringify(trigger_config),
      });
    }
    return c.json({ ok: true, id }, 201);
  } catch (err: any) {
    if (err.message?.includes("UNIQUE")) {
      return c.json({ error: `Mode name "${name}" already exists` }, 409);
    }
    throw err;
  }
});

// POST /api/modes/:id/activate — Activate a mode
modesApi.post("/:id/activate", (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  if (activateMode(id)) {
    return c.json({ ok: true });
  }
  return c.json({ error: "Mode not found" }, 404);
});

// POST /api/modes/deactivate — Deactivate all modes
modesApi.post("/deactivate", (c) => {
  deactivateAllModes();
  return c.json({ ok: true });
});

// DELETE /api/modes/:id — Delete a mode
modesApi.delete("/:id", (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  if (deleteMode(id)) {
    return c.json({ ok: true });
  }
  return c.json({ error: "Mode not found" }, 404);
});

export { modesApi };
