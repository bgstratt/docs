import type { RuntimeDiagnostics } from "../runtime/contracts";

interface DiagnosticsPanelProps {
  diagnostics: RuntimeDiagnostics;
  title?: string;
}

export function DiagnosticsPanel({ diagnostics, title = "Diagnostics" }: DiagnosticsPanelProps) {
  return (
    <aside className="nm-diagnostics">
      <h2 className="nm-diagnostics-title">{title}</h2>
      <ul className="nm-diagnostics-list">
        <li><strong>Connection</strong><span>{diagnostics.connectionState}</span></li>
        <li><strong>Transport</strong><span>{diagnostics.transportMode}</span></li>
        <li><strong>Last error</strong><span>{diagnostics.lastError ?? "—"}</span></li>
        <li><strong>Close code</strong><span>{diagnostics.lastCloseCode ?? "—"}</span></li>
        <li><strong>Close reason</strong><span>{diagnostics.lastCloseReason ?? "—"}</span></li>
      </ul>

      <p className="nm-event-section-label">Recent events</p>
      <ul className="nm-event-feed">
        {diagnostics.recentEvents.map((item, index) => (
          <li key={`${item.atIso}-${index}`}>
            <code>{item.type}</code> {item.message}
          </li>
        ))}
        {diagnostics.recentEvents.length === 0 ? <li>No events yet.</li> : null}
      </ul>
    </aside>
  );
}

