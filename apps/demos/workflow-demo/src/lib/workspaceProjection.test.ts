import { describe, expect, it } from "vitest";
import { applyWorkspaceOpPayload } from "./workspaceProjection";
import { emptyWorkspaceSnapshot } from "../state/snapshot";
import type { WorkspaceNode, WorkspaceSnapshot } from "../state/workspaceTypes";

const noResolve = () => null;

function node(overrides: Partial<WorkspaceNode> = {}): WorkspaceNode {
  return {
    id: "node-1",
    x: 100,
    y: 100,
    label: "Node 1",
    updatedAtIso: "2026-07-04T00:00:00.000Z",
    ...overrides
  };
}

function addNodePayload(entry: WorkspaceNode) {
  return { type: "workspace.add-node", nodeId: entry.id, node: entry };
}

describe("applyWorkspaceOpPayload", () => {
  it("adds embedded nodes for each shape", () => {
    const snapshot = emptyWorkspaceSnapshot();
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "a", shape: "rect" })), noResolve);
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "b", shape: "circle" })), noResolve);
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "c", shape: "diamond" })), noResolve);
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "d" })), noResolve);
    expect(snapshot.nodes.map((entry) => [entry.id, entry.shape])).toEqual([
      ["d", undefined],
      ["c", "diamond"],
      ["b", "circle"],
      ["a", "rect"]
    ]);
  });

  it("drops unknown shapes from embedded nodes", () => {
    const snapshot = emptyWorkspaceSnapshot();
    const raw = { ...node({ id: "a" }), shape: "hexagon" } as unknown as WorkspaceNode;
    applyWorkspaceOpPayload(snapshot, addNodePayload(raw), noResolve);
    expect(snapshot.nodes).toHaveLength(1);
    expect("shape" in snapshot.nodes[0]).toBe(false);
  });

  it("falls back to the resolver for legacy nodeId-only add ops", () => {
    const snapshot = emptyWorkspaceSnapshot();
    const record = node({ id: "legacy", label: "Legacy" });
    applyWorkspaceOpPayload(
      snapshot,
      { type: "workspace.add-node", nodeId: "legacy" },
      (id) => (id === "legacy" ? record : null)
    );
    expect(snapshot.nodes.map((entry) => entry.id)).toEqual(["legacy"]);
  });

  it("applies renames only to the matching node", () => {
    const snapshot = emptyWorkspaceSnapshot();
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "a", label: "Node 1" })), noResolve);
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "b", label: "Node 2" })), noResolve);
    applyWorkspaceOpPayload(
      snapshot,
      { type: "workspace.rename-node", rename: { nodeId: "a", label: "Ingest", updatedAtIso: "2026-07-04T01:00:00.000Z" } },
      noResolve
    );
    const byId = Object.fromEntries(snapshot.nodes.map((entry) => [entry.id, entry]));
    expect(byId.a.label).toBe("Ingest");
    expect(byId.a.updatedAtIso).toBe("2026-07-04T01:00:00.000Z");
    expect(byId.b.label).toBe("Node 2");
  });

  it("ignores malformed rename payloads", () => {
    const snapshot = emptyWorkspaceSnapshot();
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "a", label: "Node 1" })), noResolve);
    applyWorkspaceOpPayload(snapshot, { type: "workspace.rename-node", rename: { nodeId: "a" } }, noResolve);
    applyWorkspaceOpPayload(snapshot, { type: "workspace.rename-node" }, noResolve);
    expect(snapshot.nodes[0].label).toBe("Node 1");
  });

  it("composes move and rename on the same node", () => {
    const snapshot = emptyWorkspaceSnapshot();
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "a", shape: "circle" })), noResolve);
    applyWorkspaceOpPayload(
      snapshot,
      { type: "workspace.move-node", move: { nodeId: "a", x: 300, y: 200 } },
      noResolve
    );
    applyWorkspaceOpPayload(
      snapshot,
      { type: "workspace.rename-node", rename: { nodeId: "a", label: "Review" } },
      noResolve
    );
    expect(snapshot.nodes[0]).toMatchObject({ id: "a", x: 300, y: 200, label: "Review", shape: "circle" });
  });

  it("clear-nodes wipes nodes and edges but keeps annotations", () => {
    const snapshot: WorkspaceSnapshot = emptyWorkspaceSnapshot();
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "a" })), noResolve);
    applyWorkspaceOpPayload(
      snapshot,
      {
        type: "workspace.add-annotation",
        annotation: { id: "n1", text: "note", x: 10, y: 10, updatedAtIso: "2026-07-04T00:00:00.000Z" }
      },
      noResolve
    );
    applyWorkspaceOpPayload(snapshot, { type: "workspace.clear-nodes" }, noResolve);
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.edges).toEqual([]);
    expect(snapshot.annotations).toHaveLength(1);
  });

  it("clamps out-of-bounds adds and moves into the workspace", () => {
    const snapshot = emptyWorkspaceSnapshot();
    applyWorkspaceOpPayload(snapshot, addNodePayload(node({ id: "a", x: 5000, y: -50 })), noResolve);
    expect(snapshot.nodes[0].x).toBeLessThanOrEqual(860 - 120);
    expect(snapshot.nodes[0].y).toBeGreaterThanOrEqual(16);
  });
});
