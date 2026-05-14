<#
.SYNOPSIS
  Builds the single-file PGL Attendance installer (.exe) on Windows.

.DESCRIPTION
  Run this inside a Windows VM/host that has the prerequisites listed in
  windows-build\README.md (Node.js 20+, .NET 8 SDK, Inno Setup 6, internet).

  Stages:
    1. Backend  : npm install + nest build
    2. Prisma   : generate client (Windows engines)
    3. Frontend : next build (static export)
    4. Vendor   : download portable node-v*-win-x64 + nssm
    5. Tray     : dotnet publish (win-x64, self-contained, single-file)
    6. Seed DB  : prisma db push against an empty SQLite file
    7. Stage    : copy everything into dist\staging
    8. ISCC     : compile installer.iss into dist\PGL-Attendance-Setup-x.y.z.exe

.PARAMETER Version
  Installer version (defaults to 1.0.0).

.PARAMETER NodeWinVersion
  Node.js Windows portable version to bundle (defaults to 20.18.1).

.PARAMETER NssmVersion
  NSSM version to bundle (defaults to 2.24).

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File .\windows-build\scripts\build.ps1
  pwsh -ExecutionPolicy Bypass -File .\windows-build\scripts\build.ps1 -Version 1.2.0
#>
[CmdletBinding()]
param(
  [string]$Version        = '1.0.0',
  [string]$NodeWinVersion = '20.18.1',
  [string]$NssmVersion    = '2.24'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

function Log([string]$msg) {
  Write-Host ("[build] {0}" -f $msg) -ForegroundColor Cyan
}
function Die([string]$msg) {
  Write-Host ("[build] ERROR: {0}" -f $msg) -ForegroundColor Red
  exit 1
}
function Require-Cmd([string]$cmd, [string]$hint) {
  $found = Get-Command $cmd -ErrorAction SilentlyContinue
  if (-not $found) { Die "missing prerequisite: $cmd. $hint" }
}

# --- Paths -------------------------------------------------------------------
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir  = Resolve-Path (Join-Path $ScriptDir '..')
$RootDir     = Resolve-Path (Join-Path $ProjectDir '..')
$BackendDir  = Join-Path $RootDir  'attendance-backend'
$FrontendDir = Join-Path $RootDir  'attendance-frontend'
$TrayDir     = Join-Path $ProjectDir 'tray\PglAttendanceTray'
$InstallerIss = Join-Path $ProjectDir 'installer\installer.iss'
$VendorDir   = Join-Path $ProjectDir 'vendor'
$DistDir     = Join-Path $ProjectDir 'dist'
$Staging     = Join-Path $DistDir 'staging'

# --- Prereqs -----------------------------------------------------------------
Require-Cmd 'node'   'Install Node.js 20+ from https://nodejs.org/'
Require-Cmd 'npm'    'Comes with Node.js'
Require-Cmd 'dotnet' 'Install .NET 8 SDK from https://dotnet.microsoft.com/download'

# Locate Inno Setup
$ISCC = $null
foreach ($p in @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles}\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
)) {
  if (Test-Path $p) { $ISCC = $p; break }
}
if (-not $ISCC) {
  Die "Inno Setup 6 (ISCC.exe) not found. Install from https://jrsoftware.org/isdl.php"
}
Log "Using ISCC: $ISCC"

# --- Fresh dirs --------------------------------------------------------------
New-Item -ItemType Directory -Force -Path $VendorDir | Out-Null
New-Item -ItemType Directory -Force -Path $DistDir   | Out-Null
if (Test-Path $Staging) { Remove-Item $Staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Staging  | Out-Null
foreach ($sub in @('node','nssm','service','tray','seed','app\backend','app\attendance-frontend\out')) {
  New-Item -ItemType Directory -Force -Path (Join-Path $Staging $sub) | Out-Null
}

# --- 1. Backend build --------------------------------------------------------
Log 'Building backend (NestJS)...'
Push-Location $BackendDir
try {
  if (-not (Test-Path 'node_modules')) {
    & npm install
    if ($LASTEXITCODE -ne 0) { Die 'backend npm install failed' }
  }
  if (Test-Path 'dist') { Remove-Item 'dist' -Recurse -Force }
  & npx nest build
  if ($LASTEXITCODE -ne 0) { Die 'nest build failed' }

  Log 'Generating Prisma client for Windows...'
  $env:PRISMA_CLI_BINARY_TARGETS = 'windows'
  & npx prisma generate --schema='prisma/schema.prisma'
  if ($LASTEXITCODE -ne 0) { Die 'prisma generate failed' }
} finally { Pop-Location }

# --- 2. Production install in staging ---------------------------------------
Log 'Installing production node_modules in staging...'
$StagedBackend = Join-Path $Staging 'app\backend'
Copy-Item (Join-Path $BackendDir 'dist')           (Join-Path $StagedBackend 'dist')   -Recurse
Copy-Item (Join-Path $BackendDir 'prisma')         (Join-Path $StagedBackend 'prisma') -Recurse
Copy-Item (Join-Path $BackendDir 'package.json')      $StagedBackend
Copy-Item (Join-Path $BackendDir 'package-lock.json') $StagedBackend
Push-Location $StagedBackend
try {
  $env:PRISMA_CLI_BINARY_TARGETS = 'windows'
  & npm install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Die 'production npm install failed' }
  & npx prisma generate --schema='prisma/schema.prisma'
  if ($LASTEXITCODE -ne 0) { Die 'prisma generate (staged) failed' }
} finally { Pop-Location }

# --- 3. Frontend build -------------------------------------------------------
Log 'Building frontend (Next.js static export)...'
Push-Location $FrontendDir
try {
  if (-not (Test-Path 'node_modules')) {
    & npm install
    if ($LASTEXITCODE -ne 0) { Die 'frontend npm install failed' }
  }
  if (Test-Path 'out')   { Remove-Item 'out'   -Recurse -Force }
  if (Test-Path '.next') { Remove-Item '.next' -Recurse -Force }
  & npx next build
  if ($LASTEXITCODE -ne 0) { Die 'next build failed' }
} finally { Pop-Location }
Copy-Item (Join-Path $FrontendDir 'out\*') (Join-Path $Staging 'app\attendance-frontend\out') -Recurse

# --- 4. Vendor: node.exe + nssm.exe -----------------------------------------
function Fetch($url, $dest) {
  if (Test-Path $dest) { return }
  Log "Downloading $(Split-Path $dest -Leaf)..."
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
}

$NodeZip = Join-Path $VendorDir "node-v$NodeWinVersion-win-x64.zip"
$NodeUrl = "https://nodejs.org/dist/v$NodeWinVersion/node-v$NodeWinVersion-win-x64.zip"
Fetch $NodeUrl $NodeZip

$NodeExtract = Join-Path $VendorDir 'node-extracted'
if (Test-Path $NodeExtract) { Remove-Item $NodeExtract -Recurse -Force }
Expand-Archive -LiteralPath $NodeZip -DestinationPath $NodeExtract
$NodeInner = Get-ChildItem $NodeExtract -Directory | Where-Object Name -Match 'node-v.*-win-x64' | Select-Object -First 1
if (-not $NodeInner) { Die 'extracted node folder not found' }
Copy-Item (Join-Path $NodeInner.FullName '*') (Join-Path $Staging 'node') -Recurse

$NssmZip = Join-Path $VendorDir "nssm-$NssmVersion.zip"
$NssmUrl = "https://nssm.cc/release/nssm-$NssmVersion.zip"
Fetch $NssmUrl $NssmZip
$NssmExtract = Join-Path $VendorDir 'nssm-extracted'
if (Test-Path $NssmExtract) { Remove-Item $NssmExtract -Recurse -Force }
Expand-Archive -LiteralPath $NssmZip -DestinationPath $NssmExtract
$NssmBin = Get-ChildItem $NssmExtract -Recurse -File -Filter 'nssm.exe' | Where-Object FullName -Match '\\win64\\nssm\.exe$' | Select-Object -First 1
if (-not $NssmBin) { Die 'nssm.exe not found in archive' }
Copy-Item $NssmBin.FullName (Join-Path $Staging 'nssm\nssm.exe')

# --- 5. Tray app -------------------------------------------------------------
Log 'Publishing C# tray app (win-x64, self-contained, single-file)...'
Push-Location $TrayDir
try {
  foreach ($d in 'bin','obj','publish') { if (Test-Path $d) { Remove-Item $d -Recurse -Force } }
  & dotnet publish PglAttendanceTray.csproj `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:Version=$Version `
    -o (Join-Path $TrayDir 'publish')
  if ($LASTEXITCODE -ne 0) { Die 'dotnet publish failed' }
} finally { Pop-Location }
Copy-Item (Join-Path $TrayDir 'publish\PglAttendanceTray.exe') (Join-Path $Staging 'tray\PglAttendanceTray.exe')
Copy-Item (Join-Path $ProjectDir 'assets\app.ico')             (Join-Path $Staging 'tray\app.ico')

# --- 6. Service launcher + seed settings.json + seed DB ----------------------
Copy-Item (Join-Path $ProjectDir 'service\run-service.cmd') (Join-Path $Staging 'service\run-service.cmd')

@{ hrmisUrl = 'https://people-api.pglsystem.com'; port = 4001 } |
  ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $Staging 'seed\settings.json')

Log 'Pre-baking seed SQLite database with schema applied...'
$SeedDb = Join-Path $Staging 'seed\attendance.db'
if (Test-Path $SeedDb) { Remove-Item $SeedDb -Force }
Push-Location $BackendDir
try {
  $env:DATABASE_URL = "file:$SeedDb"
  & npx prisma db push --schema='prisma/schema.prisma' --skip-generate --accept-data-loss
  if ($LASTEXITCODE -ne 0) { Die 'prisma db push failed' }
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Pop-Location
}
if (-not (Test-Path $SeedDb) -or (Get-Item $SeedDb).Length -eq 0) { Die 'seed DB was not created' }

# --- 7. Inno Setup compile ---------------------------------------------------
Log 'Compiling installer with Inno Setup...'
& "$ISCC" /Q `
  "/DStagingDir=$Staging" `
  "/DMyAppVersion=$Version" `
  "/O$DistDir" `
  "$InstallerIss"
if ($LASTEXITCODE -ne 0) { Die "ISCC failed (exit $LASTEXITCODE)" }

$OutExe = Join-Path $DistDir "PGL-Attendance-Setup-$Version.exe"
if (-not (Test-Path $OutExe)) { Die "installer not produced ($OutExe missing)" }

$SizeMB = [math]::Round((Get-Item $OutExe).Length / 1MB, 1)
Log "Done. Installer: $OutExe ($SizeMB MB)"
