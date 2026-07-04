// pixelTimeline — replay history for the pixel board, sourced from the doc's
// DAG via `doc.history({ prefix: "px/" })` rather than locally observed
// changes. Late-join catch-up delivers real op nodes, so the timeline covers
// the room's full painting order (back to the last snapshot rebuild), and it
// survives page refreshes. Events are in (lamport, node id) causal order —
// identical on every peer.

import { GRID_SIZE, decodePixelValue, parsePixelKey } from "./pixelCodec";
import { EMPTY_PIXEL, PIXEL_NAMESPACE } from "./pixelStore";

export interface PixelTimelineEvent {
  x: number;
  y: number;
  /** EMPTY_PIXEL for erases (map-key deletes). */
  paletteIndex: number;
  /** DAG metadata (from MapHistoryItem); used by branch lanes + fork anchors. */
  lamport?: number;
  nodeId?: string;
  author?: string;
  wallMs?: number;
}

/** Subset of the SDK's MapHistoryItem that the timeline consumes. */
export interface PixelHistoryItem {
  op: "set" | "delete";
  key: string;
  value: unknown;
  lamport?: number;
  nodeId?: string;
  author?: string;
  wallMs?: number;
}

const KEY_PREFIX = `${PIXEL_NAMESPACE}/`;

/** Map raw doc.history items onto board events; unparseable entries are skipped. */
export function timelineFromHistory(items: PixelHistoryItem[]): PixelTimelineEvent[] {
  const events: PixelTimelineEvent[] = [];
  for (const item of items) {
    const rawKey = item.key.startsWith(KEY_PREFIX) ? item.key.slice(KEY_PREFIX.length) : item.key;
    const coords = parsePixelKey(rawKey);
    if (!coords) {
      continue;
    }
    const meta = { lamport: item.lamport, nodeId: item.nodeId, author: item.author, wallMs: item.wallMs };
    if (item.op === "delete") {
      events.push({ x: coords.x, y: coords.y, paletteIndex: EMPTY_PIXEL, ...meta });
      continue;
    }
    const decoded = decodePixelValue(item.value);
    if (decoded) {
      events.push({ x: coords.x, y: coords.y, paletteIndex: decoded.paletteIndex, ...meta });
    }
  }
  return events;
}

export class PixelTimeline {
  private events: PixelTimelineEvent[] = [];

  get length(): number {
    return this.events.length;
  }

  /** Read-only view of the causal event list (for lanes/fork anchors). */
  get allEvents(): readonly PixelTimelineEvent[] {
    return this.events;
  }

  /** Swap in a freshly rebuilt event list (from timelineFromHistory). */
  replaceAll(events: PixelTimelineEvent[]): void {
    this.events = events;
  }

  /** Board state after applying the first `index` events onto an empty board. */
  snapshotAt(index: number): Uint8Array {
    const clamped = Math.max(0, Math.min(index, this.events.length));
    const buffer = new Uint8Array(GRID_SIZE * GRID_SIZE).fill(EMPTY_PIXEL);
    for (let i = 0; i < clamped; i++) {
      const event = this.events[i];
      buffer[event.y * GRID_SIZE + event.x] = event.paletteIndex;
    }
    return buffer;
  }
}
