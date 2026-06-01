import { describe, expect, it } from "vitest";
import type { BranchStream } from "./branchReplay";
import { computeBranchOffsets, computeMaxBranchColumn } from "./replayLayout";

function branch(
  branchId: string,
  basedOnBranchId: string | null,
  basedOnNodeId: string | null,
  isMain = false
): BranchStream {
  return {
    branchId,
    roomId: `room-${branchId}`,
    label: branchId,
    rootNodeId: basedOnNodeId,
    headNodeId: null,
    basedOnBranchId,
    basedOnNodeId,
    isMain
  };
}

describe("replayLayout", () => {
  it("computes first-level branch offsets from fork node index", () => {
    const branches: Record<string, BranchStream> = {
      main: branch("main", null, null, true),
      "branch-1": branch("branch-1", "main", "m5")
    };
    const branchNodeIds = {
      main: ["m0", "m1", "m2", "m3", "m4", "m5", "m6"],
      "branch-1": ["b1n0", "b1n1"]
    };

    const offsets = computeBranchOffsets(["main", "branch-1"], branches, branchNodeIds);
    expect(offsets.main).toBe(0);
    expect(offsets["branch-1"]).toBe(6);
  });

  it("computes nested branch offsets from parent branch timeline", () => {
    const branches: Record<string, BranchStream> = {
      main: branch("main", null, null, true),
      "branch-1": branch("branch-1", "main", "m2"),
      "branch-2": branch("branch-2", "branch-1", "b1n1")
    };
    const branchNodeIds = {
      main: ["m0", "m1", "m2", "m3"],
      "branch-1": ["b1n0", "b1n1", "b1n2"],
      "branch-2": ["b2n0"]
    };

    const offsets = computeBranchOffsets(["main", "branch-1", "branch-2"], branches, branchNodeIds);
    expect(offsets["branch-1"]).toBe(3);
    expect(offsets["branch-2"]).toBe(5);
  });

  it("falls back gracefully when parent fork node is missing", () => {
    const branches: Record<string, BranchStream> = {
      main: branch("main", null, null, true),
      "branch-1": branch("branch-1", "main", "missing-node")
    };
    const branchNodeIds = {
      main: ["m0", "m1"],
      "branch-1": ["b1n0"]
    };

    const offsets = computeBranchOffsets(["main", "branch-1"], branches, branchNodeIds);
    expect(offsets["branch-1"]).toBe(0);
  });

  it("computes max visual column from offsets plus lane lengths", () => {
    const branchNodeIds = {
      main: ["m0", "m1", "m2"],
      "branch-1": ["b1n0", "b1n1", "b1n2", "b1n3"],
      "branch-2": ["b2n0", "b2n1"]
    };
    const offsets = {
      main: 0,
      "branch-1": 2,
      "branch-2": 5
    };

    const max = computeMaxBranchColumn(["main", "branch-1", "branch-2"], offsets, branchNodeIds);
    expect(max).toBe(6);
  });
});
