import { h } from "preact";
import { useState, useEffect } from "preact/hooks";

interface SectionStat {
  key: string; path: string; label: string; desc: string; count: number; size: number;
}
interface KeyFile {
  name: string; size: number; modified: string | null;
}
interface OverviewData {
  sections: SectionStat[];
  keyFiles: KeyFile[];
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function EcosystemOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ecosystem/overview")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div class="db-placeholder">Error: {error}</div>;
  if (!data) return <div class="db-placeholder">Loading ecosystem...</div>;

  return (
    <div>
      <div class="eco-stat-cards">
        {data.sections.filter((s) => s.count > 0).map((s) => (
          <a key={s.key} href={`#/ecosystem/${s.key}`} class="eco-stat-card eco-stat-card--link">
            <span class="eco-stat-value">{s.count}</span>
            <span class="eco-stat-label">{s.label}</span>
          </a>
        ))}
      </div>

      <h3 class="eco-section-title">Sections</h3>
      <div class="eco-cards-grid">
        {data.sections.map((s) => (
          <a key={s.key} href={`#/ecosystem/${s.key === "agents" || s.key === "plans" || s.key === "skills" || s.key === "projects" || s.key === "settings" ? s.key : "browse?path=" + s.path}`} class="eco-section-card">
            <div class="eco-section-card-title">{s.label}</div>
            <div class="eco-section-card-desc">{s.desc}</div>
            <div class="eco-section-card-meta">{s.count} items · {formatBytes(s.size)}</div>
          </a>
        ))}
      </div>

      <h3 class="eco-section-title">Key Files</h3>
      <div class="eco-key-files">
        {data.keyFiles.map((f) => (
          <a key={f.name} href={`#/ecosystem/browse?path=${f.name}`} class="eco-key-file">
            <span class="eco-key-file-name">{f.name}</span>
            <span class="eco-key-file-size">{formatBytes(f.size)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
