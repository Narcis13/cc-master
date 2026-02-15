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
