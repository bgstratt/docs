import { describe, expect, it } from "vitest";
import { branchRoomId, parentRoomId, rootRoomId, seedPaintsFromSnapshot } from "./pixelBranch";
import { GRID_SIZE } from "./pixelCodec";
import { EMPTY_PIXEL } from "./pixelStore";
import { PixelTimeline, timelineFromHistory } from "./pixelTimeline";

describe("branch room naming", () => {
  it("derives the root by stripping one branch suffix", () => {
    expect(rootRoomId("pixel-canvas")).toBe("pixel-canvas");
    expect(rootRoomId("pixel-canvas-b1x2")).toBe("pixel-canvas");
  });

  it("reports the name-derived parent, or null for a root room", () => {
    expect(parentRoomId("pixel-canvas-b1x2")).toBe("pixel-canvas");
    expect(parentRoomId("pixel-canvas")).toBeNull();
  });

  it("mints flat branch ids — branching a branch never nests suffixes", () => {
    expect(branchRoomId("pixel-canvas", "1x2")).toBe("pixel-canvas-b1x2");
    expect(branchRoomId("pixel-canvas-b1x2", "9z")).toBe("pixel-canvas-b9z");
    const minted = branchRoomId("pixel-canvas");
    expect(minted).toMatch(/^pixel-canvas-b[a-z0-9]+$/);
  });
});

describe("seedPaintsFromSnapshot", () => {
  it("extracts only painted cells", () => {
    const buffer = new Uint8Array(GRID_SIZE * GRID_SIZE).fill(EMPTY_PIXEL);
    buffer[0] = 3;
    buffer[1 * GRID_SIZE + 5] = 12;
    expect(seedPaintsFromSnapshot(buffer)).toEqual([
      { x: 0, y: 0, paletteIndex: 3 },
      { x: 5, y: 1, paletteIndex: 12 }
    ]);
  });

  it("matches the frozen frame it was taken from", () => {
    const timeline = new PixelTimeline();
    timeline.replaceAll(
      timelineFromHistory([
        { op: "set", key: "px/1,1", value: "3:a" },
        { op: "set", key: "px/2,1", value: "7:b" },
        { op: "delete", key: "px/1,1", value: undefined },
        { op: "set", key: "px/4,4", value: "9:a" }
      ])
    );
    // Frame 2: (1,1)=3 and (2,1)=7 applied; the erase and later paint are not.
    expect(seedPaintsFromSnapshot(timeline.snapshotAt(2))).toEqual([
      { x: 1, y: 1, paletteIndex: 3 },
      { x: 2, y: 1, paletteIndex: 7 }
    ]);
  });
});
