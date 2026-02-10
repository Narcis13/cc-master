import { useState, useEffect, useRef } from "preact/hooks";

export type JobEntry = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  prompt: string;
  model: string;
  reasoning: string;
  cwd: string;
  elapsed_ms: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  tokens: { input: number; output: number; context_window: number; context_used_pct: number } | null;
  files_modified: string[] | null;
  summary: string | null;
  tool_call_count: number | null;
  has_session: boolean;
  estimated_cost: number | null;
  failed_tool_calls: number | null;
  primary_tool: string | null;
};

export type Metrics = {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  averageJobDurationMs: number;
  uptimeMs: number;
};

export type HookEvent = {
  timestamp: string;
  session_id: string;
  event_type: string;
  tool_name: string;
  job_id: string;
  cwd: string;
  data: any;
};

export type Notification = {
  id: string;
  type: "agent_started" | "agent_completed" | "agent_failed" | "file_conflict" | "token_warning" | "hook_event";
  severity: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  jobId?: string;
  timestamp: string;
  read: boolean;
};

const MAX_HOOK_EVENTS = 200;
const MAX_NOTIFICATIONS = 100;

export function useJobs() {
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [connected, setConnected] = useState(false);
  const [hookEvents, setHookEvents] = useState<HookEvent[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const prevJobsRef = useRef<Map<string, string>>(new Map());

  // Generate notifications from job state transitions
  function checkJobTransitions(updatedJobs: JobEntry[]) {
    const prev = prevJobsRef.current;
    const newNotifs: Notification[] = [];

    for (const job of updatedJobs) {
      const prevStatus = prev.get(job.id);
      if (prevStatus === job.status) continue;

      if (!prevStatus && job.status === "running") {
        newNotifs.push({
          id: `${job.id}-started-${Date.now()}`,
          type: "agent_started",
          severity: "info",
          title: "Agent Started",
          message: `Agent ${job.id.slice(0, 8)} started (${job.model}/${job.reasoning})`,
          jobId: job.id,
          timestamp: new Date().toISOString(),
          read: false,
        });
      } else if (job.status === "completed" && prevStatus !== "completed") {
        newNotifs.push({
          id: `${job.id}-completed-${Date.now()}`,
          type: "agent_completed",
          severity: "success",
          title: "Agent Completed",
          message: `Agent ${job.id.slice(0, 8)} finished${job.summary ? `: ${job.summary.slice(0, 80)}` : ""}`,
          jobId: job.id,
          timestamp: new Date().toISOString(),
          read: false,
        });
      } else if (job.status === "failed" && prevStatus !== "failed") {
        newNotifs.push({
          id: `${job.id}-failed-${Date.now()}`,
          type: "agent_failed",
          severity: "error",
          title: "Agent Failed",
          message: `Agent ${job.id.slice(0, 8)} failed`,
          jobId: job.id,
          timestamp: new Date().toISOString(),
          read: false,
        });
      }
    }

    // Update previous statuses
    const newPrev = new Map<string, string>();
    for (const job of updatedJobs) {
      newPrev.set(job.id, job.status);
    }
    prevJobsRef.current = newPrev;

    if (newNotifs.length > 0) {
      setNotifications((prev) => [...newNotifs, ...prev].slice(0, MAX_NOTIFICATIONS));
    }
  }

  useEffect(() => {
    const es = new EventSource("/api/events");
    esRef.current = es;

    es.addEventListener("snapshot", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setJobs(data.jobs);
      setMetrics(data.metrics);
      setConnected(true);
      // Initialize prev statuses without generating notifications
      const prev = new Map<string, string>();
      for (const job of data.jobs) {
        prev.set(job.id, job.status);
      }
      prevJobsRef.current = prev;
    });

    es.addEventListener("job_created", (e: MessageEvent) => {
      const job: JobEntry = JSON.parse(e.data);
      setJobs((prev) => {
        const updated = [job, ...prev.filter((j) => j.id !== job.id)];
        checkJobTransitions(updated);
        return updated;
      });
    });

    es.addEventListener("job_updated", (e: MessageEvent) => {
      const job: JobEntry = JSON.parse(e.data);
      setJobs((prev) => {
        const updated = prev.map((j) => (j.id === job.id ? job : j));
        checkJobTransitions(updated);
        return updated;
      });
    });

    es.addEventListener("job_completed", (e: MessageEvent) => {
      const job: JobEntry = JSON.parse(e.data);
      setJobs((prev) => {
        const updated = prev.map((j) => (j.id === job.id ? job : j));
        checkJobTransitions(updated);
        return updated;
      });
    });

    es.addEventListener("job_failed", (e: MessageEvent) => {
      const job: JobEntry = JSON.parse(e.data);
      setJobs((prev) => {
        const updated = prev.map((j) => (j.id === job.id ? job : j));
        checkJobTransitions(updated);
        return updated;
      });
    });

    es.addEventListener("metrics_update", (e: MessageEvent) => {
      setMetrics(JSON.parse(e.data));
    });

    es.addEventListener("hook_event", (e: MessageEvent) => {
      const event: HookEvent = JSON.parse(e.data);
      setHookEvents((prev) => [event, ...prev].slice(0, MAX_HOOK_EVENTS));
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return {
    jobs,
    metrics,
    connected,
    hookEvents,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllRead,
    dismissNotification,
  };
}
