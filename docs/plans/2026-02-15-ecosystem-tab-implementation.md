# Ecosystem Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "Ecosystem" tab to the CC-Agent Dashboard that provides a visual browser for `~/.claude`, showing agents, plans, skills, projects, settings, and a general file browser.

**Architecture:** Hono sub-app API (read-only, file-system based) + Preact UI mirroring the existing Database tab pattern (sub-nav + layout wrapper + section panels). Four viewer components handle different file types (markdown, JSON, JSONL, text).

**Tech Stack:** Bun, Hono, Preact, CSS (no new dependencies)

**Design doc:** `docs/plans/ecosystem-tab.md`

---

## Task 1: API — Core Utilities + All Endpoints

**Files:**
- Create: `src/dashboard/api/ecosystem.ts`

**Step 1: Create the ecosystem API file with all endpoints**

```typescript
import { Hono } from "hono";
import fs from "fs";
import path from "path";

const ecosystemApi = new Hono();
const CLAUDE_HOME = path.join(process.env.HOME!, ".claude");

// --- Security ---
function safePath(rel: string): string | null {
  if (rel.includes("..")) return null;
  const resolved = path.resolve(CLAUDE_HOME, rel);
  if (!resolved.startsWith(CLAUDE_HOME)) return null;
  return resolved;
}

// --- Content type detection ---
function detectContentType(ext: string): string {
  if (ext === ".md") return "markdown";
  if (ext === ".json") return "json";
  if (ext === ".jsonl") return "jsonl";
  if ([".ts", ".js", ".sh", ".txt", ".yaml", ".yml", ".toml", ".css", ".html", ".log", ".env", ".gitignore"].includes(ext)) return "text";
  return "text";
}

// --- GET /overview ---
ecosystemApi.get("/overview", (c) => {
  const sections = [
    { key: "agents", path: "agents", label: "Agents", desc: "Custom agent definitions" },
    { key: "plans", path: "plans", label: "Plans", desc: "Implementation plans" },
    { key: "skills", path: "skills", label: "Skills", desc: "Skill definitions" },
    { key: "projects", path: "projects", label: "Projects", desc: "Project-scoped configs" },
    { key: "plugins", path: "plugins", label: "Plugins", desc: "Installed plugins" },
    { key: "hooks", path: "hooks", label: "Hooks", desc: "Git/lifecycle hooks" },
    { key: "commands", path: "commands", label: "Commands", desc: "Custom commands" },
    { key: "tasks", path: "tasks", label: "Tasks", desc: "Task lists" },
    { key: "teams", path: "teams", label: "Teams", desc: "Team configurations" },
  ];

  const stats = sections.map((s) => {
    const full = path.join(CLAUDE_HOME, s.path);
    let count = 0;
    let size = 0;
    try {
      const entries = fs.readdirSync(full);
      count = entries.length;
      for (const e of entries) {
        try { size += fs.statSync(path.join(full, e)).size; } catch {}
      }
    } catch {}
    return { ...s, count, size };
  });

  // Key files
  const keyFiles = ["settings.json", "CLAUDE.md"].map((name) => {
    const full = path.join(CLAUDE_HOME, name);
    try {
      const st = fs.statSync(full);
      return { name, size: st.size, modified: st.mtime.toISOString() };
    } catch {
      return { name, size: 0, modified: null };
    }
  });

  return c.json({ sections: stats, keyFiles });
});

// --- GET /tree ---
ecosystemApi.get("/tree", (c) => {
  const rel = c.req.query("path") || "";
  const depthParam = parseInt(c.req.query("depth") || "1", 10);
  const depth = Math.min(Math.max(depthParam, 1), 3);

  const resolved = rel ? safePath(rel) : CLAUDE_HOME;
  if (!resolved) return c.json({ error: "Invalid path" }, 403);

  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => {
        const full = path.join(resolved, e.name);
        try {
          const st = fs.statSync(full);
          const item: any = {
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
            size: st.size,
            modified: st.mtime.toISOString(),
          };
          if (e.isFile()) item.extension = path.extname(e.name);
          if (e.isDirectory()) {
            try { item.children_count = fs.readdirSync(full).length; } catch { item.children_count = 0; }
          }
          return item;
        } catch {
          return { name: e.name, type: "unknown", size: 0 };
        }
      })
      .sort((a, b) => {
        if (a.type === "directory" && b.type !== "directory") return -1;
        if (a.type !== "directory" && b.type === "directory") return 1;
        return a.name.localeCompare(b.name);
      });
    return c.json({ path: rel || "/", entries: items });
  } catch {
    return c.json({ error: "Cannot read directory" }, 404);
  }
});

// --- GET /file ---
ecosystemApi.get("/file", (c) => {
  const rel = c.req.query("path");
  if (!rel) return c.json({ error: "path required" }, 400);

  const resolved = safePath(rel);
  if (!resolved) return c.json({ error: "Invalid path" }, 403);

  const maxSize = 2 * 1024 * 1024; // 2MB
  const linesParam = parseInt(c.req.query("lines") || "0", 10);

  try {
    const st = fs.statSync(resolved);
    if (st.isDirectory()) return c.json({ error: "Is a directory" }, 400);
    if (st.size > maxSize) return c.json({ error: "File too large", size: st.size }, 413);

    const ext = path.extname(resolved);
    const content_type = detectContentType(ext);
    let content = fs.readFileSync(resolved, "utf-8");
    let truncated = false;

    // JSONL pagination: return last N lines
    if (content_type === "jsonl" && linesParam > 0) {
      const allLines = content.split("\n").filter((l) => l.trim());
      truncated = allLines.length > linesParam;
      const slice = allLines.slice(-linesParam);
      content = slice.join("\n");
    }

    return c.json({
      path: rel,
      content_type,
      content,
      size: st.size,
      modified: st.mtime.toISOString(),
      truncated,
    });
  } catch {
    return c.json({ error: "File not found" }, 404);
  }
});

// --- GET /search ---
ecosystemApi.get("/search", (c) => {
  const query = c.req.query("q");
  const searchType = c.req.query("type") || "file";
  if (!query) return c.json({ error: "q required" }, 400);

  const skipDirs = new Set(["todos", "debug", "session-env", "node_modules", ".git"]);
  const results: { path: string; name: string; type: string; match?: string }[] = [];
  const MAX = 100;

  function walk(dir: string, relBase: string) {
    if (results.length >= MAX) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        if (results.length >= MAX) return;
        if (e.name.startsWith(".")) continue;
        const rel = relBase ? `${relBase}/${e.name}` : e.name;
        const full = path.join(dir, e.name);

        if (e.isDirectory()) {
          if (!skipDirs.has(e.name)) walk(full, rel);
          continue;
        }

        if (searchType === "file" && e.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({ path: rel, name: e.name, type: "file" });
        } else if (searchType === "content") {
          try {
            const st = fs.statSync(full);
            if (st.size > 512 * 1024) continue; // skip files > 512KB
            const txt = fs.readFileSync(full, "utf-8");
            const idx = txt.toLowerCase().indexOf(query.toLowerCase());
            if (idx >= 0) {
              const start = Math.max(0, idx - 40);
              const end = Math.min(txt.length, idx + query.length + 40);
              results.push({ path: rel, name: e.name, type: "content", match: txt.slice(start, end) });
            }
          } catch {}
        }
      }
    } catch {}
  }

  walk(CLAUDE_HOME, "");
  return c.json({ results, total: results.length });
});

export { ecosystemApi };
```

**Step 2: Verify file compiles**

Run: `bun build src/dashboard/api/ecosystem.ts --no-bundle`
Expected: No errors

**Step 3: Commit**

```
git add src/dashboard/api/ecosystem.ts
git commit -m "feat(ecosystem): add read-only API for ~/.claude browsing"
```

---

## Task 2: Server Registration

**Files:**
- Modify: `src/dashboard/server.ts:16,89`

**Step 1: Add import at line 16 (after modesApi import)**

```typescript
import { ecosystemApi } from "./api/ecosystem.ts";
```

**Step 2: Add route mounting at line 89 (after modesApi route)**

```typescript
  app.route("/api/ecosystem", ecosystemApi);
```

**Step 3: Verify API responds**

Run: `bun run src/cli.ts dashboard &` then `curl http://localhost:3131/api/ecosystem/overview | head -c 200`
Expected: JSON with `sections` array

**Step 4: Commit**

```
git add src/dashboard/server.ts
git commit -m "feat(ecosystem): register ecosystem API routes"
```

---

## Task 3: Route Wiring in app.tsx

**Files:**
- Modify: `ui/src/app.tsx`

This task adds the Ecosystem sub-nav, layout wrapper, nav link, and route detection. Mirrors the existing `DbSubNav`/`DbLayout` pattern exactly.

**Step 1: Add EcosystemSubNav component after DbLayout (after line 79)**

```tsx
// Ecosystem sub-navigation tab bar
function EcosystemSubNav({ route }: { route: string }) {
  const tabs = [
    { hash: "#/ecosystem", label: "Overview" },
    { hash: "#/ecosystem/agents", label: "Agents" },
    { hash: "#/ecosystem/plans", label: "Plans" },
    { hash: "#/ecosystem/skills", label: "Skills" },
    { hash: "#/ecosystem/projects", label: "Projects" },
    { hash: "#/ecosystem/settings", label: "Settings" },
    { hash: "#/ecosystem/browse", label: "Browse" },
  ];

  return (
    <nav class="eco-sub-nav">
      {tabs.map((tab) => {
        const isActive =
          tab.hash === "#/ecosystem"
            ? route === "#/ecosystem" || route === "#/ecosystem/"
            : route.startsWith(tab.hash);
        return (
          <a key={tab.hash} href={tab.hash} class={`eco-sub-nav-link ${isActive ? "active" : ""}`}>
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}

// Ecosystem layout wrapper
function EcosystemLayout({ route }: { route: string }) {
  let content;
  if (route.startsWith("#/ecosystem/agents")) {
    content = <EcosystemPlaceholder section="Agents" />;
  } else if (route.startsWith("#/ecosystem/plans")) {
    content = <EcosystemPlaceholder section="Plans" />;
  } else if (route.startsWith("#/ecosystem/skills")) {
    content = <EcosystemPlaceholder section="Skills" />;
  } else if (route.startsWith("#/ecosystem/projects")) {
    content = <EcosystemPlaceholder section="Projects" />;
  } else if (route.startsWith("#/ecosystem/settings")) {
    content = <EcosystemPlaceholder section="Settings" />;
  } else if (route.startsWith("#/ecosystem/browse")) {
    content = <EcosystemPlaceholder section="Browse" />;
  } else {
    content = <EcosystemOverview />;
  }

  return (
    <div class="eco-layout">
      <EcosystemSubNav route={route} />
      <div class="eco-content">{content}</div>
    </div>
  );
}

// Temporary placeholder until panels are built
function EcosystemPlaceholder({ section }: { section: string }) {
  return <div class="db-placeholder">{section} — coming soon</div>;
}
```

**Step 2: Add route detection (at line ~146-148 area, alongside isDatabase)**

```typescript
const isEcosystem = route.startsWith("#/ecosystem");
```

Update `isHome` to include `!isEcosystem`.

**Step 3: Add nav link (after Database nav link, ~line 180)**

```tsx
<a href="#/ecosystem" class={`topbar-nav-link ${isEcosystem ? "active" : ""}`}>
  Ecosystem
</a>
```

**Step 4: Add routing conditional (before isDatabase check, ~line 202)**

```tsx
{isEcosystem ? (
  <EcosystemLayout route={route} />
) : isOrchestrator ? (
```

**Step 5: Add EcosystemOverview import placeholder at top**

For now, just import the overview component (created in Task 4):
```typescript
import { EcosystemOverview } from "./components/ecosystem/EcosystemOverview";
```

**Step 6: Verify tab appears in browser**

Open `http://localhost:3131` — "Ecosystem" nav link visible, clicking it shows sub-tabs and "Overview" placeholder.

**Step 7: Commit**

```
git add ui/src/app.tsx
git commit -m "feat(ecosystem): wire routing, sub-nav, and layout in app.tsx"
```

---

## Task 4: EcosystemOverview + Base CSS

**Files:**
- Create: `ui/src/components/ecosystem/EcosystemOverview.tsx`
- Modify: `ui/src/styles/layout.css` (append after line 4569)

**Step 1: Create EcosystemOverview component**

Fetches `/api/ecosystem/overview`, renders stat cards per section + key files list. Pattern mirrors `DbOverview.tsx`.

```tsx
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
```

**Step 2: Append ecosystem CSS to layout.css (after line 4569)**

```css
/* ===== Ecosystem Tab ===== */

.eco-layout {
  max-width: 1400px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.eco-content {
  padding-top: 16px;
}

.eco-sub-nav {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0;
  margin-bottom: 0;
}

.eco-sub-nav-link {
  font-size: 13px;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 8px 14px;
  border-radius: 6px 6px 0 0;
  transition: all 0.15s;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.eco-sub-nav-link:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.eco-sub-nav-link.active {
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-bottom-color: var(--accent);
}

.eco-stat-cards {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.eco-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 100px;
  flex: 1;
}

.eco-stat-card--link {
  text-decoration: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

.eco-stat-card--link:hover {
  border-color: var(--accent);
}

.eco-stat-value {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
}

.eco-stat-label {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 2px;
  text-align: center;
}

.eco-section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 20px 0 8px;
  color: var(--text-primary);
}

.eco-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.eco-section-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  text-decoration: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color 0.15s;
}

.eco-section-card:hover {
  border-color: var(--accent);
}

.eco-section-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.eco-section-card-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.eco-section-card-meta {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: auto;
}

.eco-key-files {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eco-key-file {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  text-decoration: none;
  font-size: 13px;
  transition: border-color 0.15s;
}

.eco-key-file:hover {
  border-color: var(--accent);
}

.eco-key-file-name {
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--text-primary);
}

.eco-key-file-size {
  font-size: 11px;
  color: var(--text-secondary);
}
```

**Step 3: Verify overview renders in browser**

Navigate to `http://localhost:3131/#/ecosystem` — stat cards and section grid visible.

**Step 4: Commit**

```
git add ui/src/components/ecosystem/EcosystemOverview.tsx ui/src/styles/layout.css
git commit -m "feat(ecosystem): overview page with stat cards and base CSS"
```

---

## Task 5: Viewers (4 components)

**Files:**
- Create: `ui/src/components/ecosystem/viewers/TextViewer.tsx`
- Create: `ui/src/components/ecosystem/viewers/MarkdownViewer.tsx`
- Create: `ui/src/components/ecosystem/viewers/JsonViewer.tsx`
- Create: `ui/src/components/ecosystem/viewers/JsonlViewer.tsx`
- Modify: `ui/src/styles/layout.css` (append viewer CSS)

All viewers are pure components: `({ content }: { content: string }) => JSX.Element`

**Step 1: Create TextViewer**

```tsx
import { h } from "preact";

export function TextViewer({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div class="eco-text-viewer">
      <pre class="eco-text-pre">
        <span class="eco-text-lines">{lines.map((_, i) => `${i + 1}\n`).join("")}</span>
        <code>{content}</code>
      </pre>
    </div>
  );
}
```

**Step 2: Create MarkdownViewer**

Hand-rolled regex MD-to-HTML converter. Handles headings, code blocks, bold, italic, links, lists, tables.

```tsx
import { h } from "preact";

function mdToHtml(md: string): string {
  let html = md;
  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="eco-md-code"><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="eco-md-inline">$1</code>');
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h4 class="eco-md-h3">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="eco-md-h2">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="eco-md-h1">$1</h2>');
  // Bold + italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="eco-md-link">$1</a>');
  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li class="eco-md-li">$1</li>');
  // Paragraphs (blank line separated)
  html = html.replace(/\n\n/g, "</p><p>");
  return `<p>${html}</p>`;
}

export function MarkdownViewer({ content }: { content: string }) {
  return (
    <div class="eco-md-viewer" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />
  );
}
```

**Step 3: Create JsonViewer**

Collapsible JSON tree with type-based color coding.

```tsx
import { h } from "preact";
import { useState } from "preact/hooks";

function JsonNode({ name, value, depth }: { name?: string; value: any; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const type = Array.isArray(value) ? "array" : typeof value;

  if (value === null) {
    return (
      <div class="eco-json-row" style={{ paddingLeft: `${depth * 16}px` }}>
        {name != null && <span class="eco-json-key">{name}: </span>}
        <span class="eco-json-null">null</span>
      </div>
    );
  }

  if (type === "object" || type === "array") {
    const entries = type === "array"
      ? value.map((v: any, i: number) => [String(i), v] as [string, any])
      : Object.entries(value);
    const bracket = type === "array" ? ["[", "]"] : ["{", "}"];
    return (
      <div>
        <div class="eco-json-row eco-json-toggle" style={{ paddingLeft: `${depth * 16}px` }} onClick={() => setOpen(!open)}>
          <span class="eco-json-arrow">{open ? "▾" : "▸"}</span>
          {name != null && <span class="eco-json-key">{name}: </span>}
          <span class="eco-json-bracket">{bracket[0]}</span>
          {!open && <span class="eco-json-collapsed"> {entries.length} items {bracket[1]}</span>}
        </div>
        {open && entries.map(([k, v]) => <JsonNode key={k} name={k} value={v} depth={depth + 1} />)}
        {open && <div class="eco-json-row" style={{ paddingLeft: `${depth * 16}px` }}><span class="eco-json-bracket">{bracket[1]}</span></div>}
      </div>
    );
  }

  const colorClass = type === "string" ? "eco-json-string" : type === "number" ? "eco-json-number" : type === "boolean" ? "eco-json-bool" : "";
  const display = type === "string" ? `"${value}"` : String(value);

  return (
    <div class="eco-json-row" style={{ paddingLeft: `${depth * 16}px` }}>
      {name != null && <span class="eco-json-key">{name}: </span>}
      <span class={colorClass}>{display}</span>
    </div>
  );
}

export function JsonViewer({ content }: { content: string }) {
  const [raw, setRaw] = useState(false);
  try {
    const parsed = JSON.parse(content);
    return (
      <div class="eco-json-viewer">
        <div class="eco-json-toolbar">
          <button class={`eco-json-btn ${!raw ? "active" : ""}`} onClick={() => setRaw(false)}>Tree</button>
          <button class={`eco-json-btn ${raw ? "active" : ""}`} onClick={() => setRaw(true)}>Raw</button>
        </div>
        {raw ? <pre class="eco-text-pre"><code>{JSON.stringify(parsed, null, 2)}</code></pre> : <JsonNode value={parsed} depth={0} />}
      </div>
    );
  } catch {
    return <pre class="eco-text-pre"><code>{content}</code></pre>;
  }
}
```

**Step 4: Create JsonlViewer**

Line-by-line with pagination (50 per page) and per-line expand.

```tsx
import { h } from "preact";
import { useState } from "preact/hooks";

const PAGE_SIZE = 50;

function JsonlLine({ line, index }: { line: string; index: number }) {
  const [expanded, setExpanded] = useState(false);
  let parsed: any;
  try { parsed = JSON.parse(line); } catch { parsed = null; }

  return (
    <div class="eco-jsonl-line">
      <div class="eco-jsonl-header" onClick={() => setExpanded(!expanded)}>
        <span class="eco-jsonl-num">{index + 1}</span>
        <span class="eco-jsonl-arrow">{expanded ? "▾" : "▸"}</span>
        <span class="eco-jsonl-preview">{line.length > 120 ? line.slice(0, 120) + "..." : line}</span>
      </div>
      {expanded && parsed && (
        <pre class="eco-jsonl-expanded">{JSON.stringify(parsed, null, 2)}</pre>
      )}
    </div>
  );
}

export function JsonlViewer({ content }: { content: string }) {
  const allLines = content.split("\n").filter((l) => l.trim());
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? allLines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : allLines;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageLines = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div class="eco-jsonl-viewer">
      <div class="eco-jsonl-toolbar">
        <input
          class="eco-jsonl-filter"
          type="text"
          placeholder="Filter lines..."
          value={filter}
          onInput={(e) => { setFilter((e.target as HTMLInputElement).value); setPage(0); }}
        />
        <span class="eco-jsonl-count">{filtered.length} lines</span>
      </div>
      {pageLines.map((line, i) => (
        <JsonlLine key={page * PAGE_SIZE + i} line={line} index={page * PAGE_SIZE + i} />
      ))}
      {totalPages > 1 && (
        <div class="eco-jsonl-pagination">
          <button class="eco-jsonl-page-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
          <span>{page + 1} / {totalPages}</span>
          <button class="eco-jsonl-page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
```

**Step 5: Append viewer CSS to layout.css**

```css
/* ===== Ecosystem Viewers ===== */

.eco-text-viewer {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: auto;
  max-height: 600px;
}

.eco-text-pre {
  margin: 0;
  padding: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.5;
  display: flex;
  gap: 16px;
}

.eco-text-lines {
  color: var(--text-secondary);
  text-align: right;
  user-select: none;
  min-width: 30px;
  white-space: pre;
}

/* Markdown */
.eco-md-viewer {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  overflow: auto;
  max-height: 600px;
}

.eco-md-viewer h2, .eco-md-viewer h3, .eco-md-viewer h4 {
  margin: 16px 0 8px;
  color: var(--text-primary);
}

.eco-md-h1 { font-size: 18px; }
.eco-md-h2 { font-size: 16px; }
.eco-md-h3 { font-size: 14px; }

.eco-md-code {
  background: var(--bg-tertiary);
  border-radius: 6px;
  padding: 10px 14px;
  margin: 8px 0;
  overflow-x: auto;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
}

.eco-md-inline {
  background: var(--bg-tertiary);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
}

.eco-md-link {
  color: var(--accent);
}

.eco-md-li {
  list-style: disc;
  margin-left: 20px;
}

/* JSON */
.eco-json-viewer {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: auto;
  max-height: 600px;
}

.eco-json-toolbar {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.eco-json-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-secondary);
  padding: 2px 10px;
  font-size: 11px;
  cursor: pointer;
}

.eco-json-btn.active {
  color: var(--text-primary);
  border-color: var(--accent);
}

.eco-json-row {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.6;
  padding: 0 12px;
}

.eco-json-toggle {
  cursor: pointer;
}

.eco-json-toggle:hover {
  background: var(--bg-tertiary);
}

.eco-json-arrow {
  color: var(--text-secondary);
  margin-right: 4px;
  font-size: 10px;
}

.eco-json-key {
  color: var(--text-primary);
}

.eco-json-string { color: #98c379; }
.eco-json-number { color: #61afef; }
.eco-json-bool { color: #e5c07b; }
.eco-json-null { color: #5c6370; }

.eco-json-bracket {
  color: var(--text-secondary);
}

.eco-json-collapsed {
  color: var(--text-secondary);
  font-style: italic;
}

/* JSONL */
.eco-jsonl-viewer {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: auto;
  max-height: 600px;
}

.eco-jsonl-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.eco-jsonl-filter {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 4px 10px;
  font-size: 12px;
  flex: 1;
  font-family: inherit;
}

.eco-jsonl-count {
  font-size: 11px;
  color: var(--text-secondary);
}

.eco-jsonl-line {
  border-bottom: 1px solid var(--border);
}

.eco-jsonl-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  cursor: pointer;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
}

.eco-jsonl-header:hover {
  background: var(--bg-tertiary);
}

.eco-jsonl-num {
  color: var(--text-secondary);
  min-width: 30px;
  text-align: right;
  font-size: 11px;
}

.eco-jsonl-arrow {
  color: var(--text-secondary);
  font-size: 10px;
}

.eco-jsonl-preview {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eco-jsonl-expanded {
  margin: 0;
  padding: 8px 12px 8px 52px;
  background: var(--bg-tertiary);
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.5;
  border-top: 1px solid var(--border);
}

.eco-jsonl-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px;
  font-size: 12px;
}

.eco-jsonl-page-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  padding: 3px 10px;
  font-size: 11px;
  cursor: pointer;
}

.eco-jsonl-page-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
```

**Step 6: Commit**

```
git add ui/src/components/ecosystem/viewers/
git commit -m "feat(ecosystem): add text, markdown, JSON, and JSONL viewer components"
```

---

## Task 6: FileBrowser (Two-Column Layout)

**Files:**
- Create: `ui/src/components/ecosystem/FileBrowser.tsx`
- Modify: `ui/src/styles/layout.css` (append file browser CSS)
- Modify: `ui/src/app.tsx` (replace Browse placeholder with FileBrowser import)

**Step 1: Create FileBrowser**

Two-column layout: left tree panel + right viewer panel. Breadcrumbs at top. Viewer auto-selected by `content_type` from API response.

```tsx
import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { TextViewer } from "./viewers/TextViewer";
import { MarkdownViewer } from "./viewers/MarkdownViewer";
import { JsonViewer } from "./viewers/JsonViewer";
import { JsonlViewer } from "./viewers/JsonlViewer";

interface TreeEntry {
  name: string;
  type: string;
  size: number;
  modified: string;
  extension?: string;
  children_count?: number;
}

interface FileData {
  path: string;
  content_type: string;
  content: string;
  size: number;
  modified: string;
  truncated: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function FileBrowser() {
  const [currentPath, setCurrentPath] = useState(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    return params.get("path") || "";
  });
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch directory listing
  useEffect(() => {
    fetch(`/api/ecosystem/tree?path=${encodeURIComponent(currentPath)}`)
      .then((r) => r.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => setEntries([]));
  }, [currentPath]);

  // Update hash when path changes
  useEffect(() => {
    const base = "#/ecosystem/browse";
    const hash = currentPath ? `${base}?path=${encodeURIComponent(currentPath)}` : base;
    if (window.location.hash !== hash) {
      history.replaceState(null, "", hash);
    }
  }, [currentPath]);

  const openFile = (filePath: string) => {
    setLoading(true);
    const linesParam = filePath.endsWith(".jsonl") ? "&lines=200" : "";
    fetch(`/api/ecosystem/file?path=${encodeURIComponent(filePath)}${linesParam}`)
      .then((r) => r.json())
      .then((data) => { setSelectedFile(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const navigateDir = (dirPath: string) => {
    setCurrentPath(dirPath);
    setSelectedFile(null);
  };

  // Breadcrumbs
  const parts = currentPath ? currentPath.split("/") : [];
  const breadcrumbs = [{ label: "~/.claude", path: "" }];
  parts.forEach((p, i) => {
    breadcrumbs.push({ label: p, path: parts.slice(0, i + 1).join("/") });
  });

  return (
    <div class="eco-browser">
      <div class="eco-breadcrumb">
        {breadcrumbs.map((b, i) => (
          <span key={i}>
            {i > 0 && <span class="eco-breadcrumb-sep">/</span>}
            <a class="eco-breadcrumb-link" onClick={() => navigateDir(b.path)}>{b.label}</a>
          </span>
        ))}
      </div>
      <div class="eco-two-col">
        <div class="eco-tree-panel">
          {entries.map((e) => (
            <div
              key={e.name}
              class={`eco-tree-item ${e.type === "directory" ? "eco-tree-dir" : "eco-tree-file"}`}
              onClick={() => {
                const fullPath = currentPath ? `${currentPath}/${e.name}` : e.name;
                e.type === "directory" ? navigateDir(fullPath) : openFile(fullPath);
              }}
            >
              <span class="eco-tree-icon">{e.type === "directory" ? "📁" : "📄"}</span>
              <span class="eco-tree-name">{e.name}</span>
              <span class="eco-tree-meta">
                {e.type === "directory" ? `${e.children_count} items` : formatBytes(e.size)}
              </span>
            </div>
          ))}
          {entries.length === 0 && <div class="eco-tree-empty">Empty directory</div>}
        </div>
        <div class="eco-viewer-panel">
          {loading ? (
            <div class="db-placeholder">Loading...</div>
          ) : selectedFile ? (
            <div>
              <div class="eco-viewer-header">
                <span class="eco-viewer-filename">{selectedFile.path}</span>
                <span class="eco-viewer-size">{formatBytes(selectedFile.size)}</span>
              </div>
              {selectedFile.content_type === "markdown" ? (
                <MarkdownViewer content={selectedFile.content} />
              ) : selectedFile.content_type === "json" ? (
                <JsonViewer content={selectedFile.content} />
              ) : selectedFile.content_type === "jsonl" ? (
                <JsonlViewer content={selectedFile.content} />
              ) : (
                <TextViewer content={selectedFile.content} />
              )}
              {selectedFile.truncated && <div class="eco-viewer-truncated">File truncated</div>}
            </div>
          ) : (
            <div class="db-placeholder">Select a file to view</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Append file browser CSS to layout.css**

```css
/* ===== Ecosystem File Browser ===== */

.eco-browser {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.eco-breadcrumb {
  font-size: 13px;
  padding: 8px 0;
}

.eco-breadcrumb-link {
  color: var(--accent);
  cursor: pointer;
  text-decoration: none;
}

.eco-breadcrumb-link:hover {
  text-decoration: underline;
}

.eco-breadcrumb-sep {
  color: var(--text-secondary);
  margin: 0 4px;
}

.eco-two-col {
  display: flex;
  gap: 16px;
  min-height: 500px;
}

.eco-tree-panel {
  flex: 0 0 300px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow-y: auto;
  max-height: 600px;
}

.eco-viewer-panel {
  flex: 1;
  min-width: 0;
}

.eco-tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
  transition: background 0.1s;
}

.eco-tree-item:hover {
  background: var(--bg-tertiary);
}

.eco-tree-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.eco-tree-name {
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eco-tree-meta {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.eco-tree-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.eco-viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.eco-viewer-filename {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 13px;
  color: var(--text-primary);
}

.eco-viewer-size {
  font-size: 11px;
  color: var(--text-secondary);
}

.eco-viewer-truncated {
  padding: 8px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-radius: 0 0 8px 8px;
}
```

**Step 3: Update app.tsx — import FileBrowser, replace placeholder in EcosystemLayout**

Replace `<EcosystemPlaceholder section="Browse" />` with `<FileBrowser />` and add the import.

**Step 4: Verify in browser**

Navigate to `#/ecosystem/browse` — directory tree loads, clicking files renders them in correct viewer.

**Step 5: Commit**

```
git add ui/src/components/ecosystem/FileBrowser.tsx ui/src/styles/layout.css ui/src/app.tsx
git commit -m "feat(ecosystem): two-column file browser with viewer dispatch"
```

---

## Task 7: Section Panels (Agents, Plans, Skills, Projects, Settings)

**Files:**
- Create: `ui/src/components/ecosystem/AgentsPanel.tsx`
- Create: `ui/src/components/ecosystem/PlansPanel.tsx`
- Create: `ui/src/components/ecosystem/SkillsPanel.tsx`
- Create: `ui/src/components/ecosystem/ProjectsPanel.tsx`
- Create: `ui/src/components/ecosystem/SettingsPanel.tsx`
- Modify: `ui/src/app.tsx` (import panels, replace all placeholders in EcosystemLayout)

All section panels follow the same pattern: fetch entries from `/api/ecosystem/tree?path=<section>`, render a list, clicking an item fetches `/api/ecosystem/file` and shows it in the appropriate viewer. Use the same viewers from Task 5.

**Step 1: Create AgentsPanel** (template for all panels)

```tsx
import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { MarkdownViewer } from "./viewers/MarkdownViewer";
import { TextViewer } from "./viewers/TextViewer";

interface Entry { name: string; type: string; size: number; extension?: string; }

export function AgentsPanel() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<{ path: string; content: string; content_type: string } | null>(null);

  useEffect(() => {
    fetch("/api/ecosystem/tree?path=agents")
      .then((r) => r.json())
      .then((data) => setEntries((data.entries || []).filter((e: Entry) => e.type === "file")))
      .catch(() => {});
  }, []);

  const openFile = (name: string) => {
    fetch(`/api/ecosystem/file?path=agents/${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((data) => setSelected(data))
      .catch(() => {});
  };

  return (
    <div class="eco-two-col">
      <div class="eco-tree-panel">
        {entries.map((e) => (
          <div key={e.name} class="eco-tree-item eco-tree-file" onClick={() => openFile(e.name)}>
            <span class="eco-tree-name">{e.name}</span>
          </div>
        ))}
        {entries.length === 0 && <div class="eco-tree-empty">No agents found</div>}
      </div>
      <div class="eco-viewer-panel">
        {selected ? (
          selected.content_type === "markdown" ? <MarkdownViewer content={selected.content} /> : <TextViewer content={selected.content} />
        ) : (
          <div class="db-placeholder">Select an agent to view</div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create PlansPanel, SkillsPanel, ProjectsPanel**

Same pattern as AgentsPanel, changing:
- `path=agents` → `path=plans`, `path=skills`, `path=projects`
- Empty message: "No plans found", "No skills found", "No projects found"
- SkillsPanel and ProjectsPanel show directories too (they have subdirectories), so keep directory entries and allow clicking to navigate into them.

**Step 3: Create SettingsPanel**

Slightly different — shows `settings.json` (JsonViewer) + `CLAUDE.md` (MarkdownViewer) side by side.

```tsx
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
```

**Step 4: Update app.tsx imports and EcosystemLayout routing**

Replace all `EcosystemPlaceholder` calls with actual component references. Remove the `EcosystemPlaceholder` function. Add imports for all 5 panels + FileBrowser.

**Step 5: Verify all sub-tabs in browser**

Click through each sub-tab: Agents, Plans, Skills, Projects, Settings — verify data loads.

**Step 6: Commit**

```
git add ui/src/components/ecosystem/*.tsx ui/src/app.tsx
git commit -m "feat(ecosystem): add agents, plans, skills, projects, settings panels"
```

---

## Task 8: CSS Polish + Responsive Breakpoints

**Files:**
- Modify: `ui/src/styles/layout.css` (append responsive rules)

**Step 1: Append responsive CSS**

```css
/* ===== Ecosystem Responsive ===== */

@media (max-width: 768px) {
  .eco-cards-grid {
    grid-template-columns: 1fr;
  }

  .eco-two-col {
    flex-direction: column;
  }

  .eco-tree-panel {
    flex: none;
    max-height: 250px;
  }

  .eco-stat-cards {
    flex-direction: column;
  }

  .eco-sub-nav {
    overflow-x: auto;
  }

  .eco-sub-nav-link {
    white-space: nowrap;
  }
}
```

**Step 2: Visual review in browser**

Check all tabs at desktop and narrow viewport widths.

**Step 3: Commit**

```
git add ui/src/styles/layout.css
git commit -m "feat(ecosystem): responsive breakpoints and CSS polish"
```

---

## Verification

1. `bun run src/cli.ts dashboard` — dashboard starts without build errors
2. Navigate to `http://localhost:3131/#/ecosystem` — overview loads with stat cards
3. Click each sub-tab — verify data loads for agents, plans, skills, projects, settings
4. Browse tab — navigate directory tree, open .md/.json/.jsonl files with correct viewers
5. API test: `curl http://localhost:3131/api/ecosystem/overview | jq .`
6. API test: `curl "http://localhost:3131/api/ecosystem/file?path=settings.json" | jq .content_type` → `"json"`
7. Security test: `curl "http://localhost:3131/api/ecosystem/file?path=../../etc/passwd"` → 403
8. Responsive: resize browser to < 768px — layout stacks properly
