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

Write-Host "Installing $($bridgePackage.Name)"
npm install $bridgePackage.FullName
if ($LASTEXITCODE -ne 0) {
  throw "Failed installing $($bridgePackage.Name)"
}

Write-Host "Installing $($sdkPackage.Name)"
npm install $sdkPackage.FullName
if ($LASTEXITCODE -ne 0) {
  throw "Failed installing $($sdkPackage.Name)"
}

Write-Host "Installed local NodalMerge npm artifacts."

