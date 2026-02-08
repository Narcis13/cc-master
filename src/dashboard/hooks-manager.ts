// Hooks manager: installs/removes Claude Code hooks in ~/.claude/settings.json
// to relay events to ~/.cc-agent/events.jsonl via the relay script.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, existsSync } from "fs";
import path from "path";

const CLAUDE_SETTINGS_PATH = path.join(process.env.HOME!, ".claude", "settings.json");
const HOOKS_DIR = path.join(process.env.HOME!, ".cc-agent", "hooks");
const RELAY_SCRIPT_DEST = path.join(HOOKS_DIR, "relay-event.sh");
const RELAY_COMMAND = "~/.cc-agent/hooks/relay-event.sh";

// Hook events we want to capture and their optional matchers
const HOOK_EVENTS: { event: string; matcher?: string }[] = [
  { event: "PreToolUse" },
  { event: "PostToolUse", matcher: "Write|Edit|Bash" },
  { event: "PostToolUseFailure" },
  { event: "Stop" },
  { event: "Notification" },
  { event: "SessionStart" },
  { event: "SessionEnd" },
  { event: "PreCompact" },
];

function buildHookEntry(matcher?: string) {
  const entry: any = {
    hooks: [
      {
        type: "command",
        command: RELAY_COMMAND,
        async: true,
        timeout: 5,
      },
    ],
  };
  if (matcher) {
    entry.matcher = matcher;
  }
  return entry;
}

function readSettings(): any {
  try {
    const raw = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeSettings(settings: any) {
  const dir = path.dirname(CLAUDE_SETTINGS_PATH);
  mkdirSync(dir, { recursive: true });
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

function isOurHook(hookEntry: any): boolean {
  return hookEntry?.hooks?.some?.((h: any) => h.command === RELAY_COMMAND) ?? false;
}

export function installHooks(): { installed: string[]; skipped: string[] } {
  // Copy relay script to ~/.cc-agent/hooks/
  mkdirSync(HOOKS_DIR, { recursive: true });
  const relayScriptSrc = path.resolve(import.meta.dir, "hooks-relay.sh");
  copyFileSync(relayScriptSrc, RELAY_SCRIPT_DEST);
  chmodSync(RELAY_SCRIPT_DEST, 0o755);

  // Ensure events.jsonl exists
  const eventsFile = path.join(process.env.HOME!, ".cc-agent", "events.jsonl");
  if (!existsSync(eventsFile)) {
    writeFileSync(eventsFile, "");
  }

  const settings = readSettings();
  if (!settings.hooks) {
    settings.hooks = {};
  }

  const installed: string[] = [];
  const skipped: string[] = [];

  for (const { event, matcher } of HOOK_EVENTS) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    // Check if our hook is already installed
    const existing = settings.hooks[event].find(isOurHook);
    if (existing) {
      skipped.push(event);
      continue;
    }

    settings.hooks[event].push(buildHookEntry(matcher));
    installed.push(event);
  }

  writeSettings(settings);
  return { installed, skipped };
}

export function removeHooks(): { removed: string[]; notFound: string[] } {
  const settings = readSettings();
  if (!settings.hooks) {
    return { removed: [], notFound: HOOK_EVENTS.map((h) => h.event) };
  }

  const removed: string[] = [];
  const notFound: string[] = [];

  for (const { event } of HOOK_EVENTS) {
    if (!settings.hooks[event]) {
      notFound.push(event);
      continue;
    }

    const before = settings.hooks[event].length;
    settings.hooks[event] = settings.hooks[event].filter((entry: any) => !isOurHook(entry));

    if (settings.hooks[event].length < before) {
      removed.push(event);
    } else {
      notFound.push(event);
    }

    // Clean up empty arrays
    if (settings.hooks[event].length === 0) {
      delete settings.hooks[event];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeSettings(settings);
  return { removed, notFound };
}

export function hooksInstalled(): boolean {
  const settings = readSettings();
  if (!settings.hooks) return false;

  // Check if at least one of our hooks is present
  return HOOK_EVENTS.some(({ event }) => {
    return settings.hooks[event]?.some?.(isOurHook) ?? false;
  });
}
