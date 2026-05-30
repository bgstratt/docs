import { useEffect, useMemo, useState } from "react";
import { loadRuntimeConfig } from "../../../../shared/runtime/config";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { RuntimeClient } from "../../../../shared/runtime/runtimeClient";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";

const config = loadRuntimeConfig(import.meta.env as Record<string, string | undefined>);
const client = new RuntimeClient(config, { pubkeyPrefix: "replay", maxEvents: 60 });

export default function App() {
  const [roomIdInput, setRoomIdInput] = useState(config.defaultRoomId);
  const [activeRoomId, setActiveRoomId] = useState<string>(config.defaultRoomId);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(client.getDiagnostics());
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [snapshots, setSnapshots] = useState<Array<{ id: number; atIso: string; eventCount: number; events: string[] }>>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeSize, setRangeSize] = useState(8);

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
    const snapshotEvents = diagnostics.recentEvents.map((entry) => `[${entry.type}] ${entry.message}`);
    setSnapshotCount(nextId);
    setSnapshots((previous) => {
      const nextSnapshots = [
        { id: nextId, atIso: new Date().toISOString(), eventCount: diagnostics.recentEvents.length, events: snapshotEvents },
        ...previous
      ];
      if (selectedSnapshotId === null) {
        setSelectedSnapshotId(nextId);
      }
      return nextSnapshots;
    });
  }

  const selectedSnapshot = snapshots.find((entry) => entry.id === selectedSnapshotId) ?? null;
  const rangedEvents = selectedSnapshot
    ? selectedSnapshot.events.slice(rangeStart, Math.min(selectedSnapshot.events.length, rangeStart + rangeSize))
    : [];

  return (
    <main style={{ margin: "0 auto", maxWidth: 1080, padding: "16px 20px", fontFamily: "Arial, sans-serif" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>Replay lab</h1>
        <p style={{ marginTop: 0 }}>
          Phase A Slice 3 consumer app proving shared runtime config and diagnostics reuse.
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
        <button type="button" onClick={() => client.disconnect()}>
          Disconnect
        </button>
        <button type="button" onClick={captureSnapshot}>
          Capture replay snapshot
        </button>
      </section>

      <section style={{ marginBottom: 16 }}>
        <strong>Active room:</strong> <code>{activeRoomId}</code>{" "}
        <span style={{ marginLeft: 8 }}>
          (<code>{config.wsBaseUrl}</code>)
        </span>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 14 }}>
        <article style={{ border: "1px solid #9aa4b2", borderRadius: 8, minHeight: 340, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Replay snapshot inspector</h2>
          <p>Capture runtime snapshots, then inspect the event payload summary for each capture.</p>
          <h3>Captured snapshots</h3>
          <ul>
            {snapshots.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => setSelectedSnapshotId(entry.id)}
                  style={{
                    background: selectedSnapshotId === entry.id ? "#dbeafe" : "transparent",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "4px 6px",
                    cursor: "pointer"
                  }}
                >
                  Snapshot {entry.id}: {new Date(entry.atIso).toLocaleTimeString()} ({entry.eventCount} events)
                </button>
              </li>
            ))}
            {snapshots.length === 0 ? <li>No snapshots captured yet.</li> : null}
          </ul>
          <h3>Snapshot details</h3>
          {selectedSnapshot ? (
            <div>
              <p style={{ marginBottom: 6 }}>
                <strong>ID:</strong> {selectedSnapshot.id}
              </p>
              <p style={{ marginTop: 0, marginBottom: 6 }}>
                <strong>Captured:</strong> {new Date(selectedSnapshot.atIso).toLocaleString()}
              </p>
              <p style={{ marginTop: 0 }}>
                <strong>Event count:</strong> {selectedSnapshot.eventCount}
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <label htmlFor="rangeStart">Range start</label>
                <input
                  id="rangeStart"
                  type="number"
                  min={0}
                  max={Math.max(0, selectedSnapshot.events.length - 1)}
                  value={rangeStart}
                  onChange={(event) => setRangeStart(Math.max(0, Number(event.target.value) || 0))}
                  style={{ width: 90, padding: 4 }}
                />
                <label htmlFor="rangeSize">Range size</label>
                <input
                  id="rangeSize"
                  type="number"
                  min={1}
                  max={50}
                  value={rangeSize}
                  onChange={(event) => setRangeSize(Math.max(1, Number(event.target.value) || 1))}
                  style={{ width: 90, padding: 4 }}
                />
                <span>
                  showing {rangedEvents.length} of {selectedSnapshot.events.length}
                </span>
              </div>
              <ul style={{ maxHeight: 150, overflow: "auto", paddingLeft: 18 }}>
                {rangedEvents.map((line, index) => (
                  <li key={`${selectedSnapshot.id}-${rangeStart + index}`}>
                    <code>{line}</code>
                  </li>
                ))}
                {rangedEvents.length === 0 ? <li>No events in selected range.</li> : null}
              </ul>
            </div>
          ) : (
            <p>Select a snapshot to inspect details.</p>
          )}
        </article>

        <DiagnosticsPanel diagnostics={diagnostics} />
      </section>
    </main>
  );
}

