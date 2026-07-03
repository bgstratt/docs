// pixelStore — shared pixel-board state over the createDoc high-level SDK.
// Maintains a palette-index buffer for canvas painting and emits fine-grained
// change events (with local/remote origin) for the convergence-flash overlay.

import type { Doc } from "nodalmerge-sdk-js/doc";
import {
  GRID_SIZE,
  decodePixelValue,
  encodePixelValue,
  parsePixelKey,
  pixelKey
} from "./pixelCodec";

export const PIXEL_NAMESPACE = "px";
/** Buffer value for "unpainted". */
export const EMPTY_PIXEL = 255;

export interface PixelChange {
  x: number;
  y: number;
  paletteIndex: number;
  source: "local" | "remote";
}

export type PixelListener = (changes: PixelChange[], fullRefresh: boolean) => void;

export class PixelStore {
  /** GRID_SIZE*GRID_SIZE palette indexes; EMPTY_PIXEL = unpainted. */
  readonly buffer = new Uint8Array(GRID_SIZE * GRID_SIZE).fill(EMPTY_PIXEL);

  private readonly doc: Doc;
  private readonly authorShort: string;
  private readonly listeners = new Set<PixelListener>();
  private readonly unsubscribe: () => void;

  constructor(doc: Doc) {
    this.doc = doc;
    this.authorShort = doc.pubkeyHex.slice(0, 6);
    this.reloadAll();
    this.unsubscribe = doc.map(PIXEL_NAMESPACE).onChange((ev) => {
      const source: "local" | "remote" = ev.source === "local" ? "local" : "remote";
      if (typeof ev.key === "string") {
        const coords = parsePixelKey(ev.key);
        if (!coords) {
          return;
        }
        const decoded = decodePixelValue(this.doc.map(PIXEL_NAMESPACE).get(ev.key));
        if (!decoded) {
          return;
        }
        this.buffer[coords.y * GRID_SIZE + coords.x] = decoded.paletteIndex;
        this.emit([{ x: coords.x, y: coords.y, paletteIndex: decoded.paletteIndex, source }], false);
        return;
      }
      // Bulk merge (remote pack / undo) — rescan and report changed cells so
      // the overlay can still flash them.
      const changes = this.reloadAll(source);
      this.emit(changes, true);
    });
  }

  paint(x: number, y: number, paletteIndex: number): void {
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
      return;
    }
    if (this.buffer[y * GRID_SIZE + x] === paletteIndex) {
      return;
    }
    this.doc.map(PIXEL_NAMESPACE).set(pixelKey(x, y), encodePixelValue(paletteIndex, this.authorShort));
  }

  paintedCount(): number {
    let count = 0;
    for (const v of this.buffer) {
      if (v !== EMPTY_PIXEL) count += 1;
    }
    return count;
  }

  subscribe(listener: PixelListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  private reloadAll(source: "local" | "remote" = "remote"): PixelChange[] {
    const all = this.doc.map(PIXEL_NAMESPACE).all();
    const changes: PixelChange[] = [];
    for (const [key, value] of Object.entries(all)) {
      const coords = parsePixelKey(key);
      const decoded = decodePixelValue(value);
      if (!coords || !decoded) {
        continue;
      }
      const idx = coords.y * GRID_SIZE + coords.x;
      if (this.buffer[idx] !== decoded.paletteIndex) {
        this.buffer[idx] = decoded.paletteIndex;
        changes.push({ x: coords.x, y: coords.y, paletteIndex: decoded.paletteIndex, source });
      }
    }
    return changes;
  }

  private emit(changes: PixelChange[], fullRefresh: boolean): void {
    if (changes.length === 0 && !fullRefresh) {
      return;
    }
    for (const listener of this.listeners) {
      listener(changes, fullRefresh);
    }
  }
}
