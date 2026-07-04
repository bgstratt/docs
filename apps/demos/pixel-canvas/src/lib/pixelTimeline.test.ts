import { describe, expect, it } from "vitest";
import { GRID_SIZE } from "./pixelCodec";
import { EMPTY_PIXEL } from "./pixelStore";
import { PixelTimeline, timelineFromHistory } from "./pixelTimeline";

function cell(buffer: Uint8Array, x: number, y: number): number {
  return buffer[y * GRID_SIZE + x];
}

describe("timelineFromHistory", () => {
  it("maps sets, deletes, and skips malformed entries", () => {
    const events = timelineFromHistory([
      { op: "set", key: "px/1,1", value: "3:abc123" },
      { op: "set", key: "px/2,1", value: "7" },
      { op: "delete", key: "px/1,1", value: undefined },
      { op: "set", key: "px/not-a-key", value: "3:abc123" },
      { op: "set", key: "px/3,1", value: "not-a-pixel" },
      { op: "set", key: "px/999,999", value: "3:abc123" }
    ]);

    expect(events).toEqual([
      { x: 1, y: 1, paletteIndex: 3 },
      { x: 2, y: 1, paletteIndex: 7 },
      { x: 1, y: 1, paletteIndex: EMPTY_PIXEL }
    ]);
  });
});

describe("PixelTimeline", () => {
  it("replays events up to the cursor, clamping out-of-range indexes", () => {
    const timeline = new PixelTimeline();
    timeline.replaceAll(
      timelineFromHistory([
        { op: "set", key: "px/1,1", value: "3:a" },
        { op: "set", key: "px/2,1", value: "7:b" },
        { op: "set", key: "px/1,1", value: "9:a" }
      ])
    );

    expect(timeline.length).toBe(3);
    expect(cell(timeline.snapshotAt(0), 1, 1)).toBe(EMPTY_PIXEL);
    expect(cell(timeline.snapshotAt(1), 1, 1)).toBe(3);
    expect(cell(timeline.snapshotAt(2), 2, 1)).toBe(7);
    expect(cell(timeline.snapshotAt(3), 1, 1)).toBe(9);
    expect(cell(timeline.snapshotAt(99), 1, 1)).toBe(9);
  });

  it("replays erases back to background", () => {
    const timeline = new PixelTimeline();
    timeline.replaceAll(
      timelineFromHistory([
        { op: "set", key: "px/5,5", value: "12:a" },
        { op: "delete", key: "px/5,5", value: undefined }
      ])
    );

    expect(cell(timeline.snapshotAt(1), 5, 5)).toBe(12);
    expect(cell(timeline.snapshotAt(2), 5, 5)).toBe(EMPTY_PIXEL);
  });
});
