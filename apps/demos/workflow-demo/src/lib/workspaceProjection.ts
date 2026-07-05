// Pure replay-op projection: applies one parsed replay-op payload onto a
// workspace snapshot. Extracted verbatim from App.tsx's
// projectReplayWorkspaceSnapshotFor loop so the op semantics are unit-testable.

import type {
  WorkspaceAnnotation,
  WorkspaceAsset,
  WorkspaceEdge,
  WorkspaceNode,
  WorkspaceSnapshot
} from "../state/workspaceTypes";
import { NODE_SHAPES, WORKSPACE_HEIGHT, WORKSPACE_WIDTH } from "../state/workspaceTypes";

export type ResolveNodeRecord = (nodeId: string) => WorkspaceNode | null;

export function applyWorkspaceOpPayload(
  projected: WorkspaceSnapshot,
  payload: unknown,
  resolveNode: ResolveNodeRecord
): void {
  if (!payload || typeof payload !== "object") {
    return;
  }
  const typed = payload as {
    type?: unknown;
    node?: unknown;
    nodeId?: unknown;
    asset?: unknown;
    edge?: unknown;
    annotation?: unknown;
    move?: unknown;
    rename?: unknown;
    text?: unknown;
  };
  if (typed.type === "workspace.add-node") {
    let raw: WorkspaceNode | null = null;
    if (typed.node && typeof typed.node === "object") {
      raw = typed.node as WorkspaceNode;
    } else if (typeof typed.nodeId === "string") {
      raw = resolveNode(typed.nodeId);
    }
    if (
      raw &&
      typeof raw.id === "string" &&
      typeof raw.label === "string" &&
      typeof raw.x === "number" &&
      typeof raw.y === "number" &&
      typeof raw.updatedAtIso === "string"
    ) {
      const exists = projected.nodes.some((entry) => entry.id === raw.id);
      if (!exists) {
        const entry: WorkspaceNode = {
          ...raw,
          x: Math.max(16, Math.min(WORKSPACE_WIDTH - 120, raw.x)),
          y: Math.max(16, Math.min(WORKSPACE_HEIGHT - 52, raw.y))
        };
        if (entry.shape !== undefined && !NODE_SHAPES.includes(entry.shape)) {
          delete entry.shape;
        }
        projected.nodes.unshift(entry);
      }
    }
  }
  if (typed.type === "workspace.add-asset" && typed.asset && typeof typed.asset === "object") {
    const raw = typed.asset as WorkspaceAsset;
    if (
      typeof raw.id === "string" &&
      typeof raw.name === "string" &&
      typeof raw.x === "number" &&
      typeof raw.y === "number" &&
      typeof raw.updatedAtIso === "string"
    ) {
      const exists = projected.assets.some((entry) => entry.id === raw.id);
      if (!exists) {
        projected.assets.unshift({
          ...raw,
          x: Math.max(16, Math.min(WORKSPACE_WIDTH - 160, raw.x)),
          y: Math.max(16, Math.min(WORKSPACE_HEIGHT - 62, raw.y))
        });
      }
    }
  }
  if (typed.type === "workspace.add-edge" && typed.edge && typeof typed.edge === "object") {
    const edge = typed.edge as WorkspaceEdge;
    if (
      typeof edge.id === "string" &&
      typeof edge.fromNodeId === "string" &&
      typeof edge.toNodeId === "string" &&
      typeof edge.updatedAtIso === "string"
    ) {
      const exists = projected.edges.some((entry) => entry.id === edge.id);
      if (!exists) {
        projected.edges.unshift({ ...edge });
      }
    }
  }
  if (typed.type === "workspace.move-node" && typed.move && typeof typed.move === "object") {
    const move = typed.move as { nodeId?: unknown; x?: unknown; y?: unknown; updatedAtIso?: unknown };
    if (typeof move.nodeId === "string" && typeof move.x === "number" && typeof move.y === "number") {
      const nextX = move.x;
      const nextY = move.y;
      projected.nodes = projected.nodes.map((entry) =>
        entry.id === move.nodeId
          ? {
              ...entry,
              x: Math.max(16, Math.min(WORKSPACE_WIDTH - 120, nextX)),
              y: Math.max(16, Math.min(WORKSPACE_HEIGHT - 52, nextY)),
              updatedAtIso: typeof move.updatedAtIso === "string" ? move.updatedAtIso : entry.updatedAtIso
            }
          : entry
      );
    }
  }
  if (typed.type === "workspace.rename-node" && typed.rename && typeof typed.rename === "object") {
    const rename = typed.rename as { nodeId?: unknown; label?: unknown; updatedAtIso?: unknown };
    if (typeof rename.nodeId === "string" && typeof rename.label === "string") {
      const nextLabel = rename.label;
      projected.nodes = projected.nodes.map((entry) =>
        entry.id === rename.nodeId
          ? {
              ...entry,
              label: nextLabel,
              updatedAtIso: typeof rename.updatedAtIso === "string" ? rename.updatedAtIso : entry.updatedAtIso
            }
          : entry
      );
    }
  }
  if (typed.type === "workspace.add-annotation" && typed.annotation && typeof typed.annotation === "object") {
    const note = typed.annotation as WorkspaceAnnotation;
    if (
      typeof note.id === "string" &&
      typeof note.text === "string" &&
      typeof note.x === "number" &&
      typeof note.y === "number" &&
      typeof note.updatedAtIso === "string"
    ) {
      const exists = projected.annotations.some((entry) => entry.id === note.id);
      if (!exists) {
        projected.annotations.unshift({
          ...note,
          x: Math.max(16, Math.min(WORKSPACE_WIDTH - 180, note.x)),
          y: Math.max(16, Math.min(WORKSPACE_HEIGHT - 90, note.y))
        });
      }
    }
  }
  if (typed.type === "workspace.clear-assets") {
    projected.assets = [];
  }
  if (typed.type === "workspace.clear-annotations") {
    projected.annotations = [];
  }
  if (typed.type === "workspace.clear-edges") {
    projected.edges = [];
  }
  if (typed.type === "workspace.clear-nodes") {
    projected.nodes = [];
    projected.edges = [];
  }
}
