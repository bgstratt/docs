import type { SharedReplayOp } from "./workspaceBaselines";

export const LEGACY_REPLAY_OPS_KEY = "workspace/replay-ops";

type SharedReader = (key: string, options?: { preferCanonical?: boolean }) => string | null;
type SharedKeyLister = (prefix: string) => string[];

export function getReplayOpIndexKey(branchId: string): string {
  return `workspace/replay-op-index/${branchId}`;
}

export function getReplayOpRecordKey(branchId: string, opId: string): string {
  return `workspace/replay-op/${branchId}/${opId}`;
}

export function getReplayOpKeyPrefix(branchId: string): string {
  return `workspace/replay-op/${branchId}/`;
}

export const ALL_REPLAY_OP_KEY_PREFIX = "workspace/replay-op/";

export function readAllReplayOpsFromShared(
  readShared: SharedReader,
  listKeys: SharedKeyLister
): SharedReplayOp[] {
  const keys = listKeys(ALL_REPLAY_OP_KEY_PREFIX);
  if (keys.length > 0) {
    const ops: SharedReplayOp[] = [];
    for (const key of keys) {
      const op = parseReplayOpRecord(readShared(key));
      if (op) {
        ops.push(op);
      }
    }
    if (ops.length > 0) {
      return ops.sort((left, right) => left.atIso.localeCompare(right.atIso));
    }
  }

  return parseLegacyReplayOpsBlob(readShared(LEGACY_REPLAY_OPS_KEY));
}

export function parseReplayOpIndex(raw: string | null): string[] {
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

export function parseReplayOpRecord(raw: string | null): SharedReplayOp | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as SharedReplayOp).id !== "string" ||
      typeof (parsed as SharedReplayOp).branchId !== "string" ||
      typeof (parsed as SharedReplayOp).opSummary !== "string" ||
      typeof (parsed as SharedReplayOp).payloadRef !== "string" ||
      typeof (parsed as SharedReplayOp).atIso !== "string" ||
      typeof (parsed as SharedReplayOp).payload !== "object" ||
      !(parsed as SharedReplayOp).payload
    ) {
      return null;
    }
    return parsed as SharedReplayOp;
  } catch {
    return null;
  }
}

export function parseLegacyReplayOpsBlob(raw: string | null): SharedReplayOp[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => parseReplayOpRecord(JSON.stringify(entry)))
      .filter((entry): entry is SharedReplayOp => Boolean(entry))
      .sort((left, right) => left.atIso.localeCompare(right.atIso));
  } catch {
    return [];
  }
}

export function readReplayOpsFromShared(
  branchId: string,
  readShared: SharedReader,
  listKeys: SharedKeyLister
): SharedReplayOp[] {
  const prefix = getReplayOpKeyPrefix(branchId);
  const opKeys = listKeys(prefix);
  if (opKeys.length > 0) {
    const ops: SharedReplayOp[] = [];
    for (const key of opKeys) {
      const op = parseReplayOpRecord(readShared(key));
      if (op) {
        ops.push(op);
      }
    }
    if (ops.length > 0) {
      return ops.sort((left, right) => left.atIso.localeCompare(right.atIso));
    }
  }

  const indexIds = parseReplayOpIndex(readShared(getReplayOpIndexKey(branchId)));
  if (indexIds.length > 0) {
    const ops: SharedReplayOp[] = [];
    for (const opId of indexIds) {
      const op = parseReplayOpRecord(readShared(getReplayOpRecordKey(branchId, opId)));
      if (op) {
        ops.push(op);
      }
    }
    if (ops.length > 0) {
      return ops.sort((left, right) => left.atIso.localeCompare(right.atIso));
    }
  }

  return parseLegacyReplayOpsBlob(readShared(LEGACY_REPLAY_OPS_KEY));
}

export function buildAppendReplayOpWriteEntries(
  branchId: string,
  op: SharedReplayOp
): Array<{ key: string; value: string }> {
  return [{ key: getReplayOpRecordKey(branchId, op.id), value: JSON.stringify(op) }];
}
