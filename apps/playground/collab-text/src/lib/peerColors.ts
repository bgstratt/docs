const PALETTE = ["#1d4ed8", "#0f766e", "#7c3aed", "#c2410c", "#be123c", "#0369a1", "#4d7c0f"];

export function colorForPeer(peerId: string): string {
  let hash = 0;
  for (let index = 0; index < peerId.length; index += 1) {
    hash = (hash * 31 + peerId.charCodeAt(index)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function isAttributedChar(ch: string): boolean {
  return ch.trim().length > 0;
}
