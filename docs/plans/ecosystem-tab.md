# Ecosystem Tab - Implementation Plan

## Context

The CC-Agent Dashboard needs a new "Ecosystem" tab that provides a visual browser for `~/.claude`, letting users see what's inside their Claude Code environment (agents, plans, plugins, projects, settings, history). The API doubles as a programmatic interface for Claude Code skills to introspect their ecosystem.

## Architecture

**Pattern:** Mirrors the existing Database tab exactly — `EcosystemSubNav` + `EcosystemLayout` in `app.tsx`, Hono sub-app for API, section panels for curated views, general file browser for everything else.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/dashboard/api/ecosystem.ts` | REST API: tree listing, file reading, overview stats, search |
| `ui/src/components/ecosystem/EcosystemOverview.tsx` | Landing page with stat cards + quick links per section |
| `ui/src/components/ecosystem/FileBrowser.tsx` | Two-column file tree + content viewer with breadcrumbs |
| `ui/src/components/ecosystem/AgentsPanel.tsx` | Agent list from `~/.claude/agents/` with MD preview |
| `ui/src/components/ecosystem/PlansPanel.tsx` | Plan list from `~/.claude/plans/` with MD preview |
| `ui/src/components/ecosystem/SkillsPanel.tsx` | Skills from `~/.claude/skills/` with directory contents |
| `ui/src/components/ecosystem/ProjectsPanel.tsx` | Projects list with session counts and sizes |
| `ui/src/components/ecosystem/SettingsPanel.tsx` | settings.json (JSON viewer) + CLAUDE.md (MD viewer) + plugins config |
| `ui/src/components/ecosystem/viewers/MarkdownViewer.tsx` | Regex-based MD-to-HTML (headings, code blocks, lists, bold, links) |
| `ui/src/components/ecosystem/viewers/JsonViewer.tsx` | Collapsible JSON tree with type-based color coding |
| `ui/src/components/ecosystem/viewers/JsonlViewer.tsx` | Line-by-line JSONL with pagination + per-line expand |
| `ui/src/components/ecosystem/viewers/TextViewer.tsx` | `<pre>` with line numbers, fallback for .sh/.js/.ts |

## Files to Modify

| File | Change |
|------|--------|
| `src/dashboard/server.ts` | Import + register `app.route("/api/ecosystem", ecosystemApi)` |
| `ui/src/app.tsx` | Add nav link, route check, `EcosystemSubNav`, `EcosystemLayout`, isHome exclusion |
| `ui/src/styles/layout.css` | Append `eco-` prefixed CSS (layout, tree, viewer, breadcrumb styles) |

---

## API Design (`/api/ecosystem`)

All endpoints are **read-only GET**. Base path: `~/.claude`. Every `path` param validated against traversal attacks (reject `..`, confirm resolved path starts with `~/.claude`).

### `GET /overview`
Returns section stats (agents, plans, skills, projects, plugins, hooks, commands, tasks, teams) with item counts, sizes, descriptions. Plus key files list (settings.json, CLAUDE.md, history.jsonl).

### `GET /tree?path=<rel>&depth=1`
Directory listing at relative path. Returns entries with name, type, size, last_modified, extension, children_count. Max depth 3.

### `GET /file?path=<rel>&limit=524288&lines=50`
File content with auto-detected content_type (markdown/json/jsonl/text/binary). Supports `lines` param for JSONL pagination (newest first). Max 2MB. Returns `truncated: boolean`.

### `GET /search?q=<query>&type=file|content`
Filename or content search. Skips large dirs (todos, debug, session-env) for content search. Max 100 results.

---

## UI Structure

### Navigation (in `app.tsx`)
```
#/ecosystem           -> EcosystemOverview
#/ecosystem/agents    -> AgentsPanel
#/ecosystem/plans     -> PlansPanel
#/ecosystem/skills    -> SkillsPanel
#/ecosystem/projects  -> ProjectsPanel
#/ecosystem/settings  -> SettingsPanel
#/ecosystem/browse    -> FileBrowser (general, with ?path= deep linking)
```

Sub-nav tabs: Overview | Agents | Plans | Skills | Projects | Settings | Browse

### Data Flow
- Each panel fetches from `/api/ecosystem/tree` or `/api/ecosystem/file`
- Loading/error states follow existing `db-placeholder` pattern
- Viewers are pure components receiving `content: string` as prop
- FileBrowser: left tree panel + right viewer panel, viewer auto-selected by content_type

### Viewers
- **MarkdownViewer**: Hand-rolled regex converter (no external lib, matches codebase convention). Handles `#`-`###`, `` ``` ``, `**`, `*`, `[]()`  lists, tables.
- **JsonViewer**: `JSON.parse` → collapsible tree. Colors: strings=green, numbers=blue, booleans=yellow, null=gray. Raw/formatted toggle.
- **JsonlViewer**: Split by `\n`, parse each line, 50 lines/page with pagination. Per-line expand/collapse. Filter input.
- **TextViewer**: `<pre>` with line numbers in monospace.

---

## CSS Approach
- Prefix all new classes `eco-` (following `db-` convention)
- Reuse `db-stat-cards`, `db-stat-card`, `db-sub-nav`, `db-sub-nav-link` patterns (copy structure with `eco-` prefix)
- New styles: `eco-two-col` (flexbox split), `eco-tree-panel`, `eco-viewer-panel`, `eco-tree-item`, `eco-breadcrumb`, viewer-specific styles
- All using existing CSS vars (`--bg-secondary`, `--border`, `--accent`, `--text-primary`, etc.)

---

## Implementation Order

### Step 1: API (`src/dashboard/api/ecosystem.ts`)
Path security helper, content-type detection, all 4 endpoints.

### Step 2: Server registration (`src/dashboard/server.ts`)
Import + route mounting.

### Step 3: Route wiring (`ui/src/app.tsx`)
`isEcosystem` check, nav link, `EcosystemSubNav`, `EcosystemLayout`, imports.

### Step 4: Overview (`EcosystemOverview.tsx`) + base CSS
Stat cards, section list, quick links. Reuse `db-stat-card` pattern.

### Step 5: Viewers (all 4)
TextViewer → MarkdownViewer → JsonViewer → JsonlViewer.

### Step 6: FileBrowser
Two-column layout, tree navigation, breadcrumbs, viewer dispatch.

### Step 7: Section Panels
AgentsPanel, PlansPanel, SkillsPanel, ProjectsPanel, SettingsPanel.

### Step 8: CSS polish
Responsive breakpoints, hover states, transitions.

---

## Key Decisions
- **No external MD library** — hand-rolled regex parser keeps bundle lean (matches codebase convention of zero rendering libs)
- **Path traversal hardened** — every path param validated since API is localhost-accessible by skills
- **Large file pagination** — history.jsonl served via lines param, not loaded whole
- **Skip noisy dirs** — todos/ (2055), debug/ (724), session-env/ (406) excluded from search/overview

## Verification
1. `bun run src/cli.ts dashboard` — start dashboard, verify build succeeds
2. Navigate to `http://localhost:3131/#/ecosystem` — overview loads with stat cards
3. Click each sub-tab — verify data loads for agents, plans, skills, projects, settings
4. Browse tab — navigate directory tree, open .md/.json/.jsonl files with correct viewers
5. API test: `curl http://localhost:3131/api/ecosystem/overview | jq` — returns valid JSON
6. API test: `curl "http://localhost:3131/api/ecosystem/file?path=settings.json"` — returns settings content
7. Security test: `curl "http://localhost:3131/api/ecosystem/file?path=../../etc/passwd"` — returns 403
