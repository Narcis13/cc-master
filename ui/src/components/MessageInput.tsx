import { h } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";

export function MessageInput({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const send = async () => {
    const text = message.trim();
    if (!text || sending || disabled) return;

    setSending(true);
    try {
      const res = await fetch(`/api/actions/jobs/${jobId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        setMessage("");
        inputRef.current?.focus();
      }
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div class={`message-input-wrap ${disabled ? "message-input-wrap--disabled" : ""}`}>
      <input
        ref={inputRef}
        type="text"
        class="message-input"
        placeholder={disabled ? "Agent is not running" : "Send a message to this agent..."}
        value={message}
        disabled={disabled || sending}
        onInput={(e) => setMessage((e.target as HTMLInputElement).value)}
        onKeyDown={onKeyDown}
      />
      <button
        class="message-send-btn"
        onClick={send}
        disabled={disabled || sending || !message.trim()}
      >
        {sending ? "..." : "Send ⏎"}
      </button>
    </div>
  );
}
