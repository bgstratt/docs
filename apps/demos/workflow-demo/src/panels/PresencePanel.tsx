// PresencePanel — the "Config and Diagnostics" sidebar: runtime mode,
// status/last-action feedback, presence name publishing, online peer roster,
// targeted peer signaling, persistence feed, the replay room-at-cursor
// inspector, and the diagnostics block.

import { DiagnosticsPanel } from "../../../../../shared/ui/DiagnosticsPanel";
import type { RuntimeDiagnostics } from "../../../../../shared/runtime/contracts";
import type { ReplayNode } from "../lib/branchReplay";
import { shortPeerId, type PersistenceEvent, type RuntimeBackend } from "../state/workspaceTypes";

interface PresencePanelProps {
  backend: RuntimeBackend;
  onBackendChange: (backend: RuntimeBackend) => void;
  activeNotice: string;
  lastAction: string;
  currentReplayNode: ReplayNode | null;
  presenceName: string;
  onPresenceNameChange: (value: string) => void;
  onPublishPresence: () => void;
  onlinePeers: string[];
  presenceByPeer: Record<string, string>;
  peerTarget: string;
  onPeerTargetChange: (value: string) => void;
  signalPayload: string;
  onSignalPayloadChange: (value: string) => void;
  onSendPeerSignal: () => void;
  lastSignalStatus: string;
  incomingSignals: string[];
  persistenceFeed: PersistenceEvent[];
  canUseSdkActions: boolean;
  diagnostics: RuntimeDiagnostics;
}

export function PresencePanel({
  backend,
  onBackendChange,
  activeNotice,
  lastAction,
  currentReplayNode,
  presenceName,
  onPresenceNameChange,
  onPublishPresence,
  onlinePeers,
  presenceByPeer,
  peerTarget,
  onPeerTargetChange,
  signalPayload,
  onSignalPayloadChange,
  onSendPeerSignal,
  lastSignalStatus,
  incomingSignals,
  persistenceFeed,
  canUseSdkActions,
  diagnostics
}: PresencePanelProps) {
  return (
    <article className="nm-card">
      <h2 className="nm-card-title">Config and Diagnostics</h2>
      <div className="nm-field">
        <label className="nm-label" htmlFor="backendMode">
          Runtime mode
        </label>
        <select
          id="backendMode"
          className="nm-input"
          value={backend}
          onChange={(event) => onBackendChange(event.target.value === "ws" ? "ws" : "sdk")}
        >
          <option value="ws">direct websocket</option>
          <option value="sdk">npm sdk + wasm</option>
        </select>
      </div>
      <p className="nm-last-action">
        <strong>Status:</strong> {activeNotice}
      </p>
      <p className="nm-last-action">
        <strong>Last action:</strong> {lastAction}
      </p>
      <div className="nm-field">
        <label className="nm-label" htmlFor="presenceName">
          Presence name
        </label>
        <input
          id="presenceName"
          className="nm-input"
          value={presenceName}
          onChange={(event) => onPresenceNameChange(event.target.value)}
          placeholder="display name"
        />
        <button type="button" className="nm-btn" onClick={onPublishPresence} disabled={!canUseSdkActions}>
          Publish presence
        </button>
      </div>
      <div className="nm-field">
        <strong>Online peers:</strong>{" "}
        {onlinePeers.length === 0 ? (
          <span>(none)</span>
        ) : (
          <span>
            {onlinePeers
              .map((peer) => (presenceByPeer[peer] ? `${presenceByPeer[peer]} (${shortPeerId(peer)})` : shortPeerId(peer)))
              .join(", ")}
          </span>
        )}
      </div>
      <div className="nm-field">
        <label className="nm-label" htmlFor="peerTarget">
          Peer signal target
        </label>
        <input
          id="peerTarget"
          className="nm-input"
          value={peerTarget}
          onChange={(event) => onPeerTargetChange(event.target.value)}
          placeholder="peer id"
        />
      </div>
      <div className="nm-field">
        <label className="nm-label" htmlFor="signalPayload">
          Signal payload JSON
        </label>
        <textarea
          id="signalPayload"
          className="nm-textarea"
          rows={4}
          value={signalPayload}
          onChange={(event) => onSignalPayloadChange(event.target.value)}
        />
        <button type="button" className="nm-btn" onClick={onSendPeerSignal} disabled={!canUseSdkActions}>
          Send peer signal
        </button>
      </div>
      <p className="nm-last-action">
        <strong>Last signal:</strong> {lastSignalStatus}
      </p>
      <p className="nm-section-label">Incoming signals</p>
      <ul className="nm-event-list nm-event-list-sm">
        {incomingSignals.map((entry, index) => (
          <li key={`${entry}-${index}`}>
            <code>{entry}</code>
          </li>
        ))}
        {incomingSignals.length === 0 ? <li>No incoming signals yet.</li> : null}
      </ul>
      <p className="nm-section-label">Workspace persistence feed</p>
      <ul className="nm-event-list nm-event-list-sm">
        {persistenceFeed.map((item, index) => (
          <li key={`${item.atIso}-${item.key}-${index}`}>
            <code>{new Date(item.atIso).toLocaleTimeString()}</code> <strong>{item.key}</strong> [{item.action}] {item.detail}
          </li>
        ))}
        {persistenceFeed.length === 0 ? <li>No shared workspace writes yet.</li> : null}
      </ul>
      {!canUseSdkActions ? (
        <p className="nm-p-warning">
          SDK actions are disabled until runtime mode is <code>npm sdk + wasm</code> and connection state is open.
        </p>
      ) : null}
      <p className="nm-section-label">Room at cursor</p>
      {currentReplayNode ? (
        <div>
          <p className="nm-last-action">
            <strong>Node:</strong> <code>{currentReplayNode.nodeId}</code>
          </p>
          <p className="nm-last-action">
            <strong>Summary:</strong> <code>{currentReplayNode.opSummary}</code>
          </p>
          <p className="nm-last-action">
            <strong>Lamport:</strong> <code>{currentReplayNode.lamport ?? "(none)"}</code>, <strong>Author:</strong>{" "}
            <code>{currentReplayNode.author ?? "(unknown)"}</code>
          </p>
          <p className="nm-last-action">
            <strong>Time:</strong> <code>{new Date(currentReplayNode.atIso).toLocaleTimeString()}</code>
          </p>
          <pre
            style={{
              marginTop: 0,
              marginBottom: 0,
              maxHeight: 110,
              overflow: "auto",
              border: "1px solid #64748b",
              borderRadius: 6,
              padding: 8
            }}
          >
            {currentReplayNode.payloadJson}
          </pre>
        </div>
      ) : (
        <p className="nm-last-action">No room state at cursor yet. Generate runtime events first.</p>
      )}
      <DiagnosticsPanel diagnostics={diagnostics} />
    </article>
  );
}
