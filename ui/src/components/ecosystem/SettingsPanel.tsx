import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { JsonViewer } from "./viewers/JsonViewer";
import { MarkdownViewer } from "./viewers/MarkdownViewer";

export function SettingsPanel() {
  const [settings, setSettings] = useState<string | null>(null);
  const [claudeMd, setClaudeMd] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ecosystem/file?path=settings.json").then((r) => r.json()).then((d) => setSettings(d.content)).catch(() => {});
    fetch("/api/ecosystem/file?path=CLAUDE.md").then((r) => r.json()).then((d) => setClaudeMd(d.content)).catch(() => {});
  }, []);

  return (
    <div>
      <h3 class="eco-section-title">settings.json</h3>
      {settings ? <JsonViewer content={settings} /> : <div class="db-placeholder">Loading...</div>}
      <h3 class="eco-section-title">CLAUDE.md</h3>
      {claudeMd ? <MarkdownViewer content={claudeMd} /> : <div class="db-placeholder">No CLAUDE.md found</div>}
    </div>
  );
}
