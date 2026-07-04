// mapsStore — collab-maps shared state over the createDoc high-level SDK.
//
// Each pin is its own LWW map key (`maps/pin/<id>`), so concurrent adds,
// moves, and deletes from different peers converge instead of clobbering
// (the previous implementation stored every pin in one JSON blob under a
// single key, which was last-writer-wins over the whole array).

import type { Doc, ChangeEvent, JsonValue } from "nodalmerge-sdk-js/doc";

export const PIN_NAMESPACE = "maps/pin";

export interface MapPin {
  id: string;
  /** Normalized board position in [0, 1] — resolution independent. */
  nx: number;
  ny: number;
  label: string;
  author: string;
  createdAtIso: string;
}

export interface PinChange {
  pin: MapPin | null;
  id: string;
  source: "local" | "remote";
}

function isValidPin(value: unknown): value is Omit<MapPin, "id"> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.nx === "number" &&
    typeof candidate.ny === "number" &&
    candidate.nx >= 0 && candidate.nx <= 1 &&
    candidate.ny >= 0 && candidate.ny <= 1 &&
    typeof candidate.label === "string" &&
    typeof candidate.author === "string"
  );
}

export class MapsStore {
  private readonly doc: Doc;
  private readonly unsubscribe: () => void;
  private readonly listeners = new Set<(changes: PinChange[]) => void>();

  constructor(doc: Doc) {
    this.doc = doc;
    this.unsubscribe = doc.map(PIN_NAMESPACE).onChange((ev: ChangeEvent) => {
      this.dispatchFromChange(ev);
    });
  }

  getPins(): MapPin[] {
    const all = this.doc.map(PIN_NAMESPACE).all();
    const pins: MapPin[] = [];
    for (const [id, value] of Object.entries(all)) {
      if (isValidPin(value)) {
        pins.push({ id, ...(value as Omit<MapPin, "id">) });
      }
    }
    pins.sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : -1));
    return pins;
  }

  addPin(input: { nx: number; ny: number; label: string; author: string }): MapPin {
    const pin: MapPin = {
      id: `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      nx: Math.min(1, Math.max(0, input.nx)),
      ny: Math.min(1, Math.max(0, input.ny)),
      label: input.label,
      author: input.author,
      createdAtIso: new Date().toISOString()
    };
    const { id, ...body } = pin;
    this.doc.map(PIN_NAMESPACE).set(id, body as unknown as JsonValue);
    return pin;
  }

  deletePin(id: string): void {
    this.doc.map(PIN_NAMESPACE).delete(id);
  }

  clearPins(): void {
    for (const pin of this.getPins()) {
      this.doc.map(PIN_NAMESPACE).delete(pin.id);
    }
  }

  subscribe(listener: (changes: PinChange[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
  }

  private dispatchFromChange(ev: ChangeEvent): void {
    // Fine-grained local/remote map events carry the key; bulk pack merges
    // don't, so fall back to a keyless refresh signal.
    const id = typeof ev.key === "string" ? ev.key : "";
    const source: "local" | "remote" = ev.source === "local" ? "local" : "remote";
    let pin: MapPin | null = null;
    if (id) {
      const value = this.doc.map(PIN_NAMESPACE).get(id);
      pin = isValidPin(value) ? { id, ...(value as Omit<MapPin, "id">) } : null;
    }
    const change: PinChange = { pin, id, source };
    for (const listener of this.listeners) {
      listener([change]);
    }
  }
}
