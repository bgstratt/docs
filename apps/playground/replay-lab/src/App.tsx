import { useEffect, useMemo, useState } from "react";
import { loadRuntimeConfig } from "../../../../shared/runtime/config";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { RuntimeClient } from "../../../../shared/runtime/runtimeClient";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";

const config = loadRuntimeConfig(import.meta.env as Record<string, string | undefined>);
const client = new RuntimeClient(config, { pubkeyPrefix: "replay", maxEvents: 60 });

type ReplayEvent = {
  index: number;
  atIso: string;
  streamType: string;
  protocolType: string;
  summary: string;
  raw: string;
};

type ReplayCheckpoint = {
  id: string;
  label: string;
  index: number;
  protocolType: string;
  kind: "session" | "sync" | "blob" | "collaboration" | "control" | "timeline";
};

type ReplaySnapshot = {
  id: number;
  atIso: string;
  eventCount: number;
  events: ReplayEvent[];
  checkpoints: ReplayCheckpoint[];
};

type ImportedTraceItem = {
  id: string;
  atIso: string;
  type: string;
  raw: string;
};

type ImportedTrace = {
  roomId: string;
  exportedAtIso: string;
  filter: string;
  items: ImportedTraceItem[];
};

type TraceCorrelation = {
  traceId: string;
  traceType: string;
  traceAtIso: string;
  matchedEventIndex: number | null;
  matchedEventType: string | null;
  deltaMs: number | null;
  confidence: "high" | "medium" | "low" | "none";
  matchReason: string;
};

function parseProtocolType(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.type === "string" ? parsed.type : "n/a";
  } catch {
    return "n/a";
  }
}

function classifyCheckpointKind(protocolType: string): ReplayCheckpoint["kind"] {
  if (protocolType === "welcome" || protocolType === "hello") {
    return "session";
  }
  if (
    protocolType.includes("pack") ||
    protocolType.includes("request") ||
    protocolType.includes("mst") ||
    protocolType.includes("subscribe")
  ) {
    return "sync";
  }
  if (protocolType.includes("blob") || protocolType.includes("upload")) {
    return "blob";
  }
  if (protocolType.includes("peer") || protocolType.includes("presence") || protocolType.includes("signal")) {
    return "collaboration";
  }
  return "control";
}

function checkpointLabel(kind: ReplayCheckpoint["kind"], protocolType: string): string {
  if (kind === "session") {
    return `Session checkpoint (${protocolType})`;
  }
  if (kind === "sync") {
    return `Sync checkpoint (${protocolType})`;
  }
  if (kind === "blob") {
    return `Blob checkpoint (${protocolType})`;
  }
  if (kind === "collaboration") {
    return `Collab checkpoint (${protocolType})`;
  }
  if (kind === "control") {
    return `Control checkpoint (${protocolType})`;
  }
  return "Timeline checkpoint";
}

function parseEpochMs(iso: string): number | null {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
}

function computeTraceCorrelations(items: ImportedTraceItem[], events: ReplayEvent[]): TraceCorrelation[] {
  const usedEventIndices = new Set<number>();

  return items.map((item) => {
    const traceMs = parseEpochMs(item.atIso);
    const candidates = events
      .map((event) => {
        if (usedEventIndices.has(event.index)) {
          return null;
        }
        const eventMs = parseEpochMs(event.atIso);
        const sameType = event.protocolType === item.type;
        const exactRaw = sameType && event.raw === item.raw;
        const timeDeltaMs = traceMs !== null && eventMs !== null ? Math.abs(traceMs - eventMs) : null;
        const normalizedTimeDelta = timeDeltaMs === null ? 120_000 : Math.min(120_000, timeDeltaMs);
        const score =
          (exactRaw ? 1000 : 0) +
          (sameType ? 120 : 0) +
          (sameType ? Math.max(0, 80 - normalizedTimeDelta / 1000) : 0) +
          Math.max(0, 20 - event.index / 10);
        return {
          event,
          sameType,
          exactRaw,
          timeDeltaMs,
          score
        };
      })
      .filter((entry): entry is { event: ReplayEvent; sameType: boolean; exactRaw: boolean; timeDeltaMs: number | null; score: number } => entry !== null)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best || (!best.sameType && !best.exactRaw)) {
      return {
        traceId: item.id,
        traceType: item.type,
        traceAtIso: item.atIso,
        matchedEventIndex: null,
        matchedEventType: null,
        deltaMs: null,
        confidence: "none",
        matchReason: "No same-type replay event available."
      };
    }

    usedEventIndices.add(best.event.index);
    const confidence: TraceCorrelation["confidence"] = best.exactRaw
      ? "high"
      : best.timeDeltaMs !== null && best.timeDeltaMs <= 3000
        ? "high"
        : best.timeDeltaMs !== null && best.timeDeltaMs <= 15000
          ? "medium"
          : "low";
    const matchReason = best.exactRaw
      ? "Exact raw payload + type match."
      : best.timeDeltaMs !== null
        ? `Nearest same-type event by timestamp (${best.timeDeltaMs}ms).`
        : "Same-type event match without timestamp alignment.";

    return {
      traceId: item.id,
      traceType: item.type,
      traceAtIso: item.atIso,
      matchedEventIndex: best.event.index,
      matchedEventType: best.event.protocolType,
      deltaMs: best.timeDeltaMs,
      confidence,
      matchReason
    };
  });
}

export default function App() {
  const [roomIdInput, setRoomIdInput] = useState(config.defaultRoomId);
  const [activeRoomId, setActiveRoomId] = useState<string>(config.defaultRoomId);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(client.getDiagnostics());
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [snapshots, setSnapshots] = useState<ReplaySnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
  const [cursorIndex, setCursorIndex] = useState(0);
  const [rangeSize, setRangeSize] = useState(8);
  const [traceJsonInput, setTraceJsonInput] = useState("");
  const [importedTrace, setImportedTrace] = useState<ImportedTrace | null>(null);
  const [traceStatus, setTraceStatus] = useState("No protocol trace snippet imported.");

  useEffect(() => {
    const unsubscribe = client.subscribe(setDiagnostics);
    client.connect(config.defaultRoomId);
    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, []);

  const canConnect = useMemo(() => roomIdInput.trim().length > 0, [roomIdInput]);

  function connectRoom() {
    const nextRoomId = roomIdInput.trim();
    if (!nextRoomId) {
      return;
    }
    setActiveRoomId(nextRoomId);
    client.connect(nextRoomId);
  }

  function captureSnapshot() {
    const nextId = snapshotCount + 1;
    const orderedEvents = [...diagnostics.recentEvents].reverse();
    const timelineEvents: ReplayEvent[] = orderedEvents.map((entry, index) => {
      const protocolType = entry.type === "message" ? parseProtocolType(entry.message) : "n/a";
      const summary = entry.type === "message" ? `${protocolType}: ${entry.message}` : entry.message;
      return {
        index,
        atIso: entry.atIso,
        streamType: entry.type,
        protocolType,
        summary,
        raw: entry.message
      };
    });
    const protocolCheckpoints = timelineEvents
      .filter((event) => event.protocolType !== "n/a")
      .map((event) => {
        const kind = classifyCheckpointKind(event.protocolType);
        return {
          id: `${nextId}-${event.index}-${event.protocolType}`,
          label: checkpointLabel(kind, event.protocolType),
          index: event.index,
          protocolType: event.protocolType,
          kind
        } as ReplayCheckpoint;
      });
    const timelineCheckpoints: ReplayCheckpoint[] = timelineEvents.length
      ? [
          {
            id: `${nextId}-timeline-start`,
            label: "Timeline start",
            index: 0,
            protocolType: "timeline.start",
            kind: "timeline"
          },
          {
            id: `${nextId}-timeline-latest`,
            label: "Timeline latest",
            index: timelineEvents.length - 1,
            protocolType: "timeline.latest",
            kind: "timeline"
          }
        ]
      : [];
    const snapshot: ReplaySnapshot = {
      id: nextId,
      atIso: new Date().toISOString(),
      eventCount: diagnostics.recentEvents.length,
      events: timelineEvents,
      checkpoints: [...timelineCheckpoints, ...protocolCheckpoints]
    };
    setSnapshotCount(nextId);
    setSnapshots((previous) => [snapshot, ...previous]);
    setSelectedSnapshotId(nextId);
    setCursorIndex(Math.max(0, snapshot.events.length - 1));
  }

  const selectedSnapshot = snapshots.find((entry) => entry.id === selectedSnapshotId) ?? null;
  const selectedEvent = selectedSnapshot?.events[cursorIndex] ?? null;
  const traceCorrelations = useMemo(() => {
    if (!selectedSnapshot || !importedTrace) {
      return [];
    }
    return computeTraceCorrelations(importedTrace.items, selectedSnapshot.events);
  }, [selectedSnapshot, importedTrace]);
  const matchedCorrelationCount = traceCorrelations.filter((item) => item.matchedEventIndex !== null).length;
  const unmatchedByType = useMemo(() => {
    const grouped: Record<string, number> = {};
    for (const correlation of traceCorrelations) {
      if (correlation.matchedEventIndex !== null) {
        continue;
      }
      grouped[correlation.traceType] = (grouped[correlation.traceType] ?? 0) + 1;
    }
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }, [traceCorrelations]);
  const rangedEvents = useMemo(() => {
    if (!selectedSnapshot || selectedSnapshot.events.length === 0) {
      return [];
    }
    const half = Math.floor(rangeSize / 2);
    const start = Math.max(0, cursorIndex - half);
    const end = Math.min(selectedSnapshot.events.length, start + rangeSize);
    return selectedSnapshot.events.slice(start, end);
  }, [selectedSnapshot, cursorIndex, rangeSize]);

  useEffect(() => {
    if (!selectedSnapshot || selectedSnapshot.events.length === 0) {
      setCursorIndex(0);
      return;
    }
    setCursorIndex((previous) => Math.max(0, Math.min(previous, selectedSnapshot.events.length - 1)));
  }, [selectedSnapshotId, selectedSnapshot]);

  function importTraceSnippet() {
    let payload: unknown;
    try {
      payload = JSON.parse(traceJsonInput);
    } catch {
      setTraceStatus("Trace import failed: invalid JSON.");
      return;
    }

    if (!payload || typeof payload !== "object") {
      setTraceStatus("Trace import failed: payload must be an object.");
      return;
    }

    const candidate = payload as {
      roomId?: unknown;
      exportedAtIso?: unknown;
      filter?: unknown;
      items?: unknown;
    };
    if (!Array.isArray(candidate.items)) {
      setTraceStatus("Trace import failed: items array is missing.");
      return;
    }

    const items = candidate.items
      .map((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }
        const mapped = entry as { atIso?: unknown; type?: unknown; raw?: unknown };
        if (typeof mapped.atIso !== "string" || typeof mapped.type !== "string" || typeof mapped.raw !== "string") {
          return null;
        }
        return {
          id: `trace-${index}`,
          atIso: mapped.atIso,
          type: mapped.type,
          raw: mapped.raw
        } as ImportedTraceItem;
      })
      .filter((entry): entry is ImportedTraceItem => entry !== null);

    const normalized: ImportedTrace = {
      roomId: typeof candidate.roomId === "string" ? candidate.roomId : "(unknown room)",
      exportedAtIso: typeof candidate.exportedAtIso === "string" ? candidate.exportedAtIso : new Date().toISOString(),
      filter: typeof candidate.filter === "string" ? candidate.filter : "(none)",
      items
    };
    setImportedTrace(normalized);
    setTraceStatus(`Imported ${normalized.items.length} trace event(s) from protocol-inspector.`);
  }

  return (
    <main className="nm-app">
      <header className="nm-page-header">
        <h1 className="nm-page-title">Replay lab</h1>
        <p className="nm-page-desc">
          Capture runtime snapshots, inspect event payload summaries, and adjust replay range windows.
        </p>
      </header>

      <div className="nm-content">
      <section className="nm-controls">
        <label className="nm-label" htmlFor="roomId">Room</label>
        <input
          id="roomId"
          className="nm-input nm-input-xl"
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
        <button type="button" className="nm-btn" onClick={captureSnapshot}>
          Capture snapshot
        </button>
        <button
          type="button"
          className="nm-btn"
          onClick={() => {
            setImportedTrace(null);
            setTraceJsonInput("");
            setTraceStatus("Protocol trace import cleared.");
          }}
        >
          Clear trace
        </button>
      </section>

      <div className="nm-meta-bar">
        <span><strong>Room:</strong> <code>{activeRoomId}</code></span>
        <span><code>{config.wsBaseUrl}</code></span>
      </div>

      <section className="nm-layout-2col">
        <article className="nm-card">
          <h2 className="nm-card-title">Replay snapshot inspector</h2>
          <p className="nm-card-desc">Capture runtime snapshots, scrub timeline windows, and jump through protocol-linked checkpoints.</p>
          <p className="nm-section-label">Captured snapshots</p>
          <ul className="nm-event-list nm-event-list-sm" style={{ marginBottom: 12 }}>
            {snapshots.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`nm-btn${selectedSnapshotId === entry.id ? " nm-btn-primary" : ""}`}
                  onClick={() => setSelectedSnapshotId(entry.id)}
                >
                  Snapshot {entry.id}: {new Date(entry.atIso).toLocaleTimeString()} ({entry.eventCount} events)
                </button>
              </li>
            ))}
            {snapshots.length === 0 ? <li>No snapshots captured yet.</li> : null}
          </ul>
          <p className="nm-section-label">Snapshot details</p>
          {selectedSnapshot ? (
            <div>
              <ul className="nm-diagnostics-list nm-mb-3">
                <li><strong>ID</strong><span>{selectedSnapshot.id}</span></li>
                <li><strong>Captured</strong><span>{new Date(selectedSnapshot.atIso).toLocaleString()}</span></li>
                <li><strong>Events</strong><span>{selectedSnapshot.eventCount}</span></li>
              </ul>
              <div className="nm-controls nm-mb-3">
                <label className="nm-label" htmlFor="cursorIndex">Replay cursor</label>
                <input
                  id="cursorIndex"
                  type="range"
                  min={0}
                  max={Math.max(0, selectedSnapshot.events.length - 1)}
                  value={Math.min(cursorIndex, Math.max(0, selectedSnapshot.events.length - 1))}
                  onChange={(event) => setCursorIndex(Math.max(0, Number(event.target.value) || 0))}
                  className="nm-input-lg"
                />
                <input
                  id="cursorIndexNumber"
                  type="number"
                  min={0}
                  max={Math.max(0, selectedSnapshot.events.length - 1)}
                  value={Math.min(cursorIndex, Math.max(0, selectedSnapshot.events.length - 1))}
                  onChange={(event) => setCursorIndex(Math.max(0, Number(event.target.value) || 0))}
                  aria-label="Replay cursor index"
                  className="nm-input nm-input-sm"
                />
                <label className="nm-label" htmlFor="rangeSize">Range</label>
                <input
                  id="rangeSize"
                  type="number"
                  min={1}
                  max={50}
                  value={rangeSize}
                  onChange={(event) => setRangeSize(Math.max(1, Number(event.target.value) || 1))}
                  className="nm-input nm-input-sm"
                />
                <span className="nm-text-hint">
                  {rangedEvents.length} events around #{Math.min(cursorIndex, Math.max(0, selectedSnapshot.events.length - 1))}
                </span>
              </div>
              <p className="nm-section-label">Protocol checkpoints</p>
              <ul className="nm-event-list nm-event-list-sm nm-mb-3">
                {selectedSnapshot.checkpoints.map((checkpoint) => (
                  <li key={checkpoint.id}>
                    <button
                      type="button"
                      className={`nm-btn${checkpoint.index === cursorIndex ? " nm-btn-primary" : ""}`}
                      onClick={() => setCursorIndex(checkpoint.index)}
                    >
                      {checkpoint.label} @#{checkpoint.index}
                    </button>
                  </li>
                ))}
                {selectedSnapshot.checkpoints.length === 0 ? <li>No protocol checkpoints found in this snapshot.</li> : null}
              </ul>
              <p className="nm-section-label">Protocol trace correlation</p>
              <p className="nm-card-desc">
                Paste a trace snippet exported from protocol-inspector, then map it to this replay snapshot timeline.
              </p>
              <label className="nm-label-block" htmlFor="traceJsonInput">
                Protocol trace JSON
              </label>
              <textarea
                id="traceJsonInput"
                className="nm-textarea nm-mb-2"
                rows={4}
                value={traceJsonInput}
                onChange={(event) => setTraceJsonInput(event.target.value)}
                placeholder="Paste exported trace JSON from protocol-inspector (roomId/filter/items)."
              />
              <div className="nm-controls nm-mb-2">
                <button type="button" className="nm-btn nm-btn-primary" onClick={importTraceSnippet}>
                  Import trace
                </button>
                <span className="nm-text-hint">{traceStatus}</span>
              </div>
              {importedTrace ? (
                <p className="nm-p-muted">
                  trace room <code>{importedTrace.roomId}</code>, filter <code>{importedTrace.filter}</code>, matched{" "}
                  <code>{matchedCorrelationCount}/{traceCorrelations.length}</code>
                </p>
              ) : null}
              {traceCorrelations.length > 0 ? (
                <ul className="nm-event-list nm-event-list-sm nm-mb-2">
                  {traceCorrelations.map((correlation) => (
                    <li key={correlation.traceId}>
                      {correlation.matchedEventIndex !== null ? (
                        <button
                          type="button"
                          className="nm-btn"
                          onClick={() => setCursorIndex(correlation.matchedEventIndex ?? 0)}
                        >
                          <code>{correlation.traceType}</code> → event #{correlation.matchedEventIndex}
                          {correlation.deltaMs !== null ? ` (${correlation.deltaMs}ms)` : ""}
                          {" · "}confidence: {correlation.confidence}
                        </button>
                      ) : (
                        <span><code>{correlation.traceType}</code> → no match</span>
                      )}
                      <span className="nm-text-hint nm-ml-2">{correlation.matchReason}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {unmatchedByType.length > 0 ? (
                <div className="nm-mb-2">
                  <p className="nm-section-label">Unmatched diagnostics</p>
                  <ul className="nm-event-list">
                    {unmatchedByType.map(([type, count]) => (
                      <li key={type}>
                        <code>{type}</code>: {count} unmatched
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="nm-p-muted">
                <strong>Cursor event:</strong>{" "}
                <code>
                  {selectedEvent
                    ? `[#${selectedEvent.index}] [${selectedEvent.streamType}] [${selectedEvent.protocolType}]`
                    : "(none)"}
                </code>
              </p>
              <ul className="nm-event-list nm-event-list-sm">
                {rangedEvents.map((event) => (
                  <li key={`${selectedSnapshot.id}-${event.index}`}>
                    <code>{`[#${event.index}] [${event.streamType}] [${event.protocolType}] ${event.summary}`}</code>
                  </li>
                ))}
                {rangedEvents.length === 0 ? <li>No events in selected range.</li> : null}
              </ul>
            </div>
          ) : (
            <p className="nm-p-muted">Select a snapshot to inspect details.</p>
          )}
        </article>

        <DiagnosticsPanel diagnostics={diagnostics} />
      </section>
      </div>
    </main>
  );
}

