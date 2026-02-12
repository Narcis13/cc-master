import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  text: string;
}

let _addToast: ((msg: Omit<ToastMessage, "id">) => void) | null = null;

/** Call from anywhere to show a toast */
export function showToast(type: ToastMessage["type"], text: string) {
  _addToast?.({ type, text });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((msg: Omit<ToastMessage, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...msg, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div class="toast-container">
      {toasts.map((t) => (
        <div key={t.id} class={`toast toast--${t.type}`} onClick={() => dismiss(t.id)}>
          <span class="toast-text">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
