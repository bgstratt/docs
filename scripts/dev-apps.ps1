param(
  [string]$WorkspaceRoot = "."
)

$ErrorActionPreference = "Stop"

$workspace = Resolve-Path $WorkspaceRoot
$demoPath = Join-Path $workspace "apps/demos/infinite-room-workspace"
$mapsPath = Join-Path $workspace "apps/demos/collab-maps"
$replayPath = Join-Path $workspace "apps/playground/replay-lab"
$protocolPath = Join-Path $workspace "apps/playground/protocol-inspector"
$collabTextPath = Join-Path $workspace "apps/playground/collab-text"
$pixelCanvasPath = Join-Path $workspace "apps/demos/pixel-canvas"
$benchTracePath = Join-Path $workspace "apps/demos/bench-trace"

function Start-AppDev {
  param(
    [string]$AppPath,
    [string]$Name,
    [int]$Port
  )

  if (-not (Test-Path $AppPath)) {
    throw "Missing app path: $AppPath"
  }

  $viteCache = Join-Path $AppPath "node_modules\.vite"
  if (Test-Path $viteCache) {
    Remove-Item -Recurse -Force $viteCache
  }

  Write-Host "Starting $Name on port $Port (fresh Vite dep cache) ..."
  Start-Process -FilePath "powershell" -ArgumentList @(
    "-NoExit",
    "-Command",
    "cd `"$AppPath`"; npm run dev -- --host 127.0.0.1 --port $Port"
  ) | Out-Null
}

Start-AppDev -AppPath $demoPath -Name "infinite-room-workspace" -Port 4173
Start-AppDev -AppPath $mapsPath -Name "collab-maps" -Port 4175
Start-AppDev -AppPath $replayPath -Name "replay-lab" -Port 4174
Start-AppDev -AppPath $protocolPath -Name "protocol-inspector" -Port 4176
Start-AppDev -AppPath $collabTextPath -Name "collab-text" -Port 4177
Start-AppDev -AppPath $pixelCanvasPath -Name "pixel-canvas" -Port 4178
Start-AppDev -AppPath $benchTracePath -Name "bench-trace" -Port 4179

Write-Host "Started app dev servers."
Write-Host "infinite-room-workspace: http://127.0.0.1:4173"
Write-Host "replay-lab: http://127.0.0.1:4174"
Write-Host "collab-maps: http://127.0.0.1:4175"
Write-Host "protocol-inspector: http://127.0.0.1:4176"
Write-Host "collab-text: http://127.0.0.1:4177"
Write-Host "pixel-canvas: http://127.0.0.1:4178"
Write-Host "bench-trace: http://127.0.0.1:4179"

