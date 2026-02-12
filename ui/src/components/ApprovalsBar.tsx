import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { formatRelativeTime } from "../lib/format";

interface PendingApproval {
  id: string;
  trigger_id: number;
  trigger_name: string;
  action: string;
  action_payload: any;
  created_at: string;
}

export function ApprovalsBar() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const fetchApprovals = async () => {
    try {
      const res = await fetch("/api/triggers/approvals");
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchApprovals();
    const iv = setInterval(fetchApprovals, 3000);
    return () => clearInterval(iv);
  }, []);

  const approve = async (id: string) => {
    setActingOn(id);
    try {
      await fetch(`/api/triggers/approvals/${id}/approve`, { method: "POST" });
      fetchApprovals();
    } finally {
      setActingOn(null);
    }
  };

  const reject = async (id: string) => {
    setActingOn(id);
    try {
      await fetch(`/api/triggers/approvals/${id}/reject`, { method: "POST" });
      fetchApprovals();
    } finally {
      setActingOn(null);
    }
  };

  if (approvals.length === 0) return null;

  const formatPayload = (a: PendingApproval): string => {
    if (!a.action_payload) return "";
    try {
      const p = typeof a.action_payload === "string" ? JSON.parse(a.action_payload) : a.action_payload;
      if (p.prompt) return p.prompt;
      if (p.message) return p.message;
      return JSON.stringify(p);
    } catch {
      return String(a.action_payload);
    }
  };

  return (
    <div class="approvals-bar">
      <div class="approvals-header">
        <span class="approvals-icon" />
        <span class="approvals-title">Pending Approvals ({approvals.length})</span>
      </div>
      <div class="approvals-list">
        {approvals.map((a) => (
          <div key={a.id} class="approval-item">
            <div class="approval-info">
              <span class="approval-trigger">{a.trigger_name}</span>
              <span class="approval-action">
                <span class="config-tag config-tag--action">{a.action.replace(/_/g, " ")}</span>
              </span>
              {formatPayload(a) && (
                <span class="approval-payload">{formatPayload(a)}</span>
              )}
              <span class="config-time">{formatRelativeTime(a.created_at)}</span>
            </div>
            <div class="approval-actions">
              <button
                class="btn btn--primary btn--sm"
                onClick={() => approve(a.id)}
                disabled={actingOn === a.id}
              >
                Approve
              </button>
              <button
                class="btn btn--danger-outline btn--sm"
                onClick={() => reject(a.id)}
                disabled={actingOn === a.id}
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
