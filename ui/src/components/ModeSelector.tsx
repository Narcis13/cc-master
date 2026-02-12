import { h } from "preact";
import { useState, useEffect } from "preact/hooks";

interface ModeRecord {
  id: number;
  name: string;
  description: string | null;
  trigger_config: string;
  is_active: number;
  created_at: string;
}

export function ModeSelector() {
  const [modes, setModes] = useState<ModeRecord[]>([]);
  const [activating, setActivating] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [fromCurrent, setFromCurrent] = useState(true);
  const [creating, setCreating] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const fetchModes = async () => {
    try {
      const res = await fetch("/api/modes");
      if (res.ok) {
        const data = await res.json();
        setModes(data.modes || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchModes();
    const iv = setInterval(fetchModes, 10000);
    return () => clearInterval(iv);
  }, []);

  const activate = async (id: number) => {
    setActivating(id);
    try {
      await fetch(`/api/modes/${id}/activate`, { method: "POST" });
      fetchModes();
    } finally {
      setActivating(null);
    }
  };

  const deactivate = async () => {
    setActivating(-1);
    try {
      await fetch("/api/modes/deactivate", { method: "POST" });
      fetchModes();
    } finally {
      setActivating(null);
    }
  };

  const createMode = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/modes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
          from_current: fromCurrent,
        }),
      });
      if (res.ok) {
        setNewName("");
        setNewDesc("");
        setShowCreate(false);
        fetchModes();
      }
    } finally {
      setCreating(false);
    }
  };

  const removeMode = async (id: number) => {
    setRemovingId(id);
    try {
      await fetch(`/api/modes/${id}`, { method: "DELETE" });
      fetchModes();
    } finally {
      setRemovingId(null);
    }
  };

  const activeMode = modes.find((m) => m.is_active);
  const triggerCount = (m: ModeRecord): number => {
    try {
      return JSON.parse(m.trigger_config).length;
    } catch {
      return 0;
    }
  };

  return (
    <div class="config-panel">
      <div class="config-panel-header">
        <span class="config-panel-title">Modes</span>
        <div class="config-panel-actions">
          {activeMode && (
            <button
              class="btn btn--ghost btn--sm"
              onClick={deactivate}
              disabled={activating !== null}
            >
              Deactivate
            </button>
          )}
          <button class="btn btn--primary btn--sm" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? "Cancel" : "+ New Mode"}
          </button>
        </div>
      </div>

      {showCreate && (
        <div class="config-add-form">
          <div class="config-add-row">
            <label class="config-inline-label config-inline-label--grow">
              Name
              <input
                type="text"
                class="form-input"
                placeholder="my-mode"
                value={newName}
                onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
          <label class="config-inline-label config-inline-label--full">
            Description
            <input
              type="text"
              class="form-input"
              placeholder="What this mode does..."
              value={newDesc}
              onInput={(e) => setNewDesc((e.target as HTMLInputElement).value)}
            />
          </label>
          <div class="config-add-row config-add-row--between">
            <label class="config-checkbox-label">
              <input
                type="checkbox"
                checked={fromCurrent}
                onChange={(e) => setFromCurrent((e.target as HTMLInputElement).checked)}
              />
              Snapshot current triggers
            </label>
            <button class="btn btn--primary btn--sm" onClick={createMode} disabled={creating || !newName.trim()}>
              {creating ? "Creating..." : "Create Mode"}
            </button>
          </div>
        </div>
      )}

      <div class="config-list">
        {modes.length === 0 ? (
          <div class="config-empty">No modes configured</div>
        ) : (
          modes.map((m) => (
            <div key={m.id} class={`config-item ${m.is_active ? "config-item--active" : ""}`}>
              <div class="config-item-main">
                <div class="mode-info">
                  <span class="mode-name">
                    {m.name}
                    {m.is_active && <span class="mode-active-badge">Active</span>}
                  </span>
                  {m.description && <span class="mode-desc">{m.description}</span>}
                  <span class="mode-meta">{triggerCount(m)} triggers</span>
                </div>
              </div>
              <div class="config-item-meta">
                {!m.is_active ? (
                  <button
                    class="btn btn--primary btn--sm"
                    onClick={() => activate(m.id)}
                    disabled={activating !== null}
                  >
                    {activating === m.id ? "Activating..." : "Activate"}
                  </button>
                ) : (
                  <span class="config-tag config-tag--auto">active</span>
                )}
                <button
                  class="btn btn--danger-outline btn--sm"
                  onClick={() => removeMode(m.id)}
                  disabled={removingId === m.id || m.is_active}
                  title={m.is_active ? "Deactivate first" : "Delete mode"}
                >
                  {removingId === m.id ? "..." : "Delete"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
