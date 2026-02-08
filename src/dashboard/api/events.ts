// SSE endpoint: GET /api/events
// Sends snapshot on connect, then streams job change events.

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getDashboardState, type StateEvent } from "../state.ts";

const eventsApi = new Hono();

eventsApi.get("/", (c) => {
  return streamSSE(c, async (stream) => {
    const state = getDashboardState();

    // Send initial snapshot
    const snapshot = state.getSnapshot();
    await stream.writeSSE({
      event: "snapshot",
      data: JSON.stringify(snapshot),
    });

    // Forward state changes as SSE events
    const onChange = async (event: StateEvent) => {
      try {
        let data: any;
        if (event.type === "metrics_update") {
          data = event.metrics;
        } else if (event.type === "hook_event") {
          data = event.event;
        } else {
          data = (event as any).job;
        }
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(data),
        });
      } catch {
        // Client disconnected
      }
    };

    state.on("change", onChange);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: "heartbeat",
          data: JSON.stringify({ timestamp: new Date().toISOString() }),
        });
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Cleanup on disconnect
    stream.onAbort(() => {
      state.off("change", onChange);
      clearInterval(heartbeat);
    });

    // Keep stream open until client disconnects
    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve());
    });
  });
});

export { eventsApi };
