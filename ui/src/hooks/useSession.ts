import { useState, useEffect } from "preact/hooks";

export type SessionTokens = {
  input: number;
  output: number;
  context_window: number;
  context_used_pct: number;
};

export type ToolCall = {
  name: string;
  input: unknown;
  output: unknown;
  is_error: boolean;
  timestamp: string | null;
};

export type SessionMessage = {
  role: "user" | "assistant";
  text: string;
  timestamp: string | null;
};

export type ToolStats = {
  total_calls: number;
  by_tool: Record<string, number>;
  failed_calls: number;
  unique_files_read: number;
};

export type Subagent = {
  id: string;
  tool_calls: number;
  messages: number;
};

export type SessionData = {
  job_id: string;
  session_id: string | null;
  model: string | null;
  duration_ms: number | null;
  tokens: SessionTokens | null;
  messages: SessionMessage[];
  tool_calls: ToolCall[];
  files_modified: string[] | null;
  summary: string | null;
  tool_stats: ToolStats;
  subagents: Subagent[];
};

export function useSession(jobId: string, hasSession: boolean) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSession) {
      setSession(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/jobs/${jobId}/session`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SessionData) => {
        if (!cancelled) {
          setSession(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, hasSession]);

  return { session, loading, error };
}
