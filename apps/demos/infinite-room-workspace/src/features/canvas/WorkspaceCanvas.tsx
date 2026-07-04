// WorkspaceCanvas — the spatial board: nodes (draggable), edge lines,
// shared assets, annotations, remote drag ghosts, and live/playback badges.
// Extracted from App.tsx during the module split. Interaction handlers stay
// in the app shell (they weave into branch write-routing); this component
// renders and forwards pointer events. Pointer events (not mouse events)
// are used throughout so touch and pen input drag nodes too.

import type { RefObject } from "react";
import type {
  DragPresence,
  WorkspaceAnnotation,
  WorkspaceAsset,
  WorkspaceEdge,
  WorkspaceNode,
  WorkspaceTool
} from "../../state/workspaceTypes";
import { shortPeerId, WORKSPACE_HEIGHT, WORKSPACE_WIDTH } from "../../state/workspaceTypes";

export type RemoteNodeDrag = {
  x: number;
  y: number;
  peerId: string;
  atIso: string;
};

interface WorkspaceCanvasProps {
  surfaceRef: RefObject<HTMLDivElement>;
  workspaceNodes: WorkspaceNode[];
  workspaceEdges: WorkspaceEdge[];
  workspaceAssets: WorkspaceAsset[];
  workspaceAnnotations: WorkspaceAnnotation[];
  remoteDragByNodeId: Record<string, RemoteNodeDrag>;
  remoteDragByPeer: Record<string, DragPresence>;
  presenceByPeer: Record<string, string>;
  canUseSdkActions: boolean;
  workspaceTool: WorkspaceTool;
  replayMode: "live" | "playback";
  canvasReplayBadge: string;
  edgeSourceNodeId: string | null;
  onSurfacePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onNodePointerDown: (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => void;
}

export function WorkspaceCanvas({
  surfaceRef,
  workspaceNodes,
  workspaceEdges,
  workspaceAssets,
  workspaceAnnotations,
  remoteDragByNodeId,
  remoteDragByPeer,
  presenceByPeer,
  canUseSdkActions,
  workspaceTool,
  replayMode,
  canvasReplayBadge,
  edgeSourceNodeId,
  onSurfacePointerDown,
  onNodePointerDown
}: WorkspaceCanvasProps) {
  return (
    <div
      ref={surfaceRef}
      onPointerDown={onSurfacePointerDown}
      style={{
        width: "100%",
        maxWidth: WORKSPACE_WIDTH,
        height: WORKSPACE_HEIGHT,
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        background: "linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)",
        position: "relative",
        overflow: "hidden",
        marginBottom: 12,
        touchAction: "none"
      }}
    >
      <svg
        width={WORKSPACE_WIDTH}
        height={WORKSPACE_HEIGHT}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        {workspaceEdges.map((edge) => {
          const from = workspaceNodes.find((node) => node.id === edge.fromNodeId);
          const to = workspaceNodes.find((node) => node.id === edge.toNodeId);
          if (!from || !to) {
            return null;
          }
          return (
            <line
              key={edge.id}
              x1={from.x + 52}
              y1={from.y + 18}
              x2={to.x + 52}
              y2={to.y + 18}
              stroke="#1e293b"
              strokeOpacity={0.55}
              strokeWidth={2.2}
            />
          );
        })}
      </svg>
      {workspaceNodes.map((node) => {
        const remoteDrag = remoteDragByNodeId[node.id];
        const renderX = remoteDrag ? remoteDrag.x : node.x;
        const renderY = remoteDrag ? remoteDrag.y : node.y;
        return (
          <div
            key={node.id}
            role="button"
            tabIndex={0}
            onPointerDown={(event) => onNodePointerDown(event, node.id)}
            style={{
              position: "absolute",
              left: renderX,
              top: renderY,
              width: 104,
              minHeight: 36,
              borderRadius: 8,
              border: remoteDrag ? "1px solid #0f766e" : "1px solid #2563eb",
              background: "white",
              // Fixed light background, so pin the text color too — the page
              // text color flips white in dark theme and vanished here.
              color: "#0f172a",
              padding: "6px 8px",
              cursor: canUseSdkActions ? "grab" : "not-allowed",
              boxShadow: remoteDrag ? "0 0 0 2px rgba(20, 184, 166, 0.18)" : "0 1px 3px rgba(15, 23, 42, 0.25)"
            }}
          >
            <strong style={{ display: "block", fontSize: 12 }}>{node.label}</strong>
            <small style={{ color: "#475569" }}>{new Date(node.updatedAtIso).toLocaleTimeString()}</small>
          </div>
        );
      })}
      {workspaceAssets.map((asset) => (
        <div
          key={asset.id}
          style={{
            position: "absolute",
            left: asset.x,
            top: asset.y,
            minWidth: 120,
            borderRadius: 8,
            border: "1px solid #7c3aed",
            background: "#faf5ff",
            color: "#3b0764",
            padding: "6px 8px",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.20)"
          }}
        >
          <strong style={{ display: "block", fontSize: 12 }}>{asset.name}</strong>
          <small style={{ color: "#5b21b6" }}>shared asset</small>
        </div>
      ))}
      {Object.entries(remoteDragByPeer).map(([peerId, drag]) => (
        <div
          key={`${peerId}-${drag.nodeId}`}
          style={{
            position: "absolute",
            left: drag.x + 106,
            top: drag.y - 10,
            borderRadius: 999,
            border: "1px solid #0f766e",
            background: "#ecfeff",
            color: "#155e75",
            fontSize: 11,
            padding: "2px 8px"
          }}
        >
          {presenceByPeer[peerId] ?? shortPeerId(peerId)} dragging
        </div>
      ))}
      {workspaceAnnotations.map((note) => (
        <div
          key={note.id}
          style={{
            position: "absolute",
            left: note.x,
            top: note.y,
            minWidth: 130,
            maxWidth: 220,
            borderRadius: 8,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            color: "#78350f",
            padding: "6px 8px",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.20)"
          }}
        >
          <strong style={{ display: "block", fontSize: 12 }}>{note.text}</strong>
          <small style={{ color: "#92400e" }}>{new Date(note.updatedAtIso).toLocaleTimeString()}</small>
        </div>
      ))}
      {edgeSourceNodeId ? (
        <div style={{ position: "absolute", left: 10, top: 10, color: "#1e3a8a", fontSize: 12 }}>
          Edge source: <code>{edgeSourceNodeId}</code> (shift-click target)
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          right: 10,
          top: 10,
          borderRadius: 999,
          border: "1px solid #334155",
          background: replayMode === "live" ? "#ecfeff" : "#fef3c7",
          color: "#0f172a",
          padding: "2px 10px",
          fontSize: 12,
          fontWeight: 600
        }}
      >
        {canvasReplayBadge}
      </div>
      {replayMode === "playback" ? (
        <div
          style={{
            position: "absolute",
            right: 10,
            top: 36,
            borderRadius: 6,
            border: "1px solid #d97706",
            background: "#fffbeb",
            color: "#92400e",
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 600
          }}
        >
          PLAYBACK VIEW (writes may branch)
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            right: 10,
            top: 36,
            borderRadius: 6,
            border: "1px solid #0f766e",
            background: "#ecfeff",
            color: "#155e75",
            padding: "2px 8px",
            fontSize: 11,
            fontWeight: 600
          }}
        >
          LIVE VIEW (writes append to active head)
        </div>
      )}
      {workspaceNodes.length === 0 ? (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#475569" }}>
          {workspaceTool === "annotate"
            ? "Annotate mode: click canvas to place a note."
            : "Select mode: add nodes, shift-click node to start edge connect."}
        </div>
      ) : null}
    </div>
  );
}
