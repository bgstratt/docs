param(
  [string]$ArtifactDir = "C:\Users\bgstr\source\repos\nodalmerge\artifacts\package-local\npm"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ArtifactDir)) {
  throw "Artifact directory not found: $ArtifactDir"
}

$sdkPackage = Get-ChildItem -Path $ArtifactDir -Filter "nodalmerge-sdk-js-*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$bridgePackage = Get-ChildItem -Path $ArtifactDir -Filter "nodalmerge-bridge-*.tgz" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $sdkPackage) {
  throw "Could not find nodalmerge-sdk-js-*.tgz in $ArtifactDir"
}

if (-not $bridgePackage) {
  throw "Could not find nodalmerge-bridge-*.tgz in $ArtifactDir"
}

Write-Host "Installing $($bridgePackage.Name) ($($bridgePackage.LastWriteTime))"
npm install --force $bridgePackage.FullName
if ($LASTEXITCODE -ne 0) {
  throw "Failed installing $($bridgePackage.Name)"
}

Write-Host "Installing $($sdkPackage.Name) ($($sdkPackage.LastWriteTime))"
npm install --force $sdkPackage.FullName
if ($LASTEXITCODE -ne 0) {
  throw "Failed installing $($sdkPackage.Name)"
}

$bridgeDts = Join-Path $PSScriptRoot "..\node_modules\nodalmerge-bridge\nodalmerge_bridge.d.ts"
$sdkJs = Join-Path $PSScriptRoot "..\node_modules\nodalmerge-sdk-js\index.js"
$checks = @(
  @{ Path = $bridgeDts; Pattern = "read_replay_range_local_json"; Label = "bridge read_replay_range_local_json" },
  @{ Path = $sdkJs; Pattern = "readLocalReplayRange"; Label = "sdk readLocalReplayRange" },
  @{ Path = $sdkJs; Pattern = "storeWriteDepth"; Label = "sdk storeWriteDepth" }
)
foreach ($check in $checks) {
  if (-not (Test-Path $check.Path)) {
    throw "Missing $($check.Path) after install"
  }
  $hit = Select-String -Path $check.Path -Pattern $check.Pattern -Quiet
  if (-not $hit) {
    throw "Install verification failed: $($check.Label) not found in $($check.Path)"
  }
  Write-Host "OK: $($check.Label)"
}

Write-Host "Installed and verified local NodalMerge npm artifacts."
