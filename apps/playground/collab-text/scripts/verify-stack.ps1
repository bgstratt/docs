# Verifies collab-text is wired to current local WASM + SDK + app sources.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== collab-text stack verification ===" -ForegroundColor Cyan

$checks = @(
  @{
    Label = "bridge WASM export"
    Path  = Join-Path $root "node_modules\nodalmerge-bridge\nodalmerge_bridge.d.ts"
    Pattern = "read_replay_range_local_json"
  },
  @{
    Label = "sdk readLocalReplayRange"
    Path  = Join-Path $root "node_modules\nodalmerge-sdk-js\index.js"
    Pattern = "readLocalReplayRange"
  },
  @{
    Label = "sdk store gate"
    Path  = Join-Path $root "node_modules\nodalmerge-sdk-js\index.js"
    Pattern = "storeWriteDepth"
  },
  @{
    Label = "App glyph timeline fallback"
    Path  = Join-Path $root "src\App.tsx"
    Pattern = "buildTimelineFromTextGlyphs"
  },
  @{
    Label = "App skip host replay wait"
    Path  = Join-Path $root "src\App.tsx"
    Pattern = "queryHost: false"
  },
  @{
    Label = "SdkRuntimeClient replay helper"
    Path  = Join-Path $root "..\..\demos\workflow-demo\src\lib\sdkRuntimeClient.ts"
    Pattern = "getTextSequenceForReplay"
  }
)

$failed = 0
foreach ($c in $checks) {
  if (-not (Test-Path $c.Path)) {
    Write-Host "FAIL: $($c.Label) — missing file $($c.Path)" -ForegroundColor Red
    $failed += 1
    continue
  }
  if (Select-String -Path $c.Path -Pattern $c.Pattern -Quiet) {
    Write-Host "OK:   $($c.Label)" -ForegroundColor Green
  } else {
    Write-Host "FAIL: $($c.Label) — pattern '$($c.Pattern)' not in $($c.Path)" -ForegroundColor Red
    $failed += 1
  }
}

$artifactDir = "C:\Users\bgstr\source\repos\nodalmerge\artifacts\package-local\npm"
if (Test-Path $artifactDir) {
  Get-ChildItem $artifactDir -Filter "nodalmerge-*.tgz" | ForEach-Object {
    Write-Host "artifact: $($_.Name) $($_.LastWriteTime)"
  }
}

if ($failed -gt 0) {
  Write-Host "`n$failed check(s) failed. Run: npm run install:local-sdk" -ForegroundColor Yellow
  exit 1
}

Write-Host "`nAll checks passed. Restart the Vite dev server (stop + npm run dev) so the browser loads the new bundle." -ForegroundColor Cyan
