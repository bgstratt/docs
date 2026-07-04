# Collab maps demo

## Purpose

Shared, spatial collaboration on the NodalMerge CRDT using the high-level
`createDoc` API (`nodalmerge-sdk-js/doc`).

- Each pin is its own replicated LWW key: `maps/pin/<id>` — concurrent adds,
  deletes, and edits from any number of peers converge (no whole-board
  clobbering; the earlier single-blob `maps/pins` key is retired).
- Live re-render via `doc.map("maps/pin").onChange(...)`, with a highlight
  ring on remotely-arriving pins.
- Real presence roster (`doc.presence`) — peer chips show who is in the room,
  not a join/leave counter heuristic.
- Responsive 16:9 board with normalized pin coordinates (`nx, ny ∈ [0,1]`).
- Per-pin delete (click a pin → popover), share links (`?room=<id>`), and
  offline-first behavior: pins apply to the local WASM store while
  disconnected and sync on reconnect.

Shared runtime wiring lives in `shared/sdk/` (`createDemoDoc`,
`diagnosticsAdapter`); app-specific state is `src/lib/mapsStore.ts`.

## Run locally

1. Start the demo host on `http://127.0.0.1:5074`
   (`apps/hosts/nodalmerge-demo-host`).
2. In this folder:
   - `npm install` (also run `npm install` once at the repo root — the
     `shared/` layer resolves the nodalmerge packages from there)
   - `npm run dev`
3. Open the printed Vite URL in two tabs (or send a share link).

## Validation checklist

- Two tabs, same room: pins added concurrently in both tabs all survive.
- Deleting a pin in one tab removes it in the other.
- Resizing the window keeps pins at their relative positions.
- Peer chips match the number of open tabs; names update live.
- Kill the host mid-session: pins keep applying locally; restart the host and
  reconnect — local pins push back up. (Note: the shared board itself resets
  when the host restarts; storage is in-memory.)
