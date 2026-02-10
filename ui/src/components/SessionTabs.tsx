import { h } from "preact";
import { useState } from "preact/hooks";
import { TerminalPanel } from "./TerminalPanel";
import { MessageInput } from "./MessageInput";
import { SessionOverview } from "./SessionOverview";
import { ConversationView } from "./ConversationView";
import { useSession } from "../hooks/useSession";

type Tab = "terminal" | "session" | "conversation";

export function SessionTabs({
  jobId,
  isRunning,
  hasSession,
  estimatedCost,
}: {
  jobId: string;
  isRunning: boolean;
  hasSession: boolean;
  estimatedCost: number | null;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("terminal");
  const { session, loading, error } = useSession(jobId, hasSession);

  const tabs: { id: Tab; label: string; disabled: boolean }[] = [
    { id: "terminal", label: "Terminal", disabled: false },
    { id: "session", label: "Session", disabled: !hasSession },
    { id: "conversation", label: "Conversation", disabled: !hasSession },
  ];

  return (
    <div class="session-tabs">
      <div class="session-tabs-nav">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            class={`session-tab-btn ${activeTab === tab.id ? "active" : ""}`}
            disabled={tab.disabled}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div class="session-tabs-content">
        {activeTab === "terminal" && (
          <>
            <TerminalPanel jobId={jobId} />
            <MessageInput jobId={jobId} disabled={!isRunning} />
          </>
        )}

        {activeTab === "session" && (
          <>
            {loading && <div class="session-loading">Loading session data...</div>}
            {error && <div class="session-error">Failed to load session: {error}</div>}
            {session && (
              <SessionOverview session={session} estimatedCost={estimatedCost} />
            )}
            {!loading && !error && !session && (
              <div class="empty-state">No session data available.</div>
            )}
          </>
        )}

        {activeTab === "conversation" && (
          <>
            {loading && <div class="session-loading">Loading conversation...</div>}
            {error && <div class="session-error">Failed to load conversation: {error}</div>}
            {session && <ConversationView session={session} />}
            {!loading && !error && !session && (
              <div class="empty-state">No conversation data available.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
