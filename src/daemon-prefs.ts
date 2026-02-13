// Daemon Preferences — persisted user intent for pulse and orchestrator auto-respawn.
// Survives dashboard restarts so intentional stops aren't treated as crashes.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { config } from "./config.ts";

export interface DaemonPrefs {
  pulse_enabled: boolean;
  auto_respawn: boolean;
}

const DEFAULTS: DaemonPrefs = {
  pulse_enabled: true,
  auto_respawn: true,
};

export function loadDaemonPrefs(): DaemonPrefs {
  try {
    if (!existsSync(config.daemonPrefsFile)) return { ...DEFAULTS };
    const content = readFileSync(config.daemonPrefsFile, "utf-8");
    const parsed = JSON.parse(content);
    return {
      pulse_enabled: parsed.pulse_enabled ?? DEFAULTS.pulse_enabled,
      auto_respawn: parsed.auto_respawn ?? DEFAULTS.auto_respawn,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDaemonPrefs(update: Partial<DaemonPrefs>): void {
  const existing = loadDaemonPrefs();
  const merged = { ...existing, ...update };
  mkdirSync(dirname(config.daemonPrefsFile), { recursive: true });
  writeFileSync(config.daemonPrefsFile, JSON.stringify(merged, null, 2));
}
