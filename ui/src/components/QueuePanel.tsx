import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { formatRelativeTime } from "../lib/format";
import { showToast } from "./Toast";

interface QueueTask {
  id: number;
  prompt: string;
  priority: number;
  status: string;
  metadata: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export function QueuePanel({ eventVersion = 0 }: { eventVersion?: number } = {}) {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [filter, setFilter] = useState("pending");
  const [showAdd, setShowAdd] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchTasks = async () => {
    try {
      const url = filter ? `/api/queue/tasks?status=${filter}` : "/api/queue/tasks";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch {}
  };

  // SSE-driven refetch
  useEffect(() => { fetchTasks(); }, [eventVersion, filter]);

  // Slow polling fallback
  useEffect(() => {
    const iv = setInterval(fetchTasks, 30000);
    return () => clearInterval(iv);
  }, [filter]);

  const addTask = async () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/queue/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), priority }),
      });
      if (res.ok) {
        setPrompt("");
        setPriority(0);
        setShowAdd(false);
        showToast("success", "Task added to queue");
        fetchTasks();
      } else {
        showToast("error", "Failed to add task");
      }
    } catch {
      showToast("error", "Failed to add task");
    } finally {
      setSubmitting(false);
    }
  };

  const removeTask = async (id: number) => {
    if (!confirm("Remove this task from the queue?")) return;
    setRemovingId(id);
    try {
      const res = await fetch(`/api/queue/tasks/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("info", "Task removed");
      }
      fetchTasks();
    } catch {
      showToast("error", "Failed to remove task");
    } finally {
      setRemovingId(null);
    }
  };

  const updateTaskStatus = async (id: number, newStatus: string) => {
    setUpdatingId(id);
    try {
      const body: Record<string, any> = { status: newStatus };
      if (newStatus === "completed" || newStatus === "failed") {
        body.completed_at = new Date().toISOString();
      }
      const res = await fetch(`/api/queue/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast("success", `Task marked ${newStatus}`);
        fetchTasks();
      } else {
        showToast("error", "Failed to update task");
      }
    } catch {
      showToast("error", "Failed to update task");
    } finally {
      setUpdatingId(null);
    }
  };

  const statusClass = (s: string) => {
    if (s === "processing") return "status-badge--running";
    if (s === "completed") return "status-badge--completed";
    if (s === "failed") return "status-badge--failed";
    return "status-badge--pending";
  };

  return (
    <div class="config-panel">
      <div class="config-panel-header">
        <span class="config-panel-title">Task Queue</span>
        <div class="config-panel-actions">
          <select
            class="config-filter"
            value={filter}
            onChange={(e) => setFilter((e.target as HTMLSelectElement).value)}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
          </select>
          <button class="btn btn--primary btn--sm" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "Cancel" : "+ Add Task"}
          </button>
        </div>
      </div>

      {showAdd && (
        <div class="config-add-form">
          <textarea
            class="form-textarea"
            rows={2}
            placeholder="Task prompt..."
            value={prompt}
            onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                addTask();
              }
            }}
          />
          <div class="config-add-row">
            <label class="config-inline-label">
              Priority
              <input
                type="number"
                class="form-input config-input-sm"
                value={priority}
                onInput={(e) => setPriority(parseInt((e.target as HTMLInputElement).value) || 0)}
              />
            </label>
            <button class="btn btn--primary btn--sm" onClick={addTask} disabled={submitting || !prompt.trim()}>
              {submitting ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      )}

      <div class="config-list">
        {tasks.length === 0 ? (
          <div class="config-empty">No {filter || ""} tasks in queue</div>
        ) : (
          tasks.map((t) => (
            <div key={t.id} class="config-item config-item--expandable" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div
                  class="config-item-main"
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                >
                  <span class={`status-badge ${statusClass(t.status)}`}>{t.status}</span>
                  <span class="config-item-text">{t.prompt}</span>
                </div>
                <div class="config-item-meta">
                  {t.priority > 0 && <span class="config-tag">P{t.priority}</span>}
                  <span class="config-time">{formatRelativeTime(t.created_at)}</span>
                  {t.status === "pending" && (
                    <button
                      class="btn btn--danger-outline btn--sm"
                      onClick={() => removeTask(t.id)}
                      disabled={removingId === t.id}
                    >
                      {removingId === t.id ? "..." : "Remove"}
                    </button>
                  )}
                </div>
              </div>
              {expandedId === t.id && (
                <div class="queue-task-detail">
                  <div class="queue-task-prompt">{t.prompt}</div>
                  <div class="queue-task-times">
                    <span>Created: {new Date(t.created_at).toLocaleString()}</span>
                    {t.started_at && <span>Started: {new Date(t.started_at).toLocaleString()}</span>}
                    {t.completed_at && <span>Completed: {new Date(t.completed_at).toLocaleString()}</span>}
                  </div>
                  {(t.status === "pending" || t.status === "processing") && (
                    <div class="queue-task-actions">
                      <button
                        class="btn btn--primary btn--sm"
                        onClick={() => updateTaskStatus(t.id, "completed")}
                        disabled={updatingId === t.id}
                      >
                        Mark Complete
                      </button>
                      <button
                        class="btn btn--danger-outline btn--sm"
                        onClick={() => updateTaskStatus(t.id, "failed")}
                        disabled={updatingId === t.id}
                      >
                        Mark Failed
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
