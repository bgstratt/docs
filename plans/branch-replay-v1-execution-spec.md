---
title: Branch replay v1 execution spec
description: Concrete implementation plan for visual branch replay, playback/live semantics, and head-target merge behavior in infinite room workspace.
---

# Branch replay v1 execution spec

## Scope decisions (confirmed)

This spec captures the agreed v1 behavior:

1. Source merge node can be non-head.
2. Merge target must be target branch head.
3. One source node per merge action.
4. Nodes are immutable and append-only.
5. In playback mode (not live), editing creates a new branch room from the selected historical node.
6. In live mode at branch head, editing appends normally to that active branch.

## Product goals

Build a visual branch replay experience in `apps/demos/infinite-room-workspace` where users can:

- See stream lanes connect, diverge, and reconnect.
- Scrub node-by-node and have room state follow cursor exactly.
- Branch from history explicitly (or automatically on playback edit).
- Merge a selected source node into target head with clear validation.

## V1 non-goals

- Multi-source merge in one action.
- Arbitrary target merge into non-head node.
- Full conflict-resolution editor in UI.
- Core protocol/schema changes in this slice (demo/app layer only).

## Architecture boundary

V1 implementation is app-layer and demo-layer only.

- Keep branch replay data model and control flow under `apps/demos/infinite-room-workspace`.
- Use existing runtime/sdk capabilities; do not require core engine changes for v1 UX semantics.
- Add local adapter contracts so migration to direct topology/merge commands later is straightforward.

## Data contract (app layer)

IDs alone are not enough for deterministic rendering and safe validation in UI. V1 contract should include explicit metadata fields:

### Replay node

```ts
type ReplayNode = {
  nodeId: string;
  roomId: string;
  branchId: string;
  parentIds: string[];
  lamport: number | null;
  author: string | null;
  atIso: string;
  opSummary: string;
  payloadRef?: string;
};
```

### Branch stream

```ts
type BranchStream = {
  branchId: string;
  roomId: string;
  label: string;
  rootNodeId: string;
  headNodeId: string | null;
  basedOnBranchId: string | null;
  basedOnNodeId: string | null;
  isMain: boolean;
};
```

### Merge record (visual + audit)

```ts
type MergeRecord = {
  mergeNodeId: string;
  sourceBranchId: string;
  sourceNodeId: string;
  targetBranchId: string;
  targetPrevHeadNodeId: string;
  targetNextHeadNodeId: string;
  atIso: string;
};
```

### Replay cursor + mode

```ts
type ReplayMode = "live" | "playback";

type ReplayCursor = {
  mode: ReplayMode;
  branchId: string;
  nodeIndex: number;
  nodeId: string | null;
};
```

### Tie-break and ordering

For rendering and deterministic sequencing in app UX:

1. Primary: lamport ascending (if present).
2. Secondary: author lexicographic.
3. Tertiary: nodeId lexicographic.

This mirrors product semantics expectations while remaining stable in UI.

## Operation contract (v1)

### Create branch from checkpoint

Triggered by:

- clicking "Create branch from current node", or
- making an edit while `cursor.mode === "playback"`.

Request shape:

```ts
type CreateBranchFromCheckpoint = {
  sourceBranchId: string;
  sourceNodeId: string;
  newBranchLabel: string;
  reason: "manual" | "playback-edit";
};
```

Result:

- New branch/room stream with `rootNodeId = sourceNodeId`.
- Cursor switches to new branch in `live` mode at new head.

### Append node to branch

Triggered by normal edits in `live` mode.

Request shape:

```ts
type AppendNode = {
  branchId: string;
  roomId: string;
  editPayload: Record<string, unknown>;
};
```

Behavior:

- If at branch head in live mode -> append.
- If not at head or in playback -> route through branch-from-checkpoint first.

### Merge source node into target head

Request shape:

```ts
type MergeIntoHead = {
  sourceBranchId: string;
  sourceNodeId: string;
  targetBranchId: string;
  targetHeadNodeId: string;
};
```

Validation:

- `target_not_head`
- `source_not_found`
- `target_not_found`
- `already_merged_or_ancestor`
- `source_equals_target`

Result:

- New target merge node appended at target head.
- Merge record emitted for graph overlay.

## UI interaction spec (v1)

### Core panels

1. Branch graph panel (connect/diverge/merge arcs).
2. Timeline scrub panel (nodes for selected branch).
3. Room-at-cursor panel (state follows cursor).
4. Branch/merge control panel.

### Playback and live semantics

- **Live mode**: appends normal edits to active branch head.
- **Playback mode**: edits do not mutate history; editing auto-creates branch/new room from selected node and switches to live on new branch.
- Display explicit mode badge at all times.

### Click/scrub/play behavior

- Click graph lane -> jump cursor to nearest node on that lane.
- Scrub slider -> step previous/next node and update room snapshot.
- Play:
  - if on main branch, play along main branch.
  - if on alternate branch, play sequentially on that branch from current cursor.
- Pause retains exact cursor node.

### Merge UX

- Source branch dropdown + source node picker.
- Target branch fixed to selected target, merge target node fixed to current target head.
- Action button: `Merge into <targetLabel> head`.
- Inline validation and disabled states for invalid actions.

## Rendering and replay rules

- Room panel renders state at cursor using checkpoint + replay.
- Full replay fallback when checkpoint path unavailable.
- Cursor movement is single source of truth for graph highlight + room content + metadata panel.
- Show node metadata: `nodeId`, branch, lamport, author, op summary.

## Acceptance criteria

1. Playback edit auto-branches and does not mutate historical node.
2. Live edit appends at active branch head.
3. Non-head source merge into current target head succeeds and creates a new merge node.
4. Attempt to merge into non-head target is blocked with clear error.
5. After merge, subsequent merge targets new head.
6. Graph clearly shows fork and merge arcs.
7. Scrubbing updates room content deterministically node-to-node.
8. Play mode respects active branch lane behavior.

## Implementation slices

### Slice 1: replay model + deterministic cursor

- Add app-layer contracts and reducer/state store.
- Implement stable ordering and node index mapping per branch.
- Wire minimal replay panel in `infinite-room-workspace` to prove:
  - mode toggle (`live`/`playback`)
  - deterministic cursor navigation (`prev`/`next`)
  - ordered node capture from runtime message stream

### Slice 2: visual graph + timeline + room-follow

- Add branch graph lane component.
- Add timeline slider and node chips.
- Wire room state rendering to cursor updates.

### Slice 3: playback edit -> auto branch

- Add branch creation action/button.
- Add playback-edit interception and automatic branch/new room creation.
- Switch mode to live on new branch head after auto-branch.

### Slice 4: merge into head flow

- Add merge form.
- Add validation rules and merge record rendering.
- Append merge node and update target head.

### Slice 5: polish and test pass

- Improve status text and error UX.
- Add scenario fixtures and manual test checklist.
- Update docs and runbook references.

## Open items for later (post-v1)

- Multi-source merge in one action.
- Advanced as-of/cherry-pick merge semantics.
- Direct wiring to topology-specific commands once promoted from app-layer abstraction.
