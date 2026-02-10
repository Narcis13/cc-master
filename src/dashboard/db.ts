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
  // Drop and recreate job_history, tool_calls, job_subagents for clean schema.
  // events and daily_metrics are preserved (no schema changes).
  db.exec(`
    DROP TABLE IF EXISTS job_history;
    DROP TABLE IF EXISTS tool_calls;
    DROP TABLE IF EXISTS job_subagents;

    CREATE TABLE job_history (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      model TEXT NOT NULL,
      reasoning_effort TEXT NOT NULL,
      cwd TEXT,
      prompt TEXT,
      summary TEXT,
      session_id TEXT,
      started_at TEXT,
      completed_at TEXT,
      elapsed_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      context_used_pct REAL,
      context_window INTEGER,
      estimated_cost REAL,
      tool_call_count INTEGER,
      failed_tool_calls INTEGER,
      primary_tool TEXT,
      files_modified_count INTEGER,
      files_modified_json TEXT,
      message_count INTEGER,
      user_message_count INTEGER,
      has_session INTEGER DEFAULT 0,
      reuse_count INTEGER DEFAULT 0,
      original_prompt TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_error INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT,
      input_preview TEXT,
      output_preview TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_tool_calls_job ON tool_calls(job_id);
    CREATE INDEX idx_tool_calls_name ON tool_calls(name);

    CREATE TABLE job_subagents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      subagent_id TEXT NOT NULL,
      tool_call_count INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_subagents_job ON job_subagents(job_id);

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
  cwd: string;
  prompt: string;
  summary: string | null;
  session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  elapsed_ms: number;
  input_tokens: number;
  output_tokens: number;
  context_used_pct: number;
  context_window: number;
  estimated_cost: number | null;
  tool_call_count: number;
  failed_tool_calls: number;
  primary_tool: string | null;
  files_modified_count: number;
  files_modified_json: string | null;
  message_count: number;
  user_message_count: number;
  has_session: number;
  reuse_count: number;
  original_prompt: string | null;
}

export interface ToolCallRecord {
  id: number;
  job_id: string;
  name: string;
  is_error: number;
  timestamp: string | null;
  input_preview: string | null;
  output_preview: string | null;
}

export interface SubagentRecord {
  id: number;
  job_id: string;
  subagent_id: string;
  tool_call_count: number;
  message_count: number;
}

function truncatePreview(value: unknown, maxLen: number = 500): string | null {
  if (value === null || value === undefined) return null;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

export function recordJobCompletion(job: {
  id: string;
  status: string;
  model: string;
  reasoning: string;
  cwd: string;
  prompt: string;
  summary: string | null;
  session_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  elapsed_ms: number;
  tokens: { input: number; output: number; context_used_pct: number; context_window: number } | null;
  estimated_cost: number | null;
  tool_call_count: number | null;
  failed_tool_calls: number | null;
  primary_tool: string | null;
  files_modified: string[] | null;
  message_count: number | null;
  user_message_count: number | null;
  has_session: boolean;
  reuse_count: number;
  original_prompt: string | null;
  tool_calls: Array<{
    name: string;
    is_error: boolean;
    timestamp: string | null;
    input_preview: string | null;
    output_preview: string | null;
  }>;
  subagents: Array<{
    id: string;
    tool_call_count: number;
    message_count: number;
  }>;
}) {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // Upsert job_history
  db.run(
    `INSERT OR REPLACE INTO job_history
     (id, status, model, reasoning_effort, cwd, prompt, summary, session_id,
      started_at, completed_at, elapsed_ms,
      input_tokens, output_tokens, context_used_pct, context_window,
      estimated_cost, tool_call_count, failed_tool_calls, primary_tool,
      files_modified_count, files_modified_json,
      message_count, user_message_count, has_session,
      reuse_count, original_prompt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job.id,
      job.status,
      job.model,
      job.reasoning,
      job.cwd,
      job.prompt,
      job.summary,
      job.session_id,
      job.started_at,
      job.completed_at,
      job.elapsed_ms,
      job.tokens?.input ?? 0,
      job.tokens?.output ?? 0,
      job.tokens?.context_used_pct ?? 0,
      job.tokens?.context_window ?? 0,
      job.estimated_cost,
      job.tool_call_count ?? 0,
      job.failed_tool_calls ?? 0,
      job.primary_tool,
      job.files_modified?.length ?? 0,
      job.files_modified ? JSON.stringify(job.files_modified) : null,
      job.message_count ?? 0,
      job.user_message_count ?? 0,
      job.has_session ? 1 : 0,
      job.reuse_count,
      job.original_prompt,
    ]
  );

  // Persist tool_calls: clear previous rows for this job, then bulk insert
  db.run(`DELETE FROM tool_calls WHERE job_id = ?`, [job.id]);
  if (job.tool_calls.length > 0) {
    const stmt = db.prepare(
      `INSERT INTO tool_calls (job_id, name, is_error, timestamp, input_preview, output_preview)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const tc of job.tool_calls) {
      stmt.run(job.id, tc.name, tc.is_error ? 1 : 0, tc.timestamp, tc.input_preview, tc.output_preview);
    }
  }

  // Persist subagents: clear previous rows for this job, then bulk insert
  db.run(`DELETE FROM job_subagents WHERE job_id = ?`, [job.id]);
  if (job.subagents.length > 0) {
    const stmt = db.prepare(
      `INSERT INTO job_subagents (job_id, subagent_id, tool_call_count, message_count)
       VALUES (?, ?, ?, ?)`
    );
    for (const sa of job.subagents) {
      stmt.run(job.id, sa.id, sa.tool_call_count, sa.message_count);
    }
  }

  // Upsert daily_metrics (unchanged logic)
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

export function getJobToolCalls(jobId: string): ToolCallRecord[] {
  const db = getDb();
  return db
    .query<ToolCallRecord, [string]>(
      `SELECT * FROM tool_calls WHERE job_id = ? ORDER BY id ASC`
    )
    .all(jobId);
}

export function getJobSubagents(jobId: string): SubagentRecord[] {
  const db = getDb();
  return db
    .query<SubagentRecord, [string]>(
      `SELECT * FROM job_subagents WHERE job_id = ? ORDER BY id ASC`
    )
    .all(jobId);
}

export function searchJobsByFile(filePath: string): JobHistoryRecord[] {
  const db = getDb();
  return db
    .query<JobHistoryRecord, [string]>(
      `SELECT jh.* FROM job_history jh, json_each(jh.files_modified_json) je
       WHERE je.value LIKE ?
       ORDER BY jh.completed_at DESC`
    )
    .all(`%${filePath}%`);
}

export function searchJobsByTool(toolName: string): JobHistoryRecord[] {
  const db = getDb();
  return db
    .query<JobHistoryRecord, [string]>(
      `SELECT DISTINCT jh.* FROM job_history jh
       JOIN tool_calls tc ON tc.job_id = jh.id
       WHERE tc.name = ?
       ORDER BY jh.completed_at DESC`
    )
    .all(toolName);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export { truncatePreview };
