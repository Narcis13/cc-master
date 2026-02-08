// Dashboard SQLite database for historical data persistence.
// Uses bun:sqlite (built into Bun, zero deps).

import { Database } from "bun:sqlite";
import path from "path";
import { config } from "../config.ts";

const DB_PATH = path.join(config.jobsDir, "..", "dashboard.db");

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true });
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA synchronous=NORMAL");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_history (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      model TEXT NOT NULL,
      reasoning_effort TEXT NOT NULL,
      sandbox TEXT NOT NULL DEFAULT '',
      pipeline_stage TEXT,
      cwd TEXT,
      started_at TEXT,
      completed_at TEXT,
      elapsed_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      context_used_pct REAL,
      files_modified_count INTEGER,
      prompt_preview TEXT,
      summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      job_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      tool_name TEXT,
      file_path TEXT,
      data_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_job ON events(job_id);
    CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp);

    CREATE TABLE IF NOT EXISTS daily_metrics (
      date TEXT PRIMARY KEY,
      jobs_started INTEGER DEFAULT 0,
      jobs_completed INTEGER DEFAULT 0,
      jobs_failed INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_elapsed_ms INTEGER DEFAULT 0,
      files_modified_count INTEGER DEFAULT 0
    );
  `);
}

export interface JobHistoryRecord {
  id: string;
  status: string;
  model: string;
  reasoning_effort: string;
  sandbox: string;
  cwd: string;
  started_at: string | null;
  completed_at: string | null;
  elapsed_ms: number;
  input_tokens: number;
  output_tokens: number;
  context_used_pct: number;
  files_modified_count: number;
  prompt_preview: string;
  summary: string | null;
}

export function recordJobCompletion(job: {
  id: string;
  status: string;
  model: string;
  reasoning: string;
  cwd: string;
  started_at: string | null;
  completed_at: string | null;
  elapsed_ms: number;
  tokens: { input: number; output: number; context_used_pct: number } | null;
  files_modified: string[] | null;
  prompt: string;
  summary: string | null;
}) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Upsert job_history
  db.run(
    `INSERT OR REPLACE INTO job_history
     (id, status, model, reasoning_effort, cwd, started_at, completed_at,
      elapsed_ms, input_tokens, output_tokens, context_used_pct,
      files_modified_count, prompt_preview, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id,
      job.status,
      job.model,
      job.reasoning,
      job.cwd,
      job.started_at,
      job.completed_at,
      job.elapsed_ms,
      job.tokens?.input ?? 0,
      job.tokens?.output ?? 0,
      job.tokens?.context_used_pct ?? 0,
      job.files_modified?.length ?? 0,
      job.prompt.slice(0, 200),
      job.summary?.slice(0, 500) ?? null,
    ]
  );

  // Upsert daily_metrics
  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";
  db.run(
    `INSERT INTO daily_metrics (date, jobs_started, jobs_completed, jobs_failed,
       total_input_tokens, total_output_tokens, total_elapsed_ms, files_modified_count)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       jobs_started = jobs_started + 1,
       jobs_completed = jobs_completed + ?,
       jobs_failed = jobs_failed + ?,
       total_input_tokens = total_input_tokens + ?,
       total_output_tokens = total_output_tokens + ?,
       total_elapsed_ms = total_elapsed_ms + ?,
       files_modified_count = files_modified_count + ?`,
    [
      today,
      isCompleted ? 1 : 0,
      isFailed ? 1 : 0,
      job.tokens?.input ?? 0,
      job.tokens?.output ?? 0,
      job.elapsed_ms,
      job.files_modified?.length ?? 0,
      // ON CONFLICT values
      isCompleted ? 1 : 0,
      isFailed ? 1 : 0,
      job.tokens?.input ?? 0,
      job.tokens?.output ?? 0,
      job.elapsed_ms,
      job.files_modified?.length ?? 0,
    ]
  );
}

export function recordHookEvent(event: {
  timestamp: string;
  job_id: string;
  event_type: string;
  tool_name?: string;
  file_path?: string;
  data?: any;
}) {
  const db = getDb();
  db.run(
    `INSERT INTO events (timestamp, job_id, event_type, tool_name, file_path, data_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.timestamp,
      event.job_id,
      event.event_type,
      event.tool_name ?? null,
      event.file_path ?? null,
      event.data ? JSON.stringify(event.data) : null,
    ]
  );
}

export interface DailyMetric {
  date: string;
  jobs_started: number;
  jobs_completed: number;
  jobs_failed: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_elapsed_ms: number;
  files_modified_count: number;
}

export function getMetricsHistory(range: string = "7d"): DailyMetric[] {
  const db = getDb();
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  return db
    .query<DailyMetric, [string]>(
      `SELECT * FROM daily_metrics WHERE date >= ? ORDER BY date ASC`
    )
    .all(sinceStr);
}

export function getJobHistory(limit: number = 50): JobHistoryRecord[] {
  const db = getDb();
  return db
    .query<JobHistoryRecord, [number]>(
      `SELECT * FROM job_history ORDER BY completed_at DESC LIMIT ?`
    )
    .all(limit);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
