import type { RuntimeConfig, TokenMode, TransportMode } from "./contracts";

function normalizeHostBaseUrl(input: string): string {
  return input.replace(/\/+$/, "");
}

function toWsScheme(baseUrl: string): string {
  return baseUrl.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
}

function getDefaultHostBaseUrl(): string {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "https" : "http";
  return `${protocol}://${hostname}:5074`;
}

function parseTokenMode(value: string | undefined): TokenMode {
  if (value === "static" || value === "provider") {
    return value;
  }
  return "none";
}

function parseTransportMode(value: string | undefined): TransportMode {
  if (value === "auto") {
    return value;
  }
  return "ws-only";
}

export function loadRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig {
  const hostBaseUrl = normalizeHostBaseUrl(env.VITE_HOST_BASE_URL ?? getDefaultHostBaseUrl());
  const wsBaseUrl = normalizeHostBaseUrl(env.VITE_WS_BASE_URL ?? toWsScheme(hostBaseUrl));

  return {
    hostBaseUrl,
    wsBaseUrl,
    defaultRoomId: env.VITE_DEFAULT_ROOM_ID ?? "demo-room",
    tokenMode: parseTokenMode(env.VITE_TOKEN_MODE),
    transportMode: parseTransportMode(env.VITE_TRANSPORT_MODE)
  };
}

