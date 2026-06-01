import { getWorkspaceLiveKey } from "./workspaceBaselines";
import type { SharedReplayOp } from "./workspaceBaselines";
import { readReplayOpsFromShared } from "./workspaceReplayStorage";

export type WorkspaceNodeRecord = {
  id: string;
  x: number;
  y: number;
  label: string;
  updatedAtIso: string;
};

type SharedReader = (key: string, options?: { preferCanonical?: boolean }) => string | null;
type SharedKeyLister = (prefix: string) => string[];

export function getLegacyNodesBlobKey(branchId: string): string {
  return getWorkspaceLiveKey(branchId, "nodes");
}

/** @deprecated Prefer per-node member keys; kept for read fallback. */
export function getNodeIndexKey(branchId: string): string {
  return `workspace/nodes/${branchId}/index`;
}

export function getNodeRecordKey(branchId: string, nodeId: string): string {
  return `workspace/node/${branchId}/${nodeId}`;
}

export function getNodeRecordKeyPrefix(branchId: string): string {
  return `workspace/node/${branchId}/`;
}

export function getNodeMemberKey(branchId: string, nodeId: string): string {
  return `workspace/node-member/${branchId}/${nodeId}`;
}

export function getNodeMemberKeyPrefix(branchId: string): string {
  return `workspace/node-member/${branchId}/`;
}

export function parseNodeIndex(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  } catch {
    return [];
  }
}

export function parseNodeRecord(raw: string | null): WorkspaceNodeRecord | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as WorkspaceNodeRecord).id !== "string" ||
      typeof (parsed as WorkspaceNodeRecord).label !== "string" ||
      typeof (parsed as WorkspaceNodeRecord).x !== "number" ||
      typeof (parsed as WorkspaceNodeRecord).y !== "number" ||
      typeof (parsed as WorkspaceNodeRecord).updatedAtIso !== "string"
    ) {
      return null;
    }
    return parsed as WorkspaceNodeRecord;
  } catch {
    return null;
  }
}

export function parseLegacyNodesBlob(raw: string | null): WorkspaceNodeRecord[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => parseNodeRecord(JSON.stringify(entry)))
      .filter((entry): entry is WorkspaceNodeRecord => Boolean(entry));
  } catch {
    return [];
  }
}

export function nodeIdsFromReplayOps(ops: SharedReplayOp[]): string[] {
  const ids: string[] = [];
  for (const op of ops) {
    const payload = op.payload;
    if (!payload || typeof payload !== "object") {
      continue;
    }
    if (payload.type === "workspace.add-node") {
      const embedded = (payload as { node?: { id?: unknown }; nodeId?: unknown }).node;
      const nodeId = (payload as { nodeId?: unknown }).nodeId;
      if (typeof nodeId === "string" && nodeId.length > 0) {
        ids.push(nodeId);
      } else if (embedded && typeof embedded === "object" && typeof embedded.id === "string") {
        ids.push(embedded.id);
      }
    }
  }
  return ids;
}

export function readWorkspaceNodesFromReplayOpIds(
  branchId: string,
  nodeIds: string[],
  readShared: SharedReader
): WorkspaceNodeRecord[] {
  const nodes: WorkspaceNodeRecord[] = [];
  for (const nodeId of nodeIds) {
    const record = parseNodeRecord(readShared(getNodeRecordKey(branchId, nodeId)));
    if (record) {
      nodes.push(record);
    }
  }
  return nodes;
}

export function readWorkspaceNodesFromShared(
  branchId: string,
  readShared: SharedReader,
  listKeys: SharedKeyLister
): WorkspaceNodeRecord[] {
  const replayOps = readReplayOpsFromShared(branchId, readShared, listKeys);
  const replayIds = nodeIdsFromReplayOps(replayOps);

  const recordPrefix = getNodeRecordKeyPrefix(branchId);
  const recordKeys = listKeys(recordPrefix);
  if (recordKeys.length > 0) {
    const nodes: WorkspaceNodeRecord[] = [];
    for (const key of recordKeys) {
      const record = parseNodeRecord(readShared(key));
      if (record) {
        nodes.push(record);
      }
    }
    if (nodes.length > 0) {
      return nodes;
    }
  }

  const memberPrefix = getNodeMemberKeyPrefix(branchId);
  const memberKeys = listKeys(memberPrefix);
  const memberIds = memberKeys
    .map((key) => key.slice(memberPrefix.length))
    .filter((nodeId) => nodeId.length > 0);

  const orderedIds =
    memberIds.length > 0 ? memberIds : replayIds.length > 0 ? replayIds : parseNodeIndex(readShared(getNodeIndexKey(branchId)));

  if (orderedIds.length > 0) {
    const nodes = readWorkspaceNodesFromReplayOpIds(branchId, orderedIds, readShared);
    if (nodes.length > 0) {
      return nodes;
    }
  }

  return parseLegacyNodesBlob(readShared(getLegacyNodesBlobKey(branchId)));
}

export function buildSeedBranchNodesWriteEntries(
  branchId: string,
  nodes: WorkspaceNodeRecord[]
): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const node of nodes) {
    entries.push(...buildAddNodeWriteEntries(branchId, node));
  }
  return entries;
}

export function buildAddNodeWriteEntries(
  branchId: string,
  node: WorkspaceNodeRecord,
  extraWriteEntries: Array<{ key: string; value: string }> = []
): Array<{ key: string; value: string }> {
  return [
    { key: getNodeRecordKey(branchId, node.id), value: JSON.stringify(node) },
    { key: getNodeMemberKey(branchId, node.id), value: "1" },
    ...extraWriteEntries
  ];
}

export function buildMoveNodeWriteEntries(
  branchId: string,
  node: WorkspaceNodeRecord,
  extraWriteEntries: Array<{ key: string; value: string }> = []
): Array<{ key: string; value: string }> {
  return [{ key: getNodeRecordKey(branchId, node.id), value: JSON.stringify(node) }, ...extraWriteEntries];
}

export function buildClearNodesWriteEntries(
  branchId: string,
  nodeIds: string[],
  extraWriteEntries: Array<{ key: string; value: string }> = []
): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [...extraWriteEntries];
  for (const nodeId of nodeIds) {
    entries.push({ key: getNodeRecordKey(branchId, nodeId), value: "" });
    entries.push({ key: getNodeMemberKey(branchId, nodeId), value: "" });
  }
  return entries;
}

/** Legacy keys that cause multi-megabyte cumulative packs when left in the local DAG. */
export function getLegacyWorkspaceKeysToRetire(branchId: string): string[] {
  return [
    getLegacyNodesBlobKey(branchId),
    getNodeIndexKey(branchId),
    "workspace/replay-ops",
    `workspace/replay-op-index/${branchId}`
  ];
}
