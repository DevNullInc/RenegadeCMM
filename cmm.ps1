<#
  Renegade Core Model Manager
  Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
  Licensed under GNU General Public License v3.0 (GPL-3.0)
#>
<#
.SYNOPSIS
  Renegade Core Model Manager - launcher script.

.DESCRIPTION
  Start, stop, or restart the Electron app from the terminal.

.PARAMETER Action
  The action to perform: start, stop, restart, status (default: start)

.PARAMETER Port
  Vite dev-server port (default: 5173)

.EXAMPLE
  .\cmm.ps1 start
  .\cmm.ps1 start -Port 3000
  .\cmm.ps1 stop
  .\cmm.ps1 restart
  .\cmm.ps1 status
#>

param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'restart', 'status', 'update', 'package', 'publish', 'dist', 'scan', 'download', 'check-updates', 'export', 'hf', 'workflows', 'clean-assets', 'help')]
  [string]$Action = 'start',

  [int]$Port = 5173,
  [int]$ApiPort = 5174,

  [switch]$Headless,
  [switch]$NoWindow,
  [switch]$CleanAssets,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$PidFile = Join-Path $ProjectRoot '.cmm.pid'
$InstalledMarker = Join-Path $ProjectRoot '.installed'

if ($Port -lt 1024 -or $Port -gt 65535) {
  Write-Status '!!' "Invalid Port ($Port). Must be between 1024 and 65535." 'Red'
  exit 1
}
if ($ApiPort -lt 1024 -or $ApiPort -gt 65535) {
  Write-Status '!!' "Invalid ApiPort ($ApiPort). Must be between 1024 and 65535." 'Red'
  exit 1
}

# -- Window Helper for Bringing Existing Window to Foreground -------------
# Compiled LAZILY on first use: 'Add-Type' shells out to the C# compiler, which costs
# 0.5-1.5s on every script invocation. 'status' / 'stop' / 'update' never touch a
# window and shouldn't pay that bill.
function Add-WindowHelperType {
  if ('WindowHelper' -as [type]) { return }
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WindowHelper {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsIconic(IntPtr hWnd);
}
"@ -ErrorAction SilentlyContinue
}

function Write-Status {
  param([string]$Icon, [string]$Msg, [string]$Color = 'Cyan')
  Write-Host "  [$Icon] " -NoNewline -ForegroundColor $Color
  Write-Host $Msg
}

function Set-ProcessWindowFocus {
  param([System.Diagnostics.Process]$Proc)
  Add-WindowHelperType
  if ($Proc -and $Proc.MainWindowHandle -and $Proc.MainWindowHandle -ne [IntPtr]::Zero) {
    try {
      # SW_RESTORE = 9, SW_SHOW = 5
      if ([WindowHelper]::IsIconic($Proc.MainWindowHandle)) {
        [WindowHelper]::ShowWindowAsync($Proc.MainWindowHandle, 9) | Out-Null
      } else {
        [WindowHelper]::ShowWindowAsync($Proc.MainWindowHandle, 5) | Out-Null
      }
      [WindowHelper]::SetForegroundWindow($Proc.MainWindowHandle) | Out-Null
      return $true
    } catch { }
  }
  return $false
}

function Wait-TcpPortReady {
  param([int]$Port, [int]$MaxWaitMs = 8000)
  $deadline = [Environment]::TickCount64 + $MaxWaitMs
  while ([Environment]::TickCount64 -lt $deadline) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
      $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
      if ($async.AsyncWaitHandle.WaitOne(150)) {
        $client.EndConnect($async)
        return $true
      }
    } catch { }
    finally { try { $client.Close() } catch { } }
    Start-Sleep -Milliseconds 100
  }
  return $false
}

$ProtectedBrowsers = @(
  'firefox', 'firefox-bin', 'chrome', 'googlechrome', 'chromium',
  'brave', 'opera', 'msedge', 'safari', 'vivaldi', 'zen', 'librewolf',
  'waterfox', 'tor', 'explorer', 'powershell', 'pwsh', 'cmd', 'conhost',
  'windowsterminal', 'system', 'svchost', 'taskmgr', 'csrss', 'lsass'
)

function Test-IsSafeToKill([System.Diagnostics.Process]$Proc, [hashtable]$CmdLines = @{}) {
  if (-not $Proc -or $Proc.HasExited) { return $false }
  if ($Proc.Id -le 4 -or $Proc.Id -eq $PID) { return $false }

  $name = $Proc.ProcessName.ToLower()
  foreach ($prot in $ProtectedBrowsers) {
    if ($name -like "*$prot*") { return $false }
  }

  try {
    $procPath = $Proc.MainModule.FileName.ToLower()
    foreach ($prot in $ProtectedBrowsers) {
      if ($procPath -like "*$prot*") { return $false }
    }
  } catch { }

  # Must be node or electron
  if ($name -eq 'electron' -or $name -eq 'node' -or $name -like '*civitai*') {
    # Check if CommandLine or arguments contain protected browser names. The caller
    # passes a pre-fetched PID -> command-line map (one batched CIM round trip instead
    # of ~1s per PID); a direct query is the fallback for a cache miss.
    try {
      $cmd = $CmdLines[$Proc.Id]
      if ([string]::IsNullOrWhiteSpace($cmd)) {
        $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($Proc.Id)" -ErrorAction SilentlyContinue).CommandLine
      }
      if ($cmd) {
        $cmdLower = $cmd.ToLower()
        foreach ($prot in $ProtectedBrowsers) {
          if ($cmdLower -like "*$prot*") { return $false }
        }
      }
    } catch { }
    return $true
  }

  return $false
}

function Get-CommandLineCache([int[]]$ProcessIds) {
  $cache = @{}
  $unique = @($ProcessIds | Where-Object { $_ -gt 4 } | Select-Object -Unique)
  if ($unique.Count -gt 0) {
    try {
      # The Win32_Process IN(...) filter silently returns no rows on some machines, and
      # a per-PID query costs ~1s each. One unfiltered WMI round trip for the whole
      # process table (~1s regardless of size) is the reliable way to cover every
      # candidate in a single call.
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $unique -contains [int]$_.ProcessId } |
        ForEach-Object { $cache[[int]$_.ProcessId] = [string]$_.CommandLine }
    } catch { }
  }
  return $cache
}

function Get-RunningProcs {
  $running = @()
  $seenPids = [System.Collections.Generic.HashSet[int]]::new()
  $candidates = [System.Collections.Generic.List[object]]::new()

  # 1. Check stored PID file with strict verification
  if (Test-Path $PidFile) {
    $storedPids = Get-Content $PidFile -ErrorAction SilentlyContinue | ForEach-Object { [int]$_ }
    foreach ($procId in $storedPids) {
      if ($procId -gt 4 -and $seenPids.Add($procId)) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) { $candidates.Add([pscustomobject]@{ Pid = $proc.Id; Proc = $proc }) }
      }
    }
  }

  # 2. Check network ports 5173 ($Port) and 5174 ($ApiPort) in LISTEN state only
  $portHolders = Get-NetTCPConnection -LocalPort $Port, $ApiPort -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
  if ($portHolders) {
    foreach ($ph in $portHolders) {
      if ($ph -gt 4 -and $seenPids.Add($ph)) {
        $proc = Get-Process -Id $ph -ErrorAction SilentlyContinue
        if ($proc) { $candidates.Add([pscustomobject]@{ Pid = $proc.Id; Proc = $proc }) }
      }
    }
  }

  # 3. Check any Electron processes associated with this workspace
  $electronProcs = Get-Process -Name 'electron' -ErrorAction SilentlyContinue
  foreach ($ep in $electronProcs) {
    try {
      if ($ep.Path -like "*$ProjectRoot*" -or $ep.Path -like "*node_modules\electron*") {
        if ($seenPids.Add($ep.Id)) { $candidates.Add([pscustomobject]@{ Pid = $ep.Id; Proc = $ep }) }
      }
    } catch { }
  }

  if ($candidates.Count -eq 0) { return $running }

  # Fetch every candidate's command line in ONE batched CIM query (a per-PID filter
  # costs ~1s each, so this trims a 4-process app from ~4s of WMI time to ~1s).
  $cmdCache = Get-CommandLineCache @($candidates | ForEach-Object { $_.Pid })

  foreach ($cand in $candidates) {
    if (Test-IsSafeToKill $cand.Proc $cmdCache) {
      $running += $cand.Proc
    }
  }

  return $running
}

function Stop-App {
  $procs = Get-RunningProcs
  if ($procs.Count -eq 0) {
    Write-Status '!' 'No running Renegade Core Model Manager processes found.' 'Yellow'
    return $false
  }

  Write-Status 'x' "Stopping $($procs.Count) process(es)..." 'Red'
  # Pre-fetch command lines once so the safety re-check doesn't repeat the per-PID CIM tax.
  $cmdCache = Get-CommandLineCache @($procs | ForEach-Object { $_.Id })
  foreach ($p in $procs) {
    try {
      if (Test-IsSafeToKill $p $cmdCache) {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        Write-Status 'ok' "Killed PID $($p.Id) ($($p.ProcessName))" 'DarkGray'
      }
    }
    catch {
      Write-Status '!!' "Failed to kill PID $($p.Id): $_" 'Red'
    }
  }

  if (Test-Path $PidFile) {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }
  Write-Status 'ok' 'Application stopped.' 'Green'
  return $true
}

# Prunes stale hashed renderer bundles from dist/assets after the app has fully stopped.
# Non-destructive: only `index-*.js` / `index-*.css` are considered; every asset referenced
# by dist/index.html (plus the single newest js/css pair as a safety net) is kept. Missing
# files are not errors and the folder is never wiped wholesale.
function Clean-Assets {
  $assetsDir = Join-Path $ProjectRoot 'dist\assets'
  $indexHtml = Join-Path $ProjectRoot 'dist\index.html'

  if (-not (Test-Path $assetsDir)) {
    Write-Status '!' 'No dist\assets directory found; nothing to clean.' 'DarkGray'
    return
  }

  $keep = New-Object System.Collections.Generic.HashSet[string]
  if (Test-Path $indexHtml) {
    $html = Get-Content -LiteralPath $indexHtml -Raw -ErrorAction SilentlyContinue
    if ($html) {
      [regex]::Matches($html, '(?:src|href)\s*=\s*["'']([^"'']*assets/[^"'']+)["'']') |
        ForEach-Object {
          $ref = $_.Groups[1].Value
          if ($ref -match '\.(js|css)$') {
            $name = [System.IO.Path]::GetFileName($ref.TrimEnd('/'))
            if ($name) { [void]$keep.Add($name) }
          }
        }
    }
  }

  # Newest single js + css pair as a safety net (in case index.html hasn't been updated yet).
  $candidates = @(Get-ChildItem -LiteralPath $assetsDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^index-.*\.(js|css)$' })
  foreach ($group in $candidates | Group-Object { $_.Extension.ToLowerInvariant() }) {
    $newest = $group.Group | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newest) { [void]$keep.Add($newest.Name) }
  }

  $removed = 0
  foreach ($file in $candidates) {
    if ($keep.Contains($file.Name)) { continue }
    try {
      Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
      $removed++
    }
    catch {
      Write-Status '!' "Skipped $($file.Name): $($_.Exception.Message)" 'DarkGray'
    }
  }

  if ($removed -gt 0) {
    Write-Status 'ok' "Pruned $removed orphaned asset(s) from dist\assets." 'Green'
  }
  else {
    Write-Status 'ok' 'No orphaned dist assets to prune.' 'DarkGray'
  }
}

function Ensure-NodeInstalled {
  $nodeModulesDir = Join-Path $ProjectRoot 'node_modules'

  # First-run watchdog: once the environment is proven (Node + node_modules present),
  # later launches flat-skip the entire provisioning block — no node/npm/npx PATH
  # probing, no winget/MSI fallback, no npm install. The only exception is a wiped
  # ./node_modules, which falls through to a full re-provision (and re-stamp).
  if (Test-Path $InstalledMarker) {
    if (Test-Path $nodeModulesDir) { return }
    Remove-Item $InstalledMarker -Force -ErrorAction SilentlyContinue
  }

  $nodeCmd = Get-Command 'node' -ErrorAction SilentlyContinue
  $npmCmd = Get-Command 'npm' -ErrorAction SilentlyContinue
  $npxCmd = Get-Command 'npx' -ErrorAction SilentlyContinue

  if (-not $nodeCmd -or -not $npmCmd -or -not $npxCmd) {
    Write-Status '!' 'Node.js runtime was not detected on this system.' 'Yellow'
    Write-Host ''
    Write-Host '  Renegade Core Model Manager requires Node.js (v20+ LTS recommended).' -ForegroundColor Yellow
    Write-Host ''

    $installed = $false
    # Check if winget is available
    $wingetCmd = Get-Command 'winget' -ErrorAction SilentlyContinue
    if ($wingetCmd) {
      Write-Status '>>' 'Attempting automatic Node.js installation via Windows Package Manager (winget)...' 'Cyan'
      try {
        & winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
        if ($LASTEXITCODE -eq 0) {
          $installed = $true
        }
      } catch {
        Write-Status '!!' "Winget installation encountered an issue: $_" 'Red'
      }
    }

    # If winget was not available or failed, download and run official MSI installer from nodejs.org
    if (-not $installed) {
      Write-Status '>>' 'Downloading official Node.js LTS installer from nodejs.org...' 'Cyan'
      $tempMsi = Join-Path $env:TEMP 'node-lts-installer.msi'
      try {
        $nodeDownloadUrl = 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi'
        Invoke-WebRequest -Uri $nodeDownloadUrl -OutFile $tempMsi -UseBasicParsing
        Write-Status '>>' 'Running Node.js installer (passive mode)...' 'Cyan'
        $installerProc = Start-Process msiexec.exe -ArgumentList "/i `"$tempMsi`" /passive /norestart" -PassThru -Wait
        if ($installerProc.ExitCode -eq 0) {
          $installed = $true
        }
      } catch {
        Write-Status '!!' "Failed downloading Node.js installer: $_" 'Red'
        Write-Host ''
        Write-Host '  Please download and install Node.js manually from: https://nodejs.org/' -ForegroundColor Cyan
        throw 'Node.js is required to run Renegade Core Model Manager.'
      }
    }

    # Refresh current PowerShell session environment PATH
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"

    $recheck = Get-Command 'node' -ErrorAction SilentlyContinue
    if ($recheck) {
      $nodeVer = & node -v
      Write-Status 'ok' "Node.js environment verified ($nodeVer)!" 'Green'
    } else {
      Write-Status '!' 'Node.js was installed. If commands fail, please restart your PowerShell terminal.' 'Yellow'
    }
  }

  # Check if project dependencies (node_modules) are installed
  if (-not (Test-Path $nodeModulesDir)) {
    Write-Status '>>' 'node_modules not found. Installing project dependencies (npm install)...' 'Cyan'
    Push-Location $ProjectRoot
    try {
      & npm install
      if ($LASTEXITCODE -ne 0) {
        throw 'npm install failed.'
      }
      Write-Status 'ok' 'Dependencies installed successfully.' 'Green'
    } finally {
      Pop-Location
    }
  }

  # Stamp the completed first-run setup so every later launch skips installer work.
  $null = New-Item -Path $InstalledMarker -ItemType File -Force
}

function Check-GitUpdates {
  # Check if release mode is forced or configured in src/version.ts
  if ($env:CMM_RELEASE_BUILD -eq 'true' -or $env:NODE_ENV -eq 'production') {
    return
  }
  $versionFile = Join-Path $ProjectRoot 'src\version.ts'
  if (Test-Path $versionFile) {
    $versionContent = Get-Content $versionFile -Raw
    if ($versionContent -match 'IS_DEV_BUILD:\s*false') {
      return
    }
  }

  if (Test-Path (Join-Path $ProjectRoot '.git')) {
    # Never stall a launch on GitHub. Flaky DNS/network can hang 'git ls-remote' for
    # many seconds, so only contact the remote if the last check is > 1h old, and cap
    # that single lookup at 4 seconds regardless of network state.
    $updateStamp = Join-Path $ProjectRoot '.cmm-update-check'
    $stampAge = [DateTime]::MinValue
    if (Test-Path $updateStamp) {
      try { $stampAge = [System.IO.File]::GetLastWriteTimeUtc($updateStamp) } catch { }
    }
    if ([DateTime]::UtcNow - $stampAge -lt [TimeSpan]::FromHours(1)) {
      return
    }

    try {
      $localSha = (git rev-parse --short HEAD 2>$null)
      $remoteSha = $null
      if ($localSha) {
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = 'git'
        $psi.Arguments = 'ls-remote --heads origin main'
        $psi.WorkingDirectory = $ProjectRoot
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $gitProc = [System.Diagnostics.Process]::Start($psi)
        if ($gitProc.WaitForExit(4000)) {
          $remoteOutput = $gitProc.StandardOutput.ReadToEnd().Trim()
          if ($remoteOutput) {
            $fullSha = ($remoteOutput.Split("`t")[0]).Trim()
            $remoteSha = if ($fullSha.Length -ge 7) { $fullSha.Substring(0, 7) } else { $fullSha }
          }
        } else {
          try { $gitProc.Kill() } catch { }
        }
      }
      # Stamp the check even on failure so a flaky connection doesn't re-hit the remote
      # for another hour.
      try {
        $null = New-Item -Path $updateStamp -ItemType File -Force
        [System.IO.File]::SetLastWriteTimeUtc($updateStamp, [DateTime]::UtcNow)
      } catch { }

      if ($remoteSha -and $localSha -and ($remoteSha -ne $localSha)) {
        Write-Host ''
        Write-Status '!' "DEVELOPMENT UPDATE: Newer commit available on GitHub ($remoteSha)!" 'Yellow'
        Write-Host "      Current Local Commit : $localSha" -ForegroundColor Cyan
        Write-Host "      Latest GitHub Commit : $remoteSha (main branch)" -ForegroundColor Green
        Write-Host '      Note: You are running an active development version (not a tagged release).' -ForegroundColor Yellow
        Write-Host '      Run .\cmm.ps1 update or git pull to update your development copy.' -ForegroundColor Yellow
        Write-Host ''
      }
    } catch { }
  }
}

function Update-App {
  if (-not (Test-Path (Join-Path $ProjectRoot '.git'))) {
    Write-Status '!!' 'This installation is not a Git clone. Cannot update automatically.' 'Red'
    Write-Host '  To update standalone builds, download the latest development release from GitHub.' -ForegroundColor Yellow
    return
  }

  Write-Status '>>' 'Pulling latest development updates from GitHub (git pull origin main)...' 'Cyan'
  Push-Location $ProjectRoot
  try {
    & git pull origin main
    if ($LASTEXITCODE -ne 0) {
      throw 'git pull failed.'
    }
    Write-Status 'ok' 'Git repository updated successfully.' 'Green'

    Ensure-NodeInstalled
    Write-Status '>>' 'Rebuilding application...' 'Cyan'
    & npm run build
    if ($LASTEXITCODE -ne 0) {
      throw 'Build failed.'
    }
    Write-Status 'ok' 'Update complete! You can now launch with .\cmm.ps1 start' 'Green'
  }
  finally {
    Pop-Location
  }
}

function Start-App {
  Ensure-NodeInstalled
  # Check for Git development updates
  Check-GitUpdates

  # Check if already running or if ports 5173/5174 are in use
  $existing = Get-RunningProcs
  if ($existing.Count -gt 0) {
    # Check if any running process has a visible GUI window to bring to the front
    foreach ($p in $existing) {
      if (Set-ProcessWindowFocus $p) {
        Write-Status 'ok' "Renegade Core Model Manager is already running (PID $($p.Id)). Active window brought to front." 'Green'
        return
      }
    }

    # If port is occupied but no visible window exists (orphaned ghost process), stop and auto-restart cleanly
    Write-Status '!' "Port $Port/5174 is in use by an orphaned process without an active window. Auto-cleaning orphaned process and starting fresh..." 'Yellow'
    Stop-App | Out-Null
    Start-Sleep -Seconds 1
  }

  # 1) Build
  Write-Status '>>' 'Building project...' 'Cyan'
  Push-Location $ProjectRoot

  try {
    Write-Status '>>' 'Building renderer (Vite) + main process (TypeScript) in parallel...' 'Cyan'
    $origEAP = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      if ($PSVersionTable.PSEdition -eq 'Core') {
        # Renderer and main write to disjoint dist/ subtrees, so build them concurrently.
        $buildResults = 1..2 | ForEach-Object -Parallel {
          Push-Location $using:ProjectRoot
          try {
            if ($_ -eq 1) {
              $out = npx.cmd vite build --base ./ --emptyOutDir false 2>&1
            } else {
              $out = npx.cmd tsc --project tsconfig.main.json --listEmittedFiles 2>&1
            }
            [pscustomobject]@{
              Name    = if ($_ -eq 1) { 'renderer' } else { 'main' }
              Success = $LASTEXITCODE -eq 0
              Output  = ($out -join "`n")
            }
          } finally {
            Pop-Location
          }
        } -ThrottleLimit 2
      } else {
        $rendererOut = npx.cmd vite build --base ./ --emptyOutDir false 2>&1
        $rendererOk = $LASTEXITCODE -eq 0
        $mainOut = npx.cmd tsc --project tsconfig.main.json --listEmittedFiles 2>&1
        $mainOk = $LASTEXITCODE -eq 0
        $buildResults = @(
          [pscustomobject]@{ Name = 'renderer'; Success = $rendererOk; Output = ($rendererOut -join "`n") }
          [pscustomobject]@{ Name = 'main'; Success = $mainOk; Output = ($mainOut -join "`n") }
        )
      }
    } finally {
      $ErrorActionPreference = $origEAP
    }

    $renderer = $buildResults | Where-Object { $_.Name -eq 'renderer' } | Select-Object -First 1
    $main = $buildResults | Where-Object { $_.Name -eq 'main' } | Select-Object -First 1

    if (-not $renderer.Success) {
      Write-Status '!!' 'Renderer build failed!' 'Red'
      Write-Host ''
      Write-Host '  Vite output:' -ForegroundColor Yellow
      Write-Host '  ' -NoNewline
      Write-Host $renderer.Output -ForegroundColor Red
      Pop-Location
      return
    }
    Write-Status 'ok' 'Renderer built successfully.' 'Green'

    if (-not $main.Success) {
      Write-Status '!!' 'Main process TypeScript compilation FAILED!' 'Red'
      Write-Host ''
      Write-Host '  TypeScript errors:' -ForegroundColor Yellow
      Write-Host '  ' -NoNewline
      Write-Host $main.Output -ForegroundColor Red
      Pop-Location
      return
    }
    Write-Status 'ok' 'TypeScript compilation succeeded.' 'Green'
    
    # Verify main process entry point exists
    $expectedMainFile = "dist/main/index.js"
    if (-not (Test-Path $expectedMainFile)) {
      Write-Status '!!' "Main entry point NOT FOUND: $expectedMainFile" 'Red'
      Pop-Location
      return
    }
    Write-Status 'ok' "Main process entry point verified: $expectedMainFile" 'Green'
  }
  catch {
    Write-Status '!!' "Unexpected build error: $_" 'Red'
    Write-Host ''
    Write-Host '  Stack trace:' -ForegroundColor DarkGray
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    Pop-Location
    return
  }

  # 2) Start Vite dev server (for browser access)
  Write-Status '>>' "Starting Vite server on port $Port..." 'Cyan'
  $env:PORT = "$Port"
  $env:API_PORT = "$ApiPort"
  $env:VITE_DEV_SERVER_URL = "http://localhost:$Port"
  $viteArgs = @('vite', '--port', "$Port", '--host', '127.0.0.1')
  $viteProc = Start-Process -FilePath 'npx.cmd' `
    -ArgumentList $viteArgs `
    -WorkingDirectory $ProjectRoot `
    -PassThru -WindowStyle Hidden

  # Poll until Vite actually accepts connections instead of sleeping a fixed 2s
  # (usually ready well before that).
  if (Wait-TcpPortReady -Port $Port -MaxWaitMs 10000) {
    Write-Status 'ok' "Vite dev server ready on port $Port (http://localhost:$Port)." 'Green'
  } else {
    Write-Status '!' 'Vite server is still starting up; launching Electron anyway.' 'Yellow'
  }

  # 3) Start Electron App (or run headless)
  $localElectron = Join-Path $ProjectRoot "node_modules\electron\dist\electron.exe"
  $electronExe = if (Test-Path $localElectron) { $localElectron } else { 'npx.cmd' }
  $electronArgs = if (Test-Path $localElectron) {
    if ($Headless -or $NoWindow) { @('.', '--headless') } else { @('.') }
  } else {
    if ($Headless -or $NoWindow) { @('electron', '.', '--headless') } else { @('electron', '.') }
  }

  if ($Headless -or $NoWindow) {
    Write-Status '>>' 'Starting Electron in headless background mode...' 'Magenta'
    $env:HEADLESS = "true"
    $electronProc = Start-Process -FilePath $electronExe `
      -ArgumentList $electronArgs `
      -WorkingDirectory $ProjectRoot `
      -PassThru -WindowStyle Hidden
  } else {
    Write-Status '>>' 'Launching Electron app window...' 'Magenta'
    $env:HEADLESS = "false"
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $electronExe
    $startInfo.Arguments = ($electronArgs -join ' ')
    $startInfo.WorkingDirectory = $ProjectRoot
    $startInfo.UseShellExecute = $true
    $electronProc = [System.Diagnostics.Process]::Start($startInfo)
  }

  # Save PIDs
  $pidsToSave = @()
  if ($viteProc -and -not $viteProc.HasExited) { $pidsToSave += $viteProc.Id }
  if ($electronProc -and -not $electronProc.HasExited) { $pidsToSave += $electronProc.Id }
  if ($pidsToSave.Count -gt 0) {
    $pidsToSave | Set-Content $PidFile
  }

  Write-Host ''
  Write-Status 'ok' 'Renegade Core Model Manager is running!' 'Green'
  Write-Host ''
  Write-Host "    Web / Browser UI : http://localhost:$Port" -ForegroundColor DarkGray
  Write-Host "    HTTP API Bridge  : http://localhost:$ApiPort" -ForegroundColor DarkGray
  if ($Headless -or $NoWindow) {
    Write-Host "    Mode             : Headless / Web-only" -ForegroundColor DarkGray
  } else {
    Write-Host "    Electron App     : PID $($electronProc.Id)" -ForegroundColor DarkGray
  }
  Write-Host "    PID file         : $PidFile" -ForegroundColor DarkGray
  Write-Host ''
  Write-Host '    Use  .\cmm.ps1 stop     to shut down' -ForegroundColor DarkGray
  Write-Host '    Use  .\cmm.ps1 restart  to restart' -ForegroundColor DarkGray
  Write-Host ''

  Pop-Location
}

function Show-Status {
  $procs = Get-RunningProcs
  if ($procs.Count -eq 0) {
    Write-Status '-' 'Renegade Core Model Manager is not running.' 'Yellow'
  }
  else {
    Write-Status '+' "Renegade Core Model Manager is running ($($procs.Count) processes):" 'Green'
    foreach ($p in $procs) {
      Write-Host "      PID $($p.Id)  -  $($p.ProcessName)" -ForegroundColor DarkGray
    }
  }
}

# -- Banner ----------------------------------------------------------------

function Invoke-AppPackage {
  Ensure-NodeInstalled
  Write-Status '>>' 'Building production assets...' 'Cyan'
  
  Write-Status '>>' 'Building renderer process with Vite...' 'Cyan'
  npx.cmd vite build --base ./ --emptyOutDir false
  if ($LASTEXITCODE -ne 0) {
    throw 'Vite build failed.'
  }
  Write-Status 'ok' 'Renderer built successfully.' 'Green'

  Write-Status '>>' 'Building Electron main process...' 'Cyan'
  npx.cmd tsc --project tsconfig.main.json
  if ($LASTEXITCODE -ne 0) {
    throw 'TypeScript main process compilation failed.'
  }
  Write-Status 'ok' 'TypeScript compilation succeeded.' 'Green'

  Write-Status '>>' 'Packaging standalone Windows binary with electron-builder...' 'Cyan'
  npx.cmd electron-builder --win portable nsis
  if ($LASTEXITCODE -ne 0) {
    throw 'electron-builder packaging failed.'
  }

  Write-Status 'ok' 'Standalone binary packaged successfully!' 'Green'
  Write-Host ''
  Write-Host '  Release Binaries in ./release/' -ForegroundColor Green
  if (Test-Path (Join-Path $ProjectRoot 'release')) {
    Get-ChildItem -Path (Join-Path $ProjectRoot 'release') -Filter '*.exe' | ForEach-Object {
      Write-Host "    - $($_.Name)  ($([Math]::Round($_.Length / 1MB, 2)) MB)" -ForegroundColor Cyan
    }
  }
  Write-Host ''
}

# -- Banner ----------------------------------------------------------------

Write-Host ''
Write-Host '  +-------------------------------------+' -ForegroundColor Magenta
Write-Host '  |     Renegade Core Model Manager     |' -ForegroundColor Magenta
Write-Host '  +-------------------------------------+' -ForegroundColor Magenta
Write-Host ''

# -- Dispatch --------------------------------------------------------------

switch ($Action) {
  'start' {
    Start-App
  }
  'stop' {
    Stop-App | Out-Null
    # Janitor: prune orphaned hashed assets only after processes are fully stopped.
    Clean-Assets
  }
  'clean-assets' {
    Clean-Assets
  }
  'restart' {
    Write-Status '>>' 'Restarting application...' 'Cyan'
    Stop-App | Out-Null
    Clean-Assets
    Start-Sleep -Milliseconds 500
    Start-App
  }
  'status' {
    Show-Status
  }
  'update' {
    Update-App
  }
  'package' {
    Invoke-AppPackage
  }
  'publish' {
    Invoke-AppPackage
  }
  'dist' {
    Invoke-AppPackage
  }
  default {
    Ensure-NodeInstalled
    $cliScript = Join-Path $ProjectRoot 'bin\cmm.js'
    $allCliArgs = @($Action) + $RemainingArgs
    & node $cliScript @allCliArgs
  }
}