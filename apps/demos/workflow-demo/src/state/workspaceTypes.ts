// Workspace domain types shared by the app shell, runtime hooks, and feature
// components. Extracted verbatim from App.tsx during the module split.

export type RuntimeBackend = "ws" | "sdk";

export const NODE_SHAPES = ["rect", "circle", "diamond"] as const;
export type NodeShape = (typeof NODE_SHAPES)[number];

export type WorkspaceNode = {
  id: string;
  x: number;
  y: number;
  label: string;
  /** Absent on records persisted before shapes existed; treated as "rect". */
  shape?: NodeShape;
  updatedAtIso: string;
};

export type WorkspaceEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  updatedAtIso: string;
};

export type WorkspaceAsset = {
  id: string;
  x: number;
  y: number;
  name: string;
  updatedAtIso: string;
};

export type WorkspaceAnnotation = {
  id: string;
  x: number;
  y: number;
  text: string;
  updatedAtIso: string;
};

export type WorkspaceTool = "select" | "annotate";

export type DragPresence = {
  nodeId: string;
  x: number;
  y: number;
  branchId: string;
  mode: "live" | "playback";
  atIso: string;
};

export type RemoteReplayCursor = {
  branchId: string;
  nodeIndex: number;
  replayNodeId: string | null;
  mode: "live" | "playback";
  name: string;
  atIso: string;
};

export type PersistenceEvent = {
  atIso: string;
  key: string;
  action: string;
  detail: string;
};

export type WorkspaceSnapshot = {
  doc: string;
  nodes: WorkspaceNode[];
  edges: WorkspaceEdge[];
  assets: WorkspaceAsset[];
  annotations: WorkspaceAnnotation[];
};

export type SharedReplayOp = {
  id: string;
  branchId: string;
  opSummary: string;
  payload: Record<string, unknown>;
  payloadRef: string;
  atIso: string;
};

export type SharedBranchRecord = {
  branchId: string;
  roomId: string;
  label: string;
  basedOnBranchId: string | null;
  basedOnNodeId: string | null;
  createdAtIso: string;
};

export type WorkspaceDataKind = "doc" | "nodes" | "edges" | "assets" | "annotations";

export type WriteBranchResolution = {
  branchId: string;
  seededSnapshot: WorkspaceSnapshot | null;
};

export const WORKSPACE_WIDTH = 860;
export const WORKSPACE_HEIGHT = 360;
export const BRANCH_WRITE_PROTECT_MS = 8000;

/** Display-only truncation for pubkey-style peer ids; never use for lookups. */
export function shortPeerId(peerId: string): string {
  return peerId.length > 20 ? `${peerId.slice(0, 16)}…` : peerId;
}
