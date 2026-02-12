import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { formatRelativeTime } from "../lib/format";

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

export function QueuePanel() {
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [filter, setFilter] = useState("pending");
  const [showAdd, setShowAdd] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [priority, setPriority] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

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

  useEffect(() => {
    fetchTasks();
    const iv = setInterval(fetchTasks, 5000);
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
        fetchTasks();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const removeTask = async (id: number) => {
    setRemovingId(id);
    try {
      await fetch(`/api/queue/tasks/${id}`, { method: "DELETE" });
      fetchTasks();
    } finally {
      setRemovingId(null);
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
            <div key={t.id} class="config-item">
              <div class="config-item-main">
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
          ))
        )}
      </div>
    </div>
  );
}
