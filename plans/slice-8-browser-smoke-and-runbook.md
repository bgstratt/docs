# Slice 8 browser smoke and runbook

## Goal

Establish a repeatable browser runtime smoke test for the package-mode setup:

1. host (`apps/hosts/nodalmerge-demo-host`) in NuGet package mode
2. app (`apps/demos/infinite-room-workspace`) in `npm sdk + wasm` mode
3. runtime connect path with observable welcome/peer lifecycle events

## Prerequisites

1. Local artifacts built in sibling `nodalmerge` repository:
   - NuGet packages in `artifacts/package-local/nuget`
   - npm packages in `artifacts/package-local/npm`
2. Local SDK packages installed in `infinite-room-workspace`:
   - `npm run install:local-sdk`
3. No stale process on host port `5074`.

## Smoke run steps

1. Start host:
   - `cd apps/hosts/nodalmerge-demo-host`
   - `dotnet run --project .\NodalMerge.DemoHost.csproj -p:NodalMergePackageVersion=0.1.0-local`
2. Verify host health:
   - `GET http://127.0.0.1:5074/api/host/health` -> `status=ok`
3. Start demo app:
   - `cd apps/demos/infinite-room-workspace`
   - `npm run dev`
4. In browser, open app and set:
   - runtime mode = `npm sdk + wasm`
   - room id = any deterministic value (for example `demo-room`)
5. Click **Connect** and confirm diagnostics panel includes:
   - connection state `open`
   - sdk lifecycle events
   - inbound runtime event(s) such as `welcome` and/or peer lifecycle events
6. Execute shared-document action:
   - edit `workspace/doc/main`
   - click **Apply shared document**
   - verify success message and applied value
7. Execute presence and peer signal checks (two browser windows):
   - publish presence in each window
   - verify peer appears in online list
   - send a peer signal and verify inbound signal status in target window

## Expected results

- SDK/WASM connects without blocking errors.
- Diagnostics show active runtime event flow.
- Shared document action succeeds in sdk mode and is reflected in UI state.

## Troubleshooting

- If sdk mode fails while direct websocket succeeds:
  - reinstall local npm artifacts via `npm run install:local-sdk`
  - restart app dev server to clear module cache
- If host fails to start:
  - ensure no stale `NodalMerge.DemoHost` process is locking binaries
- If wasm warning appears:
  - hard refresh browser and confirm app is running from current dev server build
  - verify sdk runtime path is using explicit `wasmModule` asset URL in app code
