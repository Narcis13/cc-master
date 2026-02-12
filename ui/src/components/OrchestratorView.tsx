import { h } from "preact";
import { OrchestratorPanel } from "./OrchestratorPanel";
import { PulseIndicator } from "./PulseIndicator";
import { QueuePanel } from "./QueuePanel";
import { TriggerPanel } from "./TriggerPanel";
import { ModeSelector } from "./ModeSelector";
import { ApprovalsBar } from "./ApprovalsBar";

export function OrchestratorView() {
  return (
    <div class="orch-view">
      <div class="orch-view-header">
        <h2 class="orch-view-title">Orchestrator</h2>
        <PulseIndicator />
      </div>
      <ApprovalsBar />
      <div class="orch-view-grid">
        <div class="orch-view-main">
          <OrchestratorPanel />
        </div>
        <div class="orch-view-sidebar">
          <QueuePanel />
          <TriggerPanel />
          <ModeSelector />
        </div>
      </div>
    </div>
  );
}
