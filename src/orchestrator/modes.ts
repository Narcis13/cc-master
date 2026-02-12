// Modes / Profiles — named collections of trigger configurations
// Provides higher-level abstraction over individual triggers

import {
  getModes,
  getModeById,
  getModeByName,
  createMode,
  deleteMode,
  activateMode,
  deactivateAllModes,
  getActiveMode,
  getTriggers,
  type ModeRecord,
} from "../dashboard/db.ts";

export type { ModeRecord };

/**
 * Create a mode from the currently configured triggers.
 * Snapshots all existing triggers into a new mode definition.
 */
export function createModeFromCurrent(name: string, description?: string): number {
  const triggers = getTriggers();
  const triggerConfig = triggers.map((t) => ({
    name: t.name,
    type: t.type,
    condition: t.condition,
    action: t.action,
    action_payload: t.action_payload,
    autonomy: t.autonomy,
    cooldown_seconds: t.cooldown_seconds,
  }));

  return createMode({
    name,
    description,
    trigger_config: JSON.stringify(triggerConfig),
  });
}

/**
 * Activate a mode by name (convenience wrapper).
 */
export function activateModeByName(name: string): boolean {
  const mode = getModeByName(name);
  if (!mode) return false;
  return activateMode(mode.id);
}

export {
  getModes,
  getModeById,
  getModeByName,
  createMode,
  deleteMode,
  activateMode,
  deactivateAllModes,
  getActiveMode,
};
