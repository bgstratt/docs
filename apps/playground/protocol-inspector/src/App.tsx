import { useEffect, useMemo, useState } from "react";
import { loadRuntimeConfig } from "../../../../shared/runtime/config";
import type { RuntimeDiagnostics } from "../../../../shared/runtime/contracts";
import { RuntimeClient } from "../../../../shared/runtime/runtimeClient";
import { DiagnosticsPanel } from "../../../../shared/ui/DiagnosticsPanel";

const config = loadRuntimeConfig(import.meta.env as Record<string, string | undefined>);
const client = new RuntimeClient(config, { pubkeyPrefix: "protocol-inspector", maxEvents: 120 });

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
    <main style={{ margin: "0 auto", maxWidth: 1180, padding: "16px 20px", fontFamily: "Arial, sans-serif" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 6 }}>Protocol inspector</h1>
        <p style={{ marginTop: 0 }}>
          Phase C playground for observing runtime websocket message flow, type distribution, and raw payloads.
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
        <label htmlFor="typeFilter">Type filter</label>
        <input
          id="typeFilter"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          placeholder="welcome, presence, peer..."
          style={{ minWidth: 200, padding: 6 }}
        />
        <button type="button" onClick={clearEvents}>
          Clear stream
        </button>
        <button type="button" onClick={() => void exportTraceSnippet()}>
          Export trace snippet
        </button>
      </section>

      <section style={{ marginBottom: 12 }}>
        <strong>Filter presets:</strong>{" "}
        {presetFilters.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setTypeFilter(preset.value)}
            style={{
              marginRight: 6,
              marginBottom: 6,
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              background: typeFilter === preset.value ? "#dbeafe" : "transparent",
              padding: "4px 8px",
              cursor: "pointer"
            }}
          >
            {preset.label}
          </button>
        ))}
      </section>

      <section style={{ marginBottom: 16 }}>
        <strong>Active room:</strong> <code>{activeRoomId}</code>{" "}
        <span style={{ marginLeft: 8 }}>
          (<code>{config.wsBaseUrl}</code>)
        </span>
        <span style={{ marginLeft: 8 }}>
          visible events: <code>{filteredEvents.length}</code>
        </span>
        <span style={{ marginLeft: 8 }}>
          export: <code>{lastExportStatus}</code>
        </span>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14 }}>
        <article style={{ border: "1px solid #9aa4b2", borderRadius: 8, minHeight: 360, padding: 12 }}>
          <h2 style={{ marginTop: 0 }}>Filtered runtime stream</h2>
          <ul style={{ maxHeight: 290, overflow: "auto", paddingLeft: 18, marginTop: 0 }}>
            {filteredEvents.map((entry) => (
              <li key={entry.id} style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => setSelectedEventId(entry.id)}
                  style={{
                    border: "1px solid #cbd5e1",
                    background: selectedEventId === entry.id ? "#e0f2fe" : "transparent",
                    borderRadius: 6,
                    cursor: "pointer",
                    padding: "4px 6px"
                  }}
                >
                  <code>{entry.type}</code> @ {new Date(entry.atIso).toLocaleTimeString()}
                </button>
              </li>
            ))}
            {filteredEvents.length === 0 ? <li>No runtime events yet for this filter.</li> : null}
          </ul>
          <h3 style={{ marginBottom: 6 }}>Selected raw payload</h3>
          {selectedEvent ? (
            <pre
              style={{
                marginTop: 0,
                maxHeight: 180,
                overflow: "auto",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: 8
              }}
            >
              {selectedEvent.raw}
            </pre>
          ) : (
            <p>Select an event to inspect its raw message payload.</p>
          )}
        </article>

        <section style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 12 }}>
          <article style={{ border: "1px solid #d0d7de", borderRadius: 8, padding: 12 }}>
            <h2 style={{ marginTop: 0 }}>Message type counts</h2>
            <ul style={{ marginBottom: 0, paddingLeft: 18, maxHeight: 180, overflow: "auto" }}>
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
    </main>
  );
}
