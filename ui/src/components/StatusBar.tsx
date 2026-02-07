import { h } from "preact";
import type { Metrics } from "../hooks/useJobs";
import { formatTokens } from "../lib/format";

export function StatusBar({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) return null;

  return (
    <div class="status-bar">
      <div class="status-metric">
        <span class="metric-value metric-active">{metrics.activeJobs}</span>
        <span class="metric-label">Active</span>
      </div>
      <div class="status-metric">
        <span class="metric-value metric-complete">{metrics.completedJobs}</span>
        <span class="metric-label">Completed</span>
      </div>
      <div class="status-metric">
        <span class="metric-value metric-failed">{metrics.failedJobs}</span>
        <span class="metric-label">Failed</span>
      </div>
      <div class="status-metric">
        <span class="metric-value">{metrics.totalJobs}</span>
        <span class="metric-label">Total</span>
      </div>
      <div class="status-metric">
        <span class="metric-value">{formatTokens(metrics.totalTokensInput + metrics.totalTokensOutput)}</span>
        <span class="metric-label">Tokens</span>
      </div>
    </div>
  );
}
