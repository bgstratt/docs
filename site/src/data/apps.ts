export type AppStatus = "live" | "coming-soon";

export interface AppEntry {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: "demos" | "playground";
  status: AppStatus;
  icon: string;
  sourcePath: string;
  /** Set once the app has a real public deployment; overrides the stub page link. */
  liveUrl?: string;
}

export const apps: AppEntry[] = [
  {
    slug: "pixel-canvas",
    name: "Pixel canvas",
    tagline: "Offline-first shared pixel art — go offline, paint, reconnect, converge",
    description:
      "An r/place-style shared board where every pixel is its own CRDT key. Paint together in real time, or flip yourself offline, keep painting, then reconnect and watch both sides merge — contested pixels resolve identically on every peer, and remote pixels flash in as they arrive.",
    category: "demos",
    status: "live",
    icon: "🎨",
    sourcePath: "apps/demos/pixel-canvas",
  },
  {
    slug: "infinite-room-workspace",
    name: "Infinite room workspace",
    tagline: "Branch, merge, and time-travel a live multiplayer workspace",
    description:
      "The flagship demo of NodalMerge's DAG model: a spatial workspace (nodes, edges, annotations, assets) with branch-from-cursor, merge-into-head, a branch-lane DAG visualization showing divergence and merges, timeline scrubbing with a per-op inspector, and live presence including remote drag ghosts and peer replay cursors.",
    category: "demos",
    status: "live",
    icon: "🧭",
    sourcePath: "apps/demos/infinite-room-workspace",
  },
  {
    slug: "bench-trace",
    name: "Engine benchmark",
    tagline: "Replay 260k real edits through the engine — in your browser",
    description:
      "Runs the automerge-perf B4 editing trace (259,778 single-character edits producing a 104,852-character paper) through the NodalMerge WASM engine, fully client-side, with a live ops/sec meter — then proves convergence by SHA-256 hash against the expected final text.",
    category: "demos",
    status: "live",
    icon: "⚡",
    sourcePath: "apps/demos/bench-trace",
  },
  {
    slug: "collab-maps",
    name: "Collab maps",
    tagline: "Shared, spatial collaboration on a map board",
    description:
      "Multiple peers drop pins on a shared board in real time. Every pin is its own replicated CRDT key, so concurrent adds and deletes converge without clobbering; a live presence roster shows who's in the room, and offline edits sync on reconnect.",
    category: "demos",
    status: "live",
    icon: "🗺️",
    sourcePath: "apps/demos/collab-maps",
  },
  {
    slug: "collab-text",
    name: "Collab text",
    tagline: "Character-level RGA text editing, live",
    description:
      "Type into a shared document and watch per-character RGA operations converge deterministically across peers — with per-peer colored attribution, a lamport-scrub preview that replays the document at any point in its history, and a local DAG replay timeline.",
    category: "playground",
    status: "live",
    icon: "🧵",
    sourcePath: "apps/playground/collab-text",
  },
  {
    slug: "protocol-inspector",
    name: "Protocol inspector",
    tagline: "Watch the wire protocol without reading source",
    description:
      "A wire-protocol tool: connect a raw WebSocket to a room and capture the live event stream — filter by message type, inspect raw payloads, and export a trace for the replay lab.",
    category: "playground",
    status: "live",
    icon: "🔍",
    sourcePath: "apps/playground/protocol-inspector",
  },
  {
    slug: "replay-lab",
    name: "Replay lab",
    tagline: "Correlate protocol traces against runtime snapshots",
    description:
      "A wire-protocol tool that pairs with the inspector: capture runtime event snapshots, scrub a replay cursor across protocol-linked checkpoints, and correlate an imported protocol-inspector trace with confidence-scored matching.",
    category: "playground",
    status: "live",
    icon: "📼",
    sourcePath: "apps/playground/replay-lab",
  },
];

export const demos = apps.filter((a) => a.category === "demos");
export const playground = apps.filter((a) => a.category === "playground");

export function getApp(slug: string) {
  return apps.find((a) => a.slug === slug);
}
