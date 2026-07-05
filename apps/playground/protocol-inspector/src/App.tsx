import { useEffect, useMemo, useState } from "react";
import { loadRuntimeConfig } from "../../../../shared/runtime/config";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { RuntimeClient } from "../../../../shared/runtime/runtimeClient";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";

const config = loadRuntimeConfig(import.meta.env as Record<string, string | undefined>);
const client = new RuntimeClient(config, { pubkeyPrefix: "protocol-inspector", maxEvents: 120 });

// Default rooms of the other demo/playground apps, so the inspector can drop
// straight into whichever page is being observed. Free-form ids still work.
const KNOWN_ROOMS = [
  "collab-text",
  "collab-maps",
  "workflow-demo",
  "pixel-canvas",
  "demo-room"
];

// Sentinel for the "type your own room id" choice in the room dropdown.
const CUSTOM_ROOM = "__custom__";

interface InspectorEvent {
  id: string;
  atIso: string;
  type: string;
  raw: string;
}

function parseType(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.type === "string" ? parsed.type : "unknown";
  } catch {
    return "unparsed";
  }
}

export default function App() {
  const [roomIdInput, setRoomIdInput] = useState(config.defaultRoomId);
  const [roomChoice, setRoomChoice] = useState(
    KNOWN_ROOMS.includes(config.defaultRoomId) ? config.defaultRoomId : CUSTOM_ROOM
  );
  const [activeRoomId, setActiveRoomId] = useState(config.defaultRoomId);
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics>(client.getDiagnostics());
  const [events, setEvents] = useState<InspectorEvent[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [lastExportStatus, setLastExportStatus] = useState("No trace export yet.");

  useEffect(() => {
    const unsubscribe = client.subscribe((next) => {
      setDiagnostics(next);
      const incoming = next.recentEvents
        .filter((entry) => entry.type === "message")
        .map<InspectorEvent>((entry, index) => ({
          id: `${entry.atIso}-${index}`,
          atIso: entry.atIso,
          type: parseType(entry.message),
          raw: entry.message
        }));

      setEvents((previous) => {
        const merged = [...incoming, ...previous]
          .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index)
          .slice(0, 200);
        return merged;
      });
    });

    client.connect(config.defaultRoomId);
    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, []);

  const canConnect = useMemo(() => roomIdInput.trim().length > 0, [roomIdInput]);
  const filteredEvents = useMemo(() => {
    const filter = typeFilter.trim().toLowerCase();
    if (!filter) {
      return events;
    }
    return events.filter((entry) => entry.type.toLowerCase().includes(filter));
  }, [events, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of events) {
      counts[entry.type] = (counts[entry.type] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  const selectedEvent = filteredEvents.find((entry) => entry.id === selectedEventId) ?? null;

  const presetFilters = [
    { id: "all", label: "All", value: "" },
    { id: "presence", label: "Presence", value: "presence" },
    { id: "peer", label: "Peer lifecycle", value: "peer-" },
    { id: "welcome", label: "Welcome/session", value: "welcome" },
    { id: "replay", label: "Replay/query", value: "replay." }
  ] as const;

  function connectRoom() {
    const roomId = roomIdInput.trim();
    if (!roomId) {
      return;
    }
    setActiveRoomId(roomId);
    client.connect(roomId);
  }

  function chooseRoom(choice: string) {
    setRoomChoice(choice);
    if (choice === CUSTOM_ROOM) {
      setRoomIdInput("");
      return;
    }
    setRoomIdInput(choice);
    setActiveRoomId(choice);
    client.connect(choice);
  }

  function clearEvents() {
    setEvents([]);
    setSelectedEventId(null);
  }

  async function exportTraceSnippet() {
    const selection = filteredEvents.slice(0, 20).map((entry) => ({
      atIso: entry.atIso,
      type: entry.type,
      raw: entry.raw
    }));
    const payload = {
      roomId: activeRoomId,
      exportedAtIso: new Date().toISOString(),
      filter: typeFilter || "(none)",
      items: selection
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setLastExportStatus(`Copied ${selection.length} events to clipboard.`);
    } catch {
      setLastExportStatus("Clipboard write failed; copy from selected payload panel.");
    }
  }

  return (
    <main className="nm-app">
      <header className="nm-page-header">
        <h1 className="nm-page-title">Protocol inspector</h1>
        <p className="nm-page-desc">
          Observe the live runtime WebSocket message stream, filter by command family, and export trace snippets.
        </p>
      </header>

      <div className="nm-content">
      <section className="nm-controls">
        <label className="nm-label" htmlFor="roomChoice">Room</label>
        <select
          id="roomChoice"
          className="nm-input nm-input-lg"
          value={roomChoice}
          onChange={(event) => chooseRoom(event.target.value)}
        >
          {KNOWN_ROOMS.map((room) => <option key={room} value={room}>{room}</option>)}
          <option value={CUSTOM_ROOM}>Custom room…</option>
        </select>
        {roomChoice === CUSTOM_ROOM && (
          <>
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
          </>
        )}
        <button type="button" className="nm-btn" onClick={() => client.disconnect()}>
          Disconnect
        </button>
        <label className="nm-label" htmlFor="typeFilter">Filter</label>
        <input
          id="typeFilter"
          className="nm-input nm-input-lg"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          placeholder="welcome, presence, peer..."
        />
        <button type="button" className="nm-btn" onClick={clearEvents}>
          Clear stream
        </button>
        <button type="button" className="nm-btn" onClick={() => void exportTraceSnippet()}>
          Export trace
        </button>
      </section>

      <div className="nm-controls nm-mb-3">
        <span className="nm-section-label" style={{ marginBottom: 0 }}>Presets:</span>
        {presetFilters.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`nm-btn${typeFilter === preset.value ? " nm-btn-primary" : ""}`}
            onClick={() => setTypeFilter(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="nm-meta-bar">
        <span><strong>Room:</strong> <code>{activeRoomId}</code></span>
        <span><code>{config.wsBaseUrl}</code></span>
        <span>visible: <code>{filteredEvents.length}</code></span>
        <span>export: <code>{lastExportStatus}</code></span>
      </div>

      <section className="nm-layout-2col-wide">
        <article className="nm-card">
          <h2 className="nm-card-title">Filtered runtime stream</h2>
          <ul className="nm-event-list nm-event-list-lg nm-mb-3">
            {filteredEvents.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`nm-btn${selectedEventId === entry.id ? " nm-btn-primary" : ""}`}
                  onClick={() => setSelectedEventId(entry.id)}
                >
                  <code>{entry.type}</code> @ {new Date(entry.atIso).toLocaleTimeString()}
                </button>
              </li>
            ))}
            {filteredEvents.length === 0 ? <li>No runtime events yet for this filter.</li> : null}
          </ul>
          <h3 className="nm-section-label">Selected raw payload</h3>
          {selectedEvent ? (
            <pre className="nm-pre">{selectedEvent.raw}</pre>
          ) : (
            <p className="nm-p-muted">Select an event to inspect its raw message payload.</p>
          )}
        </article>

        <section style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 12 }}>
          <article className="nm-card">
            <h2 className="nm-card-title">Message type counts</h2>
            <ul className="nm-event-list nm-event-list-md">
              {Object.entries(typeCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <li key={type}>
                    <code>{type}</code>: {count}
                  </li>
                ))}
              {Object.keys(typeCounts).length === 0 ? <li>No message types observed yet.</li> : null}
            </ul>
          </article>
          <DiagnosticsPanel diagnostics={diagnostics} title="Protocol inspector diagnostics" />
        </section>
      </section>
      </div>
    </main>
  );
}
