# Replay lab playground

## Purpose

This app is a second Phase A consumer that validates shared runtime wiring reuse.

It currently provides:

- Room connect/disconnect controls
- Shared diagnostics panel contract
- Replay snapshot capture with timeline cursor/range controls
- Protocol-linked checkpoint jump buttons (`welcome`, `pack/request`, blob, peer/presence, control)
- Protocol-inspector trace snippet import and replay correlation mapping
- Confidence-scored correlation heuristics (exact/raw, same-type nearest timestamp, unmatched diagnostics by type)

## Config contract (shared)

- `VITE_HOST_BASE_URL` (default `http://localhost:5074`)
- `VITE_WS_BASE_URL` (derived from host base URL if unset)
- `VITE_DEFAULT_ROOM_ID` (default `demo-room`)
- `VITE_TOKEN_MODE` (`none` | `static` | `provider`)
- `VITE_TRANSPORT_MODE` (`ws-only` | `auto`)

## Run locally

1. Start runtime host/server on `localhost:5074` (or set env override)
2. In this folder:
   - `npm install`
   - `npm run dev`
3. Open the printed Vite URL and connect to a room id

## Next slice

- Add branch-style replay exploration once deepen/hardening slices complete
