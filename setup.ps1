# Radar - safe setup for Windows.
#
# NOTE: this file is ASCII only on purpose. PowerShell 5.1 reads .ps1 as ANSI,
# not UTF-8, so accented text would break string parsing before anything runs.
#
# Electron's own unpacker fails silently on some Node versions: it leaves a
# partial dist folder and `npm start` then says it cannot find Electron.
# This script skips that path and uses Expand-Archive instead.
#
# Safe to run many times - it only fixes what is missing.
#
# If PowerShell blocks scripts:
#     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# then run   .\setup.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$EV  = $pkg.devDependencies.electron -replace '[^0-9.]', ''

switch ($env:PROCESSOR_ARCHITECTURE) {
  'AMD64' { $ARCH = 'x64'   }
  'ARM64' { $ARCH = 'arm64' }
  'x86'   { $ARCH = 'ia32'  }
  default { $ARCH = 'x64'   }
}

Write-Host ""
Write-Host "Radar setup"
Write-Host "  Electron $EV (win32-$ARCH)"
Write-Host "  Folder:   $PSScriptRoot"
Write-Host ""

# 1. Everything except Electron. --ignore-scripts keeps npm away from it.
if (-not (Test-Path 'node_modules\electron-builder')) {
  Write-Host "-> Installing dependencies..."
  npm install --ignore-scripts --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Write-Host "npm install failed."; exit 1 }
} else {
  Write-Host "[ok] dependencies already present"
}

# 2. The Electron runtime. Check the actual binary, not just the folder -
#    a broken unpack still leaves the folder behind but without the core files.
$exe  = 'node_modules\electron\dist\electron.exe'
$dll  = 'node_modules\electron\dist\ffmpeg.dll'
$mark = 'node_modules\electron\path.txt'

if ((Test-Path $exe) -and (Test-Path $dll) -and (Test-Path $mark)) {
  Write-Host "[ok] Electron already complete"
} else {
  $zip = Join-Path $env:TEMP "electron-v$EV-win32-$ARCH.zip"
  if (-not (Test-Path $zip)) {
    Write-Host "-> Downloading Electron $EV (about 128 MB)..."
    $url = "https://github.com/electron/electron/releases/download/v$EV/electron-v$EV-win32-$ARCH.zip"
    $old = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    $ProgressPreference = $old
  } else {
    Write-Host "-> Using cached download"
  }

  Write-Host "-> Extracting..."
  $dist = 'node_modules\electron\dist'
  if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
  New-Item -ItemType Directory -Path $dist -Force | Out-Null
  Expand-Archive -Path $zip -DestinationPath $dist -Force

  Set-Content -Path $mark -Value 'electron.exe' -NoNewline -Encoding ascii
  Set-Content -Path "$dist\version" -Value $EV -NoNewline -Encoding ascii

  if (-not (Test-Path $exe)) {
    Write-Host ""
    Write-Host "FAILED: electron.exe missing after extract."
    Write-Host "Delete $zip and run this script again."
    exit 1
  }
  Write-Host "[ok] Electron ready"
}

Write-Host ""
Write-Host "Done. Start the app with:  npm start"
Write-Host ""
