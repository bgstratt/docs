import type { RuntimeConfig, RuntimeDiagnostics, RuntimeEventItem } from "../../../../../shared/runtime/contracts";
import { RuntimeClient } from "../../../../../shared/runtime/runtimeClient";
import bridgeWasmUrl from "nodalmerge-bridge/nodalmerge_bridge_bg.wasm?url";

type Listener = (next: RuntimeDiagnostics) => void;
type RuntimeMessageListener = (payload: Record<string, unknown>) => void;

type NodalMergeSdkLike = {
  room: {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
  };
  sync?: {
    set?: (key: string, value: string) => void;
    get?: (key: string) => string | null;
    push?: () => void;
  };
  presence?: {
    set?: (data: unknown) => void;
  };
  signaling?: {
    relay?: (type: string, to: string, payload?: Record<string, unknown>) => void;
  };
  on?: (eventName: string, handler: (payload: unknown) => void) => () => void;
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

export class SdkRuntimeClient {
  private fallbackClient: RuntimeClient;
  private sdk: NodalMergeSdkLike | null = null;
  private diagnostics: RuntimeDiagnostics;
  private listeners = new Set<Listener>();
  private runtimeMessageListeners = new Set<RuntimeMessageListener>();
  private activeRoomId: string | null = null;

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

  setSharedValue(key: string, value: string): boolean {
    const sync = this.sdk?.sync;
    if (!sync?.set) {
      this.push("warn", "sdk sync.set unavailable; ensure runtime mode is npm sdk + wasm");
      return false;
    }

    sync.set(key, value);
    if (sync.push) {
      sync.push();
    }
    this.push("sdk", `set ${key}`);
    return true;
  }

  getSharedValue(key: string): string | null {
    const sync = this.sdk?.sync;
    if (!sync?.get) {
      return null;
    }

    try {
      return sync.get(key);
    } catch {
      return null;
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
        sdk.on("runtime-message", (payload) => {
          if (payload && typeof payload === "object") {
            this.emitRuntimeMessage(payload as Record<string, unknown>);
          }
          this.push("runtime-message", JSON.stringify(payload).slice(0, 220));
        });
      }

      await sdk.room.connect();
      this.diagnostics = {
        ...this.diagnostics,
        connectionState: "open",
        lastError: null,
        recentEvents: nextEvents(this.diagnostics.recentEvents, "sdk", "connected via npm sdk + wasm")
      };
      this.emit();
    } catch (error) {
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
    void this.disconnectAsync();
  }

  private async disconnectAsync(): Promise<void> {
    if (this.sdk) {
      try {
        await this.sdk.room.disconnect();
      } catch {
        // best effort
      }
      this.sdk = null;
    }

    this.fallbackClient.disconnect();
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

