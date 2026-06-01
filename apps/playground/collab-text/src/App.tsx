import { useCallback, useEffect, useRef, useState } from "react";
import { loadRuntimeConfig } from "../../../../shared/runtime/config";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
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

const config = loadRuntimeConfig(import.meta.env as Record<string, string | undefined>);
const DEFAULT_ROOM_ID = (import.meta.env.VITE_DEFAULT_ROOM_ID as string | undefined)?.trim() || "collab-text";
const TEXT_KEY = "notes/demo/body";
const TEXT_KEY_PREFIX = "notes/demo/";

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

  const syncedTextRef = useRef("");
  const applyingRemoteRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const localAuthorRef = useRef<string | null>(null);
  const connectGenerationRef = useRef(0);
  const textPushChainRef = useRef(Promise.resolve());
  const timelineRefreshTimerRef = useRef<number | null>(null);

  const isConnected = diagnostics.connectionState === "open";
  const canEdit = isConnected && activeRoomId !== null;

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

  function handleEditorChange(nextText: string) {
    setEditorText(nextText);
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
    <main style={{ fontFamily: "Segoe UI, system-ui, sans-serif", margin: 16, color: "#0f172a" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0, marginBottom: 6 }}>Collab text playground</h1>
        <p style={{ marginTop: 0, maxWidth: 860 }}>
          RGA collaborative text on <code>{TEXT_KEY}</code> using <code>insertTextRange</code> /{" "}
          <code>deleteTextRange</code> for contiguous edits. Peer colors come from{" "}
          <code>sync.getTextSequence</code> (bridge <code>resolve_text_seq_json</code>). DAG timeline uses{" "}
          local WASM DAG replay (host <code>replay.read-range</code> when available).
        </p>
      </header>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <label>
          Room{" "}
          <input value={roomId} onChange={(event) => setRoomId(event.target.value)} style={{ padding: 6, width: 180 }} />
        </label>
        <button type="button" onClick={() => void connectRoom()} disabled={!roomId.trim()}>
          Reconnect
        </button>
        <button type="button" onClick={() => disconnectRoom()} disabled={!isConnected}>
          Disconnect
        </button>
        <button type="button" onClick={() => void refreshTimeline()} disabled={!canEdit}>
          Refresh timeline
        </button>
        <span style={{ color: "#475569" }}>{status}</span>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14 }}>
        <article style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Editor</h2>
          <textarea
            value={editorText}
            onChange={(event) => handleEditorChange(event.target.value)}
            disabled={!canEdit}
            rows={12}
            spellCheck={false}
            style={{
              width: "100%",
              boxSizing: "border-box",
              fontFamily: "Consolas, monospace",
              fontSize: 14,
              lineHeight: 1.45,
              padding: 10,
              resize: "vertical"
            }}
          />
          <h3 style={{ marginBottom: 6 }}>Live peer-colored preview</h3>
          <pre
            style={{
              marginTop: 0,
              padding: 10,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "Consolas, monospace",
              fontSize: 14,
              lineHeight: 1.45
            }}
          >
            {renderAttributedText(editorText, attributionSpans)}
          </pre>
          <h3 style={{ marginBottom: 6 }}>Lamport scrub preview (authoritative replay)</h3>
          <p style={{ marginTop: 0, fontSize: 12, color: "#64748b" }}>
            Replays RGA state from DAG nodes with <code>transaction.lamport ≤</code> cursor via{" "}
            <code>getTextAtLamport</code> / <code>getTextSequenceAtLamport</code>. The editor above is live head.
          </p>
          <pre
            style={{
              marginTop: 0,
              padding: 10,
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "Consolas, monospace",
              fontSize: 14,
              lineHeight: 1.45
            }}
          >
            {renderAttributedText(scrubText, scrubSpans)}
          </pre>
        </article>

        <aside style={{ display: "grid", gap: 12 }}>
          <article style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 12 }}>
            <h2 style={{ marginTop: 0 }}>Room connections</h2>
            <p style={{ marginTop: 0, fontSize: 13, color: "#475569" }}>
              Runtime host at <code>{config.hostBaseUrl}</code> · transport{" "}
              <code>{diagnostics.transportMode ?? config.transportMode}</code>
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
              <li>
                <strong>Server</strong> —{" "}
                {isConnected ? (
                  <span style={{ color: "#15803d" }}>connected ({activeRoomId ?? roomId})</span>
                ) : (
                  <span style={{ color: "#b45309" }}>{diagnostics.connectionState}</span>
                )}
              </li>
              <li>
                <strong>You</strong> —{" "}
                {localPeerId ? (
                  <code title={client.getLocalPubkey() ?? undefined}>{localPeerId}</code>
                ) : (
                  "(pending)"
                )}
              </li>
              <li>
                <strong>Peers in room</strong> — {roomPeers.length}
                {roomPeers.length === 0 ? (
                  <span style={{ color: "#64748b" }}> (only you until welcome lists others)</span>
                ) : null}
              </li>
            </ul>
            {roomPeers.length > 0 ? (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, maxHeight: 120, overflow: "auto", fontSize: 12 }}>
                {roomPeers.map((peer) => (
                  <li key={peer.id}>
                    <code title={peer.id}>{peer.shortId}</code>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
          <article style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 12 }}>
            <h2 style={{ marginTop: 0 }}>DAG replay timeline</h2>
            <p style={{ marginTop: 0, fontSize: 13, color: "#475569" }}>
              Scrub lamport to filter DAG events and the scrub preview pane.
            </p>
            <input
              type="range"
              min={scrubLamportMin}
              max={scrubLamportMax}
              value={scrubSliderValue}
              disabled={scrubLamportMax === 0}
              onChange={(event) => setTimelineCursor(Number(event.target.value))}
              style={{ width: "100%" }}
            />
            <p style={{ margin: "8px 0", fontSize: 12 }}>
              Cursor lamport: <code>{timelineCursor ?? (scrubLamportMax > 0 ? scrubLamportMax : "(none)")}</code> ·
              events {filteredTimeline.length}/{timeline.length}
              {localAuthorRef.current ? (
                <>
                  {" "}
                  · you <code>{localAuthorRef.current}</code>
                </>
              ) : null}
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflow: "auto", fontSize: 12 }}>
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
    </main>
  );
}
