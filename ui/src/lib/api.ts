const BASE = "";

export async function fetchJobs() {
  const res = await fetch(`${BASE}/api/jobs`);
  return res.json();
}

export async function fetchMetrics() {
  const res = await fetch(`${BASE}/api/metrics`);
  return res.json();
}

export async function shutdownDashboard() {
  await fetch(`${BASE}/api/shutdown`, { method: "POST" });
}

export async function cleanupJobs(maxAgeDays: number = 7): Promise<{ cleaned: number; maxAgeDays: number }> {
  const res = await fetch(`${BASE}/api/jobs/cleanup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxAgeDays }),
  });
  return res.json();
}
