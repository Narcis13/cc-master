import { h } from "preact";

export function CostBadge({ cost }: { cost: number | null }) {
  if (cost === null || cost === undefined) return null;

  const level = cost >= 1.0 ? "high" : cost >= 0.25 ? "mid" : "low";

  return (
    <span class={`cost-badge cost-badge--${level}`}>
      ${cost.toFixed(2)}
    </span>
  );
}
