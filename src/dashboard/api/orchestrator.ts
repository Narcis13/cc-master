// REST API: Orchestrator lifecycle — start, stop, status, inject, state

import { Hono } from "hono";
import {
  startOrchestrator,
  stopOrchestrator,
  getOrchestratorStatus,
  injectToOrchestrator,
  loadOrchestratorState,
} from "../../orchestrator.ts";
import { getDashboardState } from "../state.ts";
import { saveDaemonPrefs } from "../../daemon-prefs.ts";
import { logActivity } from "../db.ts";

const orchestratorApi = new Hono();

// POST /api/orchestrator/start
orchestratorApi.post("/start", async (c) => {
  let model: string | undefined;
  let reasoning: string | undefined;
  try {
    const body = await c.req.json();
    model = body?.model;
    reasoning = body?.reasoning;
  } catch {
    // No body is fine, use defaults
  }

  const result = startOrchestrator({ model, reasoning });
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }
  saveDaemonPrefs({ auto_respawn: true });
  logActivity({ action: "orchestrator_started", details: { model: model || "opus" } });
  return c.json({ ok: true });
});

// POST /api/orchestrator/stop
orchestratorApi.post("/stop", (c) => {
  const result = stopOrchestrator();
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }
  saveDaemonPrefs({ auto_respawn: false });
  logActivity({ action: "orchestrator_stopped" });
  return c.json({ ok: true });
});

// GET /api/orchestrator/status
orchestratorApi.get("/status", (c) => {
  const status = getOrchestratorStatus();
  const state = getDashboardState();
  return c.json({ ...status, contextClearState: state.getContextClearState() });
});

// POST /api/orchestrator/inject
orchestratorApi.post("/inject", async (c) => {
  const body = await c.req.json();
  const { message } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return c.json({ error: "message is required" }, 400);
  }

  const sent = injectToOrchestrator(message.trim());
  if (!sent) {
    return c.json({ error: "Orchestrator is not running" }, 400);
  }
  logActivity({ action: "prompt_injected", details: { preview: message.trim().slice(0, 120) } });
  return c.json({ ok: true });
});

// GET /api/orchestrator/state
orchestratorApi.get("/state", (c) => {
  const state = loadOrchestratorState();
  if (!state) {
    return c.json({ error: "No state file found" }, 404);
  }
  return c.json(state);
});

export { orchestratorApi };
