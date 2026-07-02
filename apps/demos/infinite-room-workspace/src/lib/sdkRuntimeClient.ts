import type { RuntimeConfig, RuntimeDiagnostics, RuntimeEventItem } from "../../../../../shared/runtime/contracts";
import { RuntimeClient } from "../../../../../shared/runtime/runtimeClient";
import bridgeWasmUrl from "nodalmerge-bridge/nodalmerge_bridge_bg.wasm?url";

type Listener = (next: RuntimeDiagnostics) => void;
type RuntimeMessageListener = (payload: Record<string, unknown>) => void;

export type SharedWriteResult = {
  applied: boolean;
  pushed: boolean;
};

type NodalMergeSdkLike = {
  room: {
    connect: () => Promise<void>;
    disconnect: () => void | Promise<void>;
  };
  sync?: {
    set?: (key: string, value: string) => void;
    get?: (key: string) => string | null;
    getCanonical?: (key: string) => string | null;
    getText?: (key: string) => string | null;
    getTextCanonical?: (key: string) => string | null;
    getTextSequence?: (key: string) => Array<{ lamport: number; author: string; ch: string }>;
    getTextAtLamport?: (key: string, maxLamport: number) => string;
    getTextSequenceAtLamport?: (
      key: string,
      maxLamport: number
    ) => Array<{ lamport: number; author: string; ch: string }>;
    del?: (key: string) => void;
    insertTextRange?: (key: string, anchor: { kind: string; pos?: number }, text: string) => void;
    deleteTextRange?: (key: string, anchor: { kind: string; pos?: number }, len: number) => void;
    insertTextAt?: (key: string, pos: number, text: string) => void;
    deleteTextAt?: (key: string, pos: number, len: number) => void;
    push?: () => boolean;
    pull?: () => void;
    readLocalReplayRange?: (args: {
      keyPrefix: string;
      fromLamport?: number;
      limit?: number;
      cursor?: string;
    }) => Record<string, unknown> | null;
  };
  query?: {
    readReplayRange?: (args: {
      keyPrefix: string;
      fromLamport?: number;
      limit?: number;
      cursor?: string;
      timeoutMs?: number;
    }) => Promise<Record<string, unknown>>;
  };
  replay?: {
    state?: () => Record<string, unknown>;
  };
  offline?: {
    outboxDepth?: () => number;
  };
  presence?: {
    set?: (data: unknown) => void;
  };
  signaling?: {
    relay?: (type: string, to: string, payload?: Record<string, unknown>) => void;
  };
  topology?: {
    snapshot?: () => { pubkey?: string };
  };
  on?: (eventName: string, handler: (payload: unknown) => void) => () => void;
  isWasmStoreBusy?: () => boolean;
};

type CreateNodalMergeSdkFn = (options: {
  wsUrl: string;
  roomId: string;
  wasmModule?: string;
  transport?: { mode?: "ws-only" | "auto" };
}) => Promise<NodalMergeSdkLike>;

async function maybeLoadSdkFactory(): Promise<CreateNodalMergeSdkFn | null> {
  try {
    const loaded = (await import("nodalmerge-sdk-js")) as { createNodalMergeSdk?: CreateNodalMergeSdkFn };
    return loaded.createNodalMergeSdk ?? null;
  } catch {
    return null;
  }
}

function nextEvents(list: RuntimeEventItem[], type: string, message: string): RuntimeEventItem[] {
  return [{ atIso: new Date().toISOString(), type, message }, ...list].slice(0, 40);
}

function buildReplayRangeFromTextGlyphs(
  glyphs: Array<{ lamport: number; author: string; ch: string }>,
  textKey: string,
  keyPrefix: string
): Record<string, unknown> {
  const byLamport = new Map<number, { authors: Set<string> }>();
  for (const glyph of glyphs) {
    const bucket = byLamport.get(glyph.lamport) ?? { authors: new Set<string>() };
    bucket.authors.add(glyph.author.slice(0, 12));
    byLamport.set(glyph.lamport, bucket);
  }

  const items = [...byLamport.entries()]
    .sort(([left], [right]) => left - right)
    .map(([lamport, bucket]) => ({
      lamport,
      node_id: [...bucket.authors].sort().join("+").slice(0, 12) || `L${lamport}`,
      touched_keys: [textKey]
    }));

  return {
    type: "replay.read-range.result",
    key_prefix: keyPrefix,
    from_lamport: 0,
    items,
    next_cursor: null
  };
}

export class SdkRuntimeClient {
  private fallbackClient: RuntimeClient;
  private sdk: NodalMergeSdkLike | null = null;
  private diagnostics: RuntimeDiagnostics;
  private listeners = new Set<Listener>();
  private runtimeMessageListeners = new Set<RuntimeMessageListener>();
  private activeRoomId: string | null = null;
  private localPubkey: string | null = null;
  private initialConnectPending = false;
  private syncWriteDepth = 0;
  private unsubscribeRuntimeStreams: Array<() => void> = [];

  /** True while a local sync mutation holds the WASM store (avoid overlapping reads). */
  isSyncWriteInProgress(): boolean {
    return this.syncWriteDepth > 0;
  }

  private runSyncWrite<T>(fn: () => T): T {
    this.syncWriteDepth += 1;
    try {
      return fn();
    } finally {
      this.syncWriteDepth -= 1;
    }
  }

  constructor(private readonly config: RuntimeConfig) {
    this.fallbackClient = new RuntimeClient(config, { pubkeyPrefix: "workspace-sdk-fallback", maxEvents: 40 });
    this.diagnostics = this.fallbackClient.getDiagnostics();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.diagnostics);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getDiagnostics(): RuntimeDiagnostics {
    return this.diagnostics;
  }

  subscribeRuntimeMessages(listener: RuntimeMessageListener): () => void {
    this.runtimeMessageListeners.add(listener);
    return () => {
      this.runtimeMessageListeners.delete(listener);
    };
  }

  setSharedValue(key: string, value: string): SharedWriteResult {
    return this.setSharedValues([{ key, value }]);
  }

  setSharedValues(entries: Array<{ key: string; value: string }>): SharedWriteResult {
    const sync = this.sdk?.sync;
    if (!sync?.set) {
      this.push("warn", "sdk sync.set unavailable; ensure runtime mode is npm sdk + wasm");
      return { applied: false, pushed: false };
    }
    if (entries.length === 0) {
      return { applied: true, pushed: true };
    }

    try {
      for (const entry of entries) {
        sync.set(entry.key, entry.value);
      }
      let pushed = true;
      if (sync.push) {
        pushed = sync.push() === true;
      }
      const outboxDepth = this.sdk?.offline?.outboxDepth?.() ?? null;
      const outboxSuffix = outboxDepth === null ? "" : ` (outbox=${outboxDepth})`;
      const keys = entries.map((entry) => entry.key).join(", ");
      if (!pushed) {
        this.diagnostics = {
          ...this.diagnostics,
          lastError: "sync push produced no outbound pack; local state updated but server sync may lag",
          recentEvents: nextEvents(
            this.diagnostics.recentEvents,
            "warn",
            `sync push no-op after set ${keys}${outboxSuffix}`
          )
        };
        this.emit();
        return { applied: true, pushed: false };
      }
      this.diagnostics = {
        ...this.diagnostics,
        lastError: null,
        recentEvents: nextEvents(this.diagnostics.recentEvents, "sdk", `set ${keys}${outboxSuffix}`)
      };
      this.emit();
      return { applied: true, pushed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "sdk sync write failed";
      const keys = entries.map((entry) => entry.key).join(", ");
      this.diagnostics = {
        ...this.diagnostics,
        lastError: message,
        recentEvents: nextEvents(this.diagnostics.recentEvents, "error", `sync write failed for ${keys}: ${message}`)
      };
      this.emit();
      return { applied: false, pushed: false };
    }
  }

  getDocumentText(key: string, options?: { canonical?: boolean }): string | null {
    if (this.syncWriteDepth > 0) {
      return null;
    }
    const sync = this.sdk?.sync;
    if (!sync) {
      return null;
    }
    try {
      if (options?.canonical && sync.getTextCanonical) {
        return sync.getTextCanonical(key);
      }
      return sync.getText?.(key) ?? null;
    } catch {
      return null;
    }
  }

  getTextSequence(key: string): Array<{ lamport: number; author: string; ch: string }> {
    if (this.syncWriteDepth > 0) {
      return [];
    }
    const sync = this.sdk?.sync;
    if (!sync?.getTextSequence) {
      return [];
    }
    try {
      return sync.getTextSequence(key);
    } catch {
      return [];
    }
  }

  getTextAtLamport(key: string, maxLamport: number): string | null {
    if (this.syncWriteDepth > 0) {
      return null;
    }
    const sync = this.sdk?.sync;
    if (!sync?.getTextAtLamport) {
      return null;
    }
    try {
      return sync.getTextAtLamport(key, maxLamport);
    } catch {
      return null;
    }
  }

  getTextSequenceAtLamport(
    key: string,
    maxLamport: number
  ): Array<{ lamport: number; author: string; ch: string }> {
    if (this.syncWriteDepth > 0) {
      return [];
    }
    const sync = this.sdk?.sync;
    if (!sync?.getTextSequenceAtLamport) {
      return [];
    }
    try {
      return sync.getTextSequenceAtLamport(key, maxLamport);
    } catch {
      return [];
    }
  }

  private async waitForSyncIdle(timeoutMs = 2000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const sdkBusy = this.sdk?.isWasmStoreBusy?.() === true;
      if (this.syncWriteDepth === 0 && !sdkBusy) {
        return;
      }
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 16);
      });
    }
  }

  /** Read glyphs for replay UI without the sync-write guard (call only after waitForSyncIdle). */
  private getTextSequenceForReplay(key: string): Array<{ lamport: number; author: string; ch: string }> {
    const sync = this.sdk?.sync;
    if (!sync?.getTextSequence) {
      return [];
    }
    try {
      return sync.getTextSequence(key);
    } catch {
      return [];
    }
  }

  applyTextEdits(
    key: string,
    edits: Array<{ pos: number; deleteLen: number; insertText: string }>,
    options?: { useRangeOps?: boolean }
  ): SharedWriteResult {
    const sync = this.sdk?.sync;
    if (!sync?.insertTextAt || !sync.deleteTextAt) {
      this.push("warn", "sdk text ops unavailable; ensure runtime mode is npm sdk + wasm");
      return { applied: false, pushed: false };
    }
    const insertTextAt = sync.insertTextAt;
    const deleteTextAt = sync.deleteTextAt;
    if (edits.length === 0) {
      return { applied: true, pushed: true };
    }
    const docText = this.getDocumentText(key) ?? "";
    const docLength = [...docText].length;
    const safeEdits = edits.map((edit) => {
      const pos = Math.min(Math.max(0, edit.pos), docLength);
      const maxDelete = Math.max(0, docLength - pos);
      const deleteLen = Math.min(Math.max(0, edit.deleteLen), maxDelete);
      return { pos, deleteLen, insertText: edit.insertText };
    }).filter((edit) => edit.deleteLen > 0 || edit.insertText.length > 0);
    if (safeEdits.length === 0) {
      return { applied: true, pushed: true };
    }
    const useRangeOps = options?.useRangeOps !== false;
    try {
      this.runSyncWrite(() => {
        for (const edit of safeEdits) {
          if (edit.deleteLen > 0) {
            if (useRangeOps && edit.deleteLen > 1 && sync.deleteTextRange) {
              sync.deleteTextRange(key, { kind: "offset", pos: edit.pos }, edit.deleteLen);
            } else {
              deleteTextAt(key, edit.pos, edit.deleteLen);
            }
          }
          if (edit.insertText.length > 0) {
            if (useRangeOps && edit.insertText.length > 1 && sync.insertTextRange) {
              sync.insertTextRange(key, { kind: "offset", pos: edit.pos }, edit.insertText);
            } else {
              insertTextAt(key, edit.pos, edit.insertText);
            }
          }
        }
      });
      let pushed = true;
      if (sync.push) {
        pushed = sync.push() === true;
      }
      if (!pushed) {
        this.diagnostics = {
          ...this.diagnostics,
          lastError: "sync push produced no outbound pack after text edits",
          recentEvents: nextEvents(this.diagnostics.recentEvents, "warn", `text push no-op for ${key}`)
        };
        this.emit();
        return { applied: true, pushed: false };
      }
      this.diagnostics = {
        ...this.diagnostics,
        lastError: null,
        recentEvents: nextEvents(this.diagnostics.recentEvents, "sdk", `text edits ${key} (${edits.length})`)
      };
      this.emit();
      return { applied: true, pushed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "sdk text edit failed";
      this.diagnostics = {
        ...this.diagnostics,
        lastError: message,
        recentEvents: nextEvents(this.diagnostics.recentEvents, "error", `text edit failed for ${key}: ${message}`)
      };
      this.emit();
      return { applied: false, pushed: false };
    }
  }

  async readReplayRange(args: {
    keyPrefix: string;
    textKey?: string;
    fromLamport?: number;
    limit?: number;
    cursor?: string;
    timeoutMs?: number;
    queryHost?: boolean;
  }): Promise<Record<string, unknown> | null> {
    await this.waitForSyncIdle();

    const readLocalReplayRange = this.sdk?.sync?.readLocalReplayRange;
    if (readLocalReplayRange) {
      try {
        const localResult = readLocalReplayRange(args);
        if (localResult?.type === "replay.read-range.result") {
          const items = localResult.items;
          if (Array.isArray(items) && items.length > 0) {
            return localResult;
          }
        }
      } catch {
        // Fall through to glyph or host fallback.
      }
    }

    if (args.textKey) {
      const glyphs = this.getTextSequenceForReplay(args.textKey);
      const glyphTimeline = buildReplayRangeFromTextGlyphs(glyphs, args.textKey, args.keyPrefix);
      const glyphItems = glyphTimeline.items;
      if (Array.isArray(glyphItems) && glyphItems.length > 0) {
        return glyphTimeline;
      }
      if (args.queryHost !== true) {
        return glyphTimeline;
      }
    }

    if (args.queryHost === false) {
      return null;
    }

    const readHostReplayRange = this.sdk?.query?.readReplayRange;
    if (!readHostReplayRange) {
      return null;
    }

    try {
      return await readHostReplayRange({
        ...args,
        timeoutMs: Math.min(args.timeoutMs ?? 500, 200)
      });
    } catch {
      return null;
    }
  }

  getSharedValue(key: string, options?: { canonical?: boolean }): string | null {
    const sync = this.sdk?.sync;
    if (!sync?.get) {
      return null;
    }

    try {
      if (options?.canonical && sync.getCanonical) {
        const canonical = sync.getCanonical(key);
        if (canonical !== null) {
          return canonical;
        }
      }
      return sync.get(key);
    } catch {
      return null;
    }
  }

  listSharedKeysByPrefix(prefix: string): string[] {
    const replay = this.sdk?.replay?.state?.() as Record<string, unknown> | undefined;
    if (!replay) {
      return [];
    }
    return Object.keys(replay).filter((key) => key.startsWith(prefix));
  }

  getAllSharedKeys(): string[] {
    const replay = this.sdk?.replay?.state?.() as Record<string, unknown> | undefined;
    if (!replay) {
      return [];
    }
    return Object.keys(replay);
  }

  deleteSharedValue(key: string): SharedWriteResult {
    const sync = this.sdk?.sync;
    if (!sync?.del) {
      this.push("warn", "sdk sync.del unavailable; ensure runtime mode is npm sdk + wasm");
      return { applied: false, pushed: false };
    }
    try {
      sync.del(key);
      let pushed = true;
      if (sync.push) {
        pushed = sync.push() === true;
      }
      this.diagnostics = {
        ...this.diagnostics,
        lastError: pushed ? null : "sync delete push produced no outbound pack",
        recentEvents: nextEvents(this.diagnostics.recentEvents, "sdk", `del ${key}`)
      };
      this.emit();
      return { applied: true, pushed };
    } catch (error) {
      const message = error instanceof Error ? error.message : "sdk sync delete failed";
      this.diagnostics = {
        ...this.diagnostics,
        lastError: message,
        recentEvents: nextEvents(this.diagnostics.recentEvents, "error", `sync delete failed for ${key}: ${message}`)
      };
      this.emit();
      return { applied: false, pushed: false };
    }
  }

  getLocalPubkey(): string | null {
    return this.localPubkey;
  }

  requestSyncPull(): void {
    try {
      this.sdk?.sync?.pull?.();
    } catch {
      // best effort
    }
  }

  setPresence(data: Record<string, unknown>): boolean {
    const setPresence = this.sdk?.presence?.set;
    if (!setPresence) {
      this.push("warn", "sdk presence.set unavailable; ensure runtime mode is npm sdk + wasm");
      return false;
    }

    setPresence(data);
    this.push("sdk", "presence updated");
    return true;
  }

  sendPeerSignal(to: string, payloadType: string, payload: Record<string, unknown>): boolean {
    const relay = this.sdk?.signaling?.relay;
    if (!relay) {
      this.push("warn", "sdk signaling.relay unavailable; ensure runtime mode is npm sdk + wasm");
      return false;
    }

    relay(payloadType, to, payload);
    this.push("sdk", `signal sent to ${to}`);
    return true;
  }

  async connect(roomId: string): Promise<void> {
    await this.disconnectAsync(true);
    this.activeRoomId = roomId;
    const createSdk = await maybeLoadSdkFactory();
    if (!createSdk) {
      this.push("warn", "nodalmerge-sdk-js not installed; falling back to direct websocket mode");
      const unsub = this.fallbackClient.subscribe((diag) => {
        this.diagnostics = diag;
        this.emit();
      });
      this.fallbackClient.connect(roomId);
      // keep one latest snapshot and release immediate subscription
      unsub();
      this.diagnostics = this.fallbackClient.getDiagnostics();
      this.emit();
      return;
    }

    try {
      const sdk = await createSdk({
        wsUrl: `${this.config.wsBaseUrl}/ws/runtime`,
        roomId,
        wasmModule: bridgeWasmUrl,
        transport: { mode: this.config.transportMode }
      });
      this.sdk = sdk;
      this.diagnostics = {
        ...this.diagnostics,
        connectionState: "connecting",
        transportMode: this.config.transportMode,
        recentEvents: nextEvents(this.diagnostics.recentEvents, "sdk", "initializing nodalmerge-sdk-js")
      };
      this.emit();

      if (typeof sdk.on === "function") {
        const register = (eventName: string, options?: { skipDiagnostics?: boolean }) => {
          try {
            const unsubscribe = sdk.on?.(eventName, (payload) => {
              const normalized = normalizeRuntimePayload(eventName, payload);
              if (normalized) {
                this.emitRuntimeMessage(normalized);
              }
              if (!options?.skipDiagnostics) {
                this.push(eventName, JSON.stringify(payload).slice(0, 220));
              }
            });
            if (typeof unsubscribe === "function") {
              this.unsubscribeRuntimeStreams.push(unsubscribe);
            }
          } catch {
            // Not all bridge builds support all event names.
          }
        };
        register("runtime-message", { skipDiagnostics: true });
        register("presence", { skipDiagnostics: true });
        register("presence-updated", { skipDiagnostics: true });
        try {
          const unsubscribeReconnect = sdk.on?.("reconnect", (payload) => {
            this.push("reconnect", JSON.stringify(payload).slice(0, 220));
          });
          if (typeof unsubscribeReconnect === "function") {
            this.unsubscribeRuntimeStreams.push(unsubscribeReconnect);
          }
        } catch {
          // best effort
        }
        try {
          const unsubscribeDisconnected = sdk.on?.("disconnected", () => {
            this.diagnostics = {
              ...this.diagnostics,
              connectionState: "connecting",
              recentEvents: nextEvents(
                this.diagnostics.recentEvents,
                "state",
                "runtime websocket disconnected; sdk reconnect pending"
              )
            };
            this.emit();
          });
          if (typeof unsubscribeDisconnected === "function") {
            this.unsubscribeRuntimeStreams.push(unsubscribeDisconnected);
          }
        } catch {
          // best effort
        }
        try {
          const unsubscribeConnected = sdk.on?.("connected", () => {
            this.localPubkey = sdk.topology?.snapshot?.().pubkey ?? this.localPubkey;
            this.diagnostics = {
              ...this.diagnostics,
              connectionState: "open",
              lastError: null,
              recentEvents: nextEvents(this.diagnostics.recentEvents, "sdk", "runtime websocket connected")
            };
            this.emit();
            if (!this.initialConnectPending) {
              this.emitRuntimeMessage({ type: "runtime-reconnected" });
            }
          });
          if (typeof unsubscribeConnected === "function") {
            this.unsubscribeRuntimeStreams.push(unsubscribeConnected);
          }
        } catch {
          // best effort
        }
        try {
          const unsubscribeError = sdk.on?.("error", (payload) => {
            const message =
              payload instanceof Error ? payload.message : typeof payload === "string" ? payload : "sdk runtime error";
            this.diagnostics = {
              ...this.diagnostics,
              connectionState: "error",
              lastError: message,
              recentEvents: nextEvents(this.diagnostics.recentEvents, "error", message)
            };
            this.emit();
          });
          if (typeof unsubscribeError === "function") {
            this.unsubscribeRuntimeStreams.push(unsubscribeError);
          }
        } catch {
          // best effort
        }
        try {
          const unsubscribeMessage = sdk.on?.("message", (payload) => {
            if (!payload || typeof payload !== "object") {
              return;
            }
            const msg = payload as { type?: unknown; from?: unknown };
            if (msg.type === "pack" || msg.type === "blob-pack") {
              const fromPeer = typeof msg.from === "string" ? msg.from : null;
              this.emitRuntimeMessage({ type: "pack-applied", from: fromPeer });
            }
          });
          if (typeof unsubscribeMessage === "function") {
            this.unsubscribeRuntimeStreams.push(unsubscribeMessage);
          }
        } catch {
          // best effort
        }
      }

      this.initialConnectPending = true;
      await sdk.room.connect();
      this.initialConnectPending = false;
      this.localPubkey = sdk.topology?.snapshot?.().pubkey ?? null;
      this.diagnostics = {
        ...this.diagnostics,
        connectionState: "open",
        lastError: null,
        recentEvents: nextEvents(this.diagnostics.recentEvents, "sdk", "connected via npm sdk + wasm")
      };
      this.emit();
    } catch (error) {
      this.initialConnectPending = false;
      this.diagnostics = {
        ...this.diagnostics,
        connectionState: "error",
        lastError: error instanceof Error ? error.message : "sdk connect failed",
        recentEvents: nextEvents(this.diagnostics.recentEvents, "error", "sdk connect failed")
      };
      this.emit();
    }
  }

  disconnect(): void {
    void this.disconnectAsync(false);
  }

  private async disconnectAsync(silent: boolean): Promise<void> {
    if (this.unsubscribeRuntimeStreams.length > 0) {
      for (const unsubscribe of this.unsubscribeRuntimeStreams) {
        try {
          unsubscribe();
        } catch {
          // best effort
        }
      }
      this.unsubscribeRuntimeStreams = [];
    }

    if (this.sdk) {
      try {
        await this.sdk.room.disconnect();
      } catch {
        // best effort
      }
      this.sdk = null;
    }

    this.fallbackClient.disconnect();
    this.activeRoomId = null;
    this.localPubkey = null;
    if (silent) {
      return;
    }
    this.diagnostics = {
      ...this.diagnostics,
      connectionState: "closed",
      recentEvents: nextEvents(this.diagnostics.recentEvents, "state", "manual disconnect")
    };
    this.emit();
  }

  private push(type: string, message: string): void {
    this.diagnostics = {
      ...this.diagnostics,
      recentEvents: nextEvents(this.diagnostics.recentEvents, type, message)
    };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.diagnostics);
    }
  }

  private emitRuntimeMessage(payload: Record<string, unknown>): void {
    for (const listener of this.runtimeMessageListeners) {
      listener(payload);
    }
  }
}

function normalizeRuntimePayload(eventName: string, payload: unknown): Record<string, unknown> | null {
  if (payload && typeof payload === "object") {
    const asRecord = payload as Record<string, unknown>;
    if (typeof asRecord.type === "string") {
      return asRecord;
    }
    return { type: eventName, data: asRecord };
  }
  if (typeof payload === "string" || typeof payload === "number" || typeof payload === "boolean") {
    return { type: eventName, data: payload };
  }
  return { type: eventName };
}

