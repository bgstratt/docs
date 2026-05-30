# Slice next: host-composition runtime handling

## Goal

Replace basic runtime stub behavior with composition-backed host wiring and a room-aware websocket runtime broker from package-mode host app in this repo.

## Delivered in this slice

1. Host provider composition is now active in the demo host:
   - `builder.Services.AddNodalMergeHostProviders(builder.Configuration)`
2. Provider resolution visibility endpoint:
   - `GET /api/host/providers`
3. Runtime room broker service handling:
   - `GET /ws/runtime`
   - `GET /ws/{roomId}`
4. Multi-peer runtime behavior:
   - `hello` handshake -> `welcome`
   - `peer-joined` / `peer-left` broadcasts
   - relay path for `to`-addressed messages
   - `presence-set` broadcast path

## Evidence

- Host build passes in package mode (`NodalMergePackageVersion=0.1.0-local`).
- Host provider endpoint shows composition-backed provider bindings, for example:
  - node store: `InMemoryNodeStoreProvider`
  - blob store: `WsOnlyBlobStoreProvider`
  - auth provider: `DefaultRoomTokenAuthProvider`
- Host runtime endpoints run from this repo without direct source project references.

## Important caveat

- Node-only SDK smoke still fails due to browser-oriented WASM initialization path in `nodalmerge-bridge`.
- This is not a host runtime failure.
- SDK/WASM validation remains browser integration + build artifact based.

## Next recommended slice

1. Add browser automation or manual scripted browser smoke for SDK room connect and welcome event.
2. Expand runtime message handling toward command families used by demo apps.
3. Optionally migrate from custom runtime broker service toward packaged `NodalMerge.DotNetHost` runtime stack once that package is available as a local artifact.

