---
title: Docs-site demo platform plan
description: Phased execution plan for playgrounds, demos, tutorials, and onboarding in the docs repository.
---

# Docs-site demo platform plan

## Goal

Build a focused developer experience platform in this repository using a `docs-site` sibling structure, then port tactical showcase experiences in small, verifiable slices.

Primary targets:

- Playground surfaces for protocol/runtime understanding
- Product-like demos (starting with infinite room workspace and collab maps)
- Step-by-step tutorials
- Guided onboarding path across docs + demos

## Target repo structure

Planned sibling layout:

- `docs-site/` for Mintlify docs app
- `apps/demos/infinite-room-workspace/`
- `apps/demos/collab-maps/`
- `apps/playground/protocol-inspector/`
- `apps/playground/replay-lab/`
- `tutorials/`
- `onboarding/`
- `shared/` for common runtime/auth/config utilities
- `plans/` for execution plans and inventories

## Demo quality bar

Every demo or playground slice must meet this bar before merge:

1. Deterministic local startup steps documented and verified
2. Explicit success criteria ("what good looks like")
3. Explicit failure behavior surfaced in UI (disconnects, rejections, token expiry)
4. Minimal observability panel (connection state, last error/close code, recent runtime events)
5. Cross-links to relevant docs pages (SDK/protocol/operators/API reference)
6. Branded and contract-aligned to NodalMerge naming and runtime surfaces
7. No hidden one-off env assumptions; all required configuration is declared

## Phase plan

## Phase A: platform baseline

Objective: establish shared foundations so all later demos/tutorials use consistent runtime wiring.

Scope:

- Create common app harness conventions under `apps/`
- Define shared runtime config (`wsUrl`, room naming, token provider hook shape)
- Add shared UI diagnostics component(s) in `shared/`
- Document local run workflows for each app type

Deliverables:

- Baseline scaffold committed for demos/playgrounds
- Shared utility module for connection/runtime diagnostics
- "How to run local demo apps" doc in `tutorials/` or `onboarding/`

Exit criteria:

- One minimal smoke app can connect and show runtime state
- Shared diagnostics panel works in that app
- A second app surface reuses the same shared runtime config/diagnostics contract

### Phase A upcoming integration slices

- Slice 5: add a NuGet-based `.NET` demo host in this repo using:
  - `NodalMerge.Host.Abstractions`
  - `NodalMerge.Host.Composition`
  - `NodalMerge.DotNetHost.Native.win-x64`
  - `NodalMerge.DotNetHost.Native.linux-x64`
- Slice 6: wire npm SDK/WASM usage in app runtime path using:
  - `nodalmerge-sdk-js`
  - `nodalmerge-bridge`
- Slice 7: validate end-to-end host + web package mode from this repo without project references into `nodalmerge`.

### Deferred docs-site relocation checkpoint

Keep Mintlify docs content at repo root during early platform slices to avoid config churn.

Add a dedicated relocation slice after Phase A/B stability:

- Move docs content and ownership under `docs-site/`
- Update tooling/scripts/path assumptions
- Re-run `mint dev` and `mint broken-links`
- Verify docs-to-demo cross-links and rollback plan

## Phase B: flagship demos

Objective: port high-signal product demos from tactical showcase.

Scope:

- Port `infinite-room-workspace`
- Port `collab-maps`
- Adapt naming and dependency surfaces from ActiveSync branding to NodalMerge branding

Deliverables:

- Two runnable demos with focused README/run instructions
- Cross-links from docs entry points to demo pages

Exit criteria:

- Both demos pass demo quality bar
- Both demos use NodalMerge-branded hosts/SDK/runtime contracts

## Phase C: playgrounds

Objective: provide safe, educational runtime inspection tools.

Scope:

- Protocol inspector playground (observe key WS command/response flows)
- Replay lab playground (state/hash/replay inspection workflows)

Deliverables:

- Two playground apps with constrained, documented functionality
- Clear warning boundaries for "learning tool" vs "production operator workflow"

Exit criteria:

- Users can inspect and reason about runtime behavior without reading source first
- Playgrounds link back to API/protocol docs for each surfaced operation

## Phase D: tutorials and onboarding

Objective: turn demos/playgrounds into a guided learning journey.

Scope:

- Build 2-4 tutorial tracks with checkpoints
- Build onboarding path that points to docs + demos + playgrounds in sequence
- Add "first hour", "first day", and "operator baseline" paths

Deliverables:

- Tutorial pages in `tutorials/`
- Onboarding flow in `onboarding/`
- Entry links from `index.mdx` and relevant docs sections

Exit criteria:

- New user can follow onboarding path from zero to running one demo with confidence
- Operator can follow a targeted path for security, troubleshooting, and upgrade basics

## Porting strategy for activesync tactical showcase

Migration preference:

- Migrate when contracts and architecture remain close enough
- Replicate/rebuild selectively when branding, host/runtime wiring, or contracts diverge too far

Decision rule per component:

- Keep: no meaningful rename/contract mismatch
- Adapt: moderate rename or runtime API changes
- Rebuild: heavy contract divergence or undesirable legacy assumptions
- Drop: low value or redundant with better NodalMerge-native experience

## Slice execution rules

- Keep each PR narrow: one app or one capability slice at a time
- Include a "verification checklist" in each PR description
- Avoid parallel schema/contract changes while porting UI behavior
- Land shared abstractions only after at least two consumers prove reuse

## Initial sequencing

1. Complete this plan document
2. Inventory tactical showcase modules and map to target folders
3. Produce port matrix (keep/adapt/rebuild/drop) with rationale
4. Execute Phase A baseline slice
5. Execute Phase B demo ports in two focused slices

## Current status snapshot (2026-05-29)

### Completed

- Phase A baseline slices delivered:
  - shared runtime config + diagnostics contracts
  - dual app scaffold (`infinite-room-workspace`, `replay-lab`)
  - shared runtime and shared diagnostics UI reuse
- Phase A package-mode integration delivered:
  - NuGet-based demo host in `apps/hosts/nodalmerge-demo-host`
  - npm sdk/wasm wiring in `infinite-room-workspace`
  - end-to-end package-mode validation docs (`slice-7` and follow-up host slice)
- Slice 8 delivered:
  - browser smoke/runbook document (`plans/slice-8-browser-smoke-and-runbook.md`)
- Slice 9 delivered:
  - `infinite-room-workspace` upgraded from placeholder to first sdk-backed shared document action
- Slice 10 delivered:
  - `replay-lab` upgraded from placeholder to replay snapshot inspector
- Docs discoverability pass delivered:
  - new `developer-experience/apps` page
  - `index` links to app surfaces
  - `docs.json` navigation tab for developer experience apps

### In progress relative to phases

- Phase A is effectively complete for baseline + package-mode goals.
- Phase B has started:
  - `infinite-room-workspace` interactive path delivered
  - `collab-maps` flagship demo scaffold and first shared-pin interaction path delivered
  - remaining Phase B work is hardening/polish and feature depth
- Phase C has started (replay inspector foundation exists), but protocol inspector and deeper replay tooling remain.
- Phase C has active implementation:
  - `replay-lab` snapshot inspector delivered
  - `replay-lab` range/cursor controls delivered for snapshot event windows
  - `protocol-inspector` scaffold + filtered runtime stream viewer delivered
  - `protocol-inspector` command-family presets and trace snippet export delivered
  - remaining Phase C work is deeper replay/protocol workflows and docs cross-link tightening
- Phase D not started (tutorial and onboarding tracks still pending).
- Phase D has started:
  - first onboarding paths delivered (`first-hour`, `operator-baseline`)
  - additional onboarding path delivered (`first-day-builder`)
  - tutorials delivered (`trace-a-room-session`, `incident-debug-sprint`)
  - remaining Phase D work is additional tracks, role-based paths, and deeper checkpointing

### Immediate next slices

1. Expand infinite workspace from single shared-doc action into multi-user interaction set:
   - presence indicator
   - simple peer-targeted signal action
2. Expand protocol inspector with command-family presets and exportable trace snippets.
3. Deepen replay-lab with range cursor controls and protocol-linked checkpoint semantics.
4. Add role-specific onboarding variants (frontend app team, platform/operator team).
5. Execute deferred docs relocation slice (`docs-site/`) once app/docs links stabilize.
