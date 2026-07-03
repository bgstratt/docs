# Infinite room workspace demo

## Purpose

Flagship demo of NodalMerge's DAG model: a spatial multiplayer workspace with
full branch / replay / merge visualization on top of shared CRDT state.

Features (all live):

- **Workspace objects** — draggable nodes, shift-click edge connect,
  click-to-annotate mode, and shared assets, each persisted under per-object
  sync keys (`workspace/node/{branchId}/{nodeId}`, …).
- **Branches + replay DAG** — branch from any replay cursor position, merge a
  source branch node into the active head, and watch the branch-lane
  visualization render divergence (dashed purple), merges (orange), HEAD /
  MERGE markers, and remote peers' replay cursors (dashed orange rings).
- **Timeline scrubbing** — quick-scrub bar over the canvas plus a full
  timeline with play/pause, prev/next, and a "room at cursor" op inspector
  (lamport, author, payload JSON).
- **Presence** — display-name publishing, online peer roster, targeted peer
  signaling, and live remote-drag ghosts.
- **Touch support** — canvas interactions use Pointer Events, so drag /
  annotate work with touch and pen as well as mouse.

## Module layout

- `src/App.tsx` — app shell: connection lifecycle, branch write-routing, and
  state orchestration.
- `src/state/` — workspace domain types and snapshot helpers.
- `src/features/canvas/WorkspaceCanvas.tsx` — the spatial board.
- `src/features/replay/ReplayControls.tsx` + `ReplayLanes.tsx` — replay
  controls and the branch-lane DAG SVG.
- `src/panels/PresencePanel.tsx` — presence/signaling/diagnostics column.
- `src/lib/` — tested pure logic: `branchReplay.ts` (reducer/DAG model),
  `replayLayout.ts` (lane geometry), `workspaceNodeStorage.ts`,
  `workspaceReplayStorage.ts`, `workspaceBaselines.ts`, `writeRouting.ts`.
- Runtime adapter: `src/lib/sdkRuntimeClient.ts` over `nodalmerge-sdk-js`
  (also consumed by the collab-text playground).

## Runtime modes

- **npm sdk + wasm** (default) — full editing: local WASM CRDT store synced
  to the demo host. Required for all writes.
- **direct websocket** — diagnostics-only observation of the wire protocol;
  editing is disabled with an explanatory banner.

## Config contract

- `VITE_HOST_BASE_URL` (default `http://localhost:5074`)
- `VITE_WS_BASE_URL` (derived from host base URL if unset)
- `VITE_DEFAULT_ROOM_ID` (default `demo-room`)
- `VITE_TOKEN_MODE` (`none` | `static` | `provider`)
- `VITE_TRANSPORT_MODE` (`ws-only` | `auto`)

## Run locally

1. Start the demo host on `localhost:5074`
   (`apps/hosts/nodalmerge-demo-host`), or set `VITE_HOST_BASE_URL`.
2. In this folder:
   - `npm run install:local-sdk` (installs sibling `nodalmerge` package
     tarballs: `nodalmerge-bridge`, `nodalmerge-sdk-js`)
   - `npm install`
   - `npm run dev`
3. Open the printed Vite URL in two tabs and connect both to the same room.

## Verification checklist

- Two tabs: concurrent node drags converge; remote drags render as ghosts.
- Branch from cursor → edit → merge into active head shows correct lane
  connectors (divergence + merge) in both tabs.
- Replay scrub in one tab shows a remote cursor ring in the other.
- Touch drag works in devtools device emulation.
- `npx vitest run` — branchReplay / replayLayout / workspaceBaselines /
  writeRouting suites stay green.
