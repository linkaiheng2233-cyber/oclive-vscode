# Copy oclive-kernel-server into extension bin/ (fallback / offline VSIX).
param(
  [string]$Profile = "debug",
  [string]$SourceRoot = ""
)

$ErrorActionPreference = "Stop"
$repo = if ($SourceRoot) { $SourceRoot } else { Join-Path $PSScriptRoot "..\..\oclivenewnew" }
$targetRoot = Join-Path $repo "..\oclive-dev-artifacts\oclivenewnew-cargo-target"
$exeName = "oclive-kernel-server.exe"
$src = Join-Path $targetRoot "$Profile\$exeName"

if (-not (Test-Path $src)) {
  Write-Host "Building oclive_kernel_server ($Profile)..."
  Push-Location $repo
  try {
    cargo build -p oclive_kernel_server $(if ($Profile -eq "release") { "--release" })
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
Write-Host "Bundled kernel -> $dest"
