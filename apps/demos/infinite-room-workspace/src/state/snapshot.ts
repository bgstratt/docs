// Workspace snapshot helpers. Extracted verbatim from App.tsx during the
// module split.

import type { WorkspaceSnapshot } from "./workspaceTypes";

export function emptyWorkspaceSnapshot(): WorkspaceSnapshot {
  return { doc: "", nodes: [], edges: [], assets: [], annotations: [] };
}

export function cloneWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    doc: snapshot.doc,
    nodes: snapshot.nodes.map((entry) => ({ ...entry })),
    edges: snapshot.edges.map((entry) => ({ ...entry })),
    assets: snapshot.assets.map((entry) => ({ ...entry })),
    annotations: snapshot.annotations.map((entry) => ({ ...entry }))
  };
}

export function hasWorkspaceSnapshotContent(snapshot: WorkspaceSnapshot): boolean {
  return (
    snapshot.doc.trim().length > 0 ||
    snapshot.nodes.length > 0 ||
    snapshot.edges.length > 0 ||
    snapshot.assets.length > 0 ||
    snapshot.annotations.length > 0
  );
}
