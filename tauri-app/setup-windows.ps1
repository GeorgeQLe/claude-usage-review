#Requires -RunAsAdministrator
<#
.SYNOPSIS
    One-click Windows setup & build script for ClaudeUsage Tauri app.
    Run from an elevated PowerShell: .\setup-windows.ps1

.DESCRIPTION
    Installs all prerequisites (Rust, Node.js, VS Build Tools, WiX),
    syncs the project to a Windows-native path (avoids WSL filesystem issues),
    then builds the MSI installer.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$wslSource = $PSScriptRoot
$buildDir  = "$env:USERPROFILE\tauri-build\claude-usage"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "    [SKIP] $msg" -ForegroundColor Yellow }

# ---------- 1. winget (should exist on Win 10 1709+ / Win 11) ----------
Write-Step "Checking winget..."
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error "winget is not available. Please install App Installer from the Microsoft Store."
}
Write-Ok "winget found"

# ---------- 2. Visual Studio Build Tools (C++ workload) ----------
Write-Step "Checking Visual Studio Build Tools (C++ desktop workload)..."
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasCpp = $false
if (Test-Path $vsWhere) {
    $instances = & $vsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($instances) { $hasCpp = $true }
}
if (-not $hasCpp) {
    Write-Host "    Installing Visual Studio Build Tools with C++ workload..." -ForegroundColor Yellow
    Write-Host "    This may take 10-20 minutes and will open an installer window." -ForegroundColor Yellow
    winget install Microsoft.VisualStudio.2022.BuildTools `
        --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" `
        --accept-source-agreements --accept-package-agreements
    Write-Ok "VS Build Tools installed"
} else {
    Write-Skip "C++ build tools already installed"
}

# ---------- 3. Rust ----------
Write-Step "Checking Rust..."
if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Host "    Installing Rust via winget..." -ForegroundColor Yellow
    winget install Rustlang.Rustup --accept-source-agreements --accept-package-agreements
    # Add cargo to current session PATH
    $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
    # Run rustup to install default toolchain
    rustup default stable
    Write-Ok "Rust installed"
} else {
    Write-Skip "Rust already installed ($(rustc --version))"
}

# ---------- 4. Node.js ----------
Write-Step "Checking Node.js..."
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "    Installing Node.js LTS via winget..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    Write-Ok "Node.js installed"
} else {
    Write-Skip "Node.js already installed ($(node --version))"
}

# ---------- 5. WiX Toolset (for MSI) ----------
Write-Step "Checking WiX Toolset..."
$wixDir = "${env:ProgramFiles(x86)}\WiX Toolset*"
$hasWix = (Get-ChildItem $wixDir -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0
if (-not $hasWix) {
    # Also check for cargo-installed wix
    if (-not (Get-Command wix -ErrorAction SilentlyContinue)) {
        Write-Host "    Installing WiX via winget..." -ForegroundColor Yellow
        winget install FireGiant.WiX --accept-source-agreements --accept-package-agreements
        Write-Ok "WiX Toolset installed"
    } else {
        Write-Skip "WiX CLI already installed"
    }
} else {
    Write-Skip "WiX Toolset already installed"
}

# ---------- 6. Refresh PATH for newly installed tools ----------
Write-Step "Refreshing PATH..."
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
if (Test-Path "$env:USERPROFILE\.cargo\bin") {
    $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
}

# Verify all tools are available
$missing = @()
foreach ($cmd in @("rustc", "cargo", "node", "npm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        $missing += $cmd
    }
}
if ($missing.Count -gt 0) {
    Write-Host "`n    Some tools were just installed and may need a new terminal session." -ForegroundColor Yellow
    Write-Host "    Missing from current PATH: $($missing -join ', ')" -ForegroundColor Yellow
    Write-Host "    Please close this terminal, open a new elevated PowerShell, and re-run this script." -ForegroundColor Yellow
    exit 1
}
Write-Ok "All tools available"

# ---------- 7. Sync project to Windows-native path ----------
Write-Step "Syncing project to $buildDir ..."
Write-Host "    Source: $wslSource" -ForegroundColor Gray
Write-Host "    Dest:   $buildDir" -ForegroundColor Gray

if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
}

# robocopy: /MIR = mirror, /XD = exclude dirs, /NFL /NDL /NP = quiet output
# robocopy returns 0-7 for success, 8+ for errors
$robocopyArgs = @(
    $wslSource, $buildDir,
    "/MIR",
    "/XD", "node_modules", "target", ".git",
    "/NFL", "/NDL", "/NP"
)
$robocopyResult = & robocopy @robocopyArgs
if ($LASTEXITCODE -ge 8) {
    Write-Error "robocopy failed with exit code $LASTEXITCODE"
}
Write-Ok "Project synced to $buildDir"

# ---------- 8. npm install (on Windows-native path) ----------
Write-Step "Installing Node dependencies..."
Push-Location $buildDir
# npm writes warnings to stderr; under $ErrorActionPreference = "Stop" PowerShell
# treats any stderr output as a terminating NativeCommandError. Temporarily relax.
$ErrorActionPreference = "Continue"
npm install 2>&1 | Write-Host
$ErrorActionPreference = "Stop"
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed with exit code $LASTEXITCODE" }
Write-Ok "npm install complete"

# ---------- 9. Build ----------
Write-Step "Building ClaudeUsage MSI..."
Write-Host "    This may take 5-15 minutes on first build (Rust compilation)." -ForegroundColor Yellow
Write-Host "    You will see cargo/rustc output below as it compiles." -ForegroundColor Yellow
Write-Host ""

$buildStart = Get-Date
$lastHeartbeat = $buildStart

# Stream build output line-by-line, injecting heartbeat messages during quiet periods
$buildProcess = Start-Process -FilePath "npx" -ArgumentList "tauri","build" `
    -NoNewWindow -PassThru -RedirectStandardOutput "$buildDir\.build-stdout.log" -RedirectStandardError "$buildDir\.build-stderr.log"

# Relax error preference during log tailing — Get-Content can throw if the log
# file is locked by the build process, and cargo stderr output is normal.
$ErrorActionPreference = "Continue"
$tailPos = 0
$tailPosErr = 0
while (-not $buildProcess.HasExited) {
    Start-Sleep -Milliseconds 500

    # Print any new stdout lines
    if (Test-Path "$buildDir\.build-stdout.log") {
        $content = Get-Content "$buildDir\.build-stdout.log" -Raw -ErrorAction SilentlyContinue
        if ($content -and $content.Length -gt $tailPos) {
            $newText = $content.Substring($tailPos)
            $tailPos = $content.Length
            Write-Host $newText -NoNewline
            $lastHeartbeat = Get-Date
        }
    }

    # Print any new stderr lines (cargo writes progress to stderr)
    if (Test-Path "$buildDir\.build-stderr.log") {
        $contentErr = Get-Content "$buildDir\.build-stderr.log" -Raw -ErrorAction SilentlyContinue
        if ($contentErr -and $contentErr.Length -gt $tailPosErr) {
            $newText = $contentErr.Substring($tailPosErr)
            $tailPosErr = $contentErr.Length
            Write-Host $newText -NoNewline
            $lastHeartbeat = Get-Date
        }
    }

    # Heartbeat if no output for 30 seconds
    if (((Get-Date) - $lastHeartbeat).TotalSeconds -ge 30) {
        $elapsed = [math]::Round(((Get-Date) - $buildStart).TotalMinutes, 1)
        Write-Host "    ... still building (${elapsed}m elapsed)" -ForegroundColor DarkGray
        $lastHeartbeat = Get-Date
    }
}

# Flush remaining output
if (Test-Path "$buildDir\.build-stdout.log") {
    $content = Get-Content "$buildDir\.build-stdout.log" -Raw -ErrorAction SilentlyContinue
    if ($content -and $content.Length -gt $tailPos) { Write-Host $content.Substring($tailPos) -NoNewline }
}
if (Test-Path "$buildDir\.build-stderr.log") {
    $contentErr = Get-Content "$buildDir\.build-stderr.log" -Raw -ErrorAction SilentlyContinue
    if ($contentErr -and $contentErr.Length -gt $tailPosErr) { Write-Host $contentErr.Substring($tailPosErr) -NoNewline }
}

$buildExitCode = $buildProcess.ExitCode
$ErrorActionPreference = "Stop"
Remove-Item "$buildDir\.build-stdout.log","$buildDir\.build-stderr.log" -Force -ErrorAction SilentlyContinue

$buildElapsed = [math]::Round(((Get-Date) - $buildStart).TotalMinutes, 1)
Write-Host ""
if ($buildExitCode -eq 0) {
    Write-Ok "Build completed in ${buildElapsed} minutes"
} else {
    Write-Host "    Build FAILED with exit code $buildExitCode after ${buildElapsed} minutes" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

# ---------- 10. Copy MSI back to WSL source ----------
$msiPath = Get-ChildItem "$buildDir\src-tauri\target\release\bundle\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($msiPath) {
    $destMsi = "$wslSource\$($msiPath.Name)"
    Copy-Item $msiPath.FullName $destMsi -Force
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD SUCCESSFUL" -ForegroundColor Green
    Write-Host "  MSI installer: $($msiPath.FullName)" -ForegroundColor Green
    Write-Host "  Copied to:     $destMsi" -ForegroundColor Green
    Write-Host "  Size: $([math]::Round($msiPath.Length / 1MB, 2)) MB" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  BUILD FAILED -- check output above" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    exit 1
}
