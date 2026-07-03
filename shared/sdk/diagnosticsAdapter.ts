// diagnosticsAdapter — adapts a createDoc `Doc`'s connection lifecycle to the
// RuntimeDiagnostics shape rendered by shared/ui/DiagnosticsPanel, so apps
// migrating from the low-level runtime clients keep their diagnostics UI.

import type { Doc } from "nodalmerge-sdk-js/doc";
import type { ConnectionState, RuntimeDiagnostics, RuntimeEventItem } from "../runtime/contracts";
import type { RuntimeConfig } from "../runtime/contracts";

const MAX_EVENTS = 25;

export interface DocDiagnostics {
  getDiagnostics(): RuntimeDiagnostics;
  subscribe(listener: (diagnostics: RuntimeDiagnostics) => void): () => void;
  /** Record an app-level event into the recent-events feed. */
  note(type: string, message: string): void;
  dispose(): void;
}

export function createDocDiagnostics(doc: Doc, config: RuntimeConfig): DocDiagnostics {
  let connectionState: ConnectionState = doc.isConnected ? "open" : "connecting";
  let lastError: string | null = null;
  const recentEvents: RuntimeEventItem[] = [];
  const listeners = new Set<(diagnostics: RuntimeDiagnostics) => void>();

  const snapshot = (): RuntimeDiagnostics => ({
    // The SDK doesn't emit onDisconnect for a manual disconnect(), so an
    // "open" state from the last event can go stale — cross-check the live
    // flag rather than trusting event history alone.
    connectionState: connectionState === "open" && !doc.isConnected ? "closed" : connectionState,
    transportMode: config.transportMode,
    lastError,
    lastCloseCode: null,
    lastCloseReason: null,
    recentEvents: [...recentEvents]
  });

  const emit = () => {
    const current = snapshot();
    for (const listener of listeners) {
      listener(current);
    }
  };

  const pushEvent = (type: string, message: string) => {
    recentEvents.unshift({ atIso: new Date().toISOString(), type, message });
    if (recentEvents.length > MAX_EVENTS) {
      recentEvents.pop();
    }
  };

  const offConnect = doc.onConnect(() => {
    connectionState = "open";
    pushEvent("connect", "Connected to demo host.");
    emit();
  });
  const offDisconnect = doc.onDisconnect(() => {
    connectionState = "closed";
    pushEvent("disconnect", "Disconnected from demo host.");
    emit();
  });
  const offError = doc.onError((err) => {
    connectionState = doc.isConnected ? "open" : "error";
    lastError = err instanceof Error ? err.message : String(err);
    pushEvent("error", lastError);
    emit();
  });

  return {
    getDiagnostics: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    note(type, message) {
      pushEvent(type, message);
      emit();
    },
    dispose() {
      offConnect();
      offDisconnect();
      offError();
      listeners.clear();
    }
  };
}
