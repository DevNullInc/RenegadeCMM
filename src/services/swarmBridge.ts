/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import axios from 'axios';
import child_process from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SwarmStatus } from '../types/app';
import { logger } from '../utils/logger';
import { isSafeNetworkUrl } from '../utils/securityValidator';
import { swarmAuthToken } from './swarmAuthToken';

export class SwarmBridge {
  private static instance: SwarmBridge;

  public static getInstance(): SwarmBridge {
    if (!SwarmBridge.instance) {
      SwarmBridge.instance = new SwarmBridge();
    }
    return SwarmBridge.instance;
  }

  /**
   * Normalizes and validates the Swarm daemon endpoint URL.
   * Default is http://127.0.0.1:5180.
   */
  public normalizeUrl(rawUrl?: string): string {
    let url = (rawUrl && rawUrl.trim()) ? rawUrl.trim() : 'http://127.0.0.1:5180';
    url = url.replace(/\/+$/, '');

    // Reject non-HTTP protocol schemes before prepending http://
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !/^https?:/i.test(url)) {
      logger.warn(`Security: Disallowed protocol in Swarm daemon URL [${url}], defaulting to http://127.0.0.1:5180`);
      return 'http://127.0.0.1:5180';
    }

    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }
    const check = isSafeNetworkUrl(url);
    if (!check.safe) {
      logger.warn(`Security: Invalid Swarm daemon URL rejected [${url}], defaulting to http://127.0.0.1:5180`);
      return 'http://127.0.0.1:5180';
    }
    return check.url ? check.url.replace(/\/+$/, '') : 'http://127.0.0.1:5180';
  }

  /**
   * Probes the local RenegadeSwarm sister daemon for health & swarm state.
   * Public unauthenticated endpoint.
   */
  public async checkSwarmStatus(targetUrl?: string): Promise<SwarmStatus> {
    const url = this.normalizeUrl(targetUrl);

    // 1. Try standard /api/health endpoint
    try {
      const res = await axios.get(`${url}/api/health`, {
        timeout: 1500,
        headers: { Accept: 'application/json' },
      });

      if (res.status === 200 && res.data) {
        const data = res.data;
        const peers = typeof data.peers === 'number'
          ? data.peers
          : typeof data.swarm?.peers === 'number'
            ? data.swarm.peers
            : typeof data.peer_count === 'number'
              ? data.peer_count
              : 0;

        const seeding = typeof data.seeding === 'number'
          ? data.seeding
          : typeof data.swarm?.seeding === 'number'
            ? data.swarm.seeding
            : typeof data.active_seeds === 'number'
              ? data.active_seeds
              : 0;

        const version = String(data.version || data.daemon_version || data.system?.version || 'Active');

        return {
          online: true,
          serverUrl: url,
          version,
          peers,
          seeding,
          status: data.status || 'ok',
        };
      }
    } catch (err: any) {
      logger.debug(`Swarm /api/health probe failed on ${url}, attempting fallback:`, err.message);
    }

    // 2. Try fallback endpoint /health
    try {
      const res = await axios.get(`${url}/health`, {
        timeout: 1200,
        headers: { Accept: 'application/json' },
      });

      if (res.status === 200 && res.data) {
        const data = res.data;
        return {
          online: true,
          serverUrl: url,
          version: String(data.version || 'Active'),
          peers: typeof data.peers === 'number' ? data.peers : 0,
          seeding: typeof data.seeding === 'number' ? data.seeding : 0,
          status: data.status || 'ok',
        };
      }
    } catch {}

    // 3. Try fallback endpoint /api/status
    try {
      const res = await axios.get(`${url}/api/status`, {
        timeout: 1000,
        headers: { Accept: 'application/json' },
      });

      if (res.status === 200 && res.data) {
        const data = res.data;
        return {
          online: true,
          serverUrl: url,
          version: String(data.version || 'Active'),
          peers: typeof data.peers === 'number' ? data.peers : (data.swarm?.peers || 0),
          seeding: typeof data.seeding === 'number' ? data.seeding : (data.swarm?.seeding || 0),
          status: data.status || 'ok',
        };
      }
    } catch {}

    return {
      online: false,
      serverUrl: url,
      error: 'RenegadeSwarm daemon not responding on ' + url,
    };
  }

  /**
   * Intelligently searches for and activates the running RenegadeSwarm Electron window.
   * 1. First tries daemon window focus endpoint (POST /api/window/focus with Bearer token)
   * 2. Searches for active Electron window via OS process/window APIs and activates it
   * 3. If no active window is found, checks for installed desktop executable and launches it
   * 4. Only falls back to browser if native window activation/launch is unavailable
   */
  public async focusOrOpenSwarm(targetUrl?: string): Promise<{ success: boolean; method: 'daemon_focus' | 'os_window' | 'browser'; url: string; error?: string }> {
    const url = this.normalizeUrl(targetUrl);

    // 1. Try daemon focus API endpoint (POST only with Bearer token)
    let token = swarmAuthToken.loadSwarmDaemonToken();
    if (token) {
      try {
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        };
        let res;
        try {
          res = await axios.post(`${url}/api/window/focus`, {}, { timeout: 1500, headers });
        } catch (err: any) {
          if (err.response?.status === 401) {
            // Token may have refreshed; reload and retry once
            token = swarmAuthToken.loadSwarmDaemonToken(true);
            if (token) {
              res = await axios.post(`${url}/api/window/focus`, {}, {
                timeout: 1500,
                headers: { ...headers, 'Authorization': `Bearer ${token}` }
              });
            } else {
              swarmAuthToken.setLastAuthError('Swarm daemon rejected auth (missing or stale token)');
            }
          } else {
            // Fallback to /api/focus with the same Bearer header (POST only)
            res = await axios.post(`${url}/api/focus`, {}, { timeout: 1500, headers }).catch((fallbackErr) => {
              if (fallbackErr.response?.status === 401) {
                swarmAuthToken.setLastAuthError('Swarm daemon rejected auth (missing or stale token)');
              }
              return null;
            });
          }
        }
        if (res?.status === 200) {
          logger.info('Successfully focused RenegadeSwarm window via daemon focus API');
          return { success: true, method: 'daemon_focus', url };
        }
      } catch (err: any) {
        if (err.response?.status === 401) {
          swarmAuthToken.setLastAuthError('Swarm daemon rejected auth (missing or stale token)');
        }
        logger.debug('Swarm daemon focus endpoint returned non-200, attempting OS window fallback:', err.message);
      }
    } else {
      logger.debug('Swarm daemon bearer token not found; falling back to native OS window focus');
    }

    // 2. Search for active Electron window and bring to foreground
    try {
      const platform = os.platform();
      let focused = false;

      if (platform === 'win32') {
        const psScript = `
          $w = New-Object -ComObject WScript.Shell
          $activated = $w.AppActivate('RenegadeSwarm') -or $w.AppActivate('Renegade Swarm') -or $w.AppActivate('Swarm')
          if ($activated) { exit 0 }

          $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { 
            ($_.ProcessName -match '(?i)renegadeswarm|swarm' -or ($_.ProcessName -eq 'electron' -and $_.MainWindowTitle -match '(?i)swarm')) -and $_.MainWindowHandle -ne 0
          }
          if ($procs) {
            $p = $procs | Select-Object -First 1
            $code = @"
              using System;
              using System.Runtime.InteropServices;
              public class Win32WindowHelper {
                [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
                [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
              }
"@
            Add-Type -TypeDefinition $code -Language CSharp -IgnoreWarnings
            [Win32WindowHelper]::ShowWindow($p.MainWindowHandle, 9)
            [Win32WindowHelper]::SetForegroundWindow($p.MainWindowHandle)
            exit 0
          }
          exit 1
        `;
        const res = child_process.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 3000, windowsHide: true });
        if (res.status === 0) {
          focused = true;
        }
      } else if (platform === 'darwin') {
        const res = child_process.spawnSync('osascript', ['-e', 'tell application "RenegadeSwarm" to activate'], { timeout: 2000 });
        if (res.status === 0) {
          focused = true;
        }
      } else if (platform === 'linux') {
        const res = child_process.spawnSync('wmctrl', ['-a', 'RenegadeSwarm'], { timeout: 1500 });
        if (res.status === 0) {
          focused = true;
        }
      }

      if (focused) {
        logger.info('Successfully activated active RenegadeSwarm Electron desktop window via OS API');
        return { success: true, method: 'os_window', url };
      }
    } catch (err: any) {
      logger.debug('Native OS window focus check failed:', err.message);
    }

    // 3. Fallback: try launching the installed desktop executable if found locally
    try {
      const platform = os.platform();

      if (platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || '';
        const programFiles = process.env.ProgramFiles || '';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || '';
        const candidates = [
          path.join(localAppData, 'Programs', 'RenegadeSwarm', 'RenegadeSwarm.exe'),
          path.join(localAppData, 'Programs', 'renegadeswarm', 'renegadeswarm.exe'),
          path.join(programFiles, 'RenegadeSwarm', 'RenegadeSwarm.exe'),
          path.join(programFilesX86, 'RenegadeSwarm', 'RenegadeSwarm.exe'),
          path.join(localAppData, 'renegadeswarm', 'RenegadeSwarm.exe'),
        ];
        for (const exe of candidates) {
          if (fs.existsSync(exe)) {
            child_process.spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
            logger.info(`Launched installed RenegadeSwarm desktop app executable at ${exe}`);
            return { success: true, method: 'os_window', url };
          }
        }
      } else if (platform === 'darwin') {
        const candidates = [
          '/Applications/RenegadeSwarm.app',
          path.join(os.homedir(), 'Applications', 'RenegadeSwarm.app'),
        ];
        for (const appPath of candidates) {
          if (fs.existsSync(appPath)) {
            child_process.spawnSync('open', ['-a', appPath]);
            logger.info(`Launched installed RenegadeSwarm macOS app at ${appPath}`);
            return { success: true, method: 'os_window', url };
          }
        }
      } else if (platform === 'linux') {
        const res = child_process.spawnSync('which', ['renegadeswarm']);
        if (res.status === 0) {
          child_process.spawn('renegadeswarm', [], { detached: true, stdio: 'ignore' }).unref();
          logger.info('Launched installed RenegadeSwarm Linux app');
          return { success: true, method: 'os_window', url };
        }
      }
    } catch (err: any) {
      logger.debug('Attempt to launch installed desktop executable failed:', err.message);
    }

    // 4. Last fallback: all native activation & daemon focus attempts failed
    return {
      success: false,
      method: 'browser',
      url,
      error:
        swarmAuthToken.getSwarmAuthStatus().lastAuthError ||
        'Failed to activate or launch RenegadeSwarm desktop window',
    };
  }

  /**
   * Notifies the local RenegadeSwarm daemon about newly downloaded / packaged model files
   * so Swarm can immediately begin seeding without requiring a manual rescan.
   * Requires Bearer authentication with Swarm's daemon.token.
   */
  public async notifySwarmModelIngest(
    filePath: string,
    metadata?: any,
    targetUrl?: string
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const url = this.normalizeUrl(targetUrl);
    let token = swarmAuthToken.loadSwarmDaemonToken();

    if (!token) {
      logger.warn('Cannot notify Swarm of model ingest: Swarm daemon token missing (SWARM_TOKEN_MISSING)');
      return {
        success: false,
        error: 'SWARM_TOKEN_MISSING: Start RenegadeSwarm once so it can write the daemon token.',
      };
    }

    const payload = {
      filePath,
      fileName: metadata?.fileName || filePath.split(/[/\\]/).pop(),
      sha256: metadata?.sha256,
      modelType: metadata?.modelType,
      timestamp: new Date().toISOString(),
    };

    const makeHeaders = (t: string) => ({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${t}`,
    });

    try {
      let res;
      try {
        res = await axios.post(`${url}/api/ingest`, payload, {
          timeout: 2500,
          headers: makeHeaders(token),
        });
      } catch (err: any) {
        if (err.response?.status === 401) {
          // Retry once with reloaded token
          token = swarmAuthToken.loadSwarmDaemonToken(true);
          if (token) {
            res = await axios.post(`${url}/api/ingest`, payload, {
              timeout: 2500,
              headers: makeHeaders(token),
            });
          } else {
            swarmAuthToken.setLastAuthError('Swarm daemon rejected auth (missing or stale token)');
            return {
              success: false,
              statusCode: 401,
              error: 'Swarm daemon rejected auth (missing or stale token)',
            };
          }
        } else if (err.response?.status === 403) {
          const errorMsg = "Model path is outside Swarm's allowed folder roots (Path Confinement)";
          logger.warn(`RenegadeSwarm ingest rejected (403): ${errorMsg} for ${filePath}`);
          return {
            success: false,
            statusCode: 403,
            error: errorMsg,
          };
        } else {
          // Fallback to /api/models/scan with the same Bearer header
          res = await axios.post(`${url}/api/models/scan`, payload, {
            timeout: 2500,
            headers: makeHeaders(token),
          });
        }
      }

      if (res && (res.status === 200 || res.status === 201)) {
        logger.info(`Successfully notified RenegadeSwarm of new model ingest: ${payload.fileName}`);
        return { success: true, statusCode: res.status };
      }
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401) {
        swarmAuthToken.setLastAuthError('Swarm daemon rejected auth (missing or stale token)');
        return {
          success: false,
          statusCode: 401,
          error: 'Swarm daemon rejected auth (missing or stale token)',
        };
      }
      if (status === 403) {
        const errorMsg = "Model path is outside Swarm's allowed folder roots (Path Confinement)";
        logger.warn(`RenegadeSwarm ingest rejected (403): ${errorMsg} for ${filePath}`);
        return {
          success: false,
          statusCode: 403,
          error: errorMsg,
        };
      }
      logger.debug(`Could not notify Swarm daemon of model ingest on ${url}:`, err.message);
      return {
        success: false,
        statusCode: status,
        error: err.message || 'Swarm daemon unavailable or did not accept ingest notification',
      };
    }

    return {
      success: false,
      error: 'Swarm daemon unavailable or did not accept ingest notification',
    };
  }

  /**
   * Sends a non-blocking sister wakeup poke to the RenegadeSwarm daemon (Port 5180).
   * Used on CMM bridge startup to alert an already-running Swarm daemon that CMM is active.
   */
  public async sendSisterWakeup(targetUrl?: string): Promise<{ success: boolean; error?: string }> {
    const url = this.normalizeUrl(targetUrl);
    const token = swarmAuthToken.loadSwarmDaemonToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['X-Swarm-Auth-Token'] = token;
    }

    try {
      const res = await axios.post(
        `${url}/api/sister/wakeup`,
        { source: 'cmm', ts: Date.now() },
        {
          timeout: 400,
          headers,
        }
      );
      if (res.status === 200) {
        logger.info('Successfully sent sister wakeup ping to RenegadeSwarm');
        return { success: true };
      }
      return { success: false, error: `Swarm returned status ${res.status}` };
    } catch (err: any) {
      // Swallowed on purpose: zero retry loop if Swarm is not running yet
      logger.debug('Swarm sister wakeup ping swallowed (Swarm not active yet):', err.message);
      return { success: false, error: err.message };
    }
  }
}

export const swarmBridge = SwarmBridge.getInstance();

