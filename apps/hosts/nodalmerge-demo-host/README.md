# NodalMerge demo host (NuGet package mode)

## Purpose

Run a local `.NET` host for the demos/playground apps using the published NodalMerge NuGet
packages (`NodalMerge.Host.Abstractions`, `NodalMerge.Host.Composition`, `NodalMerge.DotNetHost`,
and the `NodalMerge.DotNetHost.Native.{win-x64,linux-x64}` runtime packages) from nuget.org.

This project has no project/source reference into the sibling `nodalmerge` repo — it only
consumes what we've published.

## Restore and run

From this folder:

```powershell
dotnet restore .\NodalMerge.DemoHost.csproj
dotnet run
```

`dotnet run` uses `Properties/launchSettings.json` for the local URL/profile
(`http://127.0.0.1:5074`).

To pin a different published version ad hoc:

```powershell
dotnet run --project .\NodalMerge.DemoHost.csproj -p:NodalMergePackageVersion=0.1.2
```

The default version is set in `NodalMerge.DemoHost.csproj` (`NodalMergePackageVersion`) and
should be bumped whenever a new host package version is pushed to nuget.org.

Host endpoints:

- `http://127.0.0.1:5074/api/host/health` — demo-host-specific health check
- `http://127.0.0.1:5074/api/host/providers` — resolved provider bindings (node/blob/auth)
- `http://127.0.0.1:5074/` — package baseline health (`NodalMerge.DotNetHost`)
- `ws://127.0.0.1:5074/ws/runtime` and `ws://127.0.0.1:5074/ws/{roomId}` — CRDT sync runtime
- `http://127.0.0.1:5074/sync/token`, `/sync/token/validate`, `/sync/blob-url` — room auth/blob
  helpers (see `NodalMerge.DotNetHost`'s `WebApplicationExtensions.MapNodalMergeEndpoints`)

## CORS

Allowed browser origins are configured in `appsettings.json` under
`NodalMerge:Cors:AllowedOrigins`. It currently includes:

- the local Vite dev ports used by `npm run dev:apps` (4173-4177) and the Astro site dev
  server (4321)
- the deployed marketing site origins, `https://nodalmerge.com` and `https://www.nodalmerge.com`,
  which serve the built demos/playground apps from `site/dist` in production

Add any new app's dev port or deployment origin to that list — the host throws on startup if
the list is empty.

## Providers

`appsettings.json` configures the demo/dev provider set:

- `NodeStorage: InMemory`
- `BlobStorage: WsOnly`
- `Auth: Default` (no-op auth; matches `VITE_TOKEN_MODE=none`, the default in the apps' runtime
  config)

Swap these (and add the matching `NodalMerge:Storage:*`/`NodalMerge:Auth:*` sections) if a
persistent or JWT-backed provider is needed for a given deployment.

## Notes

- The host is served from a single process for all demos/playground apps — every app points at
  the same `hostBaseUrl`/`wsBaseUrl` by default (see `shared/runtime/config.ts`), so this one
  host process is sufficient for all of them at once.
- NuGet package versions can be overridden via `-p:NodalMergePackageVersion=<version>`.
