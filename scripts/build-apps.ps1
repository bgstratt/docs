param(
  [string]$WorkspaceRoot = ".",
  [string]$HostBaseUrl = $env:NODALMERGE_DEMO_HOST_URL
)

$ErrorActionPreference = "Stop"

$workspace = Resolve-Path $WorkspaceRoot
$siteDist = Join-Path $workspace "site/dist"

if (-not $HostBaseUrl) {
  Write-Warning "NODALMERGE_DEMO_HOST_URL is not set - skipping demo/playground app builds. The marketing site will keep its 'coming soon' stub pages at /demos/<slug> and /playground/<slug>. Set NODALMERGE_DEMO_HOST_URL to the deployed nodalmerge-server/host base URL (e.g. https://demo.nodalmerge.com) to build and mount the real SPAs."
  exit 0
}

if (-not (Test-Path $siteDist)) {
  throw "site/dist not found. Run 'npm run build:site' (astro build) before build:apps - the app bundles are copied into it, not the other way around."
}

# Each app defaults to its own room ID (== slug) so different demos/playground
# apps don't collide into the shared "demo-room" fallback baked into
# shared/runtime/config.ts when visited by different people at the same time.
# Visitors can still type a different room name in-app to test multi-peer sync.
$apps = @(
  @{ Slug = "collab-maps"; Category = "demos"; Path = "apps/demos/collab-maps" },
  @{ Slug = "pixel-canvas"; Category = "demos"; Path = "apps/demos/pixel-canvas" },
  @{ Slug = "infinite-room-workspace"; Category = "demos"; Path = "apps/demos/infinite-room-workspace" },
  @{ Slug = "collab-text"; Category = "playground"; Path = "apps/playground/collab-text" },
  @{ Slug = "protocol-inspector"; Category = "playground"; Path = "apps/playground/protocol-inspector" },
  @{ Slug = "replay-lab"; Category = "playground"; Path = "apps/playground/replay-lab" }
)

foreach ($app in $apps) {
  $appPath = Join-Path $workspace $app.Path
  $base = "/$($app.Category)/$($app.Slug)/"
  $roomId = $app.Slug

  if (-not (Test-Path $appPath)) {
    throw "Missing app path: $appPath"
  }

  Write-Host "Building $($app.Slug) (base=$base room=$roomId host=$HostBaseUrl) ..."

  $env:VITE_HOST_BASE_URL = $HostBaseUrl
  $env:VITE_DEFAULT_ROOM_ID = $roomId

  Push-Location $appPath
  try {
    npm run build -- --base=$base
    if ($LASTEXITCODE -ne 0) {
      throw "$($app.Slug) build failed (exit $LASTEXITCODE) - not copying a stale/partial dist/."
    }
  } finally {
    Pop-Location
    Remove-Item Env:\VITE_HOST_BASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:\VITE_DEFAULT_ROOM_ID -ErrorAction SilentlyContinue
  }

  $appDist = Join-Path $appPath "dist"
  if (-not (Test-Path $appDist)) {
    throw "$($app.Slug) build did not produce a dist/ folder."
  }

  $destDir = Join-Path $siteDist "$($app.Category)/$($app.Slug)"
  if (Test-Path $destDir) {
    Remove-Item -Recurse -Force $destDir
  }
  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -Recurse -Force (Join-Path $appDist "*") $destDir
}

Write-Host "App builds copied into site/dist. Sync site/dist to S3 as usual."
