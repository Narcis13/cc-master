// Terminal streaming: reads job log files, tracks byte offset, broadcasts deltas to WebSocket clients.

import { readFileSync, statSync } from "fs";
import { join } from "path";
import { config } from "../config.ts";
import { loadJob } from "../jobs.ts";

type WSLike = { send(data: string): void };

export class TerminalStreamer {
  private logFile: string;
  private offset = 0;
  private pollTimer: Timer | null = null;
  private clients = new Set<WSLike>();
  private jobCompleted = false;

  constructor(private jobId: string) {
    this.logFile = join(config.jobsDir, `${jobId}.log`);
  }

  addClient(ws: WSLike) {
    this.clients.add(ws);
    this.sendInitial(ws);
    if (this.clients.size === 1) this.startPolling();
  }

  removeClient(ws: WSLike) {
    this.clients.delete(ws);
    if (this.clients.size === 0) this.stopPolling();
  }

  get clientCount() {
    return this.clients.size;
  }

  private sendInitial(ws: WSLike) {
    try {
      const buf = readFileSync(this.logFile);
      this.offset = buf.length;
      ws.send(JSON.stringify({ type: "initial", data: buf.toString("utf-8") }));
    } catch {
      ws.send(JSON.stringify({ type: "initial", data: "" }));
    }

    if (this.jobCompleted) {
      const job = loadJob(this.jobId);
      ws.send(JSON.stringify({ type: "completed", status: job?.status ?? "completed" }));
    }
  }

  private startPolling() {
    this.pollTimer = setInterval(() => this.poll(), 500);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private poll() {
    // Read new bytes from log file
    try {
      const stat = statSync(this.logFile);
      if (stat.size > this.offset) {
        const buf = readFileSync(this.logFile);
        if (buf.length > this.offset) {
          const delta = buf.slice(this.offset).toString("utf-8");
          this.offset = buf.length;
          if (delta) this.broadcast({ type: "delta", data: delta });
        }
      }
    } catch {
      // File may not exist yet
    }

    // Check if job completed
    if (!this.jobCompleted) {
      const job = loadJob(this.jobId);
      if (job && (job.status === "completed" || job.status === "failed")) {
        this.jobCompleted = true;
        // Final read to catch any remaining bytes
        try {
          const buf = readFileSync(this.logFile);
          if (buf.length > this.offset) {
            const delta = buf.slice(this.offset).toString("utf-8");
            this.offset = buf.length;
            if (delta) this.broadcast({ type: "delta", data: delta });
          }
        } catch {}
        this.broadcast({ type: "completed", status: job.status });
      }
    }
  }

  private broadcast(msg: object) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      try {
        ws.send(data);
      } catch {
        this.clients.delete(ws);
      }
    }
  }

  destroy() {
    this.stopPolling();
    this.clients.clear();
  }
}

// Per-job streamer registry
const streamers = new Map<string, TerminalStreamer>();

export function getStreamer(jobId: string): TerminalStreamer {
  let streamer = streamers.get(jobId);
  if (!streamer) {
    streamer = new TerminalStreamer(jobId);
    streamers.set(jobId, streamer);
  }
  return streamer;
}

export function cleanupStreamer(jobId: string) {
  const streamer = streamers.get(jobId);
  if (streamer && streamer.clientCount === 0) {
    streamer.destroy();
    streamers.delete(jobId);
  }
}
