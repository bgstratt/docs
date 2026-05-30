import type {
  ConnectionState,
  RuntimeConfig,
  RuntimeDiagnostics,
  RuntimeEventItem
} from "./contracts";

type Listener = (next: RuntimeDiagnostics) => void;

const DEFAULT_MAX_EVENTS = 60;

function pushEvent(list: RuntimeEventItem[], type: string, message: string, maxEvents: number): RuntimeEventItem[] {
  const next = [{ atIso: new Date().toISOString(), type, message }, ...list];
  return next.slice(0, maxEvents);
}

function initialDiagnostics(transport: RuntimeDiagnostics["transportMode"]): RuntimeDiagnostics {
  return {
    connectionState: "idle",
    transportMode: transport,
    lastError: null,
    lastCloseCode: null,
    lastCloseReason: null,
    recentEvents: []
  };
}

export class RuntimeClient {
  private socket: WebSocket | null = null;
  private diagnostics: RuntimeDiagnostics;
  private listeners = new Set<Listener>();
  private activeRoomId: string | null = null;

  constructor(
    private readonly config: RuntimeConfig,
    private readonly options: { maxEvents?: number; pubkeyPrefix?: string } = {}
  ) {
    this.diagnostics = initialDiagnostics(config.transportMode);
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

  getActiveRoomId(): string | null {
    return this.activeRoomId;
  }

  connect(roomId: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.activeRoomId === roomId) {
      this.setConnectionState("open", `already connected to ${roomId}`);
      return;
    }

    this.disconnect();

    this.activeRoomId = roomId;
    const url = `${this.config.wsBaseUrl}/ws/${encodeURIComponent(roomId)}`;
    this.setConnectionState("connecting", `opening websocket ${url}`);

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      const helloPayload = {
        type: "hello",
        room: roomId,
        pubkey: `${this.options.pubkeyPrefix ?? "demo"}-${Math.random().toString(36).slice(2, 10)}`,
        known: []
      };
      socket.send(JSON.stringify(helloPayload));
      this.setConnectionState("open", `connected to ${roomId}`);
      this.push("hello", "sent handshake payload");
    });

    socket.addEventListener("message", (event) => {
      this.push("message", String(event.data).slice(0, 300));
      this.emit();
    });

    socket.addEventListener("error", () => {
      this.diagnostics = {
        ...this.diagnostics,
        connectionState: "error",
        lastError: "runtime websocket error"
      };
      this.push("error", "socket error");
      this.emit();
    });

    socket.addEventListener("close", (event) => {
      const state: ConnectionState = this.diagnostics.connectionState === "error" ? "error" : "closed";
      this.diagnostics = {
        ...this.diagnostics,
        connectionState: state,
        lastCloseCode: event.code,
        lastCloseReason: event.reason || null
      };
      this.push("close", `code=${event.code} reason=${event.reason || "(none)"}`);
      this.emit();
    });
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;
    try {
      socket.close(1000, "manual disconnect");
    } catch {
      this.push("warn", "manual disconnect encountered close error");
    }
    this.setConnectionState("closed", "manual disconnect");
  }

  private setConnectionState(state: ConnectionState, message: string): void {
    this.diagnostics = {
      ...this.diagnostics,
      connectionState: state
    };
    this.push("state", message);
    this.emit();
  }

  private push(type: string, message: string): void {
    const maxEvents = this.options.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.diagnostics = {
      ...this.diagnostics,
      recentEvents: pushEvent(this.diagnostics.recentEvents, type, message, maxEvents)
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.diagnostics);
    }
  }
}

