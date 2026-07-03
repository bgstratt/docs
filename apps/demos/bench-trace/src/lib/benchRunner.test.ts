import { describe, expect, it } from "vitest";
import { OPS_PER_CHUNK, summarize } from "./benchRunner";

describe("benchRunner", () => {
  it("summarize computes ops/sec from elapsed ms", () => {
    expect(summarize(1000, 1000)).toEqual({ opsPerSec: 1000 });
    expect(summarize(50_000, 250)).toEqual({ opsPerSec: 200_000 });
    expect(summarize(0, 100)).toEqual({ opsPerSec: 0 });
    expect(summarize(100, 0)).toEqual({ opsPerSec: 0 });
  });

  it("chunk size keeps frames responsive but amortized", () => {
    expect(OPS_PER_CHUNK).toBeGreaterThanOrEqual(500);
    expect(OPS_PER_CHUNK).toBeLessThanOrEqual(10_000);
  });
});
