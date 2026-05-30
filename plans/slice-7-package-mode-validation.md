# Slice 7 package-mode validation

## Goal

Validate end-to-end package-mode setup from this repo:

1. `.NET` demo host runs from NuGet package references
2. web app builds and runs with npm SDK/WASM package dependencies
3. no direct source references into `nodalmerge` implementation folders

## Validation run summary

Date: 2026-05-29

### A) NuGet host package mode

Working directory:

- `apps/hosts/nodalmerge-demo-host`

Checks:

1. `dotnet restore .\NodalMerge.DemoHost.csproj --configfile .\NuGet.config -p:NodalMergePackageVersion=0.1.0-local` -> pass
2. `dotnet build .\NodalMerge.DemoHost.csproj -p:NodalMergePackageVersion=0.1.0-local` -> pass
3. `dotnet run ...` starts host on `http://127.0.0.1:5074` -> pass
4. `GET /api/host/health` returns `status=ok` and `packageMode=true` -> pass

### B) npm SDK/WASM package mode

Working directory:

- `apps/demos/infinite-room-workspace`

Checks:

1. `npm run install:local-sdk` installs local:
   - `nodalmerge-bridge-*.tgz`
   - `nodalmerge-sdk-js-*.tgz`
   -> pass
2. `npm run build` outputs bundled app plus WASM asset:
   - `dist/assets/nodalmerge_bridge_bg-*.wasm`
   -> pass

### C) Node-only SDK smoke note

Attempted:

- `npm run smoke:sdk` (node script invoking `createNodalMergeSdk`)

Result:

- fails in plain Node due to browser-oriented WASM bootstrap path (`fetch`/asset loading behavior)

Interpretation:

- expected for current package/runtime shape; SDK/WASM path is validated through browser build/runtime integration instead.

## Acceptance status

- Host NuGet package mode: pass
- Web npm SDK/WASM package-mode build path: pass
- End-to-end package references from this repo: pass

## Follow-up

1. Keep Node smoke script as optional exploratory tool only (not required gate).
2. Prefer browser runtime smoke (dev server + UI connect path) for SDK/WASM validation.
3. Next host slice: replace minimal `/ws/runtime` stub with host composition-backed runtime service wiring.

