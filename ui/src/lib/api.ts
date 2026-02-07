const BASE = "";

export async function fetchJobs() {
  const res = await fetch(`${BASE}/api/jobs`);
  return res.json();
}

export async function fetchMetrics() {
  const res = await fetch(`${BASE}/api/metrics`);
  return res.json();
}
