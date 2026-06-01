import { loadRuntimeConfig } from "../../../../../shared/runtime/config";
import type { RuntimeConfig, RuntimeDiagnostics, RuntimeEventItem } from "../../../../../shared/runtime/contracts";
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
  return [{ atIso: new Date().toISOString(), type, message }, ...list].slice(0, 50);
}

function initialDiagnostics(config: RuntimeConfig): RuntimeDiagnostics {
  return {
    connectionState: "idle",
    transportMode: config.transportMode,
    lastError: null,
    lastCloseCode: null,
    lastCloseReason: null,
    recentEvents: []
  };
}

export interface MapPin {
  id: string;
  x: number;
  y: number;
  label: string;
  author: string;
  atIso: string;
}

export class CollabMapsRuntimeClient {
  private readonly config = loadRuntimeConfig(import.meta.env as Record<string, string | undefined>);
  private sdk: NodalMergeSdkLike | null = null;
  private diagnostics: RuntimeDiagnostics = initialDiagnostics(this.config);
  private listeners = new Set<Listener>();
  private runtimeMessageListeners = new Set<RuntimeMessageListener>();
  private activeRoomId: string | null = null;
  private unsubscribeRuntimeStream: (() => void) | null = null;

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

  getConfig(): RuntimeConfig {
    return this.config;
  }

  subscribeRuntimeMessages(listener: RuntimeMessageListener): () => void {
    this.runtimeMessageListeners.add(listener);
    return () => {
      this.runtimeMessageListeners.delete(listener);
    };
  }

  async connect(roomId: string): Promise<void> {
    await this.disconnectAsync(true);
    this.activeRoomId = roomId;
    const createSdk = await maybeLoadSdkFactory();
    if (!createSdk) {
      this.push("error", "nodalmerge-sdk-js not installed");
      this.diagnostics = { ...this.diagnostics, connectionState: "error", lastError: "missing nodalmerge-sdk-js" };
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
        lastError: null
      };
      this.push("sdk", "initialized collab-maps sdk");
      this.emit();
      if (typeof sdk.on === "function") {
        this.unsubscribeRuntimeStream = sdk.on("runtime-message", (payload) => {
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
        lastError: null
      };
      this.push("sdk", "connected room");
      this.emit();
    } catch (error) {
      this.diagnostics = {
        ...this.diagnostics,
        connectionState: "error",
        lastError: error instanceof Error ? error.message : "sdk connect failed"
      };
      this.push("error", "sdk connect failed");
      this.emit();
    }
  }

  disconnect(): void {
    void this.disconnectAsync(false);
  }

  private async disconnectAsync(silent: boolean): Promise<void> {
    if (this.unsubscribeRuntimeStream) {
      try {
        this.unsubscribeRuntimeStream();
      } catch {
        // best effort
      }
      this.unsubscribeRuntimeStream = null;
    }

    if (this.sdk) {
      try {
        await this.sdk.room.disconnect();
      } catch {
        // best effort
      }
      this.sdk = null;
    }
    this.activeRoomId = null;
    if (silent) {
      return;
    }
    this.diagnostics = {
      ...this.diagnostics,
      connectionState: "closed"
    };
    this.push("state", "manual disconnect");
    this.emit();
  }

  getPins(): MapPin[] {
    const raw = this.sdk?.sync?.get?.("maps/pins");
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((entry): entry is MapPin => {
        return (
          entry &&
          typeof entry === "object" &&
          typeof (entry as MapPin).id === "string" &&
          typeof (entry as MapPin).x === "number" &&
          typeof (entry as MapPin).y === "number" &&
          typeof (entry as MapPin).label === "string" &&
          typeof (entry as MapPin).author === "string" &&
          typeof (entry as MapPin).atIso === "string"
        );
      });
    } catch {
      return [];
    }
  }

  addPin(pin: Omit<MapPin, "id" | "atIso">): boolean {
    const setValue = this.sdk?.sync?.set;
    if (!setValue) {
      this.push("warn", "sdk sync.set unavailable");
      return false;
    }
    const existing = this.getPins();
    const next: MapPin = {
      id: `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      atIso: new Date().toISOString(),
      ...pin
    };
    const updated = [next, ...existing].slice(0, 150);
    setValue("maps/pins", JSON.stringify(updated));
    this.sdk?.sync?.push?.();
    this.push("sdk", `pin added (${next.label})`);
    this.emit();
    return true;
  }

  clearPins(): boolean {
    const setValue = this.sdk?.sync?.set;
    if (!setValue) {
      this.push("warn", "sdk sync.set unavailable");
      return false;
    }
    setValue("maps/pins", JSON.stringify([]));
    this.sdk?.sync?.push?.();
    this.push("sdk", "pins cleared");
    this.emit();
    return true;
  }

  private push(type: string, message: string): void {
    this.diagnostics = {
      ...this.diagnostics,
      recentEvents: nextEvents(this.diagnostics.recentEvents, type, message)
    };
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
