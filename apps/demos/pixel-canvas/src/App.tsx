import { useCallback, useEffect, useState } from "react";
import bridgeWasmUrl from "nodalmerge-bridge/nodalmerge_bridge_bg.wasm?url";
import type { Doc } from "nodalmerge-sdk-js/doc";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { createDemoDoc } from "../../../../shared/sdk/createDemoDoc";
import { createDocDiagnostics, type DocDiagnostics } from "../../../../shared/sdk/diagnosticsAdapter";
import { createOfflineToggle, type OfflineToggle } from "../../../../shared/sdk/offlineToggle";
import { PixelBoard } from "./components/PixelBoard";
import { PixelStore } from "./lib/pixelStore";
import { GRID_SIZE, PALETTE } from "./lib/pixelCodec";

const env = import.meta.env as Record<string, string | undefined>;

interface Session {
  doc: Doc;
  store: PixelStore;
  diagnostics: DocDiagnostics;
  offline: OfflineToggle;
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(EMPTY_DIAGNOSTICS);
  const [paletteIndex, setPaletteIndex] = useState(5);
  const [online, setOnline] = useState(true);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [paintedCount, setPaintedCount] = useState(0);
  const [peerCount, setPeerCount] = useState(0);
  const [roomIdInput, setRoomIdInput] = useState("");
  const [notice, setNotice] = useState("Connecting to the shared board...");

  const openSession = useCallback(async (roomOverride?: string) => {
    const sharedRoom = new URLSearchParams(window.location.search).get("room")?.trim();
    const handle = await createDemoDoc({
      wasmUrl: bridgeWasmUrl,
      env,
      room: roomOverride ?? (sharedRoom || undefined),
      docOptions: { subscribe: ["px/**"] }
    });
    const store = new PixelStore(handle.doc);
    const diag = createDocDiagnostics(handle.doc, handle.config);
    const offline = createOfflineToggle(handle.doc);
    return { doc: handle.doc, store, diagnostics: diag, offline, roomId: handle.roomId } satisfies Session;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let active: Session | null = null;
    void openSession().then((next) => {
      if (cancelled) {
        closeSession(next);
        return;
      }
      active = next;
      setSession(next);
      setRoomIdInput(next.roomId);
    }).catch((error) => {
      setNotice(`Failed to start the SDK runtime: ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => {
      cancelled = true;
      if (active) {
        closeSession(active);
      }
    };
  }, [openSession]);

  useEffect(() => {
    if (!session) {
      return;
    }
    setDiagnostics(session.diagnostics.getDiagnostics());
    setPaintedCount(session.store.paintedCount());
    setOnline(session.offline.isOnline());
    setPeerCount(session.doc.peers().length);
    setNotice(
      session.doc.isConnected
        ? `Connected to ${session.roomId}. Pick a color and paint.`
        : "Connecting… paints apply locally and sync when the server is reachable."
    );
    const unsubs = [
      session.diagnostics.subscribe(setDiagnostics),
      session.store.subscribe(() => setPaintedCount(session.store.paintedCount())),
      session.offline.subscribe((state) => {
        setOnline(state.online);
        setPendingWrites(state.pendingWrites);
      }),
      session.doc.onConnect(() => {
        setPeerCount(session.doc.peers().length);
        setNotice(`Connected to ${session.roomId}. Pick a color and paint.`);
      }),
      session.doc.onDisconnect(() => setPeerCount(0))
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [session]);

  function closeSessionAndSwitch() {
    const roomId = roomIdInput.trim();
    if (!session || !roomId || roomId === session.roomId) {
      return;
    }
    closeSession(session);
    setSession(null);
    setNotice(`Switching to ${roomId}...`);
    void openSession(roomId).then(setSession).catch((error) => {
      setNotice(`Failed to join ${roomId}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  function toggleOnline() {
    if (!session) {
      return;
    }
    if (session.offline.isOnline()) {
      session.offline.goOffline();
      setNotice("Offline — keep painting! Strokes queue locally and merge on reconnect.");
    } else {
      session.offline.goOnline();
      setNotice("Reconnecting — queued pixels are syncing; watch peers' pixels flash in.");
    }
  }

  function copyShareLink() {
    if (!session) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("room", session.roomId);
    void navigator.clipboard.writeText(url.toString()).then(
      () => setNotice("Share link copied — send it to a friend and paint together."),
      () => setNotice("Could not copy share link (clipboard blocked).")
    );
  }

  return (
    <main className="nm-app">
      <header className="nm-page-header">
        <h1 className="nm-page-title">Pixel canvas</h1>
        <p className="nm-page-desc">
          A shared {GRID_SIZE}×{GRID_SIZE} board where every pixel is its own CRDT key. Paint together in
          real time — or flip yourself offline, keep painting, and watch both sides converge on reconnect.
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
        <button
          type="button"
          className="nm-btn nm-btn-primary"
          onClick={closeSessionAndSwitch}
          disabled={!session || !roomIdInput.trim() || roomIdInput.trim() === session.roomId}
        >
          Join room
        </button>
        <button type="button" className="nm-btn" onClick={copyShareLink} disabled={!session}>
          Copy share link
        </button>
        <span className="nm-offline-toggle">
          <button
            type="button"
            className={`nm-btn ${online ? "nm-btn-danger" : "nm-btn-primary"}`}
            onClick={toggleOnline}
            disabled={!session}
          >
            {online ? "Go offline" : "Go online"}
          </button>
          {!online ? <span className="nm-p-warning">offline — {pendingWrites} queued paint(s)</span> : null}
        </span>
        <p className="nm-controls-hint">
          Try it: open this page in two tabs. In one tab click <em>Go offline</em>, paint something,
          then <em>Go online</em> — your pixels merge into the shared board and remote pixels flash in.
          The shared board resets when the demo server restarts.
        </p>
      </section>

      <div className="nm-meta-bar">
        <span><strong>Room:</strong> <code>{session?.roomId ?? "—"}</code></span>
        <span>painted: <code>{paintedCount}</code> / {GRID_SIZE * GRID_SIZE}</span>
        <span>peers: <code>{peerCount}</code></span>
        <span>status: <code>{online ? "online" : "offline"}</code></span>
      </div>

      <section className="nm-layout-2col">
        <article className="nm-card">
          <h2 className="nm-card-title">Shared board</h2>
          <p className={`nm-notice ${diagnostics.connectionState === "open" ? "nm-notice-online" : "nm-notice-offline"}`}>
            <strong>Status:</strong> {notice}
          </p>
          <div className="nm-palette" role="radiogroup" aria-label="Palette">
            {PALETTE.map((color, index) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={index === paletteIndex}
                title={color}
                className={`nm-palette-swatch${index === paletteIndex ? " nm-palette-swatch-active" : ""}`}
                style={{ background: color }}
                onClick={() => setPaletteIndex(index)}
              />
            ))}
          </div>
          {session ? (
            <PixelBoard
              store={session.store}
              onPaint={(x, y) => session.store.paint(x, y, paletteIndex)}
            />
          ) : (
            <p className="nm-p-muted">Starting the WASM engine…</p>
          )}
          <p className="nm-card-desc">
            Every pixel is a last-writer-wins register keyed <code>px/x,y</code> in the room's signed
            DAG — concurrent painters never clobber each other's unrelated pixels, and contested pixels
            resolve identically on every peer. Blue rings mark pixels arriving from other peers.
          </p>
        </article>

        <DiagnosticsPanel diagnostics={diagnostics} title="Pixel canvas diagnostics" />
      </section>
      </div>
    </main>
  );
}

function closeSession(session: Session): void {
  session.offline.dispose();
  session.diagnostics.dispose();
  session.store.dispose();
  session.doc.close();
}
