import { useCallback, useEffect, useMemo, useState } from "react";
import bridgeWasmUrl from "nodalmerge-bridge/nodalmerge_bridge_bg.wasm?url";
import type { Doc } from "nodalmerge-sdk-js/doc";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { createDemoDoc } from "../../../../shared/sdk/createDemoDoc";
import { createDocDiagnostics, type DocDiagnostics } from "../../../../shared/sdk/diagnosticsAdapter";
import { createOfflineToggle, type OfflineToggle } from "../../../../shared/sdk/offlineToggle";
import { PixelBoard } from "./components/PixelBoard";
import { PIXEL_NAMESPACE, PixelStore } from "./lib/pixelStore";
import { PixelTimeline, timelineFromHistory, type PixelHistoryItem } from "./lib/pixelTimeline";
import { GRID_SIZE, PALETTE } from "./lib/pixelCodec";

const env = import.meta.env as Record<string, string | undefined>;

interface Session {
  doc: Doc;
  store: PixelStore;
  diagnostics: DocDiagnostics;
  offline: OfflineToggle;
  timeline: PixelTimeline;
  roomId: string;
}

const REPLAY_TOOLTIP = "Replay view — jump to Live to paint.";

// Palette-selection sentinel for the eraser (delete pixel back to background).
const ERASER_INDEX = -1;

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
  // Replay: null cursor = live view; a number freezes the board at that frame.
  const [replayCursor, setReplayCursor] = useState<number | null>(null);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [timelineLength, setTimelineLength] = useState(0);

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
    const timeline = new PixelTimeline();
    return { doc: handle.doc, store, diagnostics: diag, offline, timeline, roomId: handle.roomId } satisfies Session;
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
    // Rebuild the replay timeline from the doc's DAG history: causal order,
    // includes ops from before this tab joined, survives refresh.
    const rebuildTimeline = () => {
      const items: PixelHistoryItem[] = [];
      let cursor: string | null = "";
      do {
        const page = session.doc.history({ prefix: `${PIXEL_NAMESPACE}/`, limit: 2000, cursor });
        items.push(...(page.items as PixelHistoryItem[]));
        cursor = page.nextCursor;
      } while (cursor);
      session.timeline.replaceAll(timelineFromHistory(items));
      setTimelineLength(session.timeline.length);
    };
    // Throttle rebuilds: paint drags emit many change events per second.
    let rebuildTimer: number | null = null;
    const scheduleRebuild = () => {
      if (rebuildTimer !== null) {
        return;
      }
      rebuildTimer = window.setTimeout(() => {
        rebuildTimer = null;
        rebuildTimeline();
      }, 250);
    };
    rebuildTimeline();
    const unsubs = [
      session.diagnostics.subscribe(setDiagnostics),
      session.store.subscribe(() => {
        scheduleRebuild();
        setPaintedCount(session.store.paintedCount());
      }),
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
      if (rebuildTimer !== null) {
        window.clearTimeout(rebuildTimer);
      }
    };
  }, [session]);

  // Drive playback: advance the cursor until it catches up to the live head,
  // then drop back to live automatically.
  useEffect(() => {
    if (!isReplayPlaying || !session) {
      return;
    }
    const id = window.setInterval(() => {
      setReplayCursor((previous) => {
        const length = session.timeline.length;
        const step = Math.max(1, Math.ceil(length / 240));
        const next = (previous ?? 0) + step;
        if (next >= length) {
          setIsReplayPlaying(false);
          return null;
        }
        return next;
      });
    }, 50);
    return () => window.clearInterval(id);
  }, [isReplayPlaying, session]);

  // timelineLength is a dependency so a history rebuild refreshes a frozen frame.
  const replayBuffer = useMemo(
    () => (session && replayCursor !== null ? session.timeline.snapshotAt(replayCursor) : null),
    [session, replayCursor, timelineLength]
  );
  const isLive = replayCursor === null;

  function closeSessionAndSwitch() {
    const roomId = roomIdInput.trim();
    if (!session || !roomId || roomId === session.roomId) {
      return;
    }
    closeSession(session);
    setSession(null);
    setReplayCursor(null);
    setIsReplayPlaying(false);
    setTimelineLength(0);
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
            <button
              type="button"
              role="radio"
              aria-checked={paletteIndex === ERASER_INDEX}
              title="Erase — restore background"
              aria-label="Erase — restore background"
              className={`nm-palette-swatch${paletteIndex === ERASER_INDEX ? " nm-palette-swatch-active" : ""}`}
              style={{
                background:
                  "linear-gradient(135deg, transparent 44%, #dc2626 44%, #dc2626 56%, transparent 56%), #ffffff"
              }}
              onClick={() => setPaletteIndex(ERASER_INDEX)}
            />
          </div>
          {!isLive ? (
            <p className="nm-notice nm-notice-offline">
              <strong>Replay view.</strong> Painting is disabled — press <em>Live</em> to paint.
              New paints (yours and peers') keep landing on the live board.
            </p>
          ) : null}
          {session ? (
            <PixelBoard
              store={session.store}
              onPaint={(x, y) =>
                paletteIndex === ERASER_INDEX ? session.store.erase(x, y) : session.store.paint(x, y, paletteIndex)
              }
              replayBuffer={replayBuffer}
              replayTooltip={REPLAY_TOOLTIP}
            />
          ) : (
            <p className="nm-p-muted">Starting the WASM engine…</p>
          )}
          <div style={{ marginTop: 10 }}>
            <label className="nm-label" htmlFor="pixelReplaySlider">
              Timeline scrubber{" "}
              <code>
                {replayCursor ?? timelineLength}/{timelineLength}
              </code>
            </label>
            <input
              id="pixelReplaySlider"
              type="range"
              min={0}
              max={timelineLength}
              value={replayCursor ?? timelineLength}
              onChange={(event) => {
                const value = Number(event.target.value) || 0;
                setIsReplayPlaying(false);
                setReplayCursor(value >= timelineLength ? null : value);
              }}
              style={{ width: "100%" }}
              disabled={timelineLength === 0}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <button
                type="button"
                className="nm-btn"
                onClick={() => {
                  if (isReplayPlaying) {
                    setIsReplayPlaying(false);
                    return;
                  }
                  if (replayCursor === null || replayCursor >= timelineLength) {
                    setReplayCursor(0);
                  }
                  setIsReplayPlaying(true);
                }}
                disabled={timelineLength <= 1}
              >
                {isReplayPlaying ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                className="nm-btn"
                onClick={() => {
                  setIsReplayPlaying(false);
                  setReplayCursor(0);
                }}
                disabled={timelineLength === 0}
              >
                Start
              </button>
              <button
                type="button"
                className="nm-btn"
                onClick={() => {
                  setIsReplayPlaying(false);
                  setReplayCursor((previous) => Math.max(0, (previous ?? timelineLength) - 1));
                }}
                disabled={timelineLength === 0}
              >
                Prev
              </button>
              <button
                type="button"
                className="nm-btn"
                onClick={() => {
                  setIsReplayPlaying(false);
                  setReplayCursor((previous) => {
                    const next = (previous ?? timelineLength) + 1;
                    return next >= timelineLength ? null : next;
                  });
                }}
                disabled={timelineLength === 0 || isLive}
              >
                Next
              </button>
              <button
                type="button"
                className="nm-btn nm-btn-primary"
                onClick={() => {
                  setIsReplayPlaying(false);
                  setReplayCursor(null);
                }}
                disabled={isLive}
              >
                Live
              </button>
            </div>
          </div>
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
