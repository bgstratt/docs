import { useEffect, useMemo, useState } from "react";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { CollabMapsRuntimeClient, type MapPin } from "./lib/collabMapsRuntimeClient";

const client = new CollabMapsRuntimeClient();
const config = client.getConfig();

const BOARD_WIDTH = 640;
const BOARD_HEIGHT = 360;

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

  useEffect(() => {
    const unsubscribe = client.subscribe((next) => {
      setDiagnostics(next);
      setPins(client.getPins());
    });
    void client.connect(config.defaultRoomId).then(() => {
      setPins(client.getPins());
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
        return;
      }
      if (type === "peer-joined") {
        setPeerCount((previous) => previous + 1);
        return;
      }
      if (type === "peer-left") {
        setPeerCount((previous) => Math.max(0, previous - 1));
      }
    });
    return () => {
      unsubscribeRuntime();
    };
  }, []);

  const canConnect = useMemo(() => roomIdInput.trim().length > 0, [roomIdInput]);
  const canMapActions = diagnostics.connectionState === "open";

  function connectRoom() {
    const roomId = roomIdInput.trim();
    if (!roomId) {
      return;
    }
    setActiveRoomId(roomId);
    void client.connect(roomId).then(() => {
      setPins(client.getPins());
      setLastAction(`Connected to ${roomId}.`);
    });
  }

  function addPinFromClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!canMapActions) {
      setLastAction("Map actions are disabled until sdk room connection is open.");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(event.clientX - rect.left);
    const y = Math.round(event.clientY - rect.top);
    const label = pinLabel.trim() || "Marker";
    const author = authorName.trim() || "mapper";
    const didAdd = client.addPin({ x, y, label, author });
    if (!didAdd) {
      setLastAction("Failed to add pin; ensure sdk room connection is open.");
      return;
    }
    setPins(client.getPins());
    setLastAction(`Added "${label}" at (${x}, ${y}).`);
  }

  function clearPins() {
    const didClear = client.clearPins();
    if (!didClear) {
      setLastAction("Failed to clear pins; ensure sdk room connection is open.");
      return;
    }
    setPins(client.getPins());
    setLastAction("Cleared all pins.");
  }

  return (
    <main style={{ margin: "0 auto", maxWidth: 1120, padding: "16px 20px", fontFamily: "Arial, sans-serif" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>Collab maps</h1>
        <p style={{ marginTop: 0 }}>
          Phase B flagship demo: shared map pins backed by sdk/wasm room state.
        </p>
      </header>

      <section style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label htmlFor="roomId">Room ID</label>
        <input
          id="roomId"
          value={roomIdInput}
          onChange={(event) => setRoomIdInput(event.target.value)}
          placeholder="Enter room id"
          style={{ minWidth: 240, padding: 6 }}
        />
        <button type="button" onClick={connectRoom} disabled={!canConnect}>
          Connect
        </button>
        <button type="button" onClick={() => client.disconnect()}>
          Disconnect
        </button>
        <label htmlFor="authorName">Author</label>
        <input
          id="authorName"
          value={authorName}
          onChange={(event) => setAuthorName(event.target.value)}
          placeholder="mapper name"
          style={{ minWidth: 140, padding: 6 }}
        />
        <label htmlFor="pinLabel">Pin label</label>
        <input
          id="pinLabel"
          value={pinLabel}
          onChange={(event) => setPinLabel(event.target.value)}
          placeholder="pin label"
          style={{ minWidth: 160, padding: 6 }}
        />
        <button type="button" onClick={clearPins} disabled={!canMapActions}>
          Clear pins
        </button>
      </section>

      <section style={{ marginBottom: 16 }}>
        <strong>Active room:</strong> <code>{activeRoomId}</code>{" "}
        <span style={{ marginLeft: 8 }}>
          (<code>{config.wsBaseUrl}</code>)
        </span>
        <span style={{ marginLeft: 8 }}>
          pins: <code>{pins.length}</code>
        </span>
        <span style={{ marginLeft: 8 }}>
          peers: <code>{peerCount}</code>
        </span>
        <span style={{ marginLeft: 8 }}>
          last runtime: <code>{lastRuntimeMessage}</code>
        </span>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14 }}>
        <article style={{ border: "1px solid #9aa4b2", borderRadius: 8, minHeight: 340, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Shared pin board</h2>
          <p style={{ marginTop: 0 }}>
            Click anywhere in the board to add a shared pin. Pin state is persisted in sdk sync key <code>maps/pins</code>.
          </p>
          <div
            role="presentation"
            onClick={addPinFromClick}
            style={{
              position: "relative",
              width: BOARD_WIDTH,
              height: BOARD_HEIGHT,
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
              cursor: canMapActions ? "crosshair" : "not-allowed",
              overflow: "hidden",
              marginBottom: 10,
              opacity: canMapActions ? 1 : 0.7
            }}
          >
            {pins.map((pin) => (
              <div
                key={pin.id}
                title={`${pin.label} (${pin.author})`}
                style={{
                  position: "absolute",
                  left: Math.max(0, Math.min(pin.x - 5, BOARD_WIDTH - 12)),
                  top: Math.max(0, Math.min(pin.y - 5, BOARD_HEIGHT - 12)),
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#dc2626",
                  border: "1px solid #7f1d1d"
                }}
              />
            ))}
          </div>
          {!canMapActions ? (
            <p style={{ marginTop: 0, color: "#9a3412" }}>
              Map actions are disabled until sdk room connection is open.
            </p>
          ) : null}
          <p style={{ marginBottom: 6 }}>
            <strong>Last action:</strong> {lastAction}
          </p>
          <h3 style={{ marginBottom: 6 }}>Recent pins</h3>
          <ul style={{ maxHeight: 140, overflow: "auto", paddingLeft: 18, marginTop: 0 }}>
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
    </main>
  );
}
