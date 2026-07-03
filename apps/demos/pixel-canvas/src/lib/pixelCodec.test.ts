import { describe, expect, it } from "vitest";
import {
  GRID_SIZE,
  PALETTE,
  decodePixelValue,
  encodePixelValue,
  parsePixelKey,
  pixelKey
} from "./pixelCodec";

describe("pixelCodec", () => {
  it("round-trips keys", () => {
    expect(parsePixelKey(pixelKey(0, 0))).toEqual({ x: 0, y: 0 });
    expect(parsePixelKey(pixelKey(12, 40))).toEqual({ x: 12, y: 40 });
    expect(parsePixelKey(pixelKey(GRID_SIZE - 1, GRID_SIZE - 1))).toEqual({
      x: GRID_SIZE - 1,
      y: GRID_SIZE - 1
    });
  });

  it("rejects out-of-range or malformed keys", () => {
    expect(parsePixelKey(`${GRID_SIZE},0`)).toBeNull();
    expect(parsePixelKey("-1,5")).toBeNull();
    expect(parsePixelKey("3.5,2")).toBeNull();
    expect(parsePixelKey("nope")).toBeNull();
    expect(parsePixelKey(",")).toBeNull();
  });

  it("round-trips values", () => {
    expect(decodePixelValue(encodePixelValue(7, "a1b2c3"))).toEqual({
      paletteIndex: 7,
      authorShort: "a1b2c3"
    });
    expect(decodePixelValue("0:")).toEqual({ paletteIndex: 0, authorShort: "" });
  });

  it("rejects invalid values", () => {
    expect(decodePixelValue(`${PALETTE.length}:x`)).toBeNull();
    expect(decodePixelValue("-1:x")).toBeNull();
    expect(decodePixelValue("abc")).toBeNull();
    expect(decodePixelValue(12 as unknown as string)).toBeNull();
    expect(decodePixelValue(null)).toBeNull();
  });
});
