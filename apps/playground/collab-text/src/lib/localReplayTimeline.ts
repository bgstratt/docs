export type ReplayTimelineItem = {
  lamport: number;
  nodeId: string;
  touchedKeys: string[];
};

export function normalizeLamport(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

export function parseTimelineItems(payload: Record<string, unknown> | null): ReplayTimelineItem[] {
  if (!payload || payload.type !== "replay.read-range.result") {
    return [];
  }
  const items = payload.items;
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const lamport = normalizeLamport((entry as { lamport?: unknown }).lamport);
      const nodeId =
        typeof (entry as { node_id?: unknown }).node_id === "string" ? (entry as { node_id: string }).node_id : null;
      const touched =
        Array.isArray((entry as { touched_keys?: unknown }).touched_keys) &&
        (entry as { touched_keys: unknown[] }).touched_keys.every((key) => typeof key === "string")
          ? ((entry as { touched_keys: string[] }).touched_keys as string[])
          : [];
      if (lamport === null || !nodeId) {
        return null;
      }
      return { lamport, nodeId: nodeId.slice(0, 12), touchedKeys: touched };
    })
    .filter((entry): entry is ReplayTimelineItem => Boolean(entry));
}

/** Glyph-derived timeline when WASM `read_replay_range_local_json` is unavailable. */
export function buildTimelineFromTextGlyphs(
  glyphs: Array<{ lamport: number; author: string; ch: string }>,
  textKey: string
): ReplayTimelineItem[] {
  if (glyphs.length === 0) {
    return [];
  }

  const byLamport = new Map<number, { authors: Set<string>; chars: number }>();
  for (const glyph of glyphs) {
    const bucket = byLamport.get(glyph.lamport) ?? { authors: new Set<string>(), chars: 0 };
    bucket.authors.add(glyph.author.slice(0, 12));
    bucket.chars += 1;
    byLamport.set(glyph.lamport, bucket);
  }

  return [...byLamport.entries()]
    .sort(([left], [right]) => left - right)
    .map(([lamport, bucket]) => ({
      lamport,
      nodeId: [...bucket.authors].sort().join("+").slice(0, 12) || `L${lamport}`,
      touchedKeys: [textKey]
    }));
}

export function maxLamportFromGlyphs(glyphs: Array<{ lamport: number }>): number | null {
  if (glyphs.length === 0) {
    return null;
  }
  return glyphs.reduce((max, glyph) => Math.max(max, glyph.lamport), 0);
}
