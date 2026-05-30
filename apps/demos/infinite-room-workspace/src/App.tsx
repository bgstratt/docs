import { useEffect, useMemo, useState } from "react";
import { loadRuntimeConfig } from "../../../../shared/runtime/config";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { RuntimeClient } from "../../../../shared/runtime/runtimeClient";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";
import { SdkRuntimeClient } from "./lib/sdkRuntimeClient";

const config = loadRuntimeConfig(import.meta.env as Record<string, string | undefined>);
const wsClient = new RuntimeClient(config, { pubkeyPrefix: "workspace", maxEvents: 40 });
const sdkClient = new SdkRuntimeClient(config);
type RuntimeBackend = "ws" | "sdk";

export default function App() {
  const [backend, setBackend] = useState<RuntimeBackend>("ws");
  const [roomIdInput, setRoomIdInput] = useState(config.defaultRoomId);
  const [activeRoomId, setActiveRoomId] = useState<string>(config.defaultRoomId);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(wsClient.getDiagnostics());
  const [draftText, setDraftText] = useState("Hello from infinite workspace");
  const [appliedText, setAppliedText] = useState<string>("");
  const [lastAction, setLastAction] = useState<string>("No shared document action yet.");
  const [presenceName, setPresenceName] = useState("operator-1");
  const [peerTarget, setPeerTarget] = useState("");
  const [signalPayload, setSignalPayload] = useState('{"intent":"ping"}');
  const [onlinePeers, setOnlinePeers] = useState<string[]>([]);
  const [presenceByPeer, setPresenceByPeer] = useState<Record<string, string>>({});
  const [lastSignalStatus, setLastSignalStatus] = useState("No peer signal sent yet.");
  const [incomingSignals, setIncomingSignals] = useState<string[]>([]);

  useEffect(() => {
    const activeClient = backend === "sdk" ? sdkClient : wsClient;
    const inactiveClient = backend === "sdk" ? wsClient : sdkClient;
    const unsubscribe = activeClient.subscribe(setDiagnostics);
    inactiveClient.disconnect();
    activeClient.connect(activeRoomId);

    return () => {
      unsubscribe();
      activeClient.disconnect();
    };
  }, [backend, activeRoomId]);

  useEffect(() => {
    if (backend !== "sdk") {
      return;
    }

    const unsubscribeRuntime = sdkClient.subscribeRuntimeMessages((payload) => {
      const type = typeof payload.type === "string" ? payload.type : "";

      if (type === "welcome") {
        const peers = Array.isArray(payload.peers)
          ? payload.peers.filter((entry): entry is string => typeof entry === "string")
          : [];
        setOnlinePeers(peers);
        if (peers.length > 0 && !peerTarget) {
          setPeerTarget(peers[0]);
        }
        return;
      }

      if (type === "peer-joined") {
        const peerId = typeof payload.peerId === "string" ? payload.peerId : null;
        if (!peerId) {
          return;
        }
        setOnlinePeers((previous) => (previous.includes(peerId) ? previous : [...previous, peerId]));
        if (!peerTarget) {
          setPeerTarget(peerId);
        }
        setLastSignalStatus(`Peer ${peerId} joined.`);
        return;
      }

      if (type === "peer-left") {
        const peerId = typeof payload.peerId === "string" ? payload.peerId : null;
        if (!peerId) {
          return;
        }
        setOnlinePeers((previous) => previous.filter((entry) => entry !== peerId));
        setPresenceByPeer((previous) => {
          const next = { ...previous };
          delete next[peerId];
          return next;
        });
        setLastSignalStatus(`Peer ${peerId} left.`);
        return;
      }

      if (type === "presence") {
        const peerId = typeof payload.peerId === "string" ? payload.peerId : null;
        const data = payload.data;
        const name =
          data && typeof data === "object" && "name" in data && typeof (data as { name?: unknown }).name === "string"
            ? ((data as { name: string }).name ?? "")
            : null;
        if (!peerId || !name) {
          return;
        }
        setPresenceByPeer((previous) => ({ ...previous, [peerId]: name }));
        return;
      }

      if (type === "workspace.signal") {
        const from = typeof payload.from === "string" ? payload.from : "unknown";
        const at = new Date().toLocaleTimeString();
        setIncomingSignals((previous) => [`${at} from ${from}`, ...previous].slice(0, 8));
        setLastSignalStatus(`Received workspace.signal from ${from}.`);
      }
    });

    return () => {
      unsubscribeRuntime();
      setOnlinePeers([]);
      setPresenceByPeer({});
      setIncomingSignals([]);
    };
  }, [backend, peerTarget]);

  const canConnect = useMemo(() => roomIdInput.trim().length > 0, [roomIdInput]);
  const isSdkConnected = backend === "sdk" && diagnostics.connectionState === "open";
  const canUseSdkActions = isSdkConnected;

  function connectRoom() {
    const nextRoomId = roomIdInput.trim();
    if (!nextRoomId) {
      return;
    }
    setActiveRoomId(nextRoomId);
  }

  function applySharedDoc() {
    if (backend !== "sdk") {
      setLastAction("Shared document write requires runtime mode = npm sdk + wasm.");
      return;
    }

    const nextText = draftText.trim();
    if (!nextText) {
      setLastAction("Shared document text cannot be empty.");
      return;
    }

    const didSet = sdkClient.setSharedValue("workspace/doc/main", nextText);
    if (!didSet) {
      setLastAction("SDK sync API unavailable; reconnect in npm sdk + wasm mode.");
      return;
    }

    const confirmed = sdkClient.getSharedValue("workspace/doc/main");
    setAppliedText(confirmed ?? nextText);
    setLastAction(`Updated workspace/doc/main at ${new Date().toLocaleTimeString()}.`);
  }

  function publishPresence() {
    if (backend !== "sdk") {
      setLastAction("Presence update requires runtime mode = npm sdk + wasm.");
      return;
    }

    const nextName = presenceName.trim();
    if (!nextName) {
      setLastAction("Presence name cannot be empty.");
      return;
    }

    const didSet = sdkClient.setPresence({
      name: nextName,
      room: activeRoomId,
      updatedAtIso: new Date().toISOString()
    });
    if (!didSet) {
      setLastAction("Presence update failed; reconnect in npm sdk + wasm mode.");
      return;
    }

    setLastAction(`Presence published as ${nextName}.`);
  }

  function sendPeerSignal() {
    if (backend !== "sdk") {
      setLastSignalStatus("Peer signal requires runtime mode = npm sdk + wasm.");
      return;
    }

    const target = peerTarget.trim();
    if (!target) {
      setLastSignalStatus("Select or enter a target peer id.");
      return;
    }

    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(signalPayload);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setLastSignalStatus("Signal payload must be a JSON object.");
        return;
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      setLastSignalStatus("Signal payload is invalid JSON.");
      return;
    }

    const didSend = sdkClient.sendPeerSignal(target, "workspace.signal", payload);
    if (!didSend) {
      setLastSignalStatus("Signal send failed; reconnect in npm sdk + wasm mode.");
      return;
    }

    setLastSignalStatus(`Signal sent to ${target} at ${new Date().toLocaleTimeString()}.`);
  }

  return (
    <main style={{ margin: "0 auto", maxWidth: 1080, padding: "16px 20px", fontFamily: "Arial, sans-serif" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>Infinite room workspace</h1>
        <p style={{ marginTop: 0 }}>
          Phase A Slice 2 baseline: room connect controls, runtime adapter shell, and diagnostics.
        </p>
      </header>

      <section style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <label htmlFor="roomId">Room ID</label>
        <input
          id="roomId"
          value={roomIdInput}
          onChange={(event) => setRoomIdInput(event.target.value)}
          placeholder="Enter room id"
          style={{ minWidth: 280, padding: 6 }}
        />
        <button type="button" onClick={connectRoom} disabled={!canConnect}>
          Connect
        </button>
        <button
          type="button"
          onClick={() => {
            if (backend === "sdk") {
              sdkClient.disconnect();
              return;
            }
            wsClient.disconnect();
          }}
        >
          Disconnect
        </button>
        <label htmlFor="backendMode">Runtime mode</label>
        <select
          id="backendMode"
          value={backend}
          onChange={(event) => setBackend(event.target.value as RuntimeBackend)}
          style={{ padding: 6 }}
        >
          <option value="ws">direct websocket</option>
          <option value="sdk">npm sdk + wasm</option>
        </select>
      </section>

      <section style={{ marginBottom: 16 }}>
        <strong>Active room:</strong> <code>{activeRoomId}</code>{" "}
        <span style={{ marginLeft: 8 }}>
          (<code>{config.wsBaseUrl}</code>)
        </span>
        <span style={{ marginLeft: 8 }}>
          mode: <code>{backend}</code>
        </span>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14 }}>
        <article style={{ border: "1px solid #9aa4b2", borderRadius: 8, minHeight: 340, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Shared document action</h2>
          <p style={{ marginTop: 0 }}>
            This first non-placeholder interaction writes a shared document key through the SDK sync API.
          </p>
          <label htmlFor="sharedDocText" style={{ display: "block", marginBottom: 6 }}>
            Shared text (`workspace/doc/main`)
          </label>
          <textarea
            id="sharedDocText"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            rows={8}
            style={{ width: "100%", resize: "vertical", padding: 8, boxSizing: "border-box", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button type="button" onClick={applySharedDoc} disabled={!canUseSdkActions}>
              Apply shared document
            </button>
          </div>
          <p style={{ marginBottom: 6 }}>
            <strong>Last action:</strong> {lastAction}
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Last applied value:</strong>{" "}
            <code>{appliedText || "(none yet)"}</code>
          </p>
          <hr style={{ margin: "14px 0" }} />
          <h3 style={{ marginTop: 0 }}>Presence and peer signal</h3>
          <div style={{ marginBottom: 10 }}>
            <label htmlFor="presenceName" style={{ display: "block", marginBottom: 6 }}>
              Presence name
            </label>
            <input
              id="presenceName"
              value={presenceName}
              onChange={(event) => setPresenceName(event.target.value)}
              placeholder="display name"
              style={{ minWidth: 260, padding: 6 }}
            />
            <button type="button" onClick={publishPresence} style={{ marginLeft: 8 }} disabled={!canUseSdkActions}>
              Publish presence
            </button>
          </div>
          <div style={{ marginBottom: 10 }}>
            <strong>Online peers:</strong>{" "}
            {onlinePeers.length === 0 ? (
              <span>(none)</span>
            ) : (
              <span>{onlinePeers.map((peer) => `${peer}${presenceByPeer[peer] ? ` (${presenceByPeer[peer]})` : ""}`).join(", ")}</span>
            )}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label htmlFor="peerTarget" style={{ display: "block", marginBottom: 6 }}>
              Peer signal target
            </label>
            <input
              id="peerTarget"
              value={peerTarget}
              onChange={(event) => setPeerTarget(event.target.value)}
              placeholder="peer id"
              style={{ minWidth: 260, padding: 6 }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label htmlFor="signalPayload" style={{ display: "block", marginBottom: 6 }}>
              Signal payload JSON
            </label>
            <textarea
              id="signalPayload"
              rows={4}
              value={signalPayload}
              onChange={(event) => setSignalPayload(event.target.value)}
              style={{ width: "100%", resize: "vertical", padding: 8, boxSizing: "border-box" }}
            />
            <button type="button" onClick={sendPeerSignal} style={{ marginTop: 8 }} disabled={!canUseSdkActions}>
              Send peer signal
            </button>
          </div>
          <p style={{ marginBottom: 0 }}>
            <strong>Last signal:</strong> {lastSignalStatus}
          </p>
          <h4 style={{ marginBottom: 6 }}>Incoming signals</h4>
          <ul style={{ marginTop: 0, paddingLeft: 18 }}>
            {incomingSignals.map((entry, index) => (
              <li key={`${entry}-${index}`}>
                <code>{entry}</code>
              </li>
            ))}
            {incomingSignals.length === 0 ? <li>No incoming signals yet.</li> : null}
          </ul>
          {!canUseSdkActions ? (
            <p style={{ marginBottom: 0, color: "#9a3412" }}>
              SDK actions are disabled until runtime mode is <code>npm sdk + wasm</code> and connection state is open.
            </p>
          ) : null}
        </article>

        <DiagnosticsPanel diagnostics={diagnostics} />
      </section>
    </main>
  );
}

