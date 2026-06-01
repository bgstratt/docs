import { describe, expect, it } from "vitest";
import { decideWriteRouting } from "./writeRouting";

describe("writeRouting", () => {
  it("forks when editing during playback before branch head", () => {
    const decision = decideWriteRouting("playback", 3, 8);
    expect(decision).toBe("fork-branch-write");
  });

  it("switches to live write when playback cursor is at head", () => {
    const decision = decideWriteRouting("playback", 8, 8);
    expect(decision).toBe("switch-to-live-head-write");
  });

  it("writes directly when mode is live", () => {
    const decision = decideWriteRouting("live", 3, 8);
    expect(decision).toBe("direct-write");
  });
});
