// pixelCodec — pure encode/decode for the shared pixel board.
//
// Each pixel is its own LWW map key under namespace `px`:
//   key   "x,y"                e.g. "12,40"
//   value "{paletteIndex}:{authorShort}"  e.g. "7:a1b2c3"
//
// Per-pixel keys mean concurrent paints on different pixels always converge;
// concurrent paints on the SAME pixel resolve deterministically via the
// engine's LWW tie-break (lamport, then author pubkey).

export const GRID_SIZE = 64;

/** 16-color palette (r/place-inspired). Index is what goes on the wire. */
export const PALETTE: string[] = [
  "#ffffff", "#e4e4e4", "#888888", "#222222",
  "#ffa7d1", "#e50000", "#e59500", "#a06a42",
  "#e5d900", "#94e044", "#02be01", "#00d3dd",
  "#0083c7", "#0000ea", "#cf6ee4", "#820080"
];

export interface PixelValue {
  paletteIndex: number;
  authorShort: string;
}

export function pixelKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parsePixelKey(key: string): { x: number; y: number } | null {
  const comma = key.indexOf(",");
  if (comma <= 0) {
    return null;
  }
  const x = Number(key.slice(0, comma));
  const y = Number(key.slice(comma + 1));
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
    return null;
  }
  return { x, y };
}

export function encodePixelValue(paletteIndex: number, authorShort: string): string {
  return `${paletteIndex}:${authorShort}`;
}

export function decodePixelValue(value: unknown): PixelValue | null {
  if (typeof value !== "string") {
    return null;
  }
  const colon = value.indexOf(":");
  const rawIndex = colon === -1 ? value : value.slice(0, colon);
  const paletteIndex = Number(rawIndex);
  if (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex >= PALETTE.length) {
    return null;
  }
  return {
    paletteIndex,
    authorShort: colon === -1 ? "" : value.slice(colon + 1)
  };
}
