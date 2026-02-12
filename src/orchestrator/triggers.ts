// Trigger Engine — evaluate conditions and fire actions
// Supports cron, event, and threshold trigger types

import { randomUUID } from "crypto";
import {
  getTriggers,
  updateTrigger,
  logActivity,
  addQueueTask,
  getQueueDepth,
  type TriggerRecord,
} from "../dashboard/db.ts";
import {
  injectToOrchestrator,
  startOrchestrator,
  getOrchestratorStatus,
} from "../orchestrator.ts";
import { listJobs } from "../jobs.ts";

// --- Pending Approvals (in-memory, ephemeral) ---

export interface PendingApproval {
  id: string;
  trigger_id: number;
  trigger_name: string;
  action: string;
  action_payload: any;
  created_at: string;
}

const pendingApprovals: PendingApproval[] = [];

export function getPendingApprovals(): PendingApproval[] {
  return [...pendingApprovals];
}

export function approveAction(approvalId: string): boolean {
  const idx = pendingApprovals.findIndex((a) => a.id === approvalId);
  if (idx === -1) return false;

  const approval = pendingApprovals.splice(idx, 1)[0];
  executeAction(approval.action, approval.action_payload, approval.trigger_id);
  logActivity({
    action: "approval_approved",
    details: { approval_id: approval.id, trigger_name: approval.trigger_name, action: approval.action },
    trigger_id: approval.trigger_id,
  });
  return true;
}

export function rejectAction(approvalId: string): boolean {
  const idx = pendingApprovals.findIndex((a) => a.id === approvalId);
  if (idx === -1) return false;

  const approval = pendingApprovals.splice(idx, 1)[0];
  logActivity({
    action: "approval_rejected",
    details: { approval_id: approval.id, trigger_name: approval.trigger_name },
    trigger_id: approval.trigger_id,
  });
  return true;
}

// --- Cron Matching ---

function matchCronField(field: string, value: number): boolean {
  if (field === "*") return true;

  // */N — every N
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // Comma-separated values: 1,5,10
  const parts = field.split(",");
  for (const part of parts) {
    // Range: 1-5
    if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number);
      if (value >= lo && value <= hi) return true;
    } else {
      if (parseInt(part, 10) === value) return true;
    }
  }

  return false;
}

export function matchesCron(cronExpr: string, date: Date = new Date()): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return (
    matchCronField(minute, date.getMinutes()) &&
    matchCronField(hour, date.getHours()) &&
    matchCronField(dayOfMonth, date.getDate()) &&
    matchCronField(month, date.getMonth() + 1) &&
    matchCronField(dayOfWeek, date.getDay())
  );
}

// --- Threshold Evaluation ---

function getMetricValue(metric: string): number | null {
  switch (metric) {
    case "context_used_pct": {
      const status = getOrchestratorStatus();
      return status.contextPct ?? null;
    }
    case "queue_depth":
      return getQueueDepth();
    case "active_agents": {
      const jobs = listJobs();
      return jobs.filter((j) => j.status === "running").length;
    }
    default:
      return null;
  }
}

function evaluateThreshold(condition: string): boolean {
  // Format: "metric op value" e.g. "queue_depth >= 5"
  const match = condition.match(/^(\w+)\s*(>=|<=|>|<|==|!=)\s*(\d+(?:\.\d+)?)$/);
  if (!match) return false;

  const [, metric, op, rawVal] = match;
  const actual = getMetricValue(metric);
  if (actual === null) return false;

  const target = parseFloat(rawVal);
  switch (op) {
    case ">=": return actual >= target;
    case "<=": return actual <= target;
    case ">":  return actual > target;
    case "<":  return actual < target;
    case "==": return actual === target;
    case "!=": return actual !== target;
    default:   return false;
  }
}

// --- Action Execution ---

function parsePayload(raw: string | null): any {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function executeAction(action: string, payloadRaw: any, triggerId?: number): void {
  const payload = typeof payloadRaw === "string" ? parsePayload(payloadRaw) : (payloadRaw ?? {});

  switch (action) {
    case "inject_prompt": {
      if (payload.prompt) {
        injectToOrchestrator(payload.prompt);
      }
      break;
    }
    case "clear_context": {
      // Imported dynamically to avoid circular dependency
      const { clearJobContext } = require("../jobs.ts");
      clearJobContext("orch");
      break;
    }
    case "start_orchestrator": {
      startOrchestrator({ model: payload.model, reasoning: payload.reasoning });
      break;
    }
    case "queue_task": {
      if (payload.prompt) {
        addQueueTask({ prompt: payload.prompt, priority: payload.priority });
      }
      break;
    }
    case "notify": {
      // Notification is handled by the caller emitting SSE events
      break;
    }
  }

  logActivity({
    action: "trigger_fired",
    details: { action, payload, trigger_id: triggerId },
    trigger_id: triggerId,
  });
}

// --- Cooldown Check ---

function isCoolingDown(trigger: TriggerRecord): boolean {
  if (!trigger.last_triggered) return false;
  const lastTime = new Date(trigger.last_triggered).getTime();
  const cooldownMs = (trigger.cooldown_seconds ?? 60) * 1000;
  return Date.now() - lastTime < cooldownMs;
}

function fireTrigger(trigger: TriggerRecord): void {
  // Update last_triggered
  updateTrigger(trigger.id, { last_triggered: new Date().toISOString() });

  if (trigger.autonomy === "auto") {
    executeAction(trigger.action, trigger.action_payload, trigger.id);
  } else {
    // Add to pending approvals
    const approval: PendingApproval = {
      id: randomUUID(),
      trigger_id: trigger.id,
      trigger_name: trigger.name,
      action: trigger.action,
      action_payload: parsePayload(trigger.action_payload),
      created_at: new Date().toISOString(),
    };
    pendingApprovals.push(approval);
    logActivity({
      action: "approval_required",
      details: { trigger_name: trigger.name, approval_id: approval.id },
      trigger_id: trigger.id,
    });
  }
}

// --- Public Evaluation Functions ---

export function evaluateCronTriggers(): void {
  const triggers = getTriggers(true);
  const now = new Date();

  for (const t of triggers) {
    if (t.type !== "cron") continue;
    if (isCoolingDown(t)) continue;
    if (matchesCron(t.condition, now)) {
      fireTrigger(t);
    }
  }
}

export function evaluateThresholdTriggers(): void {
  const triggers = getTriggers(true);

  for (const t of triggers) {
    if (t.type !== "threshold") continue;
    if (isCoolingDown(t)) continue;
    if (evaluateThreshold(t.condition)) {
      fireTrigger(t);
    }
  }
}

export function evaluateEventTriggers(eventName: string): void {
  const triggers = getTriggers(true);

  for (const t of triggers) {
    if (t.type !== "event") continue;
    if (isCoolingDown(t)) continue;
    if (t.condition === eventName) {
      fireTrigger(t);
    }
  }
}
