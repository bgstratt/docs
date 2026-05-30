# Phase A - Slice 1 baseline

## Slice goal

Establish a runnable baseline contract for the first demo app and shared platform wiring without overcommitting to final implementation details.

This slice delivers:

- Shared configuration contract for app surfaces
- Shared diagnostics contract for runtime state
- Minimal first-app baseline definition for `apps/demos/infinite-room-workspace`
- Local run and verification checklist

## Scope for this slice

In scope:

- Define canonical environment/config fields used by demo/playground apps
- Define diagnostics surface every app should expose
- Define first app baseline behavior and acceptance checks
- Document implementation constraints and sequencing

Out of scope:

- Full feature port from `activesync-tactical-showcase`
- Full host transport implementation
- Multi-app shared package extraction

## Shared config contract (v0)

All app surfaces should align on these config keys:

- `hostBaseUrl` (default `http://localhost:5074`)
- `wsBaseUrl` (derived from host unless explicitly provided)
- `defaultRoomId` (for local-first smoke behavior)
- `tokenMode` (`none` | `static` | `provider`)
- `transportMode` (`ws-only` | `auto`)

Rules:

- Keep app boot deterministic with defaults for local dev.
- Allow override through env vars when needed.
- Keep sensitive token values out of checked-in files.

## Shared diagnostics contract (v0)

Each demo/playground should expose a minimal diagnostics panel with:

- Connection state (`connecting/open/closed/error`)
- Active transport mode (`ws-only` or negotiated)
- Last error text (if any)
- Last close code/reason (if any)
- Recent event feed (bounded list)

This is the minimum quality bar for merge readiness in early slices.

## First app baseline: infinite room workspace

Target folder:

- `apps/demos/infinite-room-workspace/`

Baseline behavior:

1. App boots with deterministic room id and host config.
2. App connects to NodalMerge runtime using current SDK adapter.
3. App shows connection + diagnostics panel.
4. App supports simple room join/switch controls.
5. App includes placeholder content area where ported collaboration canvas lands in next slice.

Baseline UI sections:

- Header (`app title`, `room selector`, `connect status`)
- Diagnostics panel (contract above)
- Main workspace placeholder (`canvas port target`)

## Local run contract

For this slice, app docs should clearly state:

- Required services to run first
- Required env vars and defaults
- Single command to start app
- Expected "healthy baseline" indicators in UI

## Verification checklist

Before marking slice complete:

1. App starts locally with defaults and no hidden manual edits
2. Room connect path works for at least one room id
3. Diagnostics panel updates state transitions correctly
4. Error/close states are surfaced without breaking UI
5. Docs page or README for the app includes run + verify instructions

## Next slice dependency

Slice 2 should consume this baseline and add:

- First real collaboration interactions from showcase port matrix
- Shared adapter hardening (`shared/` extraction where reuse is proven)
