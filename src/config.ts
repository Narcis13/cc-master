// Configuration for cc-agent

export const config = {
  // Default model
  model: "opus",

  // Reasoning effort levels
  reasoningEfforts: ["low", "medium", "high", "xhigh"] as const,
  defaultReasoningEffort: "xhigh" as const,

  // Sandbox modes
  sandboxModes: ["read-only", "workspace-write", "danger-full-access"] as const,
  defaultSandbox: "workspace-write" as const,

  // Job storage directory
  jobsDir: `${process.env.HOME}/.cc-agent/jobs`,

  // Default inactivity timeout in minutes for running jobs
  defaultTimeout: 60,

  // Default number of jobs to show in listings
  jobsListLimit: 20,

  // tmux session prefix
  tmuxPrefix: "cc-agent",

  // Orchestrator
  orchJobId: "orch",
  orchStateFile: `${process.env.HOME}/.cc-agent/orchestrator-state.json`,

  // Daemon preferences (persisted across dashboard restarts)
  daemonPrefsFile: `${process.env.HOME}/.cc-agent/daemon-prefs.json`,
};

export type ReasoningEffort = typeof config.reasoningEfforts[number];
export type SandboxMode = typeof config.sandboxModes[number];
