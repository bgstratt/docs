# Infinite room workspace demo

## Purpose

This app is the first flagship demo surface for the docs-site platform expansion.

Phase A Slice 1 status:

- Baseline scaffold and contract docs in place
- Runtime wiring intentionally minimal and deterministic
- Collaboration feature porting lands in follow-up slices

## Baseline behavior

The baseline demo should provide:

1. Room-centric startup flow
2. NodalMerge runtime connection using shared adapter contract
3. Minimal diagnostics panel (connection, transport, last error/close, recent events)
4. Workspace placeholder shell for upcoming feature ports

## Config contract (v0)

Expected settings:

- `VITE_HOST_BASE_URL` (default `http://localhost:5074`)
- `VITE_WS_BASE_URL` (derived from host base URL if unset)
- `VITE_DEFAULT_ROOM_ID` (default `demo-room`)
- `VITE_TOKEN_MODE` (`none` | `static` | `provider`)
- `VITE_TRANSPORT_MODE` (`ws-only` | `auto`)

## Run locally

1. Start your runtime host/server on `localhost:5074` (or set `VITE_HOST_BASE_URL`)
2. In this folder:
   - `npm install`
   - `npm run dev`
3. Open the printed Vite URL and connect to a room id

## Package-mode SDK/WASM integration

To install local package artifacts from sibling `nodalmerge`:

```powershell
npm run install:local-sdk
```

This installs:

- `nodalmerge-bridge-*.tgz`
- `nodalmerge-sdk-js-*.tgz`

After install, choose **runtime mode = `npm sdk + wasm`** in the app UI.

## Current implementation notes

- Runtime adapter supports two modes:
  - direct websocket baseline
  - npm SDK/WASM package mode (`nodalmerge-sdk-js`)
- Diagnostics panel is the contract anchor for future slices.
- Workspace panel is a placeholder for the first interaction port.

## Verification checklist

- App boots with default config
- Room id can be changed and reconnection is visible
- Diagnostics panel reflects open/close/error transitions
- Failures are surfaced without crashing the app shell

## Next implementation slice

- Port core room workspace interaction path from tactical showcase matrix
- Replace placeholder workspace panel with first interactive collaborative action
