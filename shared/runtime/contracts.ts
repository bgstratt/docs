export type TokenMode = "none" | "static" | "provider";
export type TransportMode = "ws-only" | "auto";

export type ConnectionState = "idle" | "connecting" | "open" | "closed" | "error";

export interface RuntimeConfig {
  hostBaseUrl: string;
  wsBaseUrl: string;
  defaultRoomId: string;
  tokenMode: TokenMode;
  transportMode: TransportMode;
}

export interface RuntimeEventItem {
  atIso: string;
  type: string;
  message: string;
}

export interface RuntimeDiagnostics {
  connectionState: ConnectionState;
  transportMode: TransportMode | "unknown";
  lastError: string | null;
  lastCloseCode: number | null;
  lastCloseReason: string | null;
  recentEvents: RuntimeEventItem[];
}

