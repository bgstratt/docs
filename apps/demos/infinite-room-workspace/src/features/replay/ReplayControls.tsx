// ReplayControls — the replay section under the workspace canvas: the single
// timeline scrubber, the active-branch line (branch/mode selectors plus
// play/start/prev/next/end stepping and branch-from-cursor), the branch-lane
// DAG viz (ReplayLanes), and the merge workflow. The room-at-cursor inspector
// lives in the Config and Diagnostics sidebar panel.

import type { ReplayState } from "../../lib/branchReplay";
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
  laneXForRemoteReplayCursor
}: ReplayControlsProps) {
  const maxNodeIndex = Math.max(0, replayNodeCount - 1);
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <label htmlFor="replayCursorSlider" style={{ display: "block", marginBottom: 6 }}>
          Timeline scrubber{" "}
          <code>
            {replayState.cursor.branchId} [{Math.min(replayState.cursor.nodeIndex, maxNodeIndex)}/{maxNodeIndex}]
          </code>
        </label>
        <input
          id="replayCursorSlider"
          type="range"
          min={0}
          max={maxNodeIndex}
          value={Math.min(replayState.cursor.nodeIndex, maxNodeIndex)}
          onChange={(event) => onSelectNode(replayState.cursor.branchId, Number(event.target.value) || 0)}
          style={{ width: "100%" }}
          disabled={!replayCanStep}
        />
      </div>
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
          Start
        </button>
        <button
          type="button"
          onClick={() => onSelectNode(replayState.cursor.branchId, replayState.cursor.nodeIndex - 1)}
          disabled={!replayCanStep}
        >
          Prev
        </button>
        <button
          type="button"
          onClick={() => onSelectNode(replayState.cursor.branchId, replayState.cursor.nodeIndex + 1)}
          disabled={!replayCanStep}
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => onSelectNode(replayState.cursor.branchId, replayNodeCount - 1)}
          disabled={!replayCanStep}
        >
          End
        </button>
        <button type="button" onClick={onCreateBranchFromCursor} disabled={!replayState.cursor.nodeId}>
          Branch from cursor
        </button>
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
      {/* Explicit text color: the light panel background is fixed, but the page
          text color flips white in dark theme and would vanish here. */}
      <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, background: "#f8fafc", color: "#0f172a" }}>
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
    </>
  );
}
