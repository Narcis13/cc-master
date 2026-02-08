// Events reader: tail-follows ~/.cc-agent/events.jsonl and emits parsed hook events.
// Uses byte-offset tracking (same pattern as terminal-stream.ts).

import { EventEmitter } from "events";
import { statSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { watch, type FSWatcher } from "fs";
import path from "path";

export interface HookEvent {
  timestamp: string;
  session_id: string;
  event_type: string;
  tool_name: string;
  job_id: string;
  cwd: string;
  data: any;
}

const EVENTS_FILE = path.join(process.env.HOME!, ".cc-agent", "events.jsonl");

export class EventsReader extends EventEmitter {
  private byteOffset = 0;
  private watcher: FSWatcher | null = null;
  private pollTimer: Timer | null = null;
  private debounceTimer: Timer | null = null;

  start() {
    // Ensure file exists
    const dir = path.dirname(EVENTS_FILE);
    mkdirSync(dir, { recursive: true });
    if (!existsSync(EVENTS_FILE)) {
      writeFileSync(EVENTS_FILE, "");
    }

    // Start at end of file (only show new events)
    try {
      const stat = statSync(EVENTS_FILE);
      this.byteOffset = stat.size;
    } catch {
      this.byteOffset = 0;
    }

    // Watch for changes
    this.watcher = watch(EVENTS_FILE, () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.readNewLines(), 100);
    });

    // Poll as fallback (fs.watch can miss events)
    this.pollTimer = setInterval(() => this.readNewLines(), 2000);
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  getRecentEvents(limit = 50): HookEvent[] {
    if (!existsSync(EVENTS_FILE)) return [];

    try {
      const content = readFileSync(EVENTS_FILE, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const recent = lines.slice(-limit);
      return recent
        .map((line) => {
          try {
            return JSON.parse(line) as HookEvent;
          } catch {
            return null;
          }
        })
        .filter((e): e is HookEvent => e !== null);
    } catch {
      return [];
    }
  }

  private readNewLines() {
    try {
      const stat = statSync(EVENTS_FILE);
      if (stat.size <= this.byteOffset) {
        // File was truncated or no new data
        if (stat.size < this.byteOffset) {
          this.byteOffset = 0;
        }
        return;
      }

      // Read only the new bytes
      const fd = Bun.file(EVENTS_FILE);
      const buffer = readFileSync(EVENTS_FILE);
      const newData = buffer.subarray(this.byteOffset).toString("utf-8");
      this.byteOffset = stat.size;

      // Parse each line
      const lines = newData.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as HookEvent;
          this.emit("event", event);
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // File may not exist yet
    }
  }
}

// Singleton
let eventsReader: EventsReader | null = null;

export function getEventsReader(): EventsReader {
  if (!eventsReader) {
    eventsReader = new EventsReader();
    eventsReader.start();
  }
  return eventsReader;
}
