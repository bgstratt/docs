import { describe, expect, it } from "vitest";
import { createInitialReplayState, replayReducer } from "./branchReplay";

describe("branchReplay reducer", () => {
  it("switches active and cursor branch together", () => {
    let state = createInitialReplayState("demo-room", "main", "main");
    state = replayReducer(state, {
      type: "register-branch",
      branchId: "branch-1",
      roomId: "demo-room-branch-1",
      label: "branch-1",
      basedOnBranchId: "main",
      basedOnNodeId: null
    });

    state = replayReducer(state, {
      type: "set-active-branch",
      branchId: "branch-1"
    });

    expect(state.activeBranchId).toBe("branch-1");
    expect(state.cursor.branchId).toBe("branch-1");
  });

  it("creates playback branch with empty local lane (no inherited copies)", () => {
    let state = createInitialReplayState("demo-room", "main", "main");
    state = replayReducer(state, {
      type: "append-branch-node",
      branchId: "main",
      roomId: "demo-room",
      opSummary: "main-1",
      payloadJson: "{}",
      atIso: "2026-01-01T00:00:01.000Z"
    });
    state = replayReducer(state, {
      type: "append-branch-node",
      branchId: "main",
      roomId: "demo-room",
      opSummary: "main-2",
      payloadJson: "{}",
      atIso: "2026-01-01T00:00:02.000Z"
    });
    state = replayReducer(state, {
      type: "set-cursor-index",
      branchId: "main",
      nodeIndex: 1
    });

    state = replayReducer(state, {
      type: "create-branch-from-cursor",
      newBranchId: "branch-1",
      newRoomId: "demo-room-branch-1",
      newLabel: "branch-1",
      reason: "playback-edit"
    });

    expect(state.branchNodeIds["branch-1"]).toHaveLength(0);
    expect(state.branches["branch-1"]?.basedOnBranchId).toBe("main");
    expect(state.cursor.branchId).toBe("branch-1");
  });

  it("sets playback mode when cursor index changes", () => {
    let state = createInitialReplayState("demo-room", "main", "main");
    state = replayReducer(state, {
      type: "append-branch-node",
      branchId: "main",
      roomId: "demo-room",
      opSummary: "main-1",
      payloadJson: "{}",
      atIso: "2026-01-01T00:00:01.000Z"
    });
    state = replayReducer(state, {
      type: "set-mode",
      mode: "live"
    });

    state = replayReducer(state, {
      type: "set-cursor-index",
      branchId: "main",
      nodeIndex: 0
    });

    expect(state.cursor.mode).toBe("playback");
  });

  it("keeps branch lane isolated from later main appends", () => {
    let state = createInitialReplayState("demo-room", "main", "main");
    state = replayReducer(state, {
      type: "append-branch-node",
      branchId: "main",
      roomId: "demo-room",
      opSummary: "main-1",
      payloadJson: "{}",
      atIso: "2026-01-01T00:00:01.000Z"
    });
    state = replayReducer(state, {
      type: "append-branch-node",
      branchId: "main",
      roomId: "demo-room",
      opSummary: "main-2",
      payloadJson: "{}",
      atIso: "2026-01-01T00:00:02.000Z"
    });
    state = replayReducer(state, {
      type: "set-cursor-index",
      branchId: "main",
      nodeIndex: 1
    });

    state = replayReducer(state, {
      type: "create-branch-from-cursor",
      newBranchId: "branch-1",
      newRoomId: "demo-room-branch-1",
      newLabel: "branch-1",
      reason: "manual"
    });

    state = replayReducer(state, {
      type: "append-branch-node",
      branchId: "main",
      roomId: "demo-room",
      opSummary: "main-3",
      payloadJson: "{}",
      atIso: "2026-01-01T00:00:03.000Z"
    });
    state = replayReducer(state, {
      type: "append-branch-node",
      branchId: "branch-1",
      roomId: "demo-room-branch-1",
      opSummary: "branch-1-1",
      payloadJson: "{}",
      atIso: "2026-01-01T00:00:04.000Z"
    });

    expect(state.branchNodeIds.main).toHaveLength(3);
    expect(state.branchNodeIds["branch-1"]).toHaveLength(1);
    const branchNodeId = state.branchNodeIds["branch-1"][0];
    expect(state.nodesById[branchNodeId]?.branchId).toBe("branch-1");
    expect(state.nodesById[branchNodeId]?.opSummary).toBe("branch-1-1");
  });

  it("supports nested branch ancestry metadata", () => {
    let state = createInitialReplayState("demo-room", "main", "main");
    for (let i = 0; i < 5; i += 1) {
      state = replayReducer(state, {
        type: "append-branch-node",
        branchId: "main",
        roomId: "demo-room",
        opSummary: `main-${i + 1}`,
        payloadJson: "{}",
        atIso: `2026-01-01T00:00:0${i + 1}.000Z`
      });
    }

    state = replayReducer(state, {
      type: "set-cursor-index",
      branchId: "main",
      nodeIndex: 2
    });
    state = replayReducer(state, {
      type: "create-branch-from-cursor",
      newBranchId: "branch-1",
      newRoomId: "demo-room-branch-1",
      newLabel: "branch-1",
      reason: "manual"
    });
    state = replayReducer(state, {
      type: "append-branch-node",
      branchId: "branch-1",
      roomId: "demo-room-branch-1",
      opSummary: "branch-1-1",
      payloadJson: "{}",
      atIso: "2026-01-01T00:00:10.000Z"
    });
    state = replayReducer(state, {
      type: "append-branch-node",
      branchId: "branch-1",
      roomId: "demo-room-branch-1",
      opSummary: "branch-1-2",
      payloadJson: "{}",
      atIso: "2026-01-01T00:00:11.000Z"
    });
    state = replayReducer(state, {
      type: "set-cursor-index",
      branchId: "branch-1",
      nodeIndex: 1
    });
    const branch1ForkNode = state.branchNodeIds["branch-1"][1];

    state = replayReducer(state, {
      type: "create-branch-from-cursor",
      newBranchId: "branch-2",
      newRoomId: "demo-room-branch-2",
      newLabel: "branch-2",
      reason: "manual"
    });

    expect(state.branches["branch-2"]?.basedOnBranchId).toBe("branch-1");
    expect(state.branches["branch-2"]?.basedOnNodeId).toBe(branch1ForkNode);
    expect(state.branchNodeIds["branch-2"]).toHaveLength(0);
  });
});
