import { describe, expect, it } from "vitest";
import {
  buildForkReplayOp,
  getWorkspaceBaselineKey,
  getWorkspaceLiveKey,
  isForkBranchPayload,
  replayBaselineForBranch,
  snapshotBaselineKeysForBranch
} from "./workspaceBaselines";

describe("workspaceBaselines", () => {
  it("uses separate live and baseline key namespaces", () => {
    expect(getWorkspaceLiveKey("branch-1", "nodes")).toBe("workspace/nodes/branch-1");
    expect(getWorkspaceBaselineKey("branch-1", "nodes")).toBe("workspace/baseline/nodes/branch-1");
    expect(getWorkspaceLiveKey("main", "doc")).toBe("workspace/doc/main");
    expect(getWorkspaceBaselineKey("main", "doc")).toBe("workspace/baseline/doc/main");
  });

  it("builds fork replay ops with branch metadata", () => {
    const op = buildForkReplayOp({
      branchId: "branch-1",
      roomId: "demo-room-branch-1",
      label: "branch-1",
      basedOnBranchId: "main",
      basedOnNodeId: "main-abc",
      createdAtIso: "2026-05-31T00:00:00.000Z"
    });
    expect(op.payloadRef).toBe("workspace.fork-branch");
    expect(isForkBranchPayload(op.payload)).toBe(true);
    if (isForkBranchPayload(op.payload)) {
      expect(op.payload.branch.branchId).toBe("branch-1");
    }
  });

  it("keeps main replay baseline empty even when state has content", () => {
    const baseline = replayBaselineForBranch("main", {
      main: {
        doc: "stale",
        nodes: [{ id: "n1" }],
        edges: [],
        assets: [],
        annotations: []
      }
    });
    expect(baseline.doc).toBe("");
    expect(baseline.nodes).toEqual([]);
  });

  it("writes immutable baseline keys for fork snapshots", () => {
    const keys = snapshotBaselineKeysForBranch("branch-2", {
      doc: "hello",
      nodes: [{ id: "n1" }],
      edges: [],
      assets: [],
      annotations: []
    }).map((entry) => entry.key);
    expect(keys).toContain("workspace/baseline/doc/branch-2");
    expect(keys).toContain("workspace/baseline/nodes/branch-2");
  });
});
