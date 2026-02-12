import { h } from "preact";
import { OrchestratorPanel } from "./OrchestratorPanel";
import { PulseIndicator } from "./PulseIndicator";
import { QueuePanel } from "./QueuePanel";
import { TriggerPanel } from "./TriggerPanel";
import { ModeSelector } from "./ModeSelector";
import { ApprovalsBar } from "./ApprovalsBar";
import { ActivityFeed } from "./ActivityFeed";

export function OrchestratorView({ orchestratorEventVersion }: { orchestratorEventVersion: number }) {
  return (
    <div class="orch-view">
      <div class="orch-view-header">
        <h2 class="orch-view-title">Orchestrator</h2>
        <PulseIndicator eventVersion={orchestratorEventVersion} />
      </div>
      <ApprovalsBar eventVersion={orchestratorEventVersion} />
      <div class="orch-view-grid">
        <div class="orch-view-main">
          <OrchestratorPanel eventVersion={orchestratorEventVersion} />
          <ActivityFeed orchestratorEventVersion={orchestratorEventVersion} />
        </div>
        <div class="orch-view-sidebar">
          <QueuePanel eventVersion={orchestratorEventVersion} />
          <TriggerPanel eventVersion={orchestratorEventVersion} />
          <ModeSelector eventVersion={orchestratorEventVersion} />
        </div>
      </div>
    </div>
  );
}
