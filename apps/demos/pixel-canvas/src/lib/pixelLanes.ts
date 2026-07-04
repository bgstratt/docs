// pixelLanes — pure lane model for the branch-lane visualization, mirroring
// the workflow demo's lanes (one lane per branch, shrinking slot spacing,
// divergence connectors). Pixel rooms accumulate thousands of paint events,
// so lane nodes are CLUSTERS — consecutive events by the same author within
// a wall-clock gap — rather than individual paints. The scrubber stays
// fine-grained per event; clicking a cluster scrubs to its last event.

import type { PixelTimelineEvent } from "./pixelTimeline";

export interface LaneCluster {
  /** First/last event index (inclusive) in the room's timeline. */
  startIndex: number;
  endIndex: number;
  count: number;
  author: string | null;
  lamportEnd: number | null;
}

export interface ClusterOptions {
  /** New cluster when the author changes or paints pause longer than this. */
  gapMs?: number;
  /** Merge adjacent clusters to stay at or below this many lane nodes. */
  maxClusters?: number;
}

export function clusterEvents(events: readonly PixelTimelineEvent[], options: ClusterOptions = {}): LaneCluster[] {
  const gapMs = options.gapMs ?? 3000;
  const maxClusters = Math.max(1, options.maxClusters ?? 60);
  const clusters: LaneCluster[] = [];
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const author = event.author ?? null;
    const previous = clusters[clusters.length - 1];
    const previousEvent = index > 0 ? events[index - 1] : null;
    const paused =
      previousEvent?.wallMs !== undefined && event.wallMs !== undefined
        ? event.wallMs - previousEvent.wallMs > gapMs
        : false;
    if (previous && previous.author === author && !paused) {
      previous.endIndex = index;
      previous.count += 1;
      previous.lamportEnd = event.lamport ?? previous.lamportEnd;
      continue;
    }
    clusters.push({
      startIndex: index,
      endIndex: index,
      count: 1,
      author,
      lamportEnd: event.lamport ?? null
    });
  }
  if (clusters.length <= maxClusters) {
    return clusters;
  }
  // Too many bursts: merge fixed-size runs of adjacent clusters.
  const groupSize = Math.ceil(clusters.length / maxClusters);
  const merged: LaneCluster[] = [];
  for (let i = 0; i < clusters.length; i += groupSize) {
    const group = clusters.slice(i, i + groupSize);
    const last = group[group.length - 1];
    merged.push({
      startIndex: group[0].startIndex,
      endIndex: last.endIndex,
      count: group.reduce((total, entry) => total + entry.count, 0),
      author: group.every((entry) => entry.author === group[0].author) ? group[0].author : null,
      lamportEnd: last.lamportEnd
    });
  }
  return merged;
}

/** Column (cluster index) in the parent lane a branch forked from; -1 = lane start. */
export function forkColumn(
  parentEvents: readonly PixelTimelineEvent[],
  parentClusters: LaneCluster[],
  fork: { forkLamport: number | null; forkNodeId: string | null; forkIndex: number }
): number {
  let eventIndex = -1;
  if (fork.forkLamport !== null && fork.forkNodeId !== null) {
    eventIndex = parentEvents.findIndex(
      (event) => event.lamport === fork.forkLamport && event.nodeId === fork.forkNodeId
    );
  }
  if (eventIndex < 0) {
    // forkIndex counts applied events, so the anchor event is the one before it.
    eventIndex = Math.min(fork.forkIndex, parentEvents.length) - 1;
  }
  if (eventIndex < 0) {
    return -1;
  }
  for (let column = 0; column < parentClusters.length; column++) {
    if (eventIndex <= parentClusters[column].endIndex) {
      return column;
    }
  }
  return parentClusters.length - 1;
}

export interface PixelLane {
  roomId: string;
  label: string;
  clusters: LaneCluster[];
  parentRoomId: string | null;
  /** Column within the parent lane; -1 anchors at the parent lane's start. */
  forkColumn: number;
}

/**
 * Same semantics as the workflow demo's computeBranchOffsets: a child lane
 * starts one column right of the parent cluster it forked from.
 */
export function computeLaneOffsets(lanes: PixelLane[]): Record<string, number> {
  const byRoom = new Map(lanes.map((lane) => [lane.roomId, lane]));
  const offsets: Record<string, number> = {};
  const resolving = new Set<string>();
  const computeOffset = (roomId: string): number => {
    if (roomId in offsets) {
      return offsets[roomId];
    }
    if (resolving.has(roomId)) {
      return 0;
    }
    resolving.add(roomId);
    const lane = byRoom.get(roomId);
    const parent = lane?.parentRoomId ? byRoom.get(lane.parentRoomId) : undefined;
    if (!lane || !parent) {
      offsets[roomId] = 0;
      resolving.delete(roomId);
      return 0;
    }
    const parentOffset = computeOffset(parent.roomId);
    offsets[roomId] = lane.forkColumn >= 0 ? parentOffset + lane.forkColumn + 1 : parentOffset;
    resolving.delete(roomId);
    return offsets[roomId];
  };
  for (const lane of lanes) {
    computeOffset(lane.roomId);
  }
  return offsets;
}

export interface PixelLaneLayout {
  slotWidth: number;
  laneHeight: number;
  leftGutter: number;
  topGutter: number;
  width: number;
  height: number;
  laneY: Record<string, number>;
  /** X centers per lane, indexed by cluster column. */
  clusterX: Record<string, number[]>;
}

export function computeLaneLayout(lanes: PixelLane[], offsets: Record<string, number>): PixelLaneLayout {
  let maxColumn = 0;
  for (const lane of lanes) {
    if (lane.clusters.length > 0) {
      maxColumn = Math.max(maxColumn, (offsets[lane.roomId] ?? 0) + lane.clusters.length - 1);
    }
  }
  // Fixed 64px slots up to 10 columns; past that, compress the spacing so
  // the lane SVG stops growing rightward (same rule as the workflow demo).
  const baseSlotWidth = 64;
  const maxTimelineSpan = baseSlotWidth * 10;
  const columns = maxColumn + 1;
  const slotWidth = columns > 10 ? Math.max(20, Math.floor(maxTimelineSpan / columns)) : baseSlotWidth;
  const laneHeight = 54;
  const leftGutter = 130;
  const topGutter = 16;
  const laneY: Record<string, number> = {};
  const clusterX: Record<string, number[]> = {};
  lanes.forEach((lane, laneIndex) => {
    laneY[lane.roomId] = topGutter + laneIndex * laneHeight + 18;
    const offset = offsets[lane.roomId] ?? 0;
    clusterX[lane.roomId] = lane.clusters.map(
      (_, column) => leftGutter + (offset + column) * slotWidth + slotWidth / 2
    );
  });
  return {
    slotWidth,
    laneHeight,
    leftGutter,
    topGutter,
    width: Math.max(leftGutter + columns * slotWidth + 40, leftGutter + 220),
    height: topGutter + lanes.length * laneHeight + 10,
    laneY,
    clusterX
  };
}
