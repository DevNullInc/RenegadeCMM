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
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Validates whether a given token string matches the 64-hex requirement.
 */
export function isValidSwarmToken(token: unknown): token is string {
  if (typeof token !== 'string') return false;
  return /^[a-f0-9]{64}$/i.test(token.trim());
}

export class SwarmAuthTokenManager {
  private static instance: SwarmAuthTokenManager;
  private cachedToken: string | null = null;
  private lastAuthError?: string;

  public static getInstance(): SwarmAuthTokenManager {
    if (!SwarmAuthTokenManager.instance) {
      SwarmAuthTokenManager.instance = new SwarmAuthTokenManager();
    }
    return SwarmAuthTokenManager.instance;
  }

  /**
   * Returns list of well-known daemon.token candidate file paths in platform priority order.
   * Note: This returns path strings only, never the secret content.
   */
  public getCandidatePaths(): string[] {
    const platform = os.platform();
    const homedir = os.homedir();
    const paths: string[] = [];

    if (platform === 'win32') {
      const appData = process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming');
      paths.push(path.join(appData, 'RenegadeSwarm', 'daemon.token'));
      paths.push(path.join(appData, 'renegadeswarm', 'daemon.token'));
    } else if (platform === 'darwin') {
      paths.push(path.join(homedir, 'Library', 'Application Support', 'RenegadeSwarm', 'daemon.token'));
      paths.push(path.join(homedir, 'Library', 'Application Support', 'renegadeswarm', 'daemon.token'));
    } else {
      // Linux and other Unix-like systems
      const configHome = process.env.XDG_CONFIG_HOME || path.join(homedir, '.config');
      paths.push(path.join(configHome, 'RenegadeSwarm', 'daemon.token'));
      paths.push(path.join(configHome, 'renegadeswarm', 'daemon.token'));
    }

    // Dev fallback locations (read-only checking)
    paths.push(path.join(process.cwd(), '.renegadeswarm_security', 'daemon.token'));
    paths.push(path.join(process.cwd(), '..', 'RenegadeSwarm', '.renegadeswarm_security', 'daemon.token'));
    paths.push(path.join(process.cwd(), '..', 'RenegadeSwarm', 'daemon.token'));

    return paths;
  }

  /**
   * Loads the Swarm daemon bearer token from well-known token locations.
   * Cached in memory after first successful read.
   * Never logs or prints the token value.
   */
  public loadSwarmDaemonToken(forceReload = false): string | null {
    if (this.cachedToken && !forceReload) {
      return this.cachedToken;
    }

    const candidates = this.getCandidatePaths();
    for (const tokenPath of candidates) {
      try {
        if (fs.existsSync(tokenPath)) {
          const raw = fs.readFileSync(tokenPath, 'utf8');
          const trimmed = raw.trim().toLowerCase();
          if (isValidSwarmToken(trimmed)) {
            this.cachedToken = trimmed;
            this.lastAuthError = undefined;
            return this.cachedToken;
          }
        }
      } catch {
        // Continue searching without leaking errors containing token info
      }
    }

    this.cachedToken = null;
    return null;
  }

  /**
   * Clears in-memory token cache (e.g. when Swarm responds with 401 Unauthorized).
   */
  public clearCache(): void {
    this.cachedToken = null;
  }

  /**
   * Sets the last encountered authorization error message (redacted).
   */
  public setLastAuthError(err?: string): void {
    this.lastAuthError = err;
  }

  /**
   * Returns metadata about daemon token presence without exposing token contents.
   */
  public getSwarmAuthStatus(): { tokenFound: boolean; lastAuthError?: string; primaryExpectedPath: string } {
    const token = this.loadSwarmDaemonToken(false);
    const candidates = this.getCandidatePaths();
    return {
      tokenFound: Boolean(token),
      lastAuthError: this.lastAuthError,
      primaryExpectedPath: candidates[0] || 'Unknown path',
    };
  }
}

export const swarmAuthToken = SwarmAuthTokenManager.getInstance();
