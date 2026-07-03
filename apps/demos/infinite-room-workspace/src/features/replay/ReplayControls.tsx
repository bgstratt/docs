// ReplayControls — the replay canvas section: active-branch/mode selectors,
// play/pause + jump controls, branch-from-cursor, the merge workflow, the
// branch-lane DAG viz (ReplayLanes), timeline scrubber, prev/next stepping,
// and the room-at-cursor op inspector. Extracted verbatim from App.tsx during
// the module split; behavior unchanged.

import type { ReplayNode, ReplayState } from "../../lib/branchReplay";
import type { RemoteReplayCursor } from "../../state/workspaceTypes";
import { ReplayLanes, type LaneLayout, type MergeConnector } from "./ReplayLanes";

interface ReplayControlsProps {
  replayState: ReplayState;
  availableBranchIds: string[];
  replayNodeCount: number;
  replayCanStep: boolean;
  isReplayPlaying: boolean;
  onSetActiveBranch: (branchId: string) => void;
  onSetMode: (mode: "live" | "playback") => void;
  onTogglePlay: () => void;
  onSelectNode: (branchId: string, nodeIndex: number) => void;
  onCreateBranchFromCursor: () => void;
  mergeSourceBranchId: string;
  onMergeSourceBranchChange: (branchId: string) => void;
  mergeSourceNodeId: string;
  onMergeSourceNodeChange: (nodeId: string) => void;
  mergeSourceBranchNodeIds: string[];
  onMergeIntoActiveHead: () => void;
  mergeEligibilityMessage: string;
  laneLayout: LaneLayout;
  sortedBranchIds: string[];
  branchOffsetById: Record<string, number>;
  mergeConnectors: MergeConnector[];
  remoteReplayCursorByPeer: Record<string, RemoteReplayCursor>;
  laneXForRemoteReplayCursor: (remoteCursor: RemoteReplayCursor) => number | undefined;
  currentReplayNode: ReplayNode | null;
}

export function ReplayControls({
  replayState,
  availableBranchIds,
  replayNodeCount,
  replayCanStep,
  isReplayPlaying,
  onSetActiveBranch,
  onSetMode,
  onTogglePlay,
  onSelectNode,
  onCreateBranchFromCursor,
  mergeSourceBranchId,
  onMergeSourceBranchChange,
  mergeSourceNodeId,
  onMergeSourceNodeChange,
  mergeSourceBranchNodeIds,
  onMergeIntoActiveHead,
  mergeEligibilityMessage,
  laneLayout,
  sortedBranchIds,
  branchOffsetById,
  mergeConnectors,
  remoteReplayCursorByPeer,
  laneXForRemoteReplayCursor,
  currentReplayNode
}: ReplayControlsProps) {
  return (
    <>
      <h3 style={{ marginTop: 0 }}>Replay canvas</h3>
      <p style={{ marginTop: 0 }}>
        Visual lane + timeline + room-at-cursor preview. Use the quick scrubber above the canvas for side-by-side replay viewing.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <label htmlFor="activeBranch">Active branch</label>
        <select
          id="activeBranch"
          value={replayState.activeBranchId}
          onChange={(event) => onSetActiveBranch(event.target.value)}
          style={{ padding: 6 }}
        >
          {availableBranchIds.map((branchId) => (
            <option key={branchId} value={branchId}>
              {branchId}
            </option>
          ))}
        </select>
        <label htmlFor="replayMode">Replay mode</label>
        <select
          id="replayMode"
          value={replayState.cursor.mode}
          onChange={(event) => onSetMode(event.target.value === "playback" ? "playback" : "live")}
          style={{ padding: 6 }}
        >
          <option value="live">live</option>
          <option value="playback">playback</option>
        </select>
        <button type="button" onClick={onTogglePlay} disabled={replayNodeCount <= 1}>
          {isReplayPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => onSelectNode(replayState.cursor.branchId, 0)}
          disabled={!replayCanStep}
        >
          Jump start
        </button>
        <button
          type="button"
          onClick={() => onSelectNode(replayState.cursor.branchId, replayNodeCount - 1)}
          disabled={!replayCanStep}
        >
          Jump head
        </button>
        <span>
          branch <code>{replayState.cursor.branchId}</code>
        </span>
        <span>
          nodes <code>{replayNodeCount}</code>
        </span>
        <button type="button" onClick={onCreateBranchFromCursor} disabled={!replayState.cursor.nodeId}>
          Branch from cursor
        </button>
      </div>
      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, marginBottom: 10, background: "#f8fafc" }}>
        <strong>Merge workflow</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <label htmlFor="mergeSourceBranch">Source branch</label>
          <select
            id="mergeSourceBranch"
            value={mergeSourceBranchId}
            onChange={(event) => onMergeSourceBranchChange(event.target.value)}
            style={{ padding: 6 }}
          >
            {availableBranchIds.map((branchId) => (
              <option key={branchId} value={branchId}>
                {branchId}
              </option>
            ))}
          </select>
          <label htmlFor="mergeSourceNode">Source node</label>
          <select
            id="mergeSourceNode"
            value={mergeSourceNodeId}
            onChange={(event) => onMergeSourceNodeChange(event.target.value)}
            style={{ minWidth: 220, padding: 6 }}
          >
            <option value="">select node</option>
            {mergeSourceBranchNodeIds.map((nodeId) => (
              <option key={nodeId} value={nodeId}>
                {nodeId}
              </option>
            ))}
          </select>
          <span>
            target head: <code>{replayState.activeBranchId}</code>
          </span>
          <button type="button" onClick={onMergeIntoActiveHead} disabled={!mergeSourceNodeId}>
            Merge into active head
          </button>
          <span style={{ color: "#334155", fontSize: 12 }}>{mergeEligibilityMessage}</span>
        </div>
      </div>
      <ReplayLanes
        replayState={replayState}
        laneLayout={laneLayout}
        sortedBranchIds={sortedBranchIds}
        branchOffsetById={branchOffsetById}
        mergeConnectors={mergeConnectors}
        remoteReplayCursorByPeer={remoteReplayCursorByPeer}
        laneXForRemoteReplayCursor={laneXForRemoteReplayCursor}
        onSelectNode={onSelectNode}
      />
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="replayCursorSlider" style={{ display: "block", marginBottom: 6 }}>
          Timeline scrubber
        </label>
        <input
          id="replayCursorSlider"
          type="range"
          min={0}
          max={Math.max(0, replayNodeCount - 1)}
          value={Math.min(replayState.cursor.nodeIndex, Math.max(0, replayNodeCount - 1))}
          onChange={(event) => onSelectNode(replayState.cursor.branchId, Number(event.target.value) || 0)}
          style={{ width: "100%" }}
          disabled={!replayCanStep}
        />
      </div>
      <div style={{ marginBottom: 8 }}>
        <strong>Cursor:</strong>{" "}
        <code>
          index={replayState.cursor.nodeIndex}, node={replayState.cursor.nodeId ?? "(none)"}
        </code>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => onSelectNode(replayState.cursor.branchId, replayState.cursor.nodeIndex - 1)}
          disabled={!replayCanStep}
        >
          Prev node
        </button>
        <button
          type="button"
          onClick={() => onSelectNode(replayState.cursor.branchId, replayState.cursor.nodeIndex + 1)}
          disabled={!replayCanStep}
        >
          Next node
        </button>
      </div>
      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
        <strong>Room at cursor</strong>
        {currentReplayNode ? (
          <div>
            <p style={{ marginTop: 8, marginBottom: 4 }}>
              <strong>Node:</strong> <code>{currentReplayNode.nodeId}</code>
            </p>
            <p style={{ marginTop: 0, marginBottom: 4 }}>
              <strong>Summary:</strong> <code>{currentReplayNode.opSummary}</code>
            </p>
            <p style={{ marginTop: 0, marginBottom: 4 }}>
              <strong>Lamport:</strong> <code>{currentReplayNode.lamport ?? "(none)"}</code>, <strong>Author:</strong>{" "}
              <code>{currentReplayNode.author ?? "(unknown)"}</code>
            </p>
            <p style={{ marginTop: 0, marginBottom: 6 }}>
              <strong>Time:</strong> <code>{new Date(currentReplayNode.atIso).toLocaleTimeString()}</code>
            </p>
            <pre
              style={{
                marginTop: 0,
                marginBottom: 0,
                maxHeight: 110,
                overflow: "auto",
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: 8
              }}
            >
              {currentReplayNode.payloadJson}
            </pre>
          </div>
        ) : (
          <p style={{ marginBottom: 0 }}>No room state at cursor yet. Generate runtime events first.</p>
        )}
      </div>
    </>
  );
}
