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
    slug: "collab-maps",
    name: "Collab maps",
    tagline: "Shared, spatial collaboration on a map board",
    description:
      "Multiple peers drop pins on a shared map board in real time. Demonstrates shared sync state, live presence, and a diagnostics panel for inspecting room/runtime behavior as it happens.",
    category: "demos",
    status: "coming-soon",
    icon: "🗺️",
    sourcePath: "apps/demos/collab-maps",
  },
  {
    slug: "infinite-room-workspace",
    name: "Infinite room workspace",
    tagline: "The flagship collaborative workspace demo",
    description:
      "A room-centric collaborative workspace built on the NodalMerge runtime adapter contract — connection lifecycle, diagnostics, and a canvas shell for full end-to-end collaboration flows.",
    category: "demos",
    status: "coming-soon",
    icon: "🧭",
    sourcePath: "apps/demos/infinite-room-workspace",
  },
  {
    slug: "collab-text",
    name: "Collab text",
    tagline: "Character-level RGA text editing, live",
    description:
      "Type into a shared text field and watch RGA insert/delete operations, tombstone semantics, and anchor-based positioning resolve deterministically across peers in the same room.",
    category: "playground",
    status: "coming-soon",
    icon: "🧵",
    sourcePath: "apps/playground/collab-text",
  },
  {
    slug: "protocol-inspector",
    name: "Protocol inspector",
    tagline: "Watch the wire protocol without reading source",
    description:
      "Connect to a room and capture the live WebSocket event stream — filter by message type, inspect raw payloads, and see connection/reconciliation behavior in real time.",
    category: "playground",
    status: "coming-soon",
    icon: "🔍",
    sourcePath: "apps/playground/protocol-inspector",
  },
  {
    slug: "replay-lab",
    name: "Replay lab",
    tagline: "Scrub the history DAG with a timeline cursor",
    description:
      "Capture replay snapshots, jump to protocol-linked checkpoints, and correlate a protocol-inspector trace against replay state with confidence-scored heuristics.",
    category: "playground",
    status: "coming-soon",
    icon: "📼",
    sourcePath: "apps/playground/replay-lab",
  },
];

export const demos = apps.filter((a) => a.category === "demos");
export const playground = apps.filter((a) => a.category === "playground");

export function getApp(slug: string) {
  return apps.find((a) => a.slug === slug);
}
