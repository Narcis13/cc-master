// REST API: Pulse loop control

import { Hono } from "hono";
import { startPulse, stopPulse, getPulseStatus } from "../../orchestrator/pulse.ts";
import { getDashboardState } from "../state.ts";
import { saveDaemonPrefs } from "../../daemon-prefs.ts";

const pulseApi = new Hono();

// POST /api/pulse/start
pulseApi.post("/start", (c) => {
  const result = startPulse(getDashboardState());
  if (result.success) {
    saveDaemonPrefs({ pulse_enabled: true });
    return c.json({ ok: true });
  }
  return c.json({ error: result.error }, 409);
});

// POST /api/pulse/stop
pulseApi.post("/stop", (c) => {
  const result = stopPulse();
  if (result.success) {
    saveDaemonPrefs({ pulse_enabled: false });
    return c.json({ ok: true });
  }
  return c.json({ error: result.error }, 409);
});

// GET /api/pulse/status
pulseApi.get("/status", (c) => {
  return c.json(getPulseStatus());
});

export { pulseApi };
