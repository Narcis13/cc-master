import { h } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";

const MODELS = ["opus", "sonnet", "haiku"];
const REASONING = ["low", "medium", "high", "xhigh"];
const SANDBOX = ["read-only", "workspace-write", "danger-full-access"];

export function NewJobForm({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("opus");
  const [reasoning, setReasoning] = useState("xhigh");
  const [sandbox, setSandbox] = useState("workspace-write");
  const [cwd, setCwd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = async () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const body: Record<string, string> = { prompt: prompt.trim(), model, reasoning, sandbox };
      if (cwd.trim()) body.cwd = cwd.trim();

      const res = await fetch("/api/actions/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create job");
        return;
      }

      onCreated?.();
      onClose();
    } catch (err) {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div class="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>New Agent</h2>
          <button class="modal-close" onClick={onClose}>✕</button>
        </div>

        <div class="modal-body">
          <label class="form-label">
            Prompt
            <textarea
              ref={textareaRef}
              class="form-textarea"
              rows={4}
              placeholder="What should this agent do?"
              value={prompt}
              onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
              onKeyDown={onKeyDown}
            />
          </label>

          <div class="form-row">
            <label class="form-label form-label--sm">
              Model
              <select class="form-select" value={model} onChange={(e) => setModel((e.target as HTMLSelectElement).value)}>
                {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label class="form-label form-label--sm">
              Reasoning
              <select class="form-select" value={reasoning} onChange={(e) => setReasoning((e.target as HTMLSelectElement).value)}>
                {REASONING.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label class="form-label form-label--sm">
              Sandbox
              <select class="form-select" value={sandbox} onChange={(e) => setSandbox((e.target as HTMLSelectElement).value)}>
                {SANDBOX.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <label class="form-label">
            Working Directory <span class="form-hint">(optional)</span>
            <input
              type="text"
              class="form-input"
              placeholder="Defaults to server cwd"
              value={cwd}
              onInput={(e) => setCwd((e.target as HTMLInputElement).value)}
            />
          </label>

          {error && <div class="form-error">{error}</div>}
        </div>

        <div class="modal-footer">
          <button class="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button class="btn btn--primary" onClick={submit} disabled={submitting || !prompt.trim()}>
            {submitting ? "Starting..." : "Start Agent ⌘⏎"}
          </button>
        </div>
      </div>
    </div>
  );
}
