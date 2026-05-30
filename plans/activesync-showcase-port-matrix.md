# ActiveSync showcase port matrix

## Goal

Inventory `activesync-tactical-showcase`, map each candidate module into the `docs` repo sibling structure, and decide whether to keep, adapt, rebuild, or drop for NodalMerge.

## Target folders

- `apps/demos/infinite-room-workspace/`
- `apps/demos/collab-maps/`
- `apps/playground/protocol-inspector/`
- `apps/playground/replay-lab/`
- `shared/`

## Contract drift summary

Highest-risk drift points between current showcase and NodalMerge baseline:

- SDK/package branding and imports:
  - `activesync-sdk-js` -> `nodalmerge-sdk-js`
  - bridge package naming updates needed
- WebSocket path and handshake expectations:
  - showcase host centers around `/ws/runtime` and custom `/api/workspace/.../signal`
  - NodalMerge primary runtime path is `/ws/:room_id` with strict `hello` handshake flow
- Host API surface:
  - showcase uses many custom HTTP endpoints under `/api/*`
  - NodalMerge server is intentionally WS-first, with minimal HTTP routes
- Demo-specific control plane:
  - some scenario and replay helpers are showcase host features, not server-native contracts

## Port matrix

### `web-react/src/pages/RoomWorkspacePage.tsx`

- Decision: `adapt`
- Target: `apps/demos/infinite-room-workspace/`
- Why: strongest existing shared-room experience; already closest to real collaboration behavior
- Required changes:
  - swap ActiveSync SDK imports/options for NodalMerge SDK wrappers
  - move from showcase-specific signal/room endpoints to NodalMerge-compatible room connection flow
  - keep RTC/presence diagnostics, but align to NodalMerge message contracts

### `web-react/src/pages/InfiniteWorkspacePage.tsx`

- Decision: `adapt`
- Target: `apps/playground/replay-lab/`
- Why: useful educational offline/convergence simulator; good playground primitive
- Required changes:
  - rebrand and split from primary room-backed demo
  - connect replay narrative to NodalMerge terminology (speculative, authoritative, replay)

### `web-react/src/pages/TacticalStrategyPage.tsx`

- Decision: `adapt`
- Target: `apps/demos/collab-maps/`
- Why: high-value collaborative map interaction demo with clear operator narrative
- Required changes:
  - align host action endpoints and scenario plumbing to NodalMerge host composition layer
  - update terminology and docs links

### `web-react/src/pages/DungeonBuilderPage.tsx`

- Decision: `adapt`
- Target: `apps/demos/collab-maps/` (secondary mode)
- Why: good extension mode once primary collab map loop is stable
- Required changes:
  - same host/API alignment as tactical strategy
  - keep trigger-link mechanics if they map cleanly to NodalMerge model

### `web-react/src/pages/PixelSandboxPage.tsx`

- Decision: `adapt`
- Target: `apps/playground/protocol-inspector/` (stress panel) or `apps/demos/collab-maps/` (advanced mode)
- Why: useful for throughput/partition stress visibility
- Required changes:
  - keep burst instrumentation
  - map benchmark wording to NodalMerge performance docs

### `web-react/src/pages/CardBattlePage.tsx`

- Decision: `adapt`
- Target: `apps/demos/collab-maps/` (optional phase-B2 or phase-C)
- Why: valuable but not first-line for platform baseline
- Required changes:
  - preserve perspective/replay ideas
  - defer until room/workspace and map demos are stable

### `web-react/src/pages/ReplayInspectorPage.tsx`

- Decision: `adapt`
- Target: `apps/playground/replay-lab/`
- Why: directly aligned to replay education and operator debugging
- Required changes:
  - align event classification and close/reject taxonomy to NodalMerge docs

### `web-react/src/pages/FeaturePage.tsx`

- Decision: `drop`
- Target: none
- Why: mostly scaffold/placeholder wrapper around custom host endpoints; lower value than concrete demos

### `web-react/src/components/layout/AppShell.tsx`

- Decision: `adapt`
- Target: shared demo shell in `shared/`
- Why: reusable navigation shell; needs branding + IA update

### `web-react/src/app/routes.ts`

- Decision: `adapt`
- Target: per-app route configs
- Why: route grouping is useful but should be app-specific to avoid over-scaffolding

### `web-react/src/app/hostClient.ts`

- Decision: `rebuild`
- Target: `shared/` transport client layer
- Why: tightly coupled to showcase-only `/api/*` endpoints
- Required changes:
  - define a NodalMerge-first client adapter (WS-first), then add optional host helper APIs only where needed

### `web-react/src/app/activeSyncSdk.ts`

- Decision: `adapt`
- Target: `shared/` sdk adapter
- Why: valuable wrapper pattern; implementation currently branded/path-coupled
- Required changes:
  - import NodalMerge SDK package
  - enforce room URL strategy and capability/token injection from NodalMerge docs

### `web-react/src/app/scenarioHistory.ts`

- Decision: `keep`
- Target: `shared/` utility
- Why: generic scenario history utility with low coupling

### `shared/contracts/runtime.ts`

- Decision: `adapt`
- Target: `shared/` contracts
- Why: good DTO baseline for demo-host/web boundaries
- Required changes:
  - rename service identifiers
  - trim fields not used by phase-A/B demos

### `dotnet-host/src/TacticalShowcase.Host/Program.cs`

- Decision: `rebuild`
- Target: new NodalMerge-branded demo host app
- Why: currently hardwired to ActiveSync naming and custom route layout
- Required changes:
  - create NodalMerge host startup with explicit route policy and minimal necessary helper endpoints
  - preserve only demo-support endpoints that are not redundant with NodalMerge server behavior

### `dotnet-host/src/TacticalShowcase.Host/Runtime/RuntimeReplicationService.cs`

- Decision: `adapt`
- Target: NodalMerge demo host runtime service
- Why: contains substantial reusable scenario logic and replay assertions
- Required changes:
  - migrate to NodalMerge host package namespaces/contracts
  - validate command payloads against current NodalMerge runtime mapper behavior

### `dotnet-host/src/TacticalShowcase.Host/Runtime/RoomWorkspaceService.cs`

- Decision: `keep`
- Target: host-local collaborative workspace service
- Why: mostly neutral, in-memory collaboration helper independent of branding
- Required changes:
  - namespace/project rename and minor contract field normalization

### `dotnet-host/src/TacticalShowcase.Host/Ffi/*`

- Decision: `adapt` (potentially `drop` later)
- Target: host-native runtime bridge layer
- Why: may be partially replaced by NodalMerge host composition packages
- Required changes:
  - first pass: adapt to NodalMerge package names and runtime probing
  - second pass: remove if composition-layer access makes direct FFI wrappers unnecessary

## Recommended execution order

1. Build shared SDK + host client adapters under `shared/` (`adapt` + `rebuild` items).
2. Port `RoomWorkspacePage` as first flagship demo into `apps/demos/infinite-room-workspace/`.
3. Port `ReplayInspectorPage` + `InfiniteWorkspacePage` into `apps/playground/replay-lab/`.
4. Port `TacticalStrategyPage` into `apps/demos/collab-maps/`.
5. Bring `DungeonBuilderPage` and `PixelSandboxPage` after baseline quality bar is met.
6. Defer `CardBattlePage` until core room/map demos are stable.

## Migration vs replication call

Current assessment: **hybrid migration**.

- Migrate/adapt most UI experience modules.
- Rebuild transport/host integration seams where ActiveSync-specific APIs diverge from NodalMerge runtime surfaces.
- Keep pure utility/state modules when they are contract-neutral.
