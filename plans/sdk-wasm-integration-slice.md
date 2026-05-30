# SDK + WASM integration slice

## Goal

Add package-mode JavaScript runtime integration in this repo using:

- `nodalmerge-sdk-js`
- `nodalmerge-bridge`

No direct source dependency into sibling `nodalmerge` implementation folders.

## Package prerequisites

Build local npm artifacts from sibling `nodalmerge` repo:

```powershell
cd C:\Users\bgstr\source\repos\nodalmerge
pwsh -File .\pack-local-artifacts.ps1 -Version 0.1.0-local -SkipNuGet -SkipCrates
```

Expected output:

- `C:\Users\bgstr\source\repos\nodalmerge\artifacts\package-local\npm`

## Installation shape (example)

Inside each app surface:

```powershell
npm install C:\Users\bgstr\source\repos\nodalmerge\artifacts\package-local\npm\nodalmerge-bridge-0.1.0.tgz
npm install C:\Users\bgstr\source\repos\nodalmerge\artifacts\package-local\npm\nodalmerge-sdk-js-0.1.0.tgz
```

## Integration contract

1. Create SDK via `createNodalMergeSdk(...)`
2. Connect room via `sdk.room.connect()`
3. Keep shared diagnostics panel fed by runtime lifecycle events
4. Keep transport mode configurable (`ws-only` / `auto`)
5. Keep package versions explicit for reproducible demo runs

## Acceptance criteria

- App boots with SDK package imports resolved
- Room connect path works against local host/server
- Diagnostics panel shows connect/error/close states
- Build succeeds without local source references into `nodalmerge`

