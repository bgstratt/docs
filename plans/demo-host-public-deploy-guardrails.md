# Demo host public deploy guardrails

## Status

All items below are implemented in this repo/session except the two that require the
actual EC2 box (nginx install, systemd install) — those have real config files ready to
copy over.

- [x] WASM/SDK rebuilt from current `core/` and reinstalled in the 3 consuming apps
- [x] CORS allowlist + fail-fast on empty config
      (`apps/hosts/nodalmerge-demo-host/Program.cs`, `appsettings.json`)
- [x] Server-side Origin-check middleware (closes the gap CORS alone leaves — see
      "Origin-check middleware" below)
- [x] "Try another room" bounded client-side fallback + hint text in all 3 SDK apps
      (`shared/runtime/roomFallback.ts`)
- [x] collab-text soft text-length cap + friendly "message too large"/"demo limit"
      messaging
- [x] nginx config written to
      `apps/hosts/nodalmerge-demo-host/deploy/nginx/api.nodalmerge.com.conf`
      — **not yet applied on the box**
- [x] systemd unit + nightly restart timer written to
      `apps/hosts/nodalmerge-demo-host/deploy/systemd/`
      — **not yet installed on the box**
- [x] `MemoryMax`/`MemoryHigh` tuned to the chosen instance (t3a.small, 2 GB):
      1200M hard / 900M soft, mirrored in the Docker compose file
- [x] `NODALMERGE_DEMO_HOST_URL=https://api.nodalmerge.com` build done — app bundles in
      `site/dist` are baked against the real host and ready for S3 sync
- [x] Docker packaging: `deploy/docker/Dockerfile` (multi-stage, restores NodalMerge
      0.1.4 from nuget.org, non-root, healthcheck) + `deploy/docker/docker-compose.yml`
      (memory caps, loopback-only port, capped logs) + docker-variant nightly restart
      timer in `deploy/systemd/`. Image built and convergence-spike-verified locally.
- [x] Copy-paste EC2 runbook: `apps/hosts/nodalmerge-demo-host/deploy/EC2-SETUP.md`
      (swapfile, Docker/nginx/certbot install, image ship, compose up, nginx zones +
      certbot, nightly timer, smoke test) — box steps remain to be executed

## Goal

Make it safe to expose `nodalmerge-demo-host` publicly (proposed: `api.nodalmerge.com`,
behind nginx/certbot on an EC2 instance) as the backend for the demos/playground apps
embedded in `site/dist`, without modifying `nodalmerge-host` source or republishing the
NuGet packages.

## Constraints

- No changes to `nodalmerge-host` (C#) or `nodalmerge`/`core` (Rust) source. All
  guardrails must live in infra (nginx, systemd) or in this repo's app code
  (`docs/apps/*`).
- The host currently runs fully open: `Auth: Default` is a no-op (always valid), and
  room slugs are public (baked into the open-source app bundles). CORS only affects
  browser JS visibility of responses — it does not stop a non-browser client from
  hitting any endpoint directly. Every guardrail below assumes a determined actor can
  bypass the demo UI entirely and talk to the raw WebSocket/HTTP API.
- Demos are intentionally narrow in scope: showing offline-first behavior, WS/WebRTC
  sync, and CRDT convergence — not a general-purpose hosted backend. Guardrails should
  be aggressive; there's no product reason to keep a session or room alive past normal
  demo use.

## What already exists (no work needed)

- Empty-room purge: `RuntimeRoomBroker` removes a room from its dictionary the instant
  the last peer disconnects — immediate, not a grace period.
- Max inbound WS message size: 64 KiB per frame (`RuntimeWebSocketLoopRunner`). The SDK
  does not chunk large payloads, so this is already a hard per-op ceiling (single
  `text-insert` / `blob-set` cannot exceed it).
- Blob storage (`cas.*`) is not used by any current demo app (collab-maps,
  infinite-room-workspace, collab-text) — confirmed via source search, zero call sites.
  No blob-size UI work needed today.

## What's missing and how we're covering it without touching source

| Gap | Mechanism | Where |
|---|---|---|
| Idle-but-connected sockets never time out | nginx idle timeout (15 min) on `/ws/` | nginx (Appendix A) |
| No per-IP connection cap | nginx `limit_conn` keyed on `$binary_remote_addr` (30) | nginx (Appendix A) |
| No per-room connection cap | nginx `limit_conn` keyed on `$uri` (50) — works because `$uri` includes the room slug for `/ws/{roomId}` | nginx (Appendix A) |
| A single open connection can flood as fast as it can send | nginx `limit_rate` on `/ws/` (~128 KB/s per connection) | nginx (Appendix A) |
| Unbounded in-memory growth (InMemory node store, WsOnly blob store) has no hard ceiling | systemd `MemoryMax` cgroup cap + `Restart=on-failure`, plus a nightly scheduled restart to reclaim state | systemd (Appendix B) |
| No text-length guardrail in the one app that lets users type (collab-text) | client-side soft cap + friendly "demo limit" message | app code (this repo) |
| CORS only hides responses from browser JS — server still processes disallowed-origin requests | server-side Origin-check middleware, same allowlist as CORS | `nodalmerge-demo-host/Program.cs` (our code, not the NuGet package) |

### Origin-check middleware

`Program.cs` in `nodalmerge-demo-host` is our own code (not `nodalmerge-host` package
source), so it's fair game. Added middleware that rejects any request whose `Origin`
header is present but not in `NodalMerge:Cors:AllowedOrigins` — same list CORS already
uses, so localhost dev ports and `nodalmerge.com`/`www` keep working unchanged, no new
config. Requests with no `Origin` header (curl, health checks, server-to-server) pass
through untouched, since that's not a browser cross-origin call in the first place.

Honest limit: this stops a browser loading some *other* page from silently using the
API (a real vector CORS alone didn't close), but a deliberately scripted client can set
`Origin: https://nodalmerge.com` itself and get through — there is no credential a
public, login-free static SPA can present that isn't visible to anyone who opens
devtools, including the host's own built-in `JwtBridgeEmbedded` auth (its `/sync/token`
mint endpoint is itself unauthenticated). The nginx-layer caps/timeouts/throttle above
remain the real backstop against a targeted actor — they bound blast radius/cost rather
than prevent access, which isn't achievable here without a login wall.

### Room-at-capacity behavior

When `limit_conn` rejects a new `/ws/{roomId}` connection (room already at 50, or that
IP already at 30 across all rooms), nginx returns `503` and closes the handshake. No
new room is auto-provisioned — there is no logic anywhere for that, and building it
would require nginx Lua/njs scripting to track and redirect on live connection counts,
which is more machinery than a demo warrants.

This is fine as-is because:
- Every current app already has a room-id text input + "Connect" button
  (e.g. `apps/demos/collab-maps/src/App.tsx:32,94-107`), so a user can self-serve a
  different room name.
- Every current app already has a generic "could not reach server for `<room>` —
  working offline" fallback message on any failed connect attempt
  (`apps/demos/collab-maps/src/App.tsx:107` and equivalents). A rejected handshake
  looks like any other failed connect and is already handled.
- Browsers do not expose the HTTP status code of a failed WebSocket handshake to page
  JS (a deliberate browser security restriction), so the app cannot distinguish
  "room full" from "network blip" from "server down" without an extra HTTP precheck
  endpoint. Not building that — the existing generic fallback is enough for this
  surface.

## Implementation steps

1. **nginx** — config written (Appendix A). Still needs to be applied on the actual EC2
   box in front of `nodalmerge-demo-host` (already running nginx/certbot per existing
   setup — this is additive: two `limit_conn_zone`/one `limit_req_zone` in `http {}`,
   and the `location` block changes for `/ws/` and the plain HTTP endpoints).
2. **systemd** — unit + timer written (Appendix B). Still needs to be installed on the
   box. Tune `MemoryMax`/`MemoryHigh` to the actual instance size before deploying.
3. **App code (this repo)** — done. Added a soft client-side max length
   (`MAX_DOC_LENGTH = 8000`) in `apps/playground/collab-text/src/App.tsx`, safely under
   64 KiB once JSON/base64 protocol overhead is accounted for, plus a live
   `N/8,000 characters` counter and a friendly "Demo limit: text capped..." message on
   truncation. Also surfaced the SDK's existing `"message too large"` rejection path
   (`nodalmerge-sdk-js/index.js:611-618` already reverts + emits an error) as
   `"Demo limit reached: ..."` in the status line instead of a raw error. This is UX
   polish for well-behaved users, not a security boundary — see Constraints.
4. **Origin-check middleware (this repo)** — done, see "Origin-check middleware" above.
5. **"Try another room" fallback (this repo)** — done. Bounded (3 attempts), user
   triggered only, in all 3 SDK-consuming apps. See `shared/runtime/roomFallback.ts`.
6. **Build/deploy** — when running `build:apps`, set
   `NODALMERGE_DEMO_HOST_URL=https://api.nodalmerge.com` so the built app bundles point
   at the real host instead of the "coming soon" stub. Not yet done — no deploy has
   happened.

## Explicitly out of scope / not doing

- Real per-room auth (`JwtBridgeEmbedded`/`JwtBridgeSidecar`) — bigger lift, needs both
  host config *and* app-side token minting/attachment (apps currently run
  `tokenMode: "none"`). Revisit only if abuse actually becomes a problem after the
  guardrails above ship.
- Auto-provisioned overflow rooms — see "Room-at-capacity behavior" above.
- Blob size limits in app UI — no app currently uses blob storage.
- Any change to `nodalmerge-host`/`nodalmerge` source or NuGet republish.

## Open items to confirm before deploying

- Idle timeout value: defaulting to 15 min in Appendix A; 5 min was also discussed as
  more aggressive. Easy one-line change either way.
- Per-IP (30) / per-room (50) caps: middle-of-the-range defaults per prior discussion;
  tune freely, no other code depends on these numbers.
- `MemoryMax` in Appendix B needs a real value once the target EC2 instance size is
  picked.

---

## Appendix A: nginx config

Canonical copy (not duplicated here to avoid drift):
[`apps/hosts/nodalmerge-demo-host/deploy/nginx/api.nodalmerge.com.conf`](../apps/hosts/nodalmerge-demo-host/deploy/nginx/api.nodalmerge.com.conf).
Assumes TLS termination via certbot is already set up for `api.nodalmerge.com`; the
config adds the reverse proxy + idle timeout (15 min) + per-IP (30) / per-room (50)
connection caps + per-connection throughput throttle (~128 KB/s) on top of that.

Not yet applied on the actual EC2 box — copy the `server {}` block in and add the
`limit_conn_zone`/`limit_req_zone` lines (noted in the file) to the main `http {}`
block once, then `nginx -t && systemctl reload nginx`.

## Appendix B: systemd unit + nightly restart timer

Canonical copies (not duplicated here to avoid drift):
[`apps/hosts/nodalmerge-demo-host/deploy/systemd/`](../apps/hosts/nodalmerge-demo-host/deploy/systemd/)
— `nodalmerge-demo-host.service`, `nodalmerge-demo-host-restart.service`, and
`nodalmerge-demo-host-restart.timer`. Install instructions are in
[`deploy/README.md`](../apps/hosts/nodalmerge-demo-host/deploy/README.md).

Not yet installed on the actual EC2 box. `MemoryMax`/`MemoryHigh` are placeholder
values — tune to the real instance size first.

The nightly restart is safe by design: all demo state is in-memory only, and every app
already has an offline-first client-side persistence layer (IndexedDB via
`nodalmerge-sdk-js/persistence/peer-local-indexeddb.js`) plus a room-id input to
reconnect — a restart looks like any other brief disconnect/offline period to a client.
