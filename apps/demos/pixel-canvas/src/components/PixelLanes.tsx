// PixelLanes — branch-lane visualization for the pixel board, modeled on the
// workflow demo's ReplayLanes: one lane per branch room, cluster circles
// ("painting bursts") with HEAD marker and cursor ring, and dashed-purple
// divergence connectors from the parent's fork cluster to the child lane's
// first cluster. Clicking a cluster scrubs there (switching rooms first when
// the cluster is on another lane).

import {
  computeLaneLayout,
  computeLaneOffsets,
  type PixelLane
} from "../lib/pixelLanes";

interface PixelLanesProps {
  lanes: PixelLane[];
  activeRoomId: string;
  /** Live view = null; otherwise the active room's frozen event index. */
  replayCursor: number | null;
  onSelectCluster: (roomId: string, lastEventIndex: number) => void;
}

export function PixelLanes({ lanes, activeRoomId, replayCursor, onSelectCluster }: PixelLanesProps) {
  if (lanes.length === 0) {
    return null;
  }
  const offsets = computeLaneOffsets(lanes);
  const layout = computeLaneLayout(lanes, offsets);
  const byRoom = new Map(lanes.map((lane) => [lane.roomId, lane]));
  return (
    <div style={{ marginTop: 10 }}>
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
        <svg width={layout.width} height={layout.height} role="img" aria-label="Pixel branch lanes">
          {lanes.map((lane) => {
            const laneY = layout.laneY[lane.roomId] ?? 0;
            const xs = layout.clusterX[lane.roomId] ?? [];
            const isActiveLane = lane.roomId === activeRoomId;
            return (
              <g key={`lane-${lane.roomId}`}>
                <line
                  x1={layout.leftGutter - 10}
                  y1={laneY}
                  x2={Math.max(layout.leftGutter + 16, ...xs)}
                  y2={laneY}
                  stroke={isActiveLane ? "#2563eb" : "#94a3b8"}
                  strokeWidth={isActiveLane ? 2.5 : 1.5}
                  strokeDasharray={isActiveLane ? "0" : "4 4"}
                />
                <text
                  x={8}
                  y={laneY - 6}
                  fill={isActiveLane ? "#1d4ed8" : "#334155"}
                  fontSize={12}
                  fontWeight={isActiveLane ? 700 : 500}
                >
                  {lane.label}
                </text>
                <text x={8} y={laneY + 12} fill="#64748b" fontSize={10}>
                  {lane.parentRoomId ? `from ${shortRoomLabel(lane.parentRoomId)}` : "root"}
                </text>
                {lane.clusters.map((cluster, column) => {
                  const x = xs[column] ?? layout.leftGutter;
                  const isHead = column === lane.clusters.length - 1;
                  const isCursor =
                    isActiveLane &&
                    replayCursor !== null &&
                    replayCursor - 1 >= cluster.startIndex &&
                    replayCursor - 1 <= cluster.endIndex;
                  return (
                    <g
                      key={`${lane.roomId}-${cluster.startIndex}`}
                      onClick={() => onSelectCluster(lane.roomId, cluster.endIndex)}
                      style={{ cursor: "pointer" }}
                    >
                      {column > 0 ? (
                        <line
                          x1={xs[column - 1]}
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
                      <text x={x} y={laneY + 3.5} textAnchor="middle" fill="#0f172a" fontSize={8} fontWeight={600}>
                        {cluster.count}
                      </text>
                      {isHead ? (
                        <text x={x} y={laneY - 14} textAnchor="middle" fill="#0f766e" fontSize={9} fontWeight={700}>
                          HEAD
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {lanes.map((lane) => {
            if (!lane.parentRoomId) {
              return null;
            }
            const parent = byRoom.get(lane.parentRoomId);
            const parentXs = parent ? layout.clusterX[parent.roomId] ?? [] : [];
            const fromY = parent ? layout.laneY[parent.roomId] : undefined;
            const toY = layout.laneY[lane.roomId];
            const fromX =
              lane.forkColumn >= 0 && lane.forkColumn < parentXs.length
                ? parentXs[lane.forkColumn]
                : layout.leftGutter;
            const toX = (layout.clusterX[lane.roomId] ?? [])[0];
            if (typeof fromY !== "number" || typeof toY !== "number" || typeof toX !== "number") {
              return null;
            }
            const midX = fromX + 16;
            return (
              <path
                key={`diverge-${lane.roomId}`}
                d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                fill="none"
                stroke="#a855f7"
                strokeWidth={1.8}
                strokeDasharray="3 3"
              />
            );
          })}
        </svg>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#475569", display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>
          <strong style={{ color: "#a855f7" }}>Divergence</strong>: dashed purple connector
        </span>
        <span>Each circle is a painting burst; the number is its paint count</span>
        <span>
          <strong>Click any circle</strong> to replay there (switches rooms across lanes)
        </span>
      </div>
    </div>
  );
}

export function shortRoomLabel(roomId: string): string {
  const match = /-b([a-z0-9]+)$/.exec(roomId);
  return match ? `b${match[1]}` : "main";
}
