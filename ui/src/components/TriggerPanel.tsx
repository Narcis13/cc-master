import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { formatRelativeTime } from "../lib/format";
import { showToast } from "./Toast";

interface TriggerRecord {
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

const TRIGGER_TYPES = ["cron", "event", "threshold"] as const;
const ACTION_TYPES = ["inject_prompt", "clear_context", "start_orchestrator", "queue_task", "notify"] as const;
const AUTONOMY_OPTIONS = ["auto", "confirm"] as const;

export function TriggerPanel({ eventVersion = 0 }: { eventVersion?: number } = {}) {
  const [triggers, setTriggers] = useState<TriggerRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Add form state
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("cron");
  const [condition, setCondition] = useState("");
  const [action, setAction] = useState<string>("inject_prompt");
  const [payload, setPayload] = useState("");
  const [autonomy, setAutonomy] = useState<string>("confirm");
  const [cooldown, setCooldown] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("cron");
  const [editCondition, setEditCondition] = useState("");
  const [editAction, setEditAction] = useState("inject_prompt");
  const [editPayload, setEditPayload] = useState("");
  const [editAutonomy, setEditAutonomy] = useState("confirm");
  const [editCooldown, setEditCooldown] = useState(60);
  const [saving, setSaving] = useState(false);

  const fetchTriggers = async () => {
    try {
      const res = await fetch("/api/triggers");
      if (res.ok) {
        const data = await res.json();
        setTriggers(data.triggers || []);
      }
    } catch {}
  };

  // SSE-driven refetch
  useEffect(() => { fetchTriggers(); }, [eventVersion]);

  // Slow polling fallback
  useEffect(() => {
    const iv = setInterval(fetchTriggers, 30000);
    return () => clearInterval(iv);
  }, []);

  const addTrigger = async () => {
    if (!name.trim() || !condition.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        type,
        condition: condition.trim(),
        action,
        autonomy,
        cooldown_seconds: cooldown,
      };
      if (payload.trim()) {
        body.action_payload = payload.trim();
      }
      const res = await fetch("/api/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setName("");
        setCondition("");
        setPayload("");
        setShowAdd(false);
        showToast("success", `Trigger "${name.trim()}" created`);
        fetchTriggers();
      } else {
        const data = await res.json();
        const msg = data.error || "Failed to add trigger";
        setError(msg);
        showToast("error", msg);
      }
    } catch {
      showToast("error", "Failed to add trigger");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTrigger = async (id: number) => {
    setTogglingId(id);
    try {
      await fetch(`/api/triggers/${id}/toggle`, { method: "POST" });
      fetchTriggers();
    } catch {
      showToast("error", "Failed to toggle trigger");
    } finally {
      setTogglingId(null);
    }
  };

  const removeTrigger = async (id: number) => {
    if (!confirm("Delete this trigger?")) return;
    setRemovingId(id);
    try {
      const res = await fetch(`/api/triggers/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("info", "Trigger removed");
      }
      fetchTriggers();
    } catch {
      showToast("error", "Failed to remove trigger");
    } finally {
      setRemovingId(null);
    }
  };

  const startEdit = (t: TriggerRecord) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditType(t.type);
    setEditCondition(t.condition);
    setEditAction(t.action);
    setEditPayload(t.action_payload || "");
    setEditAutonomy(t.autonomy);
    setEditCooldown(t.cooldown_seconds);
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async () => {
    if (!editName.trim() || !editCondition.trim() || saving) return;
    setSaving(true);
    try {
      const body: Record<string, any> = {
        name: editName.trim(),
        type: editType,
        condition: editCondition.trim(),
        action: editAction,
        autonomy: editAutonomy,
        cooldown_seconds: editCooldown,
      };
      if (editPayload.trim()) {
        body.action_payload = editPayload.trim();
      } else {
        body.action_payload = null;
      }
      const res = await fetch(`/api/triggers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast("success", "Trigger updated");
        setEditingId(null);
        fetchTriggers();
      } else {
        showToast("error", "Failed to update trigger");
      }
    } catch {
      showToast("error", "Failed to update trigger");
    } finally {
      setSaving(false);
    }
  };

  const conditionHint = (t?: string): string => {
    const ty = t || type;
    if (ty === "cron") return "e.g. */15 * * * * (every 15 min)";
    if (ty === "event") return "e.g. job_completed, job_failed";
    return "e.g. queue_depth >= 5";
  };

  const payloadHint = (a?: string): string => {
    const ac = a || action;
    if (ac === "inject_prompt") return '{"prompt": "..."}';
    if (ac === "queue_task") return '{"prompt": "...", "priority": 0}';
    if (ac === "notify") return '{"message": "..."}';
    return "";
  };

  return (
    <div class="config-panel">
      <div class="config-panel-header">
        <span class="config-panel-title">Triggers</span>
        <button class="btn btn--primary btn--sm" onClick={() => { setShowAdd(!showAdd); setError(""); }}>
          {showAdd ? "Cancel" : "+ Add Trigger"}
        </button>
      </div>

      {showAdd && (
        <div class="config-add-form">
          <div class="config-add-row">
            <label class="config-inline-label config-inline-label--grow">
              Name
              <input
                type="text"
                class="form-input"
                placeholder="trigger-name"
                value={name}
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
              />
            </label>
            <label class="config-inline-label">
              Type
              <select class="form-select" value={type} onChange={(e) => setType((e.target as HTMLSelectElement).value)}>
                {TRIGGER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>

          <label class="config-inline-label config-inline-label--full">
            Condition <span class="form-hint">{conditionHint()}</span>
            <input
              type="text"
              class="form-input"
              placeholder={conditionHint()}
              value={condition}
              onInput={(e) => setCondition((e.target as HTMLInputElement).value)}
            />
          </label>

          <div class="config-add-row">
            <label class="config-inline-label config-inline-label--grow">
              Action
              <select class="form-select" value={action} onChange={(e) => setAction((e.target as HTMLSelectElement).value)}>
                {ACTION_TYPES.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
              </select>
            </label>
            <label class="config-inline-label">
              Autonomy
              <select class="form-select" value={autonomy} onChange={(e) => setAutonomy((e.target as HTMLSelectElement).value)}>
                {AUTONOMY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <label class="config-inline-label">
              Cooldown
              <input
                type="number"
                class="form-input config-input-sm"
                value={cooldown}
                onInput={(e) => setCooldown(parseInt((e.target as HTMLInputElement).value) || 60)}
              />
            </label>
          </div>

          {payloadHint() && (
            <label class="config-inline-label config-inline-label--full">
              Payload (JSON) <span class="form-hint">{payloadHint()}</span>
              <input
                type="text"
                class="form-input"
                placeholder={payloadHint()}
                value={payload}
                onInput={(e) => setPayload((e.target as HTMLInputElement).value)}
              />
            </label>
          )}

          {error && <div class="form-error">{error}</div>}

          <div class="config-add-row config-add-row--end">
            <button class="btn btn--primary btn--sm" onClick={addTrigger} disabled={submitting || !name.trim() || !condition.trim()}>
              {submitting ? "Adding..." : "Add Trigger"}
            </button>
          </div>
        </div>
      )}

      <div class="config-list">
        {triggers.length === 0 ? (
          <div class="config-empty">No triggers configured</div>
        ) : (
          triggers.map((t) => (
            editingId === t.id ? (
              <div key={t.id} class="config-add-form trigger-edit-form">
                <div class="config-add-row">
                  <label class="config-inline-label config-inline-label--grow">
                    Name
                    <input type="text" class="form-input" value={editName} onInput={(e) => setEditName((e.target as HTMLInputElement).value)} />
                  </label>
                  <label class="config-inline-label">
                    Type
                    <select class="form-select" value={editType} onChange={(e) => setEditType((e.target as HTMLSelectElement).value)}>
                      {TRIGGER_TYPES.map((tt) => <option key={tt} value={tt}>{tt}</option>)}
                    </select>
                  </label>
                </div>
                <label class="config-inline-label config-inline-label--full">
                  Condition <span class="form-hint">{conditionHint(editType)}</span>
                  <input type="text" class="form-input" value={editCondition} onInput={(e) => setEditCondition((e.target as HTMLInputElement).value)} />
                </label>
                <div class="config-add-row">
                  <label class="config-inline-label config-inline-label--grow">
                    Action
                    <select class="form-select" value={editAction} onChange={(e) => setEditAction((e.target as HTMLSelectElement).value)}>
                      {ACTION_TYPES.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
                    </select>
                  </label>
                  <label class="config-inline-label">
                    Autonomy
                    <select class="form-select" value={editAutonomy} onChange={(e) => setEditAutonomy((e.target as HTMLSelectElement).value)}>
                      {AUTONOMY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                  <label class="config-inline-label">
                    Cooldown
                    <input type="number" class="form-input config-input-sm" value={editCooldown} onInput={(e) => setEditCooldown(parseInt((e.target as HTMLInputElement).value) || 60)} />
                  </label>
                </div>
                {payloadHint(editAction) && (
                  <label class="config-inline-label config-inline-label--full">
                    Payload (JSON) <span class="form-hint">{payloadHint(editAction)}</span>
                    <input type="text" class="form-input" value={editPayload} onInput={(e) => setEditPayload((e.target as HTMLInputElement).value)} />
                  </label>
                )}
                <div class="config-add-row config-add-row--end">
                  <button class="btn btn--ghost btn--sm" onClick={cancelEdit}>Cancel</button>
                  <button class="btn btn--primary btn--sm" onClick={saveEdit} disabled={saving || !editName.trim() || !editCondition.trim()}>
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div key={t.id} class={`config-item ${!t.enabled ? "config-item--disabled" : ""}`}>
                <div class="config-item-main">
                  <button
                    class={`trigger-toggle ${t.enabled ? "trigger-toggle--on" : ""}`}
                    onClick={() => toggleTrigger(t.id)}
                    disabled={togglingId === t.id}
                    title={t.enabled ? "Disable" : "Enable"}
                  />
                  <div class="trigger-info">
                    <span class="trigger-name">{t.name}</span>
                    <span class="trigger-desc">
                      <span class="config-tag">{t.type}</span>
                      <code class="trigger-condition">{t.condition}</code>
                      <span class="trigger-arrow">-&gt;</span>
                      <span class="config-tag config-tag--action">{t.action.replace(/_/g, " ")}</span>
                    </span>
                  </div>
                </div>
                <div class="config-item-meta">
                  <span class={`config-tag ${t.autonomy === "auto" ? "config-tag--auto" : "config-tag--confirm"}`}>
                    {t.autonomy}
                  </span>
                  {t.last_triggered && (
                    <span class="config-time" title={t.last_triggered}>
                      fired {formatRelativeTime(t.last_triggered)}
                    </span>
                  )}
                  <button
                    class="btn btn--ghost btn--sm"
                    onClick={() => startEdit(t)}
                    title="Edit trigger"
                  >
                    Edit
                  </button>
                  <button
                    class="btn btn--danger-outline btn--sm"
                    onClick={() => removeTrigger(t.id)}
                    disabled={removingId === t.id}
                  >
                    {removingId === t.id ? "..." : "Remove"}
                  </button>
                </div>
              </div>
            )
          ))
        )}
      </div>
    </div>
  );
}
