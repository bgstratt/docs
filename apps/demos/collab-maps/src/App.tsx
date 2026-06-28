import { useEffect, useMemo, useState } from "react";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { CollabMapsRuntimeClient, type MapPin } from "./lib/collabMapsRuntimeClient";

const client = new CollabMapsRuntimeClient();
const config = client.getConfig();

const BOARD_WIDTH = 640;
const BOARD_HEIGHT = 360;

const AUTHOR_COLORS: Array<{ bg: string; border: string }> = [
  { bg: "#dc2626", border: "#7f1d1d" },
  { bg: "#2563eb", border: "#1e3a8a" },
  { bg: "#16a34a", border: "#14532d" },
  { bg: "#d97706", border: "#78350f" },
  { bg: "#7c3aed", border: "#4c1d95" },
  { bg: "#0891b2", border: "#164e63" },
  { bg: "#be185d", border: "#831843" },
  { bg: "#ea580c", border: "#7c2d12" },
];

function authorColor(author: string): { bg: string; border: string } {
  let hash = 0;
  for (let i = 0; i < author.length; i++) {
    hash = (hash * 31 + author.charCodeAt(i)) >>> 0;
  }
  return AUTHOR_COLORS[hash % AUTHOR_COLORS.length];
}

export default function App() {
  const [roomIdInput, setRoomIdInput] = useState(config.defaultRoomId);
  const [activeRoomId, setActiveRoomId] = useState(config.defaultRoomId);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(client.getDiagnostics());
  const [authorName, setAuthorName] = useState("mapper-1");
  const [pinLabel, setPinLabel] = useState("New marker");
  const [pins, setPins] = useState<MapPin[]>([]);
  const [lastAction, setLastAction] = useState("No map action yet.");
  const [peerCount, setPeerCount] = useState(0);
  const [lastRuntimeMessage, setLastRuntimeMessage] = useState("none");
  const [activeNotice, setActiveNotice] = useState("Click the board to add pins. Connecting to server...");

  useEffect(() => {
    const unsubscribe = client.subscribe((next) => {
      setDiagnostics(next);
      setPins(client.getPins());
    });
    void client.connect(config.defaultRoomId).then(() => {
      setPins(client.getPins());
      const isConnected = client.getDiagnostics().connectionState === "open";
      setActiveNotice(
        isConnected
          ? `Connected to ${config.defaultRoomId}. Click board to add pins.`
          : "Server unavailable — pins saved locally, will sync when connected."
      );
    });
    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, []);

  useEffect(() => {
    const unsubscribeRuntime = client.subscribeRuntimeMessages((payload) => {
      const type = typeof payload.type === "string" ? payload.type : "unknown";
      setLastRuntimeMessage(type);
      if (type === "welcome") {
        const peers = Array.isArray(payload.peers)
          ? payload.peers.filter((entry): entry is string => typeof entry === "string")
          : [];
        setPeerCount(peers.length);
        setActiveNotice(`Welcome received. ${peers.length} peer(s) currently online.`);
        return;
      }
      if (type === "peer-joined") {
        setPeerCount((previous) => previous + 1);
        setActiveNotice("A peer joined the room.");
        return;
      }
      if (type === "peer-left") {
        setPeerCount((previous) => Math.max(0, previous - 1));
        setActiveNotice("A peer left the room.");
      }
    });
    return () => {
      unsubscribeRuntime();
    };
  }, []);

  const canConnect = useMemo(() => roomIdInput.trim().length > 0, [roomIdInput]);
  const isOnline = diagnostics.connectionState === "open";
  const canClearPins = pins.length > 0;

  function connectRoom() {
    const roomId = roomIdInput.trim();
    if (!roomId) {
      return;
    }
    setActiveRoomId(roomId);
    void client.connect(roomId).then(() => {
      setPins(client.getPins());
      const isConnected = client.getDiagnostics().connectionState === "open";
      if (isConnected) {
        setLastAction(`Connected to ${roomId}.`);
        setActiveNotice(`Connected to ${roomId}. Click board to add pins.`);
      } else {
        setLastAction(`Could not reach server for ${roomId} — working offline.`);
        setActiveNotice("Server unavailable — pins saved locally, will sync when connected.");
      }
    });
  }

  function addPinFromClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(event.clientX - rect.left);
    const y = Math.round(event.clientY - rect.top);
    const label = pinLabel.trim() || "Marker";
    const author = authorName.trim() || "mapper";
    client.addPin({ x, y, label, author });
    setPins(client.getPins());
    if (isOnline) {
      setLastAction(`Added "${label}" at (${x}, ${y}).`);
      setActiveNotice(`Pin "${label}" synced to room.`);
    } else {
      setLastAction(`Added "${label}" at (${x}, ${y}) — saved locally.`);
      setActiveNotice(`Pin "${label}" saved locally; will sync when connected.`);
    }
  }

  function clearPins() {
    client.clearPins();
    setPins(client.getPins());
    if (isOnline) {
      setLastAction("Cleared all pins.");
      setActiveNotice("All shared pins cleared.");
    } else {
      setLastAction("Cleared all local pins.");
      setActiveNotice("Local pins cleared.");
    }
  }

  return (
    <main className="nm-app">
      <header className="nm-page-header">
        <h1 className="nm-page-title">Collab maps</h1>
        <p className="nm-page-desc">
          Shared map pins backed by sdk/wasm room state — place pins and watch them converge across peers.
        </p>
      </header>

      <div className="nm-content">
      <section className="nm-controls">
        <label className="nm-label" htmlFor="roomId">Room</label>
        <input
          id="roomId"
          className="nm-input nm-input-lg"
          value={roomIdInput}
          onChange={(event) => setRoomIdInput(event.target.value)}
          placeholder="Enter room id"
        />
        <button type="button" className="nm-btn nm-btn-primary" onClick={connectRoom} disabled={!canConnect}>
          Connect
        </button>
        <button type="button" className="nm-btn" onClick={() => client.disconnect()}>
          Disconnect
        </button>
        <label className="nm-label" htmlFor="authorName">Author</label>
        <input
          id="authorName"
          className="nm-input nm-input-sm"
          value={authorName}
          onChange={(event) => setAuthorName(event.target.value)}
          placeholder="mapper name"
        />
        <label className="nm-label" htmlFor="pinLabel">Pin label</label>
        <input
          id="pinLabel"
          className="nm-input nm-input-md"
          value={pinLabel}
          onChange={(event) => setPinLabel(event.target.value)}
          placeholder="pin label"
        />
        <button type="button" className="nm-btn nm-btn-danger" onClick={clearPins} disabled={!canClearPins}>
          Clear pins
        </button>
      </section>

      <div className="nm-meta-bar">
        <span><strong>Room:</strong> <code>{activeRoomId}</code></span>
        <span><code>{config.wsBaseUrl}</code></span>
        <span>pins: <code>{pins.length}</code></span>
        <span>peers: <code>{peerCount}</code></span>
        <span>last msg: <code>{lastRuntimeMessage}</code></span>
      </div>

      <section className="nm-layout-2col">
        <article className="nm-card">
          <h2 className="nm-card-title">Shared pin board</h2>
          <p className={`nm-notice ${isOnline ? "nm-notice-online" : "nm-notice-offline"}`}>
            <strong>Status:</strong> {activeNotice}
          </p>
          <p className="nm-card-desc">
            Click anywhere in the board to add a shared pin. Pin state is persisted in sdk sync key <code>maps/pins</code>.
          </p>
          <div
            role="presentation"
            onClick={addPinFromClick}
            className="nm-canvas-board nm-board-640x360"
          >
            {pins.map((pin) => {
              const color = authorColor(pin.author);
              return (
                <div
                  key={pin.id}
                  className="nm-pin-dot"
                  title={`${pin.label} (${pin.author})`}
                  style={{
                    left: Math.max(0, Math.min(pin.x - 5, BOARD_WIDTH - 12)),
                    top: Math.max(0, Math.min(pin.y - 5, BOARD_HEIGHT - 12)),
                    background: color.bg,
                    border: `1px solid ${color.border}`
                  }}
                />
              );
            })}
          </div>
          {!isOnline ? (
            <p className="nm-p-warning">
              Offline mode — pins are saved locally and will sync to the room when connected.
            </p>
          ) : null}
          {isOnline && pins.length === 0 ? (
            <p className="nm-p-muted">No shared pins yet. Add the first one to confirm collaboration flow.</p>
          ) : null}
          <p className="nm-last-action">
            <strong>Last action:</strong> {lastAction}
          </p>
          <p className="nm-section-label">Recent pins</p>
          <ul className="nm-event-list nm-event-list-sm">
            {pins.slice(0, 8).map((pin) => (
              <li key={`list-${pin.id}`}>
                <code>{pin.label}</code> by <code>{pin.author}</code> at ({pin.x}, {pin.y})
              </li>
            ))}
            {pins.length === 0 ? <li>No pins yet. Click the board to add one.</li> : null}
          </ul>
        </article>

        <DiagnosticsPanel diagnostics={diagnostics} title="Collab maps diagnostics" />
      </section>
      </div>
    </main>
  );
}
