// pixelBranch — pure helpers for diverging the board from an earlier frame.
// A branch is a fresh room seeded with the frozen frame's pixels; room names
// stay flat (`room-bXXXX`, never `room-b1-b2`), while real lineage lives in
// the branch registry records (see branchRegistry.ts).

import { GRID_SIZE } from "./pixelCodec";
import { EMPTY_PIXEL } from "./pixelStore";

const BRANCH_SUFFIX = /-b[a-z0-9]+$/;

/** Room-name base shared by a whole branch family. */
export function rootRoomId(roomId: string): string {
  return roomId.replace(BRANCH_SUFFIX, "");
}

/** Name-derived parent (registry records are authoritative when present). */
export function parentRoomId(roomId: string): string | null {
  return BRANCH_SUFFIX.test(roomId) ? rootRoomId(roomId) : null;
}

/** Mint a fresh branch room id; `suffix` is injectable for tests. */
export function branchRoomId(roomId: string, suffix?: string): string {
  const unique = suffix ?? `${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 4)}`;
  return `${rootRoomId(roomId)}-b${unique}`;
}

export interface SeedPaint {
  x: number;
  y: number;
  paletteIndex: number;
}

/** Painted cells of a snapshotAt() frame, ready to replay into a new room. */
export function seedPaintsFromSnapshot(buffer: Uint8Array): SeedPaint[] {
  const paints: SeedPaint[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const paletteIndex = buffer[y * GRID_SIZE + x];
      if (paletteIndex !== EMPTY_PIXEL) {
        paints.push({ x, y, paletteIndex });
      }
    }
  }
  return paints;
}
