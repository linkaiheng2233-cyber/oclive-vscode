# Copy oclive-kernel-server + manifest sidecar into extension bin/ (VS Code Flash bundled-first).
param(
  [string]$Profile = "release",
  [string]$SourceRoot = ""
)

$ErrorActionPreference = "Stop"
$repo = if ($SourceRoot) { $SourceRoot } else { Join-Path $PSScriptRoot "..\..\oclivenewnew" }
$targetRoot = Join-Path $repo "..\oclive-dev-artifacts\oclivenewnew-cargo-target"
$exeName = "oclive-kernel-server.exe"
$manifestName = "oclive-kernel-server.oclive-manifest.json"
$src = Join-Path $targetRoot "$Profile\$exeName"

if (-not (Test-Path $src)) {
  Write-Host "Building oclive_kernel_server ($Profile)..."
  Push-Location $repo
  try {
    $releaseArgs = if ($Profile -eq "release") { @("--release") } else { @() }
    cargo build -p oclive_kernel_server @releaseArgs
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $src)) {
  throw "Binary not found: $src"
}

$destDir = Join-Path $PSScriptRoot "..\bin"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null
$dest = Join-Path $destDir $exeName
Copy-Item -Force $src $dest

$manifestJson = & $dest --version-json
$manifestPath = Join-Path $destDir $manifestName
Set-Content -Path $manifestPath -Value $manifestJson -Encoding utf8

Write-Host "Bundled kernel -> $dest"
Write-Host "Manifest sidecar -> $manifestPath"
