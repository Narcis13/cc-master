import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import path from "path";

export const DEFAULT_PORT = 3131;

export function createDashboardApp() {
  const app = new Hono();

  // Resolve paths relative to project root
  const projectRoot = path.resolve(import.meta.dir, "../..");
  const uiDist = path.join(projectRoot, "ui/dist");

  // API health check
  app.get("/api/health", (c) => c.json({ status: "ok" }));

  // Serve built UI assets
  app.use("/*", serveStatic({ root: uiDist }));

  // SPA fallback — serve index.html for client-side routes
  app.get("/*", async (c) => {
    const indexPath = path.join(uiDist, "index.html");
    const file = Bun.file(indexPath);
    if (await file.exists()) {
      return c.html(await file.text());
    }
    return c.text("Dashboard UI not built. Run: bun run build:ui", 500);
  });

  return app;
}

export async function startDashboard(port: number = DEFAULT_PORT) {
  // Build UI first
  const projectRoot = path.resolve(import.meta.dir, "../..");
  const buildResult = await buildUI(projectRoot);
  if (!buildResult) {
    console.error("Failed to build dashboard UI");
    process.exit(1);
  }

  const app = createDashboardApp();

  console.log(`CC-Agent Dashboard running at http://localhost:${port}`);
  console.log("Press Ctrl+C to stop\n");

  Bun.serve({
    port,
    fetch: app.fetch,
  });
}

async function buildUI(projectRoot: string): Promise<boolean> {
  const entrypoint = path.join(projectRoot, "ui/src/index.tsx");
  const outdir = path.join(projectRoot, "ui/dist");

  try {
    const result = await Bun.build({
      entrypoints: [entrypoint],
      outdir,
      minify: true,
      target: "browser",
      define: {
        "process.env.NODE_ENV": '"production"',
      },
    });

    if (!result.success) {
      for (const log of result.logs) {
        console.error(log);
      }
      return false;
    }

    // Write index.html that loads the built JS and CSS
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CC-Agent Dashboard</title>
  <link rel="stylesheet" href="/theme.css">
  <style>
    .shell { height: 100%; display: flex; flex-direction: column; }
    .topbar {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 20px; background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
    }
    .topbar-title { font-size: 16px; font-weight: 600; }
    .topbar-version { color: var(--text-secondary); font-size: 12px; }
    .content { flex: 1; padding: 20px; }
    .placeholder { color: var(--text-secondary); }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/index.js"></script>
</body>
</html>`;

    await Bun.write(path.join(outdir, "index.html"), htmlContent);

    // Copy theme.css to dist
    const themeSrc = path.join(projectRoot, "ui/src/styles/theme.css");
    const themeDst = path.join(outdir, "theme.css");
    await Bun.write(themeDst, Bun.file(themeSrc));

    console.log("Dashboard UI built successfully");
    return true;
  } catch (err) {
    console.error("Build error:", err);
    return false;
  }
}
