/**
 * Deterministic peer-ID-to-color mapping utility.
 * Ensures each connected peer gets a consistent, visually distinct color.
 */

const PEER_COLOR_PALETTE: string[] = [
  '#4A90D9', // blue
  '#E85D75', // rose
  '#3CB878', // green
  '#F5A623', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#E11D48', // crimson
  '#8B4513', // saddle brown
];

const DEFAULT_NODE_COLOR = '#6B7280'; // neutral gray fallback

/**
 * Simple string hash function (djb2 variant) — deterministic across sessions.
 */
function hashPeerId(peerId: string): number {
  let hash = 5381;
  for (let i = 0; i < peerId.length; i++) {
    hash = ((hash << 5) + hash + peerId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Returns a deterministic CSS color for the given peer ID.
 * The same peer ID will always map to the same color.
 */
export function getPeerColor(peerId: string): string {
  if (!peerId) return DEFAULT_NODE_COLOR;
  const index = hashPeerId(peerId) % PEER_COLOR_PALETTE.length;
  return PEER_COLOR_PALETTE[index];
}

/**
 * Returns the default fallback color for nodes without a known peer.
 */
export function getDefaultNodeColor(): string {
  return DEFAULT_NODE_COLOR;
}

export { PEER_COLOR_PALETTE, DEFAULT_NODE_COLOR };
