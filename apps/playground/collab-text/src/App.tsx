import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadRuntimeConfig } from "../../../../shared/runtime/config";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { connectWithRoomFallback } from "../../../../shared/runtime/roomFallback";
import { SdkRuntimeClient } from "../../../demos/infinite-room-workspace/src/lib/sdkRuntimeClient";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";
import { diffTextEdits } from "./lib/textDiff";
import {
  buildAttributionSpans,
  glyphsToText,
  peerIdFromAuthor,
  type AttributionSpan,
  type TextGlyph
} from "./lib/textAttribution";
import { renderAttributedText } from "./lib/renderAttributed";
import {
  buildTimelineFromTextGlyphs,
  maxLamportFromGlyphs,
  parseTimelineItems,
  type ReplayTimelineItem
} from "./lib/localReplayTimeline";
import { transformCaret } from "./lib/caretTransform";

const config = loadRuntimeConfig(import.meta.env as Record<string, string | undefined>);
const SHARED_ROOM_ID = new URLSearchParams(window.location.search).get("room")?.trim() || "";
const DEFAULT_ROOM_ID =
  SHARED_ROOM_ID || (import.meta.env.VITE_DEFAULT_ROOM_ID as string | undefined)?.trim() || "collab-text";
const TEXT_KEY = "notes/demo/body";
const TEXT_KEY_PREFIX = "notes/demo/";

// Demo-only guardrail, not a protocol limit: keeps edits comfortably under the host's
// 64 KiB max WebSocket message size (which has no chunking on the SDK side) while
// giving room users a predictable, small-scale editing surface.
const MAX_DOC_LENGTH = 8000;

const client = new SdkRuntimeClient(config);

type RoomPeer = {
  id: string;
  shortId: string;
};

function shortPeerId(pubkey: string): string {
  const trimmed = pubkey.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return trimmed.slice(0, 12);
}

function parseWelcomePeers(payload: Record<string, unknown>): string[] {
  const peers = payload.peers;
  if (!Array.isArray(peers)) {
    return [];
  }
  return peers.filter((entry): entry is string => typeof entry === "string");
}

export default function App() {
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(client.getDiagnostics());
  const [roomId, setRoomId] = useState(DEFAULT_ROOM_ID);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [textGlyphs, setTextGlyphs] = useState<TextGlyph[]>([]);
  const [attributionSpans, setAttributionSpans] = useState<AttributionSpan[]>([]);
  const [timeline, setTimeline] = useState<ReplayTimelineItem[]>([]);
  const [timelineCursor, setTimelineCursor] = useState<number | null>(null);
  const [scrubGlyphs, setScrubGlyphs] = useState<TextGlyph[]>([]);
  const [scrubText, setScrubText] = useState("");
  const [scrubSpans, setScrubSpans] = useState<AttributionSpan[]>([]);
  const [status, setStatus] = useState(`Connecting to ${DEFAULT_ROOM_ID}...`);
  const [roomPeers, setRoomPeers] = useState<RoomPeer[]>([]);
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);
  const [isTryingAnotherRoom, setIsTryingAnotherRoom] = useState(false);

  const syncedTextRef = useRef("");
  const applyingRemoteRef = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCaretRef = useRef<{ start: number; end: number } | null>(null);
  const pushTimerRef = useRef<number | null>(null);
  const localAuthorRef = useRef<string | null>(null);
  const connectGenerationRef = useRef(0);
  const textPushChainRef = useRef(Promise.resolve());
  const timelineRefreshTimerRef = useRef<number | null>(null);

  const isConnected = diagnostics.connectionState === "open";
  const canEdit = isConnected && activeRoomId !== null;

  // Restore the transformed caret after a remote-driven editorText replace.
  useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    const editor = editorRef.current;
    if (pending && editor) {
      pendingCaretRef.current = null;
      editor.setSelectionRange(pending.start, pending.end);
    }
  }, [editorText]);

  const syncFromRuntimeGraph = useCallback(() => {
    if (!activeRoomId) {
      return;
    }
    if (client.isSyncWriteInProgress()) {
      queueMicrotask(() => syncFromRuntimeGraph());
      return;
    }
    const glyphs = client.getTextSequence(TEXT_KEY);
    const next = glyphs.length > 0 ? glyphsToText(glyphs) : client.getDocumentText(TEXT_KEY) ?? "";
    const spans = buildAttributionSpans(glyphs);
    setTextGlyphs(glyphs);
    setAttributionSpans(spans);
    if (next !== syncedTextRef.current) {
      // Remote (or reconciled) update replaces the textarea value wholesale;
      // transform the local caret through the change so typing doesn't jump.
      const editor = editorRef.current;
      if (editor && document.activeElement === editor) {
        pendingCaretRef.current = {
          start: transformCaret(editor.value, next, editor.selectionStart ?? 0),
          end: transformCaret(editor.value, next, editor.selectionEnd ?? 0)
        };
      }
      applyingRemoteRef.current = true;
      syncedTextRef.current = next;
      setEditorText(next);
      applyingRemoteRef.current = false;
    }
    const maxLamport = maxLamportFromGlyphs(glyphs);
    if (maxLamport !== null) {
      setTimelineCursor((previous) => previous ?? maxLamport);
    }
    setStatus(`Synced ${next.length} chars · ${glyphs.length} visible glyphs.`);
  }, [activeRoomId]);

  const refreshTimeline = useCallback(async () => {
    const result = await client.readReplayRange({
      keyPrefix: TEXT_KEY_PREFIX,
      textKey: TEXT_KEY,
      fromLamport: 0,
      limit: 200,
      queryHost: false
    });
    let items = parseTimelineItems(result);
    if (items.length === 0) {
      const glyphs = client.getTextSequence(TEXT_KEY);
      items = buildTimelineFromTextGlyphs(glyphs, TEXT_KEY);
    }
    setTimeline(items);
    if (items.length > 0) {
      setTimelineCursor((previous) => previous ?? items[items.length - 1].lamport);
    } else {
      const glyphs = client.getTextSequence(TEXT_KEY);
      const maxLamport = maxLamportFromGlyphs(glyphs);
      setTimelineCursor(maxLamport);
    }
  }, []);

  const scheduleTimelineRefresh = useCallback(() => {
    if (timelineRefreshTimerRef.current !== null) {
      window.clearTimeout(timelineRefreshTimerRef.current);
    }
    timelineRefreshTimerRef.current = window.setTimeout(() => {
      timelineRefreshTimerRef.current = null;
      void refreshTimeline();
    }, 200);
  }, [refreshTimeline]);

  useEffect(() => {
    if (diagnostics.lastError?.toLowerCase().includes("message too large")) {
      setStatus("Demo limit reached: that edit was too large for this demo host and was not applied. Try a smaller edit.");
    }
  }, [diagnostics.lastError]);

  useEffect(() => {
    return client.subscribeRuntimeMessages((message) => {
      const type = typeof message.type === "string" ? message.type : "";
      if (type === "welcome") {
        const peerIds = parseWelcomePeers(message);
        setRoomPeers(
          peerIds.map((id) => ({
            id,
            shortId: shortPeerId(id)
          }))
        );
        return;
      }
      if (type === "peer-joined") {
        const peer =
          typeof message.pubkey === "string"
            ? message.pubkey
            : typeof message.from === "string"
              ? message.from
              : typeof message.peer === "string"
                ? message.peer
                : null;
        if (!peer) {
          return;
        }
        setRoomPeers((previous) => {
          if (previous.some((entry) => entry.id === peer)) {
            return previous;
          }
          return [...previous, { id: peer, shortId: shortPeerId(peer) }];
        });
        return;
      }
      if (type === "peer-left") {
        const peer =
          typeof message.pubkey === "string"
            ? message.pubkey
            : typeof message.from === "string"
              ? message.from
              : typeof message.peer === "string"
                ? message.peer
                : null;
        if (!peer) {
          return;
        }
        setRoomPeers((previous) => previous.filter((entry) => entry.id !== peer));
        return;
      }
      if (type === "pack" || type === "pack-applied") {
        queueMicrotask(() => syncFromRuntimeGraph());
        scheduleTimelineRefresh();
      }
    });
  }, [syncFromRuntimeGraph, scheduleTimelineRefresh]);

  useEffect(() => {
    if (!canEdit) {
      setScrubGlyphs([]);
      setScrubText("");
      setScrubSpans([]);
      return;
    }
    const effectiveCursor =
      timelineCursor ?? maxLamportFromGlyphs(client.getTextSequence(TEXT_KEY));
    if (effectiveCursor === null) {
      setScrubGlyphs([]);
      setScrubText("");
      setScrubSpans([]);
      return;
    }
    if (client.isSyncWriteInProgress()) {
      const retry = window.setTimeout(() => {
        const glyphs = client.getTextSequenceAtLamport(TEXT_KEY, effectiveCursor);
        const text =
          client.getTextAtLamport(TEXT_KEY, effectiveCursor) ?? glyphsToText(glyphs);
        setScrubGlyphs(glyphs);
        setScrubText(text);
        setScrubSpans(buildAttributionSpans(glyphs));
      }, 0);
      return () => window.clearTimeout(retry);
    }
    const glyphs = client.getTextSequenceAtLamport(TEXT_KEY, effectiveCursor);
    const text = client.getTextAtLamport(TEXT_KEY, effectiveCursor) ?? glyphsToText(glyphs);
    setScrubGlyphs(glyphs);
    setScrubText(text);
    setScrubSpans(buildAttributionSpans(glyphs));
  }, [timelineCursor, canEdit, activeRoomId]);

  const connectRoom = useCallback(
    async (targetRoom?: string) => {
      const nextRoom = (targetRoom ?? roomId).trim();
      if (!nextRoom) {
        return;
      }
      const generation = connectGenerationRef.current + 1;
      connectGenerationRef.current = generation;
      setStatus(`Connecting to ${nextRoom}...`);
      setRoomPeers([]);
      await client.connect(nextRoom);
      if (connectGenerationRef.current !== generation) {
        return;
      }
      setActiveRoomId(nextRoom);
      const localPub = client.getLocalPubkey();
      const localShort = localPub ? peerIdFromAuthor(localPub) : null;
      localAuthorRef.current = localShort;
      setLocalPeerId(localShort);
      queueMicrotask(() => syncFromRuntimeGraph());
      syncedTextRef.current = client.getDocumentText(TEXT_KEY) ?? "";
      setTimeline([]);
      setTimelineCursor(null);
      void refreshTimeline();
      if (connectGenerationRef.current !== generation) {
        return;
      }
      setStatus(`Connected to ${nextRoom}. Type to emit RGA text ops.`);
    },
    [roomId, refreshTimeline, syncFromRuntimeGraph]
  );

  const tryAnotherRoom = useCallback(async () => {
    const baseRoomId = roomId.trim() || DEFAULT_ROOM_ID;
    setIsTryingAnotherRoom(true);
    const result = await connectWithRoomFallback(
      baseRoomId,
      (candidate) => connectRoom(candidate),
      () => client.getDiagnostics().connectionState === "open",
      (candidate) => {
        setRoomId(candidate);
        setStatus(`Room busy — trying ${candidate}...`);
      }
    );
    setIsTryingAnotherRoom(false);
    if (!result.connected) {
      setStatus(`Tried ${result.attempts} room(s) starting from ${baseRoomId} — still unavailable.`);
    }
  }, [roomId, connectRoom]);

  const disconnectRoom = useCallback(() => {
    connectGenerationRef.current += 1;
    client.disconnect();
    setActiveRoomId(null);
    setRoomPeers([]);
    setLocalPeerId(null);
    localAuthorRef.current = null;
    setStatus("Disconnected.");
  }, []);

  useEffect(() => {
    const unsubscribe = client.subscribe((next) => setDiagnostics(next));
    void connectRoom(DEFAULT_ROOM_ID);
    return () => {
      unsubscribe();
      disconnectRoom();
    };
    // Mount-only bootstrap; use Reconnect for a different room id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scheduleTextPush(nextText: string) {
    if (pushTimerRef.current !== null) {
      window.clearTimeout(pushTimerRef.current);
    }
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null;
      textPushChainRef.current = textPushChainRef.current
        .then(async () => {
          if (client.isSyncWriteInProgress()) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 0);
            });
          }
          const glyphs = client.getTextSequence(TEXT_KEY);
          const before =
            glyphs.length > 0 ? glyphsToText(glyphs) : client.getDocumentText(TEXT_KEY) ?? syncedTextRef.current;
          const edits = diffTextEdits(before, nextText);
          if (edits.length === 0) {
            return;
          }
          const result = client.applyTextEdits(TEXT_KEY, edits, { useRangeOps: true });
          if (!result.applied) {
            queueMicrotask(() => syncFromRuntimeGraph());
            setStatus("Text edit failed locally; resynced from WASM. Check diagnostics.");
            return;
          }
          if (!result.pushed) {
            setStatus("Text updated locally but pack was not sent — try a fresh room or reconnect.");
            return;
          }
          syncedTextRef.current = nextText;
          queueMicrotask(() => syncFromRuntimeGraph());
          setStatus(`Pushed ${edits.length} contiguous edit(s), ${nextText.length} chars (range ops when len > 1).`);
          scheduleTimelineRefresh();
        })
        .catch(() => {
          // Serialized push chain — avoid overlapping WASM mutations.
        });
    }, 80);
  }

  function handleEditorChange(rawNextText: string) {
    const wasTruncated = rawNextText.length > MAX_DOC_LENGTH;
    const nextText = wasTruncated ? rawNextText.slice(0, MAX_DOC_LENGTH) : rawNextText;
    setEditorText(nextText);
    if (wasTruncated) {
      setStatus(`Demo limit: text capped at ${MAX_DOC_LENGTH.toLocaleString()} characters.`);
    }
    if (applyingRemoteRef.current || !canEdit) {
      return;
    }
    scheduleTextPush(nextText);
  }

  const filteredTimeline =
    timelineCursor === null ? timeline : timeline.filter((entry) => entry.lamport <= timelineCursor);
  const scrubLamportMax =
    timeline.length > 0
      ? timeline[timeline.length - 1].lamport
      : maxLamportFromGlyphs(textGlyphs) ?? 0;
  const scrubLamportMin = timeline.length > 0 ? timeline[0].lamport : scrubLamportMax > 0 ? 1 : 0;
  const scrubSliderValue = timelineCursor ?? scrubLamportMax;

  return (
    <main className="nm-app">
      <header className="nm-page-header">
        <h1 className="nm-page-title">Collab text playground</h1>
        <p className="nm-page-desc">
          RGA collaborative text on <code>{TEXT_KEY}</code> using <code>insertTextRange</code> /{" "}
          <code>deleteTextRange</code>. Peer colors from <code>getTextSequence</code>. DAG timeline uses local WASM replay.
        </p>
      </header>

      <div className="nm-content">
      <section className="nm-controls">
        <label className="nm-label">
          Room
          <input
            className="nm-input nm-input-lg"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
          />
        </label>
        <button type="button" className="nm-btn nm-btn-primary" onClick={() => void connectRoom()} disabled={!roomId.trim()}>
          Reconnect
        </button>
        <button type="button" className="nm-btn" onClick={() => disconnectRoom()} disabled={!isConnected}>
          Disconnect
        </button>
        <button type="button" className="nm-btn" onClick={() => void refreshTimeline()} disabled={!canEdit}>
          Refresh timeline
        </button>
        <button
          type="button"
          className="nm-btn"
          onClick={() => void tryAnotherRoom()}
          disabled={isTryingAnotherRoom}
        >
          {isTryingAnotherRoom ? "Trying rooms..." : "Try another room"}
        </button>
        <button
          type="button"
          className="nm-btn"
          disabled={!activeRoomId}
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set("room", activeRoomId ?? roomId);
            void navigator.clipboard.writeText(url.toString()).then(
              () => setStatus("Share link copied — anyone opening it lands in this room."),
              () => setStatus("Could not copy share link (clipboard blocked).")
            );
          }}
        >
          Copy share link
        </button>
        <span className="nm-p-muted" style={{ marginBottom: 0 }}>{status}</span>
        <p className="nm-controls-hint">
          Room busy or unreachable? Type a different room name above, or click "Try another
          room" to attempt a couple of nearby room ids automatically.
        </p>
      </section>

      <section className="nm-layout-2col-wide">
        <article className="nm-card">
          <h2 className="nm-card-title">Editor</h2>
          <textarea
            ref={editorRef}
            className="nm-textarea"
            value={editorText}
            onChange={(event) => handleEditorChange(event.target.value)}
            disabled={!canEdit}
            rows={12}
            spellCheck={false}
            maxLength={MAX_DOC_LENGTH}
          />
          <p className="nm-p-muted">
            Demo limit: {editorText.length.toLocaleString()}/{MAX_DOC_LENGTH.toLocaleString()} characters.
          </p>
          <h3 style={{ marginBottom: 6, marginTop: 14 }}>Live peer-colored preview</h3>
          <pre className="nm-pre">
            {renderAttributedText(editorText, attributionSpans)}
          </pre>
          <h3 style={{ marginBottom: 6, marginTop: 14 }}>Lamport scrub preview</h3>
          <p className="nm-p-muted">
            Replays RGA state from DAG nodes with <code>transaction.lamport ≤</code> cursor via{" "}
            <code>getTextAtLamport</code> / <code>getTextSequenceAtLamport</code>.
          </p>
          <pre className="nm-pre nm-pre-scrub">
            {renderAttributedText(scrubText, scrubSpans)}
          </pre>
        </article>

        <aside style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <article className="nm-card">
            <h2 className="nm-card-title">Room connections</h2>
            <p className="nm-card-desc">
              Host: <code>{config.hostBaseUrl}</code> · transport{" "}
              <code>{diagnostics.transportMode ?? config.transportMode}</code>
            </p>
            <ul className="nm-diagnostics-list" style={{ marginBottom: 8 }}>
              <li>
                <strong>Server</strong>
                {isConnected ? (
                  <span style={{ color: "var(--nm-text-success)" }}>connected ({activeRoomId ?? roomId})</span>
                ) : (
                  <span style={{ color: "var(--nm-text-warning)" }}>{diagnostics.connectionState}</span>
                )}
              </li>
              <li>
                <strong>You</strong>
                {localPeerId ? (
                  <code title={client.getLocalPubkey() ?? undefined}>{localPeerId}</code>
                ) : (
                  <span>(pending)</span>
                )}
              </li>
              <li>
                <strong>Peers</strong>
                <span>{roomPeers.length}{roomPeers.length === 0 ? " (only you)" : ""}</span>
              </li>
            </ul>
            {roomPeers.length > 0 ? (
              <ul className="nm-event-list nm-event-list-md">
                {roomPeers.map((peer) => (
                  <li key={peer.id}>
                    <code title={peer.id}>{peer.shortId}</code>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
          <article className="nm-card">
            <h2 className="nm-card-title">DAG replay timeline</h2>
            <p className="nm-card-desc">Scrub lamport to filter DAG events and the scrub preview pane.</p>
            <input
              type="range"
              className="nm-input-full"
              min={scrubLamportMin}
              max={scrubLamportMax}
              value={scrubSliderValue}
              disabled={scrubLamportMax === 0}
              onChange={(event) => setTimelineCursor(Number(event.target.value))}
            />
            <p className="nm-p-muted" style={{ margin: "8px 0" }}>
              Cursor: <code>{timelineCursor ?? (scrubLamportMax > 0 ? scrubLamportMax : "(none)")}</code> ·
              {" "}{filteredTimeline.length}/{timeline.length} events
              {localAuthorRef.current ? <> · you <code>{localAuthorRef.current}</code></> : null}
            </p>
            <ul className="nm-event-list nm-event-list-lg">
              {filteredTimeline.map((entry) => (
                <li key={`${entry.lamport}-${entry.nodeId}`}>
                  L{entry.lamport} · {entry.nodeId} · {entry.touchedKeys.join(", ") || "(no keys)"}
                </li>
              ))}
            </ul>
          </article>
          <DiagnosticsPanel diagnostics={diagnostics} />
        </aside>
      </section>
      </div>
    </main>
  );
}
