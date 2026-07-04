import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bridgeWasmUrl from "nodalmerge-bridge/nodalmerge_bridge_bg.wasm?url";
import type { Doc, PresencePeer } from "nodalmerge-sdk-js/doc";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { createDemoDoc } from "../../../../shared/sdk/createDemoDoc";
import { createDocDiagnostics, type DocDiagnostics } from "../../../../shared/sdk/diagnosticsAdapter";
import { MapsStore, type MapPin } from "./lib/mapsStore";

const env = import.meta.env as Record<string, string | undefined>;

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

const REMOTE_HIGHLIGHT_MS = 900;

function defaultMapperName(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += letters[Math.floor(Math.random() * letters.length)];
  }
  return `mapper-${suffix}`;
}

interface Session {
  doc: Doc;
  store: MapsStore;
  diagnostics: DocDiagnostics;
  roomId: string;
}

const EMPTY_DIAGNOSTICS: RuntimeDiagnostics = {
  connectionState: "connecting",
  transportMode: "unknown",
  lastError: null,
  lastCloseCode: null,
  lastCloseReason: null,
  recentEvents: []
};

function peerName(peer: PresencePeer): string {
  const data = peer.state as Record<string, unknown> | null;
  const name = data && typeof data.name === "string" ? data.name.trim() : "";
  return name || `${peer.pubkey.slice(0, 8)}…`;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [roomIdInput, setRoomIdInput] = useState("");
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(EMPTY_DIAGNOSTICS);
  const [authorName, setAuthorName] = useState(defaultMapperName);
  const [pinLabel, setPinLabel] = useState("New marker");
  const [pins, setPins] = useState<MapPin[]>([]);
  const [remotePinIds, setRemotePinIds] = useState<Set<string>>(new Set());
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState("No map action yet.");
  const [activeNotice, setActiveNotice] = useState("Connecting to server...");
  const authorNameRef = useRef(authorName);
  authorNameRef.current = authorName;

  const openSession = useCallback(async (roomOverride?: string) => {
    const sharedRoom = new URLSearchParams(window.location.search).get("room")?.trim();
    const handle = await createDemoDoc({
      wasmUrl: bridgeWasmUrl,
      env,
      room: roomOverride ?? (sharedRoom || undefined),
      docOptions: {
        // Pins only; keeps late-join catch-up payloads scoped.
        subscribe: ["maps/**"]
      }
    });
    const store = new MapsStore(handle.doc);
    const diag = createDocDiagnostics(handle.doc, handle.config);
    handle.doc.presence.set({ name: authorNameRef.current });
    return { doc: handle.doc, store, diagnostics: diag, roomId: handle.roomId } satisfies Session;
  }, []);

  // Session lifecycle: create on mount; recreate when the user switches room.
  useEffect(() => {
    let cancelled = false;
    let active: Session | null = null;
    void openSession().then((next) => {
      if (cancelled) {
        next.diagnostics.dispose();
        next.store.dispose();
        next.doc.close();
        return;
      }
      active = next;
      setSession(next);
      setRoomIdInput(next.roomId);
    }).catch((error) => {
      setActiveNotice(`Failed to start SDK runtime: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => {
      cancelled = true;
      if (active) {
        active.diagnostics.dispose();
        active.store.dispose();
        active.doc.close();
      }
    };
  }, [openSession]);

  // Wire the active session into component state.
  useEffect(() => {
    if (!session) {
      return;
    }
    setPins(session.store.getPins());
    setDiagnostics(session.diagnostics.getDiagnostics());
    setPeers(session.doc.presence.others());
    setActiveNotice(
      session.doc.isConnected
        ? `Connected to ${session.roomId}. Click the board to add pins.`
        : "Connecting… pins apply locally and sync once the server is reachable."
    );

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubs = [
      session.diagnostics.subscribe(setDiagnostics),
      session.store.subscribe((changes) => {
        setPins(session.store.getPins());
        const remoteIds = changes.filter((c) => c.source === "remote" && c.pin).map((c) => c.id);
        if (remoteIds.length > 0) {
          setRemotePinIds((prev) => new Set([...prev, ...remoteIds]));
          const timer = setTimeout(() => {
            setRemotePinIds((prev) => {
              const next = new Set(prev);
              for (const id of remoteIds) next.delete(id);
              return next;
            });
            timers.delete(timer);
          }, REMOTE_HIGHLIGHT_MS);
          timers.add(timer);
        }
      }),
      session.doc.presence.onJoin(() => setPeers(session.doc.presence.others())),
      session.doc.presence.onLeave(() => setPeers(session.doc.presence.others())),
      session.doc.presence.onUpdate(() => setPeers(session.doc.presence.others())),
      session.doc.onConnect(() => setActiveNotice(`Connected to ${session.roomId}. Click the board to add pins.`)),
      session.doc.onDisconnect(() => setActiveNotice("Offline — pins keep applying locally and sync on reconnect."))
    ];
    return () => {
      for (const unsub of unsubs) unsub();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [session]);

  // Broadcast the author name over presence when it changes.
  useEffect(() => {
    if (session && authorName.trim()) {
      session.doc.presence.set({ name: authorName.trim() });
    }
  }, [session, authorName]);

  const isOnline = diagnostics.connectionState === "open";
  const canConnect = useMemo(
    () => roomIdInput.trim().length > 0 && roomIdInput.trim() !== session?.roomId,
    [roomIdInput, session]
  );
  const selectedPin = selectedPinId ? pins.find((pin) => pin.id === selectedPinId) ?? null : null;

  function switchRoom() {
    const roomId = roomIdInput.trim();
    if (!roomId || !session || roomId === session.roomId) {
      return;
    }
    session.diagnostics.dispose();
    session.store.dispose();
    session.doc.close();
    setSession(null);
    setSelectedPinId(null);
    setActiveNotice(`Switching to ${roomId}...`);
    void openSession(roomId).then((next) => {
      setSession(next);
      setLastAction(`Joined room ${roomId}.`);
    }).catch((error) => {
      setActiveNotice(`Failed to join ${roomId}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  function copyShareLink() {
    if (!session) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("room", session.roomId);
    void navigator.clipboard.writeText(url.toString()).then(
      () => setLastAction("Share link copied to clipboard."),
      () => setLastAction("Could not copy share link (clipboard blocked).")
    );
  }

  function addPinFromClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!session) {
      return;
    }
    if (selectedPinId) {
      // First click after selecting a pin just dismisses the popover.
      setSelectedPinId(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width;
    const ny = (event.clientY - rect.top) / rect.height;
    const label = pinLabel.trim() || "Marker";
    const author = authorName.trim() || "mapper";
    session.store.addPin({ nx, ny, label, author });
    setLastAction(
      isOnline
        ? `Added "${label}" — synced to room.`
        : `Added "${label}" — applied locally, syncs on reconnect.`
    );
  }

  function deleteSelectedPin() {
    if (!session || !selectedPin) {
      return;
    }
    session.store.deletePin(selectedPin.id);
    setSelectedPinId(null);
    setLastAction(`Deleted "${selectedPin.label}".`);
  }

  function clearPins() {
    if (!session) {
      return;
    }
    session.store.clearPins();
    setSelectedPinId(null);
    setLastAction("Cleared all pins.");
  }

  return (
    <main className="nm-app">
      <header className="nm-page-header">
        <h1 className="nm-page-title">Collab maps</h1>
        <p className="nm-page-desc">
          Shared map pins on the NodalMerge CRDT — every pin is its own replicated key, so
          concurrent edits from any number of peers converge without clobbering.
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
        <button type="button" className="nm-btn nm-btn-primary" onClick={switchRoom} disabled={!canConnect}>
          Join room
        </button>
        <button type="button" className="nm-btn" onClick={copyShareLink} disabled={!session}>
          Copy share link
        </button>
        <label className="nm-label" htmlFor="authorName">Your name</label>
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
        <button type="button" className="nm-btn nm-btn-danger" onClick={clearPins} disabled={pins.length === 0}>
          Clear pins
        </button>
        <p className="nm-controls-hint">
          Open this page in a second tab (or send the share link to a teammate) and watch pins
          appear live. The shared board resets when the demo server restarts.
        </p>
      </section>

      <div className="nm-meta-bar">
        <span><strong>Room:</strong> <code>{session?.roomId ?? "—"}</code></span>
        <span>pins: <code>{pins.length}</code></span>
        <span>peers online: <code>{peers.length + (session ? 1 : 0)}</code></span>
      </div>

      <section className="nm-layout-2col">
        <article className="nm-card">
          <h2 className="nm-card-title">Shared pin board</h2>
          <p className={`nm-notice ${isOnline ? "nm-notice-online" : "nm-notice-offline"}`}>
            <strong>Status:</strong> {activeNotice}
          </p>
          <ul className="nm-peer-chips">
            <li className="nm-peer-chip">
              <span className="nm-peer-chip-dot" style={{ background: authorColor(authorName).bg }} />
              {authorName.trim() || "you"} (you)
            </li>
            {peers.map((peer) => {
              const name = peerName(peer);
              return (
                <li key={peer.pubkey} className="nm-peer-chip">
                  <span className="nm-peer-chip-dot" style={{ background: authorColor(name).bg }} />
                  {name}
                </li>
              );
            })}
          </ul>
          <div
            role="presentation"
            onClick={addPinFromClick}
            className="nm-canvas-board nm-board-responsive"
          >
            {pins.map((pin) => {
              const color = authorColor(pin.author);
              return (
                <div
                  key={pin.id}
                  className={`nm-pin-dot${remotePinIds.has(pin.id) ? " nm-pin-dot-remote" : ""}`}
                  title={`${pin.label} (${pin.author})`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedPinId(pin.id === selectedPinId ? null : pin.id);
                  }}
                  style={{
                    left: `${pin.nx * 100}%`,
                    top: `${pin.ny * 100}%`,
                    background: color.bg,
                    border: `1px solid ${color.border}`
                  }}
                />
              );
            })}
            {selectedPin ? (
              <div
                className="nm-pin-popover"
                style={{ left: `${selectedPin.nx * 100}%`, top: `${selectedPin.ny * 100}%` }}
                onClick={(event) => event.stopPropagation()}
              >
                <span><code>{selectedPin.label}</code> by <code>{selectedPin.author}</code></span>
                <button type="button" className="nm-btn nm-btn-danger" onClick={deleteSelectedPin}>
                  Delete
                </button>
              </div>
            ) : null}
          </div>
          {!isOnline ? (
            <p className="nm-p-warning">
              Offline mode — pins apply to the local CRDT store and sync to the room on reconnect.
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
                <code>{pin.label}</code> by <code>{pin.author}</code> at ({Math.round(pin.nx * 100)}%, {Math.round(pin.ny * 100)}%)
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
