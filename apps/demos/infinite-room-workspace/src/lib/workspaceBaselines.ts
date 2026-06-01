export type WorkspaceDataKind = "doc" | "nodes" | "edges" | "assets" | "annotations";

export type WorkspaceSnapshot = {
  doc: string;
  nodes: unknown[];
  edges: unknown[];
  assets: unknown[];
  annotations: unknown[];
};

export type SharedBranchRecord = {
  branchId: string;
  roomId: string;
  label: string;
  basedOnBranchId: string | null;
  basedOnNodeId: string | null;
  createdAtIso: string;
};

export type SharedReplayOp = {
  id: string;
  branchId: string;
  opSummary: string;
  payload: Record<string, unknown>;
  payloadRef: string;
  atIso: string;
};

export const WORKSPACE_BRANCHES_KEY = "workspace/branches";

export function getWorkspaceLiveKey(branchId: string, kind: WorkspaceDataKind): string {
  if (kind === "doc") {
    return `workspace/doc/${branchId}`;
  }
  return `workspace/${kind}/${branchId}`;
}

export function getWorkspaceBaselineKey(branchId: string, kind: WorkspaceDataKind): string {
  if (kind === "doc") {
    return `workspace/baseline/doc/${branchId}`;
  }
  return `workspace/baseline/${kind}/${branchId}`;
}

export function snapshotLiveKeysForBranch(
  branchId: string,
  snapshot: WorkspaceSnapshot
): Array<{ key: string; value: string }> {
  return [
    { key: getWorkspaceLiveKey(branchId, "doc"), value: snapshot.doc },
    { key: getWorkspaceLiveKey(branchId, "nodes"), value: JSON.stringify(snapshot.nodes) },
    { key: getWorkspaceLiveKey(branchId, "edges"), value: JSON.stringify(snapshot.edges) },
    { key: getWorkspaceLiveKey(branchId, "assets"), value: JSON.stringify(snapshot.assets) },
    { key: getWorkspaceLiveKey(branchId, "annotations"), value: JSON.stringify(snapshot.annotations) }
  ];
}

export function snapshotBaselineKeysForBranch(
  branchId: string,
  snapshot: WorkspaceSnapshot
): Array<{ key: string; value: string }> {
  return [
    { key: getWorkspaceBaselineKey(branchId, "doc"), value: snapshot.doc },
    { key: getWorkspaceBaselineKey(branchId, "nodes"), value: JSON.stringify(snapshot.nodes) },
    { key: getWorkspaceBaselineKey(branchId, "edges"), value: JSON.stringify(snapshot.edges) },
    { key: getWorkspaceBaselineKey(branchId, "assets"), value: JSON.stringify(snapshot.assets) },
    { key: getWorkspaceBaselineKey(branchId, "annotations"), value: JSON.stringify(snapshot.annotations) }
  ];
}

export function buildForkReplayOp(record: SharedBranchRecord): SharedReplayOp {
  const forkTime = new Date(record.createdAtIso).getTime();
  return {
    id: `${record.branchId}:fork:${forkTime}`,
    branchId: record.branchId,
    opSummary: `fork ${record.branchId} from ${record.basedOnBranchId ?? "root"}:${record.basedOnNodeId ?? "root"}`,
    payload: {
      type: "workspace.fork-branch",
      branch: record
    },
    payloadRef: "workspace.fork-branch",
    atIso: record.createdAtIso
  };
}

export function isForkBranchPayload(payload: unknown): payload is { type: "workspace.fork-branch"; branch: SharedBranchRecord } {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const typed = payload as { type?: unknown; branch?: unknown };
  if (typed.type !== "workspace.fork-branch" || !typed.branch || typeof typed.branch !== "object") {
    return false;
  }
  const branch = typed.branch as SharedBranchRecord;
  return typeof branch.branchId === "string" && typeof branch.roomId === "string" && typeof branch.label === "string";
}

export function replayBaselineForBranch(
  branchId: string,
  branchBaselineById: Record<string, WorkspaceSnapshot>
): WorkspaceSnapshot {
  if (branchId === "main") {
    return { doc: "", nodes: [], edges: [], assets: [], annotations: [] };
  }
  const baseline = branchBaselineById[branchId];
  if (!baseline) {
    return { doc: "", nodes: [], edges: [], assets: [], annotations: [] };
  }
  return {
    doc: baseline.doc,
    nodes: baseline.nodes.map((entry) => (typeof entry === "object" && entry ? { ...entry } : entry)),
    edges: baseline.edges.map((entry) => (typeof entry === "object" && entry ? { ...entry } : entry)),
    assets: baseline.assets.map((entry) => (typeof entry === "object" && entry ? { ...entry } : entry)),
    annotations: baseline.annotations.map((entry) => (typeof entry === "object" && entry ? { ...entry } : entry))
  };
}
