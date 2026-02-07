// WebSocket hook for terminal streaming.
// Connects to /api/terminal/:id, receives initial + delta messages,
// writes to a provided writer ref (set by TerminalPanel with xterm.js).

import { useState, useEffect } from "preact/hooks";

export type TerminalWriter = (data: string) => void;

export function useTerminal(
  jobId: string | null,
  writer: { current: TerminalWriter | null }
) {
  const [connected, setConnected] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/terminal/${jobId}`);

    ws.onopen = () => setConnected(true);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if ((msg.type === "initial" || msg.type === "delta") && writer.current) {
          writer.current(msg.data);
        } else if (msg.type === "completed") {
          setCompleted(true);
        }
      } catch {}
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => ws.close();
  }, [jobId]);

  return { connected, completed };
}
