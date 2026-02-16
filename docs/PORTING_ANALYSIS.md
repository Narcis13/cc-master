# CC-Orchestrator Porting Analysis

> Comprehensive technical assessment of porting cc-orchestrator from Bun+Hono+Preact to (1) an Electron desktop app and (2) a Go CLI. Produced after exhaustive line-by-line analysis of the entire codebase (61 files, ~109K tokens).

---

## Table of Contents

1. [Current Architecture Summary](#1-current-architecture-summary)
2. [What Makes This Codebase Unique](#2-what-makes-this-codebase-unique)
3. [Option 1: Electron Desktop App](#3-option-1-electron-desktop-app)
4. [Option 2: Go CLI](#4-option-2-go-cli)
5. [Side-by-Side Comparison](#5-side-by-side-comparison)
6. [Sincere Objective Advice](#6-sincere-objective-advice)
7. [Recommended Path](#7-recommended-path)

---

## 1. Current Architecture Summary

### Technology Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Runtime | **Bun** | TypeScript execution, built-in SQLite, HTTP server, bundler |
| CLI | Custom arg parser | 30+ commands across 9 groups |
| Process Mgmt | **tmux** | Session multiplexing, background agents, capture/send |
| HTTP Server | **Hono** | REST API (30+ endpoints), SSE streaming |
| WebSocket | **Bun.serve** native | Bidirectional terminal streaming |
| UI Framework | **Preact** | 45+ components, hash routing, SSE hooks |
| Terminal UI | **xterm.js** | In-browser terminal emulation |
| Database | **bun:sqlite** (built-in) | WAL mode, 9 tables, analytics/queue/triggers |
| Persistence | JSON files | Job metadata at `~/.cc-agent/jobs/` |
| Logging | `script` command | Terminal output capture with ANSI preservation |

### Component Inventory

| Component | Files | Estimated LoC | Complexity |
|-----------|-------|--------------|------------|
| CLI entry + arg parsing | 1 | ~600 | Medium |
| Job lifecycle (CRUD, status, enrichment) | 1 | ~500 | High |
| tmux integration (sessions, send, capture) | 1 | ~400 | High |
| Session parser (JSONL/JSON, tokens, tools) | 1 | ~350 | High |
| Config + file loading | 2 | ~200 | Low |
| Orchestrator core (lifecycle, state, context) | 1 | ~300 | Medium |
| Pulse loop (10s heartbeat, queue, health) | 1 | ~250 | High |
| Trigger engine (cron, event, threshold, approvals) | 1 | ~400 | High |
| Mode presets | 1 | ~150 | Low |
| Dashboard server (Hono, WS, build, pidfile) | 1 | ~300 | Medium |
| Dashboard state (watch, SSE, context lifecycle) | 1 | ~350 | High |
| SQLite persistence (9 tables, analytics) | 1 | ~600 | High |
| Event bus | 1 | ~20 | Trivial |
| API routes (12 route groups) | 12 | ~1500 | Medium |
| Events reader (JSONL tail-follow) | 1 | ~100 | Low |
| Terminal streamer (byte-offset delta) | 1 | ~120 | Medium |
| Hooks (relay script, manager) | 2 | ~200 | Low |
| Daemon prefs | 1 | ~50 | Trivial |
| **UI Components** | **45+** | **~4000** | **High** |
| UI Hooks (useJobs, useTerminal, useSession) | 3 | ~400 | Medium |
| UI Styles (theme + layout CSS) | 2 | ~500 | Medium |
| Plugin/skill system | 6 skills | ~2000 | Medium |
| Shell wrapper + install script | 2 | ~150 | Low |
| **TOTAL** | **~85** | **~13,000** | |

### Key System Dependencies

1. **tmux** - Absolutely central. Every agent runs in a tmux session. Send, capture, kill, list, attach - all tmux primitives.
2. **Claude Code CLI** - The `claude` binary with `--dangerously-skip-permissions`.
3. **`script` command** - Unix utility for terminal output logging.
4. **Bun built-in SQLite** - Zero-dependency embedded database (via `bun:sqlite`).
5. **Bun bundler** - Builds Preact UI on dashboard startup.
6. **Filesystem watching** - `fs.watch()` on jobs directory.

---

## 2. What Makes This Codebase Unique

Before analyzing porting options, it is essential to understand the **non-obvious architectural constraints** that make this project special:

### 2.1 tmux Is the Core, Not a Detail

tmux is not "just" a process manager here. It is the **execution substrate**:
- Agents survive terminal disconnects (decoupled from parent)
- `send-keys` enables injecting prompts into running Claude sessions (bidirectional communication)
- `capture-pane` enables reading live output without log file parsing
- `load-buffer`/`paste-buffer` handles prompts >5000 chars
- Session existence checks detect crashes
- The Escape + sleep + /clear sequence for context resets depends on tmux's TUI timing

**Porting impact:** Any replacement must replicate ALL of these tmux primitives. This is the single hardest porting challenge.

### 2.2 Bun Is a Swiss Army Knife Here

Bun provides 5 distinct capabilities simultaneously:
1. TypeScript execution (no compile step)
2. Built-in SQLite (`bun:sqlite`)
3. HTTP server with native WebSocket upgrade
4. Bundler (builds Preact UI)
5. File watcher (fast fs.watch)

**Porting impact:** Replacing Bun means replacing 5 things, not 1.

### 2.3 The UI Is Tightly Coupled to the Backend

The Preact UI is:
- Built on-the-fly by the dashboard server (`Bun.build()` on startup)
- Served as static files by the same Hono server
- Connected via SSE (same origin, no CORS)
- Connected via WebSocket for terminal streaming
- 45+ components with ~4000 lines of custom code

**Porting impact:** The UI either comes along wholesale or gets rebuilt from scratch.

### 2.4 Session Parsing Is Claude-Specific

The session parser understands Claude Code's internal JSONL format:
- Event-based messages (`event_msg`, `response_item`)
- Token extraction from `token_count` payloads
- File modification detection from `apply_patch` tool calls
- Subagent discovery from `Task` tool calls

**Porting impact:** This parsing logic must be reimplemented in the target language.

---

## 3. Option 1: Electron Desktop App

### 3.1 What Would Change

| Aspect | Current (Bun+Hono) | Electron |
|--------|-------------------|----------|
| Runtime | Bun | Node.js (Electron's main process) |
| HTTP Server | Hono on Bun.serve | Not needed (IPC replaces HTTP) |
| UI Rendering | Preact in browser tab | Preact/React in Electron renderer |
| SQLite | bun:sqlite | better-sqlite3 or sql.js |
| WebSocket | Bun.serve native upgrade | Not needed (IPC replaces WS) |
| UI Build | Bun.build() on startup | Webpack/Vite at build time |
| Distribution | git clone + bun install | .dmg/.AppImage/.exe installer |
| Terminal | xterm.js in browser | xterm.js in Electron (same!) |
| Process Mgmt | tmux | tmux (unchanged) OR node-pty |

### 3.2 Pros

1. **Native desktop experience** - Taskbar icon, system tray, notifications, keyboard shortcuts at OS level, always running.

2. **No browser tab dependency** - Currently, closing the browser tab kills the dashboard connection. Electron persists.

3. **IPC replaces HTTP/WebSocket** - Electron's contextBridge and ipcRenderer/ipcMain eliminate network overhead. No CORS, no SSE reconnection logic, no port conflicts.

4. **System-level integrations** - File dialogs for selecting CWD, native menus, auto-launch on login, global hotkeys to spawn agents.

5. **UI code largely reusable** - Preact components (45+) can port to React with minimal changes (Preact is React-API-compatible). CSS is vanilla - no framework dependency.

6. **xterm.js works natively** - Terminal panel component is identical. WebGL renderer may even perform better in Electron.

7. **Offline-capable** - No web server needed; everything runs locally via IPC.

8. **Auto-update mechanism** - electron-updater provides seamless updates.

9. **Professional packaging** - .dmg, .AppImage, .exe with proper icons, signing, notarization.

### 3.3 Cons

1. **Massive binary size** - Electron bundles Chromium (~150-250MB). For a CLI tool that currently installs in <5MB, this is a 50x size increase.

2. **Memory overhead** - Electron runs 2 processes minimum (main + renderer). Base memory ~150-300MB. Current Bun process uses ~30-50MB. Combined with tmux sessions and Claude processes, memory pressure is real.

3. **Bun-specific APIs need replacement:**
   - `bun:sqlite` -> `better-sqlite3` (npm, native addon, needs rebuild per platform)
   - `Bun.build()` -> Vite/Webpack (separate build pipeline)
   - `Bun.serve()` WebSocket -> either node-pty for terminals or electron IPC
   - `Bun.spawn()` -> `child_process.spawn()` (minor)

4. **tmux still required** - Electron doesn't eliminate the tmux dependency. You still need tmux for agent session management. Electron users on macOS/Linux must install tmux separately. Windows users need WSL.

5. **IPC complexity** - Replacing HTTP routes with IPC channels means rewriting ALL 30+ API endpoints as IPC handlers. The architectural change is not trivial - it is a different communication paradigm.

6. **Build pipeline complexity** - Electron apps need:
   - Main process bundling
   - Renderer process bundling (separate)
   - Native module compilation (better-sqlite3)
   - Code signing (macOS notarization, Windows signing)
   - Auto-update server infrastructure
   - CI/CD for multi-platform builds

7. **Plugin system incompatibility** - Claude Code's plugin marketplace expects CLI tools, not desktop apps. The skill system (SKILL.md files) works because Claude reads them from disk. This is unaffected by Electron, but the `cc-agent` CLI wrapper would need to coexist with or be replaced by the Electron app.

8. **Two processes to manage** - If you keep the CLI for headless use AND add Electron for GUI, you now maintain two entry points into the same codebase.

9. **Testing is harder** - Electron E2E testing (Spectron/Playwright) is significantly more complex than testing HTTP endpoints.

10. **Security surface** - Electron apps have a larger attack surface (Chromium vulnerabilities, nodeIntegration risks, preload script injection).

### 3.4 Migration Effort Breakdown

| Task | Effort | Notes |
|------|--------|-------|
| Project setup (electron-forge/electron-builder) | 2-3 days | Boilerplate, build config, packaging |
| Replace bun:sqlite with better-sqlite3 | 1-2 days | API is nearly identical, but native rebuilds per platform |
| Port Hono routes to IPC handlers | 3-5 days | 30+ endpoints, SSE -> IPC event push, WebSocket -> IPC |
| Port Preact to React (or keep Preact) | 1-2 days | Preact works in Electron; switching to React optional |
| Set up Vite/Webpack for renderer build | 1-2 days | Replace Bun.build() |
| Terminal streaming via IPC | 2-3 days | Replace WebSocket with IPC-based streaming |
| Native features (tray, notifications, menus) | 2-3 days | New functionality |
| Auto-update system | 2-3 days | electron-updater + release server |
| Code signing + packaging | 2-3 days | macOS notarization, Windows signing |
| Testing + debugging | 3-5 days | Platform-specific issues, IPC debugging |
| CLI coexistence | 1-2 days | Keep `cc-agent` CLI working alongside Electron |
| **Total** | **20-33 days** | **~1 month of full-time work** |

### 3.5 Difficulty Rating: 6/10

The UI code transfers well, tmux stays the same, and the main challenge is replacing Bun's built-in capabilities with Node.js equivalents + Electron IPC.

---

## 4. Option 2: Go CLI

### 4.1 What Would Change

| Aspect | Current (Bun+Hono) | Go |
|--------|-------------------|-----|
| Runtime | Bun (TypeScript) | Go (compiled binary) |
| Type System | TypeScript interfaces | Go structs + interfaces |
| HTTP Server | Hono | net/http or chi/echo/fiber |
| CLI | Custom arg parser | cobra or urfave/cli |
| SQLite | bun:sqlite | modernc.org/sqlite or mattn/go-sqlite3 |
| WebSocket | Bun.serve native | gorilla/websocket or nhooyr/websocket |
| UI Build | Bun.build() at runtime | embed directive (pre-built) |
| UI Framework | Preact (45+ components) | Keep Preact, build separately |
| Terminal Streaming | Custom byte-offset polling | Go goroutines + io.Reader |
| Session Parsing | TypeScript JSONL parser | Go encoding/json + bufio |
| Process Mgmt | child_process (Bun) | os/exec |
| File Watching | fs.watch() | fsnotify |
| Concurrency | Single-threaded + timers | Goroutines + channels |
| Distribution | git clone + bun install | Single static binary |

### 4.2 Pros

1. **Single static binary** - The killer advantage. No runtime dependencies (no Bun, no Node.js, no npm). Just `curl -L url -o cc-agent && chmod +x cc-agent`. Instant install, zero maintenance.

2. **Cross-compilation is trivial** - `GOOS=linux GOARCH=amd64 go build` produces a Linux binary from macOS. Covers darwin/amd64, darwin/arm64, linux/amd64, linux/arm64 with zero effort.

3. **Memory efficiency** - Go binary uses 10-20MB vs Bun's 30-50MB. With multiple agents running, this matters.

4. **Goroutines for the pulse loop** - The 10-second heartbeat, trigger evaluation, queue processing, and terminal streaming are naturally expressed as goroutines with channels. No event loop contortion, no `setTimeout` chains.

5. **Excellent tmux interop** - `os/exec.Command("tmux", ...)` is idiomatic Go. Process management is a Go strength.

6. **Pure Go SQLite exists** - `modernc.org/sqlite` is a pure Go SQLite implementation. No CGO, no native addons, no platform-specific compilation. It just works everywhere Go compiles.

7. **Startup time** - Go binary starts in <10ms. Bun starts in ~100ms. For a CLI tool invoked frequently, this is noticeable.

8. **No dependency hell** - No `node_modules`, no `bun.lock`, no version conflicts. Dependencies compiled into the binary.

9. **Better suited for daemon processes** - The dashboard runs as a background daemon. Go's syscall package provides proper daemonization (setsid, fork, etc.) vs the current `detached` child_process approach.

10. **embed directive for UI** - Go 1.16+ `//go:embed` bakes pre-built UI assets into the binary. No build step at runtime. Dashboard starts instantly.

11. **Robust error handling** - Go's explicit error returns prevent the silent failures scattered through the TypeScript codebase (silent try/catch blocks returning null).

### 4.3 Cons

1. **Complete rewrite** - This is not a port, it is a rewrite. Every line of TypeScript becomes Go code. Zero code reuse for the backend.

2. **UI requires separate build pipeline** - The 45+ Preact components stay as TypeScript/JSX. You need a separate `npm run build` (or bun build) to produce `dist/` assets, then embed them into the Go binary. Two languages, two build systems.

3. **Session parser is complex to rewrite** - The JSONL/JSON session parser handles multiple Claude Code formats, ANSI stripping, tool call pairing, and subagent detection. This is ~350 lines of nuanced TypeScript that must be carefully reimplemented.

4. **Cron parser reimplementation** - The trigger engine's cron matching (5-field expressions with ranges, lists, steps) needs reimplementation. Go libraries exist (robfig/cron) but the custom matching logic has specific behaviors that need preservation.

5. **No REPL for debugging** - TypeScript allows console.log debugging and REPL exploration. Go requires compile-run cycles.

6. **Loss of TypeScript ecosystem** - Hono's clean routing, Preact's hooks, Bun's built-in utilities - all replaced with Go equivalents that may be more verbose.

7. **JSON handling is verbose** - TypeScript: `const data = JSON.parse(str)`. Go: define struct, `json.Unmarshal([]byte(str), &data)`, handle error. Every JSON interaction becomes 5-10x more code.

8. **Template/string formatting** - The system prompts, injection messages, and formatted output use template literals extensively. Go's `fmt.Sprintf` is less ergonomic for multi-line templates.

9. **Plugin system needs redesign** - Skills are SKILL.md files read by Claude. The install script is bash. The marketplace.json is JSON. These survive, but the skill instructions reference `bun run src/cli.ts` and TypeScript-specific patterns.

10. **Go's learning curve** - If you are primarily a TypeScript developer, Go's error handling, struct composition, interface satisfaction, goroutine patterns, and channel communication have a real learning curve.

11. **Maintaining two languages** - The UI stays TypeScript (Preact). The backend becomes Go. You now develop in two languages with two toolchains.

### 4.4 Migration Effort Breakdown

| Task | Effort | Notes |
|------|--------|-------|
| Go project setup (modules, structure, cobra) | 1-2 days | Standard Go project layout |
| CLI arg parsing (30+ commands) | 3-4 days | cobra subcommands, flags, validation |
| Job system (CRUD, JSON persistence) | 2-3 days | Struct definitions, file I/O |
| tmux integration (all primitives) | 3-4 days | os/exec wrappers, output parsing |
| Session parser (JSONL/JSON, tokens, tools) | 4-5 days | Most complex rewrite piece |
| Config + file loading (glob, tokens) | 1-2 days | filepath.Glob, io/fs |
| Orchestrator core (lifecycle, state) | 2-3 days | State persistence, context parsing |
| Pulse loop (goroutine, ticker) | 2-3 days | Goroutines + time.Ticker |
| Trigger engine (cron, threshold, event) | 3-4 days | Cron parser, metric evaluation, approval state |
| Mode system | 1 day | Straightforward DB operations |
| HTTP server + all API routes | 4-5 days | chi/echo router, 30+ handlers |
| SSE implementation | 1-2 days | http.Flusher, event formatting |
| WebSocket terminal streaming | 2-3 days | gorilla/websocket, goroutine per connection |
| SQLite schema + queries (9 tables) | 3-4 days | modernc.org/sqlite, all CRUD operations |
| Dashboard state (file watcher, events) | 2-3 days | fsnotify, channels, event aggregation |
| Event bus + hooks | 1-2 days | Channels replace EventEmitter |
| Terminal streamer (byte-offset delta) | 1-2 days | io.ReadSeeker pattern |
| Hooks relay + manager | 1-2 days | Bash script stays, Go writes settings.json |
| UI build pipeline (separate) | 1-2 days | bun build -> //go:embed |
| Daemon management (pidfile, signals) | 1-2 days | syscall, os.Signal |
| Testing | 5-7 days | Unit + integration tests |
| Platform-specific debugging | 3-5 days | macOS vs Linux edge cases |
| **Total** | **45-65 days** | **~2-3 months of full-time work** |

### 4.5 Difficulty Rating: 8/10

A near-complete rewrite. The complexity comes from:
- Reimplementing the session parser's nuanced format handling
- Rebuilding the trigger engine with cron evaluation
- Managing two languages (Go backend + TypeScript UI)
- Preserving all tmux interaction timing (sleep values, escape sequences)

---

## 5. Side-by-Side Comparison

### 5.1 Feature Parity Matrix

| Capability | Current | Electron | Go CLI |
|-----------|---------|----------|--------|
| CLI commands (30+) | Native | Preserved (+ GUI) | Reimplemented |
| Web dashboard | Browser tab | Embedded window | Browser tab (same as now) |
| Terminal streaming | WebSocket | IPC (faster) | WebSocket (same) |
| SSE real-time updates | Native | IPC (faster) | Reimplemented |
| SQLite analytics | bun:sqlite | better-sqlite3 | modernc.org/sqlite |
| tmux agent management | Native | Same | Same |
| Pulse loop (10s) | setInterval | setInterval | time.Ticker goroutine |
| Trigger engine | Native | Same | Reimplemented |
| File watching | fs.watch | fs.watch | fsnotify |
| Session parsing | Native | Same | Reimplemented |
| Plugin/skill system | Native | Mostly same | Mostly same |
| Cross-platform | macOS + Linux | macOS + Linux + Windows* | macOS + Linux |
| Installation | git clone + bun install | Download .dmg/.AppImage | Download single binary |

*Windows via Electron still needs tmux, so WSL required.

### 5.2 Effort & Risk

| Dimension | Electron | Go CLI |
|-----------|----------|--------|
| **Estimated effort** | 20-33 days | 45-65 days |
| **Code reuse** | ~70% (UI 100%, backend ~50%) | ~30% (UI 100%, backend 0%) |
| **Risk of bugs** | Medium (IPC transition) | High (full rewrite) |
| **Maintenance burden** | High (Chromium updates, native addons) | Medium (single binary, no deps) |
| **Dependency count** | ~50+ (Electron ecosystem) | ~5-8 (Go modules) |
| **Binary size** | 150-250 MB | 15-25 MB |
| **Memory usage** | 150-300 MB base | 10-20 MB base |
| **Startup time** | 2-5 seconds (Chromium) | <100ms |
| **Install complexity** | Download installer | Download binary, chmod +x |

### 5.3 What You Gain vs What You Lose

#### Electron: What You Gain
- Native desktop experience (tray, notifications, menus)
- No browser tab to manage
- Faster IPC vs HTTP (marginal benefit)
- Auto-update mechanism
- Professional packaging

#### Electron: What You Lose
- Lightweight footprint (5MB -> 200MB)
- Fast startup (100ms -> 3s)
- Simple deployment (git clone -> installer)
- Low memory usage (50MB -> 300MB)
- Build simplicity (bun install -> electron-forge pipeline)

#### Go CLI: What You Gain
- Single static binary (zero runtime deps)
- Cross-compilation (trivial multi-platform)
- 10x less memory, 10x faster startup
- Goroutines (natural fit for pulse loop, streaming)
- No dependency management (no node_modules)
- Professional-grade CLI tool appearance

#### Go CLI: What You Lose
- 2-3 months of development time
- TypeScript ecosystem ergonomics
- Quick iteration cycle (REPL, console.log)
- Single-language codebase (now Go + TypeScript)
- 100% of backend code (complete rewrite)

---

## 6. Sincere Objective Advice

### 6.1 What Problem Are You Actually Solving?

Before choosing a porting target, be honest about the **motivation**:

**If the motivation is "better distribution"** -> Go wins decisively. A single binary that works everywhere without Bun, npm, or Node.js is the gold standard for CLI tools. This is why tools like Docker, Kubernetes, Terraform, and GitHub CLI are written in Go.

**If the motivation is "better user experience"** -> Electron wins marginally, but at enormous cost. The current browser-based dashboard is already excellent. Adding a native wrapper provides incremental UX improvement (system tray, notifications) but introduces massive complexity.

**If the motivation is "I want to learn Go"** -> Valid reason. But be aware this is a 2-3 month project, and you will be maintaining two languages forever.

**If the motivation is "the current stack has problems"** -> What problems? The Bun+Hono+Preact stack is:
- Fast (Bun is faster than Node)
- Small (7 dependencies)
- Working (the codebase is functional and feature-complete)
- Maintainable (single language, clear architecture)

### 6.2 The Uncomfortable Truth

**Neither port is necessary.** The current architecture is well-suited to its purpose. Bun+Hono+Preact is:
- Lightweight (5MB install)
- Fast (100ms startup)
- Feature-complete (30+ CLI commands, 30+ API endpoints, 45+ UI components)
- Well-architected (clean separation of concerns, event-driven, persistent)

The honest ROI calculation:
- **Electron:** 1 month of work for a desktop wrapper around a tool that works fine in a browser tab. Net benefit: system tray icon + notifications.
- **Go:** 2-3 months of work for a single binary. Net benefit: easier installation for end users. But your end users are developers who already have Bun or can install it.

### 6.3 When Each Option Makes Sense

**Electron makes sense IF:**
- You plan to sell this as a commercial desktop product
- Your target users are non-technical (they would struggle with `bun install`)
- You need deep OS integration (file associations, protocol handlers, auto-launch)
- You want to distribute through app stores

**Go makes sense IF:**
- You are targeting a wide open-source audience (like Terraform/kubectl users)
- Installation friction is causing adoption problems
- You need the binary to run in containers/CI without Bun
- You want to eliminate all runtime dependencies
- You plan to maintain this for years (Go's stability guarantee matters)

**Neither makes sense IF:**
- Your users are developers comfortable with CLI tools
- The project is primarily for personal/small-team use
- You would rather spend 2-3 months building new features
- The current stack works and you are not hitting its limits

### 6.4 The 80/20 Alternative

If distribution is the concern, consider these lower-effort alternatives:

1. **Bun compile** - `bun build --compile src/cli.ts` produces a single executable. No Bun installation required. This gives you 80% of Go's distribution benefit at 5% of the effort.

2. **Docker image** - `docker run narcis13/cc-agent start "prompt"` eliminates all dependency management. Works on any platform with Docker.

3. **Homebrew formula** - `brew install cc-agent` handles Bun dependency automatically on macOS/Linux.

4. **Shell installer** - You already have `install.sh`. It works. Most CLI tools distribute this way.

---

## 7. Recommended Path

### If You Must Port: Go

Between the two options, **Go is the better long-term investment**, despite being harder:

1. The resulting binary has genuine advantages (size, speed, zero deps)
2. The Electron advantages are marginal for this use case
3. Go's compiled nature catches bugs at build time
4. Go goroutines are a natural fit for the pulse loop architecture
5. The CLI tool ecosystem (cobra, viper) is mature and battle-tested
6. Long-term maintenance is lower (no Chromium updates, no native addon rebuilds)

### If You Can Wait: Bun Compile

The most pragmatic path is:
1. **Now:** Use `bun build --compile` to produce a standalone executable
2. **Later:** If adoption demands it, rewrite in Go
3. **Never:** Electron (the cost/benefit ratio does not justify it for a CLI-first tool)

### Phased Go Migration (If Chosen)

If you decide on Go, here is the recommended order:

**Phase 1: Core CLI (2 weeks)**
- Go project setup with cobra
- Job CRUD + JSON persistence
- tmux integration (all primitives)
- Config system
- Basic commands: start, status, send, capture, kill, jobs

**Phase 2: Orchestrator (1.5 weeks)**
- Orchestrator lifecycle
- State persistence
- Pulse loop (goroutine)
- Queue processing

**Phase 3: Trigger Engine (1 week)**
- Cron parser (or use robfig/cron)
- Threshold evaluation
- Event triggers
- Approval workflow

**Phase 4: Dashboard Server (2 weeks)**
- HTTP server with chi
- All API routes
- SSE implementation
- WebSocket terminal streaming
- SQLite with modernc.org/sqlite

**Phase 5: Session Parser (1 week)**
- JSONL parser
- JSON parser
- Token extraction
- File modification detection
- Subagent discovery

**Phase 6: UI + Polish (1.5 weeks)**
- Set up separate UI build (bun build -> dist/)
- go:embed for static assets
- Hooks integration
- Daemon management
- Cross-platform testing

**Phase 7: Distribution (1 week)**
- GitHub Actions for multi-platform builds
- Release automation
- Homebrew formula
- goreleaser configuration
- README update

---

## Appendix: Porting Complexity Hotspots

These are the specific code sections that are hardest to port, regardless of target:

### A. tmux Timing Sequences

```typescript
// From jobs.ts - reuseJob()
sendControl(session, "Escape");   // Interrupt current turn
await sleep(2000);                 // TUI cancellation processing
sendMessage(session, "/clear");    // Only works at prompt
await sleep(3000);                 // Context reset
sendMessage(session, newPrompt);   // New task
```

These sleep values are empirically determined. They depend on Claude Code's TUI rendering speed. Getting them wrong causes dropped keystrokes or commands sent to the wrong state.

### B. Context Percentage Parsing

```typescript
// From orchestrator.ts
const pattern = /[...]+\s+(\d{1,3})%/g;
// Matches: ████████░░ 85%
```

This regex matches Claude Code's status bar. If Claude changes their TUI, this breaks silently.

### C. Session File Discovery

```typescript
// From session-parser.ts
// Recursive BFS through ~/.claude/projects/
// Matching session ID in file path
// Handling both .jsonl and .json formats
```

This is a filesystem walk with format detection. The logic is intricate because Claude's session storage format has evolved.

### D. Dashboard State Machine

```
idle -> warned (70%) -> interrupting (80%, Escape sent)
     -> clearing (2s delay, /clear sent)
     -> resuming (5s delay, state injected)
     -> idle
```

This 4-state machine with timing constraints must be preserved exactly.

### E. Prompt Sending Size Branching

```typescript
if (prompt.length < 5000) {
  // send-keys (simple, direct)
} else {
  // load-buffer + paste-buffer (tmux internal buffer)
}
```

Two completely different code paths for prompt delivery, based on tmux's command-line length limits.

---

*Generated 2026-02-16 after exhaustive analysis of all 61 source files in cc-master.*
