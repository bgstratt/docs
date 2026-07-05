import { describe, expect, it } from "vitest";
import type { PixelTimelineEvent } from "./pixelTimeline";
import {
  clusterEvents,
  computeLaneLayout,
  computeLaneOffsets,
  forkColumn,
  type PixelLane
} from "./pixelLanes";

function event(overrides: Partial<PixelTimelineEvent>): PixelTimelineEvent {
  return { x: 0, y: 0, paletteIndex: 1, ...overrides };
}

function burst(author: string, startMs: number, count: number, startLamport: number): PixelTimelineEvent[] {
  return Array.from({ length: count }, (_, i) =>
    event({ author, wallMs: startMs + i * 100, lamport: startLamport + i, nodeId: `${author}-${startLamport + i}` })
  );
}

describe("clusterEvents", () => {
  it("groups consecutive same-author paints into bursts", () => {
    const events = [...burst("alice", 0, 3, 1), ...burst("bob", 300, 2, 4), ...burst("alice", 60000, 4, 6)];
    const clusters = clusterEvents(events);
    expect(clusters.map((c) => [c.author, c.count])).toEqual([
      ["alice", 3],
      ["bob", 2],
      ["alice", 4]
    ]);
    expect(clusters[2].startIndex).toBe(5);
    expect(clusters[2].endIndex).toBe(8);
  });

  it("splits same-author bursts across a long pause", () => {
    const events = [...burst("alice", 0, 2, 1), ...burst("alice", 60000, 2, 3)];
    expect(clusterEvents(events)).toHaveLength(2);
  });

  it("forces a cluster boundary after fork anchor events", () => {
    const events = burst("alice", 0, 10, 1);
    const clusters = clusterEvents(events, { breakAfter: [4] });
    expect(clusters.map((c) => [c.startIndex, c.endIndex])).toEqual([
      [0, 4],
      [5, 9]
    ]);
  });

  it("caps the number of lane nodes by merging adjacent clusters", () => {
    const events: PixelTimelineEvent[] = [];
    for (let i = 0; i < 30; i++) {
      events.push(...burst(`author-${i}`, i * 10000, 1, i + 1));
    }
    const clusters = clusterEvents(events, { maxClusters: 10 });
    expect(clusters.length).toBeLessThanOrEqual(10);
    expect(clusters.reduce((total, c) => total + c.count, 0)).toBe(30);
    expect(clusters[clusters.length - 1].endIndex).toBe(29);
  });
});

describe("forkColumn", () => {
  const events = [...burst("alice", 0, 3, 1), ...burst("bob", 60000, 3, 4)];
  const clusters = clusterEvents(events);

  it("locates the cluster containing the fork event by (lamport, nodeId)", () => {
    expect(forkColumn(events, clusters, { forkLamport: 2, forkNodeId: "alice-2", forkIndex: 99 })).toBe(0);
    expect(forkColumn(events, clusters, { forkLamport: 5, forkNodeId: "bob-5", forkIndex: 0 })).toBe(1);
  });

  it("falls back to the event-count index when the node is unknown", () => {
    expect(forkColumn(events, clusters, { forkLamport: null, forkNodeId: null, forkIndex: 3 })).toBe(0);
    expect(forkColumn(events, clusters, { forkLamport: null, forkNodeId: null, forkIndex: 6 })).toBe(1);
    expect(forkColumn(events, clusters, { forkLamport: null, forkNodeId: null, forkIndex: 0 })).toBe(-1);
  });
});

describe("computeLaneOffsets + computeLaneLayout", () => {
  function lane(roomId: string, clusterCount: number, parentRoomId: string | null, fork: number): PixelLane {
    return {
      roomId,
      label: roomId,
      clusters: clusterEvents(burst("a", 0, clusterCount, 1), { gapMs: -1 }),
      parentRoomId,
      forkColumn: fork
    };
  }

  it("staggers a child lane one column right of its fork cluster", () => {
    const lanes = [lane("root", 5, null, -1), lane("root-b1", 3, "root", 2)];
    const offsets = computeLaneOffsets(lanes);
    expect(offsets.root).toBe(0);
    expect(offsets["root-b1"]).toBe(3);
  });

  it("chains offsets through a branch of a branch", () => {
    const lanes = [
      lane("root", 5, null, -1),
      lane("root-b1", 4, "root", 1),
      lane("root-b2", 2, "root-b1", 1)
    ];
    const offsets = computeLaneOffsets(lanes);
    expect(offsets["root-b1"]).toBe(2);
    expect(offsets["root-b2"]).toBe(4);
  });

  it("compresses slot spacing past 10 columns", () => {
    const narrow = computeLaneLayout([lane("root", 5, null, -1)], { root: 0 });
    expect(narrow.slotWidth).toBe(64);
    const wide = computeLaneLayout([lane("root", 40, null, -1)], { root: 0 });
    expect(wide.slotWidth).toBeLessThan(64);
    expect(wide.slotWidth).toBeGreaterThanOrEqual(20);
  });
});
