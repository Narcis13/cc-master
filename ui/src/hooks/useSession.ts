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
  thinking: string | null;
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

// Module-level cache: avoids refetching when switching tabs back to the same job
const sessionCache = new Map<string, SessionData>();

export function useSession(jobId: string, hasSession: boolean) {
  const [session, setSession] = useState<SessionData | null>(
    () => sessionCache.get(jobId) ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSession) {
      setSession(null);
      setError(null);
      return;
    }

    // Serve from cache immediately
    const cached = sessionCache.get(jobId);
    if (cached) {
      setSession(cached);
      setLoading(false);
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
        sessionCache.set(jobId, data);
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

/** Clear cached session data for a specific job, or all jobs if no id given. */
export function invalidateSession(jobId?: string) {
  if (jobId) sessionCache.delete(jobId);
  else sessionCache.clear();
}
