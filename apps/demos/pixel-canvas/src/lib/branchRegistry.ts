// branchRegistry — shared records describing the branch family of a board.
// Records live in the ROOT room's doc under the `branch` namespace (key =
// branch room id), so every family member sees the same lineage regardless
// of which room they're viewing. The fork position is stored as
// (lamport, nodeId) — stable under late-arriving history — plus the event
// index at branch time as a display fallback.

import type { Doc } from "nodalmerge-sdk-js/doc";

export const BRANCH_NAMESPACE = "branch";

export interface BranchRecord {
  roomId: string;
  parentRoomId: string;
  forkIndex: number;
  forkLamport: number | null;
  forkNodeId: string | null;
  createdAtIso: string;
}

export function parseBranchRecord(raw: unknown): BranchRecord | null {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as BranchRecord;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.roomId !== "string" ||
      typeof parsed.parentRoomId !== "string" ||
      typeof parsed.forkIndex !== "number" ||
      typeof parsed.createdAtIso !== "string"
    ) {
      return null;
    }
    return {
      ...parsed,
      forkLamport: typeof parsed.forkLamport === "number" ? parsed.forkLamport : null,
      forkNodeId: typeof parsed.forkNodeId === "string" ? parsed.forkNodeId : null
    };
  } catch {
    return null;
  }
}

/** All branch records in the registry doc, oldest first. */
export function readBranchRecords(registryDoc: Doc): BranchRecord[] {
  const all = registryDoc.map(BRANCH_NAMESPACE).all();
  const records: BranchRecord[] = [];
  for (const value of Object.values(all)) {
    const record = parseBranchRecord(value);
    if (record) {
      records.push(record);
    }
  }
  records.sort((left, right) => left.createdAtIso.localeCompare(right.createdAtIso));
  return records;
}

export function writeBranchRecord(registryDoc: Doc, record: BranchRecord): void {
  registryDoc.map(BRANCH_NAMESPACE).set(record.roomId, JSON.stringify(record));
}
