// ReplayLanes — the branch-lane DAG visualization: one lane per branch,
// commit circles with HEAD/MERGE/cursor markers, dashed-purple divergence
// connectors, orange merge connectors, and remote peer replay cursors.
// Extracted verbatim from App.tsx during the module split; rendering and
// interaction behavior are unchanged.

import type { ReplayState } from "../../lib/branchReplay";
import type { RemoteReplayCursor } from "../../state/workspaceTypes";

export type LaneLayout = {
  slotWidth: number;
  laneHeight: number;
  leftGutter: number;
  topGutter: number;
  width: number;
  height: number;
  laneY: Record<string, number>;
  nodeXByBranch: Record<string, Record<string, number>>;
};

export type MergeConnector = {
  id: string;
  path: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

interface ReplayLanesProps {
  replayState: ReplayState;
  laneLayout: LaneLayout;
  sortedBranchIds: string[];
  branchOffsetById: Record<string, number>;
  mergeConnectors: MergeConnector[];
  remoteReplayCursorByPeer: Record<string, RemoteReplayCursor>;
  laneXForRemoteReplayCursor: (remoteCursor: RemoteReplayCursor) => number | undefined;
  onSelectNode: (branchId: string, nodeIndex: number) => void;
}

export function ReplayLanes({
  replayState,
  laneLayout,
  sortedBranchIds,
  branchOffsetById,
  mergeConnectors,
  remoteReplayCursorByPeer,
  laneXForRemoteReplayCursor,
  onSelectNode
}: ReplayLanesProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <strong>Branch lanes:</strong>
      <div
        style={{
          marginTop: 6,
          border: "1px solid #cbd5e1",
          borderRadius: 8,
          padding: "8px 10px",
          background: "#f8fafc",
          color: "#334155",
          overflowX: "auto"
        }}
      >
        {sortedBranchIds.length === 0 ? (
          <span>No branch streams yet.</span>
        ) : (
          <svg width={laneLayout.width} height={laneLayout.height} role="img" aria-label="Replay branch lanes">
            {sortedBranchIds.map((branchId) => {
              const branch = replayState.branches[branchId];
              const laneY = laneLayout.laneY[branchId] ?? 0;
              const nodeIds = replayState.branchNodeIds[branchId] ?? [];
              const isActiveLane = branchId === replayState.activeBranchId;
              const branchSource = branch?.basedOnBranchId && branch?.basedOnNodeId
                ? `${branch.basedOnBranchId}:${branch.basedOnNodeId}`
                : "root";
              return (
                <g key={`lane-${branchId}`}>
                  <line
                    x1={laneLayout.leftGutter - 10}
                    y1={laneY}
                    x2={Math.max(
                      laneLayout.leftGutter + 16,
                      ...nodeIds.map((nodeId) => laneLayout.nodeXByBranch[branchId]?.[nodeId] ?? laneLayout.leftGutter)
                    )}
                    y2={laneY}
                    stroke={isActiveLane ? "#2563eb" : "#94a3b8"}
                    strokeWidth={isActiveLane ? 2.5 : 1.5}
                    strokeDasharray={isActiveLane ? "0" : "4 4"}
                  />
                  <text x={8} y={laneY - 6} fill={isActiveLane ? "#1d4ed8" : "#334155"} fontSize={12} fontWeight={isActiveLane ? 700 : 500}>
                    {branch?.label ?? branchId}
                    {branch?.isMain ? " (main)" : ""}
                  </text>
                  <text x={8} y={laneY + 12} fill="#64748b" fontSize={10}>
                    from {branchSource}
                  </text>
                  {nodeIds.map((nodeId, index) => {
                    const isCursor = replayState.cursor.nodeId === nodeId;
                    const node = replayState.nodesById[nodeId];
                    const isHead = branch?.headNodeId === nodeId;
                    const x = laneLayout.nodeXByBranch[branchId]?.[nodeId] ?? laneLayout.leftGutter;
                    const previousNodeId = index > 0 ? nodeIds[index - 1] : null;
                    const previousX = previousNodeId ? laneLayout.nodeXByBranch[branchId]?.[previousNodeId] : undefined;
                    return (
                      <g
                        key={nodeId}
                        onClick={() => onSelectNode(branchId, index)}
                        style={{ cursor: "pointer" }}
                      >
                        {typeof previousX === "number" ? (
                          <line
                            x1={previousX}
                            y1={laneY}
                            x2={x}
                            y2={laneY}
                            stroke={isActiveLane ? "#2563eb" : "#64748b"}
                            strokeWidth={isActiveLane ? 2 : 1.4}
                          />
                        ) : null}
                        <circle
                          cx={x}
                          cy={laneY}
                          r={isCursor ? 11 : 8}
                          fill={isCursor ? "#dbeafe" : "#ffffff"}
                          stroke={isCursor ? "#2563eb" : isHead ? "#0f766e" : "#64748b"}
                          strokeWidth={isCursor ? 2.5 : isHead ? 2 : 1.4}
                        />
                        <text x={x} y={laneY + 3.5} textAnchor="middle" fill="#0f172a" fontSize={9} fontWeight={600}>
                          {index + (branchOffsetById[branchId] ?? 0)}
                        </text>
                        {isHead ? (
                          <text x={x} y={laneY - 14} textAnchor="middle" fill="#0f766e" fontSize={9} fontWeight={700}>
                            HEAD
                          </text>
                        ) : null}
                        {node?.payloadRef === "merge" ? (
                          <text x={x} y={laneY + 20} textAnchor="middle" fill="#7c3aed" fontSize={8} fontWeight={700}>
                            MERGE
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {sortedBranchIds.map((branchId) => {
              const branch = replayState.branches[branchId];
              if (!branch?.basedOnBranchId || !branch.basedOnNodeId) {
                return null;
              }
              const fromX = laneLayout.nodeXByBranch[branch.basedOnBranchId]?.[branch.basedOnNodeId];
              const fromY = laneLayout.laneY[branch.basedOnBranchId];
              const toY = laneLayout.laneY[branchId];
              const firstNodeId = (replayState.branchNodeIds[branchId] ?? [])[0];
              const toX = firstNodeId ? laneLayout.nodeXByBranch[branchId]?.[firstNodeId] : undefined;
              if (typeof fromX !== "number" || typeof fromY !== "number" || typeof toX !== "number" || typeof toY !== "number") {
                return null;
              }
              const branchMidX = fromX + 16;
              return (
                <path
                  key={`diverge-${branchId}`}
                  d={`M ${fromX} ${fromY} C ${branchMidX} ${fromY}, ${branchMidX} ${toY}, ${toX} ${toY}`}
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth={1.8}
                  strokeDasharray="3 3"
                />
              );
            })}

            {Object.entries(remoteReplayCursorByPeer).map(([peerId, remoteCursor]) => {
              const laneY = laneLayout.laneY[remoteCursor.branchId];
              const x = laneXForRemoteReplayCursor(remoteCursor);
              if (typeof laneY !== "number" || typeof x !== "number") {
                return null;
              }
              return (
                <g key={`remote-replay-cursor-${peerId}`}>
                  <circle
                    cx={x}
                    cy={laneY}
                    r={12}
                    fill="none"
                    stroke="#ea580c"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                  <text x={x} y={laneY - 16} textAnchor="middle" fill="#ea580c" fontSize={9} fontWeight={700}>
                    {remoteCursor.name}
                  </text>
                </g>
              );
            })}

            {mergeConnectors.map((merge) => (
              <g key={`merge-${merge.id}`}>
                <path d={merge.path} fill="none" stroke="#f97316" strokeWidth={2.1} />
                <circle cx={merge.sourceX} cy={merge.sourceY} r={2.5} fill="#f97316" />
                <circle cx={merge.targetX} cy={merge.targetY} r={2.5} fill="#f97316" />
              </g>
            ))}
          </svg>
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#475569", display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>
          <strong style={{ color: "#a855f7" }}>Divergence</strong>: dashed purple connector
        </span>
        <span>
          <strong style={{ color: "#f97316" }}>Merge</strong>: orange connector
        </span>
        <span>
          <strong style={{ color: "#ea580c" }}>Peer cursor</strong>: dashed orange ring
        </span>
        <span>
          <strong>Click any node</strong> to move replay cursor
        </span>
      </div>
    </div>
  );
}
