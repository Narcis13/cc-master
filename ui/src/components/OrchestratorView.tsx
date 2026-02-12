import { h } from "preact";
import { OrchestratorPanel } from "./OrchestratorPanel";
import { PulseIndicator } from "./PulseIndicator";

export function OrchestratorView() {
  return (
    <div class="orch-view">
      <div class="orch-view-header">
        <h2 class="orch-view-title">Orchestrator</h2>
        <PulseIndicator />
      </div>
      <div class="orch-view-body">
        <OrchestratorPanel />
      </div>
    </div>
  );
}
