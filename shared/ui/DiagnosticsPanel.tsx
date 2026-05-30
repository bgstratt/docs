import type { RuntimeDiagnostics } from "../runtime/contracts";

interface DiagnosticsPanelProps {
  diagnostics: RuntimeDiagnostics;
  title?: string;
}

export function DiagnosticsPanel({ diagnostics, title = "Diagnostics" }: DiagnosticsPanelProps) {
  return (
    <aside style={{ border: "1px solid #d0d7de", borderRadius: 8, padding: 12 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <ul style={{ paddingLeft: 18 }}>
        <li>Connection: {diagnostics.connectionState}</li>
        <li>Transport: {diagnostics.transportMode}</li>
        <li>Last error: {diagnostics.lastError ?? "none"}</li>
        <li>Last close code: {diagnostics.lastCloseCode ?? "none"}</li>
        <li>Last close reason: {diagnostics.lastCloseReason ?? "none"}</li>
      </ul>

      <h3>Recent events</h3>
      <ul style={{ maxHeight: 240, overflow: "auto", paddingLeft: 18 }}>
        {diagnostics.recentEvents.map((item, index) => (
          <li key={`${item.atIso}-${index}`}>
            <code>{item.type}</code> - {item.message}
          </li>
        ))}
        {diagnostics.recentEvents.length === 0 ? <li>No events yet.</li> : null}
      </ul>
    </aside>
  );
}

