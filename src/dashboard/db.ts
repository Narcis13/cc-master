// Dashboard SQLite database for historical data persistence.
// Uses bun:sqlite (built into Bun, zero deps).

import { Database } from "bun:sqlite";
import path from "path";
import { config } from "../config.ts";
import orchestratorBus from "./event-bus.ts";

const DB_PATH = path.join(config.jobsDir, "..", "dashboard.db");

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH, { create: true });
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA synchronous=NORMAL");
    initSchema(db);
    // Seed preset modes on first run (must happen after schema init, uses the module-level db)
    seedPresetModes();
  }
  return db;
}

function initSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orchestrator_triggers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      condition TEXT NOT NULL,
      action TEXT NOT NULL,
      action_payload TEXT,
      autonomy TEXT NOT NULL DEFAULT 'confirm',
      enabled INTEGER NOT NULL DEFAULT 1,
      cooldown_seconds INTEGER DEFAULT 60,
      last_triggered TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orchestrator_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      details TEXT,
      trigger_id INTEGER,
      queue_task_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orchestrator_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_queue_status_priority
      ON orchestrator_queue(status, priority DESC, created_at ASC);

    CREATE TABLE IF NOT EXISTS job_history (
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

    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      name TEXT NOT NULL,
      is_error INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT,
      input_preview TEXT,
      output_preview TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tool_calls_job ON tool_calls(job_id);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_name ON tool_calls(name);

    CREATE TABLE IF NOT EXISTS job_subagents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      subagent_id TEXT NOT NULL,
      tool_call_count INTEGER DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_subagents_job ON job_subagents(job_id);

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

    CREATE TABLE IF NOT EXISTS orchestrator_modes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      trigger_config TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

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

// --- Database Explorer functions ---

export interface DbOverview {
  tables: {
    job_history: { count: number; columns: number };
    tool_calls: { count: number; columns: number };
    job_subagents: { count: number; columns: number };
    events: { count: number; columns: number };
    daily_metrics: { count: number; columns: number };
  };
  db_size_bytes: number;
  db_path: string;
  top_statuses: { status: string; count: number }[];
  top_tools: { name: string; count: number }[];
  top_event_types: { event_type: string; count: number }[];
  jobs_with_subagents: number;
  avg_subagents_per_job: number;
  metrics_date_range: { min: string | null; max: string | null };
  metrics_totals: { total_input_tokens: number; total_output_tokens: number; total_cost: number };
  daily_sparkline: { date: string; jobs_started: number }[];
}

export function getDbOverview(): DbOverview {
  const db = getDb();
  const fs = require("fs");

  const count = (table: string): number =>
    (db.query<{ c: number }, []>(`SELECT COUNT(*) as c FROM ${table}`).get() as any)?.c ?? 0;

  const jobCount = count("job_history");
  const toolCallCount = count("tool_calls");
  const subagentCount = count("job_subagents");
  const eventCount = count("events");
  const metricsCount = count("daily_metrics");

  const topStatuses = db
    .query<{ status: string; count: number }, []>(
      `SELECT status, COUNT(*) as count FROM job_history GROUP BY status ORDER BY count DESC`
    )
    .all();

  const topTools = db
    .query<{ name: string; count: number }, []>(
      `SELECT name, COUNT(*) as count FROM tool_calls GROUP BY name ORDER BY count DESC LIMIT 4`
    )
    .all();

  const topEventTypes = db
    .query<{ event_type: string; count: number }, []>(
      `SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type ORDER BY count DESC`
    )
    .all();

  const subagentStats = db
    .query<{ jobs_with: number; avg_per: number }, []>(
      `SELECT COUNT(DISTINCT job_id) as jobs_with,
              CAST(COUNT(*) AS REAL) / MAX(1, COUNT(DISTINCT job_id)) as avg_per
       FROM job_subagents`
    )
    .get() ?? { jobs_with: 0, avg_per: 0 };

  const dateRange = db
    .query<{ min: string | null; max: string | null }, []>(
      `SELECT MIN(date) as min, MAX(date) as max FROM daily_metrics`
    )
    .get() ?? { min: null, max: null };

  const totals = db
    .query<{ ti: number; tout: number }, []>(
      `SELECT COALESCE(SUM(total_input_tokens), 0) as ti,
              COALESCE(SUM(total_output_tokens), 0) as tout
       FROM daily_metrics`
    )
    .get() ?? { ti: 0, tout: 0 };

  // Rough cost estimate: opus pricing ($15/$75 per 1M tokens)
  const totalCost = (totals.ti / 1_000_000) * 15 + (totals.tout / 1_000_000) * 75;

  const sparkline = db
    .query<{ date: string; jobs_started: number }, []>(
      `SELECT date, jobs_started FROM daily_metrics ORDER BY date DESC LIMIT 30`
    )
    .all()
    .reverse();

  let dbSize = 0;
  try { dbSize = fs.statSync(DB_PATH).size; } catch {}

  return {
    tables: {
      job_history: { count: jobCount, columns: 26 },
      tool_calls: { count: toolCallCount, columns: 7 },
      job_subagents: { count: subagentCount, columns: 5 },
      events: { count: eventCount, columns: 7 },
      daily_metrics: { count: metricsCount, columns: 8 },
    },
    db_size_bytes: dbSize,
    db_path: DB_PATH,
    top_statuses: topStatuses,
    top_tools: topTools,
    top_event_types: topEventTypes,
    jobs_with_subagents: (subagentStats as any).jobs_with ?? 0,
    avg_subagents_per_job: Math.round(((subagentStats as any).avg_per ?? 0) * 10) / 10,
    metrics_date_range: dateRange as any,
    metrics_totals: { total_input_tokens: totals.ti, total_output_tokens: totals.tout, total_cost: Math.round(totalCost * 100) / 100 },
    daily_sparkline: sparkline,
  };
}

export interface JobHistoryFilters {
  status?: string;
  model?: string;
  reasoning?: string;
  cost_min?: number;
  cost_max?: number;
  since?: string;
  until?: string;
  has_session?: boolean;
  search?: string;
  search_mode?: "prompt" | "file" | "tool" | "summary";
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface JobHistoryFilteredResult {
  jobs: JobHistoryRecord[];
  total: number;
  page: number;
  limit: number;
  aggregate: { total_cost: number; total_input: number; total_output: number };
}

export function getJobHistoryFiltered(filters: JobHistoryFilters): JobHistoryFilteredResult {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.status) {
    conditions.push("jh.status = ?");
    params.push(filters.status);
  }
  if (filters.model) {
    conditions.push("jh.model = ?");
    params.push(filters.model);
  }
  if (filters.reasoning) {
    conditions.push("jh.reasoning_effort = ?");
    params.push(filters.reasoning);
  }
  if (filters.cost_min !== undefined) {
    conditions.push("jh.estimated_cost >= ?");
    params.push(filters.cost_min);
  }
  if (filters.cost_max !== undefined) {
    conditions.push("jh.estimated_cost <= ?");
    params.push(filters.cost_max);
  }
  if (filters.since) {
    conditions.push("(jh.completed_at >= ? OR jh.started_at >= ?)");
    params.push(filters.since, filters.since);
  }
  if (filters.until) {
    conditions.push("(jh.completed_at <= ? OR jh.started_at <= ?)");
    params.push(filters.until, filters.until);
  }
  if (filters.has_session !== undefined) {
    conditions.push("jh.has_session = ?");
    params.push(filters.has_session ? 1 : 0);
  }

  // Search handling
  if (filters.search) {
    const mode = filters.search_mode || "prompt";
    if (mode === "prompt") {
      conditions.push("jh.prompt LIKE ?");
      params.push(`%${filters.search}%`);
    } else if (mode === "summary") {
      conditions.push("jh.summary LIKE ?");
      params.push(`%${filters.search}%`);
    } else if (mode === "file") {
      conditions.push("EXISTS (SELECT 1 FROM json_each(jh.files_modified_json) je WHERE je.value LIKE ?)");
      params.push(`%${filters.search}%`);
    } else if (mode === "tool") {
      conditions.push("EXISTS (SELECT 1 FROM tool_calls tc WHERE tc.job_id = jh.id AND tc.name = ?)");
      params.push(filters.search);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Sort
  const validSorts: Record<string, string> = {
    completed_at: "jh.completed_at",
    started_at: "jh.started_at",
    estimated_cost: "jh.estimated_cost",
    input_tokens: "jh.input_tokens",
    output_tokens: "jh.output_tokens",
    elapsed_ms: "jh.elapsed_ms",
    tool_call_count: "jh.tool_call_count",
    files_modified_count: "jh.files_modified_count",
  };
  const sortCol = validSorts[filters.sort || "completed_at"] || "jh.completed_at";
  const sortOrder = filters.order === "asc" ? "ASC" : "DESC";

  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 50));
  const offset = (page - 1) * limit;

  // Count
  const countRow = db.query<{ c: number }, any[]>(`SELECT COUNT(*) as c FROM job_history jh ${where}`).get(...params);
  const total = (countRow as any)?.c ?? 0;

  // Aggregate
  const aggRow = db
    .query<{ tc: number; ti: number; tout: number }, any[]>(
      `SELECT COALESCE(SUM(jh.estimated_cost), 0) as tc,
              COALESCE(SUM(jh.input_tokens), 0) as ti,
              COALESCE(SUM(jh.output_tokens), 0) as tout
       FROM job_history jh ${where}`
    )
    .get(...params) ?? { tc: 0, ti: 0, tout: 0 };

  // Fetch
  const jobs = db
    .query<JobHistoryRecord, any[]>(
      `SELECT jh.* FROM job_history jh ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return {
    jobs,
    total,
    page,
    limit,
    aggregate: {
      total_cost: Math.round((aggRow as any).tc * 100) / 100,
      total_input: (aggRow as any).ti,
      total_output: (aggRow as any).tout,
    },
  };
}

export interface ToolStatsResult {
  by_tool: {
    name: string;
    total_calls: number;
    error_count: number;
    error_rate: number;
    avg_per_job: number;
    last_used: string | null;
  }[];
}

export function getToolStats(): ToolStatsResult {
  const db = getDb();
  const jobCount = (db.query<{ c: number }, []>(`SELECT COUNT(*) as c FROM job_history`).get() as any)?.c ?? 1;

  const rows = db
    .query<
      { name: string; total_calls: number; error_count: number; last_used: string | null },
      []
    >(
      `SELECT name,
              COUNT(*) as total_calls,
              SUM(is_error) as error_count,
              MAX(timestamp) as last_used
       FROM tool_calls
       GROUP BY name
       ORDER BY total_calls DESC`
    )
    .all();

  return {
    by_tool: rows.map((r) => ({
      name: r.name,
      total_calls: r.total_calls,
      error_count: r.error_count,
      error_rate: r.total_calls > 0 ? Math.round((r.error_count / r.total_calls) * 1000) / 10 : 0,
      avg_per_job: Math.round((r.total_calls / jobCount) * 10) / 10,
      last_used: r.last_used,
    })),
  };
}

export interface ToolCallsFilters {
  tool?: string;
  is_error?: boolean;
  job_id?: string;
  page?: number;
  limit?: number;
}

export function getToolCallsFiltered(filters: ToolCallsFilters): { tool_calls: ToolCallRecord[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.tool) {
    conditions.push("name = ?");
    params.push(filters.tool);
  }
  if (filters.is_error !== undefined) {
    conditions.push("is_error = ?");
    params.push(filters.is_error ? 1 : 0);
  }
  if (filters.job_id) {
    conditions.push("job_id = ?");
    params.push(filters.job_id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 50));
  const offset = (page - 1) * limit;

  const countRow = db.query<{ c: number }, any[]>(`SELECT COUNT(*) as c FROM tool_calls ${where}`).get(...params);
  const total = (countRow as any)?.c ?? 0;

  const rows = db
    .query<ToolCallRecord, any[]>(
      `SELECT * FROM tool_calls ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return { tool_calls: rows, total };
}

export interface EventsFilters {
  job_id?: string;
  event_type?: string;
  tool_name?: string;
  file_path?: string;
  page?: number;
  limit?: number;
}

export interface EventRecord {
  id: number;
  timestamp: string;
  job_id: string;
  event_type: string;
  tool_name: string | null;
  file_path: string | null;
  data_json: string | null;
}

export function getEventsFiltered(filters: EventsFilters): {
  events: EventRecord[];
  total: number;
  stats: { by_type: Record<string, number> };
} {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.job_id) {
    conditions.push("job_id = ?");
    params.push(filters.job_id);
  }
  if (filters.event_type) {
    conditions.push("event_type = ?");
    params.push(filters.event_type);
  }
  if (filters.tool_name) {
    conditions.push("tool_name = ?");
    params.push(filters.tool_name);
  }
  if (filters.file_path) {
    conditions.push("file_path LIKE ?");
    params.push(`%${filters.file_path}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 50));
  const offset = (page - 1) * limit;

  const countRow = db.query<{ c: number }, any[]>(`SELECT COUNT(*) as c FROM events ${where}`).get(...params);
  const total = (countRow as any)?.c ?? 0;

  const rows = db
    .query<EventRecord, any[]>(
      `SELECT * FROM events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  // Stats: event type counts (unfiltered)
  const typeStats = db
    .query<{ event_type: string; count: number }, []>(
      `SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type`
    )
    .all();
  const byType: Record<string, number> = {};
  for (const t of typeStats) byType[t.event_type] = t.count;

  return { events: rows, total, stats: { by_type: byType } };
}

export interface AnalyticsResult {
  headline: {
    jobs_started: number;
    jobs_completed: number;
    jobs_failed: number;
    total_cost: number;
    total_tokens: number;
  };
  daily: DailyMetric[];
  by_model: { model: string; reasoning: string; count: number; cost: number }[];
  by_cwd: { cwd: string; count: number }[];
  avg_duration_by_day: { date: string; avg_ms: number }[];
  success_rate_by_day: { date: string; rate: number }[];
}

export function getAnalytics(range: string = "7d"): AnalyticsResult {
  const db = getDb();
  const days = range === "all" ? 36500 : range === "90d" ? 90 : range === "30d" ? 30 : 7;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  // Daily metrics
  const daily = db
    .query<DailyMetric, [string]>(
      `SELECT * FROM daily_metrics WHERE date >= ? ORDER BY date ASC`
    )
    .all(sinceStr);

  // Headline from daily
  let totalStarted = 0, totalCompleted = 0, totalFailed = 0, totalInput = 0, totalOutput = 0;
  for (const d of daily) {
    totalStarted += d.jobs_started;
    totalCompleted += d.jobs_completed;
    totalFailed += d.jobs_failed;
    totalInput += d.total_input_tokens;
    totalOutput += d.total_output_tokens;
  }
  const totalCost = (totalInput / 1_000_000) * 15 + (totalOutput / 1_000_000) * 75;

  // By model
  const byModel = db
    .query<{ model: string; reasoning: string; count: number; cost: number }, [string, string]>(
      `SELECT model, reasoning_effort as reasoning, COUNT(*) as count,
              COALESCE(SUM(estimated_cost), 0) as cost
       FROM job_history
       WHERE (completed_at >= ? OR started_at >= ?)
       GROUP BY model, reasoning_effort
       ORDER BY count DESC`
    )
    .all(sinceStr, sinceStr);

  // By cwd
  const byCwd = db
    .query<{ cwd: string; count: number }, [string, string]>(
      `SELECT cwd, COUNT(*) as count FROM job_history
       WHERE (completed_at >= ? OR started_at >= ?)
       GROUP BY cwd ORDER BY count DESC LIMIT 10`
    )
    .all(sinceStr, sinceStr);

  // Avg duration by day
  const avgDuration = db
    .query<{ date: string; avg_ms: number }, [string]>(
      `SELECT date(completed_at) as date,
              AVG(elapsed_ms) as avg_ms
       FROM job_history
       WHERE completed_at >= ? AND status = 'completed'
       GROUP BY date(completed_at)
       ORDER BY date ASC`
    )
    .all(sinceStr);

  // Success rate by day
  const successRate = daily.map((d) => {
    const total = d.jobs_completed + d.jobs_failed;
    return {
      date: d.date,
      rate: total > 0 ? Math.round((d.jobs_completed / total) * 1000) / 10 : 100,
    };
  });

  return {
    headline: {
      jobs_started: totalStarted,
      jobs_completed: totalCompleted,
      jobs_failed: totalFailed,
      total_cost: Math.round(totalCost * 100) / 100,
      total_tokens: totalInput + totalOutput,
    },
    daily,
    by_model: byModel,
    by_cwd: byCwd,
    avg_duration_by_day: avgDuration,
    success_rate_by_day: successRate,
  };
}

// --- Orchestrator Queue functions ---

export interface QueueTask {
  id: number;
  prompt: string;
  priority: number;
  status: string;
  metadata: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export function addQueueTask(opts: { prompt: string; priority?: number; metadata?: Record<string, any> }): number {
  const db = getDb();
  const result = db.run(
    `INSERT INTO orchestrator_queue (prompt, priority, metadata) VALUES (?, ?, ?)`,
    [opts.prompt, opts.priority ?? 0, opts.metadata ? JSON.stringify(opts.metadata) : null]
  );
  const id = Number(result.lastInsertRowid);
  const task = db.query<QueueTask, [number]>(`SELECT * FROM orchestrator_queue WHERE id = ?`).get(id);
  if (task) {
    orchestratorBus.emit("state_event", { type: "queue_update", task, operation: "added" });
  }
  return id;
}

export function getQueueTasks(status?: string): QueueTask[] {
  const db = getDb();
  if (status) {
    return db
      .query<QueueTask, [string]>(
        `SELECT * FROM orchestrator_queue WHERE status = ? ORDER BY priority DESC, created_at ASC`
      )
      .all(status);
  }
  return db
    .query<QueueTask, []>(
      `SELECT * FROM orchestrator_queue ORDER BY priority DESC, created_at ASC`
    )
    .all();
}

export function getNextPendingTask(): QueueTask | null {
  const db = getDb();
  return db
    .query<QueueTask, []>(
      `SELECT * FROM orchestrator_queue WHERE status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 1`
    )
    .get() ?? null;
}

export function updateQueueTask(id: number, updates: { status?: string; started_at?: string; completed_at?: string }): boolean {
  const db = getDb();
  const sets: string[] = [];
  const params: any[] = [];
  if (updates.status !== undefined) { sets.push("status = ?"); params.push(updates.status); }
  if (updates.started_at !== undefined) { sets.push("started_at = ?"); params.push(updates.started_at); }
  if (updates.completed_at !== undefined) { sets.push("completed_at = ?"); params.push(updates.completed_at); }
  if (sets.length === 0) return false;
  params.push(id);
  const result = db.run(`UPDATE orchestrator_queue SET ${sets.join(", ")} WHERE id = ?`, params);
  if (result.changes > 0) {
    const task = db.query<QueueTask, [number]>(`SELECT * FROM orchestrator_queue WHERE id = ?`).get(id);
    if (task) {
      orchestratorBus.emit("state_event", { type: "queue_update", task, operation: "status_changed" });
    }
  }
  return result.changes > 0;
}

export function removeQueueTask(id: number): boolean {
  const db = getDb();
  const task = db.query<QueueTask, [number]>(`SELECT * FROM orchestrator_queue WHERE id = ?`).get(id);
  const result = db.run(`DELETE FROM orchestrator_queue WHERE id = ?`, [id]);
  if (result.changes > 0 && task) {
    orchestratorBus.emit("state_event", { type: "queue_update", task, operation: "removed" });
  }
  return result.changes > 0;
}

export function getQueueDepth(): number {
  const db = getDb();
  const row = db.query<{ c: number }, []>(`SELECT COUNT(*) as c FROM orchestrator_queue WHERE status = 'pending'`).get();
  return (row as any)?.c ?? 0;
}

// --- Orchestrator Trigger functions ---

export interface TriggerRecord {
  id: number;
  name: string;
  type: string;
  condition: string;
  action: string;
  action_payload: string | null;
  autonomy: string;
  enabled: number;
  cooldown_seconds: number;
  last_triggered: string | null;
  created_at: string;
}

export function addTrigger(opts: {
  name: string;
  type: string;
  condition: string;
  action: string;
  action_payload?: string;
  autonomy?: string;
  cooldown_seconds?: number;
}): number {
  const db = getDb();
  const result = db.run(
    `INSERT INTO orchestrator_triggers (name, type, condition, action, action_payload, autonomy, cooldown_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.name,
      opts.type,
      opts.condition,
      opts.action,
      opts.action_payload ?? null,
      opts.autonomy ?? "confirm",
      opts.cooldown_seconds ?? 60,
    ]
  );
  return Number(result.lastInsertRowid);
}

export function getTriggers(enabledOnly?: boolean): TriggerRecord[] {
  const db = getDb();
  if (enabledOnly) {
    return db
      .query<TriggerRecord, []>(
        `SELECT * FROM orchestrator_triggers WHERE enabled = 1 ORDER BY id ASC`
      )
      .all();
  }
  return db
    .query<TriggerRecord, []>(
      `SELECT * FROM orchestrator_triggers ORDER BY id ASC`
    )
    .all();
}

export function getTriggerById(id: number): TriggerRecord | null {
  const db = getDb();
  return db
    .query<TriggerRecord, [number]>(
      `SELECT * FROM orchestrator_triggers WHERE id = ?`
    )
    .get(id) ?? null;
}

export function updateTrigger(id: number, updates: Partial<{
  name: string;
  type: string;
  condition: string;
  action: string;
  action_payload: string | null;
  autonomy: string;
  enabled: number;
  cooldown_seconds: number;
  last_triggered: string;
}>): boolean {
  const db = getDb();
  const sets: string[] = [];
  const params: any[] = [];

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      sets.push(`${key} = ?`);
      params.push(val);
    }
  }
  if (sets.length === 0) return false;
  params.push(id);
  const result = db.run(
    `UPDATE orchestrator_triggers SET ${sets.join(", ")} WHERE id = ?`,
    params
  );
  return result.changes > 0;
}

export function removeTrigger(id: number): boolean {
  const db = getDb();
  const result = db.run(`DELETE FROM orchestrator_triggers WHERE id = ?`, [id]);
  return result.changes > 0;
}

export function toggleTrigger(id: number): boolean {
  const db = getDb();
  const result = db.run(
    `UPDATE orchestrator_triggers SET enabled = CASE WHEN enabled = 1 THEN 0 ELSE 1 END WHERE id = ?`,
    [id]
  );
  return result.changes > 0;
}

export function disableAllTriggers(): void {
  const db = getDb();
  db.run(`UPDATE orchestrator_triggers SET enabled = 0`);
}

export function deleteAllTriggers(): void {
  const db = getDb();
  db.run(`DELETE FROM orchestrator_triggers`);
}

// --- Orchestrator Activity Log ---

export interface ActivityRecord {
  id: number;
  action: string;
  details: string | null;
  trigger_id: number | null;
  queue_task_id: number | null;
  created_at: string;
}

export function logActivity(opts: {
  action: string;
  details?: Record<string, any>;
  trigger_id?: number;
  queue_task_id?: number;
}): void {
  const db = getDb();
  db.run(
    `INSERT INTO orchestrator_activity (action, details, trigger_id, queue_task_id)
     VALUES (?, ?, ?, ?)`,
    [
      opts.action,
      opts.details ? JSON.stringify(opts.details) : null,
      opts.trigger_id ?? null,
      opts.queue_task_id ?? null,
    ]
  );
}

export function getActivityLog(limit: number = 50): ActivityRecord[] {
  const db = getDb();
  return db
    .query<ActivityRecord, [number]>(
      `SELECT * FROM orchestrator_activity ORDER BY id DESC LIMIT ?`
    )
    .all(limit);
}

// --- Orchestrator Modes ---

export interface ModeRecord {
  id: number;
  name: string;
  description: string | null;
  trigger_config: string;
  is_active: number;
  created_at: string;
}

export function getModes(): ModeRecord[] {
  const db = getDb();
  return db
    .query<ModeRecord, []>(`SELECT * FROM orchestrator_modes ORDER BY name ASC`)
    .all();
}

export function getModeById(id: number): ModeRecord | null {
  const db = getDb();
  return db
    .query<ModeRecord, [number]>(`SELECT * FROM orchestrator_modes WHERE id = ?`)
    .get(id) ?? null;
}

export function getModeByName(name: string): ModeRecord | null {
  const db = getDb();
  return db
    .query<ModeRecord, [string]>(`SELECT * FROM orchestrator_modes WHERE name = ?`)
    .get(name) ?? null;
}

export function createMode(opts: {
  name: string;
  description?: string;
  trigger_config: string;
}): number {
  const db = getDb();
  const result = db.run(
    `INSERT INTO orchestrator_modes (name, description, trigger_config) VALUES (?, ?, ?)`,
    [opts.name, opts.description ?? null, opts.trigger_config]
  );
  return Number(result.lastInsertRowid);
}

export function deleteMode(id: number): boolean {
  const db = getDb();
  const result = db.run(`DELETE FROM orchestrator_modes WHERE id = ?`, [id]);
  return result.changes > 0;
}

export function getActiveMode(): ModeRecord | null {
  const db = getDb();
  return db
    .query<ModeRecord, []>(`SELECT * FROM orchestrator_modes WHERE is_active = 1 LIMIT 1`)
    .get() ?? null;
}

export function activateMode(id: number): boolean {
  const db = getDb();
  const mode = getModeById(id);
  if (!mode) return false;

  const triggers: Array<{
    name: string;
    type: string;
    condition: string;
    action: string;
    action_payload?: string;
    autonomy?: string;
    cooldown_seconds?: number;
  }> = JSON.parse(mode.trigger_config);

  // Clear existing triggers and install mode's triggers
  deleteAllTriggers();
  for (const t of triggers) {
    addTrigger({
      name: t.name,
      type: t.type,
      condition: t.condition,
      action: t.action,
      action_payload: t.action_payload,
      autonomy: t.autonomy,
      cooldown_seconds: t.cooldown_seconds,
    });
  }

  // Set this mode as active, deactivate all others
  db.run(`UPDATE orchestrator_modes SET is_active = 0`);
  db.run(`UPDATE orchestrator_modes SET is_active = 1 WHERE id = ?`, [id]);

  logActivity({
    action: "mode_activated",
    details: { mode_name: mode.name, trigger_count: triggers.length },
  });

  return true;
}

export function deactivateAllModes(): void {
  const db = getDb();
  db.run(`UPDATE orchestrator_modes SET is_active = 0`);
}

export function seedPresetModes(): void {
  const db = getDb();
  const count = (db.query<{ c: number }, []>(
    `SELECT COUNT(*) as c FROM orchestrator_modes`
  ).get() as any)?.c ?? 0;

  if (count > 0) return; // Already seeded

  const presets = [
    {
      name: "dev",
      description: "Development mode: queue check every 15min, health report every 30min",
      trigger_config: JSON.stringify([
        { name: "dev-queue-check", type: "cron", condition: "*/15 * * * *", action: "inject_prompt", action_payload: '{"prompt":"Check the queue for pending tasks and process any that are waiting."}', autonomy: "auto", cooldown_seconds: 60 },
        { name: "dev-health-report", type: "cron", condition: "*/30 * * * *", action: "inject_prompt", action_payload: '{"prompt":"Generate a brief health report: active agents, queue depth, context usage."}', autonomy: "auto", cooldown_seconds: 60 },
      ]),
    },
    {
      name: "maintenance",
      description: "Maintenance mode: nightly cleanup at 2am, weekly audit Monday 8am",
      trigger_config: JSON.stringify([
        { name: "maint-nightly-cleanup", type: "cron", condition: "0 2 * * *", action: "inject_prompt", action_payload: '{"prompt":"Run nightly maintenance: clean old jobs, check disk usage, verify system health."}', autonomy: "confirm", cooldown_seconds: 3600 },
        { name: "maint-weekly-audit", type: "cron", condition: "0 8 * * 1", action: "inject_prompt", action_payload: '{"prompt":"Run weekly audit: review completed jobs, summarize costs, identify patterns."}', autonomy: "confirm", cooldown_seconds: 3600 },
      ]),
    },
    {
      name: "sprint",
      description: "Sprint mode: aggressive queue processing every 5min, low-capacity alert",
      trigger_config: JSON.stringify([
        { name: "sprint-queue-check", type: "cron", condition: "*/5 * * * *", action: "inject_prompt", action_payload: '{"prompt":"Check queue immediately and process all pending tasks with high priority."}', autonomy: "auto", cooldown_seconds: 30 },
        { name: "sprint-low-capacity", type: "threshold", condition: "active_agents < 2", action: "inject_prompt", action_payload: '{"prompt":"Low agent count detected. Check queue for tasks and spawn more agents if work is available."}', autonomy: "auto", cooldown_seconds: 120 },
        { name: "sprint-high-queue", type: "threshold", condition: "queue_depth >= 5", action: "notify", action_payload: '{"message":"Queue depth is high (5+). Consider scaling or prioritizing."}', autonomy: "auto", cooldown_seconds: 300 },
      ]),
    },
  ];

  for (const preset of presets) {
    db.run(
      `INSERT INTO orchestrator_modes (name, description, trigger_config) VALUES (?, ?, ?)`,
      [preset.name, preset.description, preset.trigger_config]
    );
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export { truncatePreview };
