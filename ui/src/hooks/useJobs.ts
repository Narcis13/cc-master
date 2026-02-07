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

export function useJobs() {
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    esRef.current = es;

    es.addEventListener("snapshot", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setJobs(data.jobs);
      setMetrics(data.metrics);
      setConnected(true);
    });

    es.addEventListener("job_created", (e: MessageEvent) => {
      const job: JobEntry = JSON.parse(e.data);
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
    });

    es.addEventListener("job_updated", (e: MessageEvent) => {
      const job: JobEntry = JSON.parse(e.data);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
    });

    es.addEventListener("job_completed", (e: MessageEvent) => {
      const job: JobEntry = JSON.parse(e.data);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
    });

    es.addEventListener("job_failed", (e: MessageEvent) => {
      const job: JobEntry = JSON.parse(e.data);
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
    });

    es.addEventListener("metrics_update", (e: MessageEvent) => {
      setMetrics(JSON.parse(e.data));
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { jobs, metrics, connected };
}
