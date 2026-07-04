// offlineToggle — explicit online/offline switch over a createDoc `Doc`.
//
// While offline, local mutations keep applying to the in-browser WASM store;
// on goOnline() the SDK reconnects and its welcome catch-up pushes everything
// the host is missing (and pulls what we're missing). `pendingWrites` counts
// local mutations made while offline so UIs can show an outbox-style badge —
// the SDK itself tracks unsent nodes internally, but does not expose a depth.

import type { Doc } from "nodalmerge-sdk-js/doc";

export interface OfflineToggle {
  isOnline(): boolean;
  goOffline(): void;
  goOnline(): void;
  /** Local mutations made while offline; resets to 0 after goOnline(). */
  pendingWrites(): number;
  subscribe(listener: (state: { online: boolean; pendingWrites: number }) => void): () => void;
  dispose(): void;
}

export function createOfflineToggle(doc: Doc): OfflineToggle {
  let online = doc.isConnected;
  let manuallyOffline = false;
  let pending = 0;
  const listeners = new Set<(state: { online: boolean; pendingWrites: number }) => void>();

  const emit = () => {
    const state = { online, pendingWrites: pending };
    for (const listener of listeners) {
      listener(state);
    }
  };

  const offChange = doc.onChange((ev) => {
    if (manuallyOffline && ev.source === "local") {
      pending += 1;
      emit();
    }
  });
  const offConnect = doc.onConnect(() => {
    online = true;
    pending = 0;
    emit();
  });
  const offDisconnect = doc.onDisconnect(() => {
    online = false;
    emit();
  });

  return {
    isOnline: () => online,
    goOffline() {
      manuallyOffline = true;
      doc.disconnect();
      // The SDK only emits onDisconnect for *unexpected* socket closes (a
      // manual disconnect() clears its connected flag before onclose runs),
      // so flip our state directly instead of waiting for an event that
      // never comes.
      online = false;
      emit();
    },
    goOnline() {
      manuallyOffline = false;
      doc.connect();
      // online flips back via doc.onConnect once the handshake completes.
    },
    pendingWrites: () => pending,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      offChange();
      offConnect();
      offDisconnect();
      listeners.clear();
    }
  };
}
