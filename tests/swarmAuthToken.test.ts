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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { swarmAuthToken, isValidSwarmToken } from '../src/services/swarmAuthToken';

describe('SwarmAuthToken Service', () => {
  let tempDir: string;
  let mockTokenPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-swarm-token-test-'));
    mockTokenPath = path.join(tempDir, 'daemon.token');
    swarmAuthToken.clearCache();
    swarmAuthToken.setLastAuthError(undefined);
  });

  afterEach(() => {
    swarmAuthToken.clearCache();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('isValidSwarmToken', () => {
    it('should validate exactly 64-hex string tokens', () => {
      const validToken = 'a'.repeat(64);
      expect(isValidSwarmToken(validToken)).toBe(true);

      const mixedHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      expect(isValidSwarmToken(mixedHex)).toBe(true);
      expect(isValidSwarmToken(mixedHex.toUpperCase())).toBe(true);
    });

    it('should reject invalid, short, non-hex, or empty tokens', () => {
      expect(isValidSwarmToken('')).toBe(false);
      expect(isValidSwarmToken('   ')).toBe(false);
      expect(isValidSwarmToken('a'.repeat(63))).toBe(false); // 63 chars
      expect(isValidSwarmToken('a'.repeat(65))).toBe(false); // 65 chars
      expect(isValidSwarmToken('g'.repeat(64))).toBe(false); // non-hex
      expect(isValidSwarmToken(null)).toBe(false);
      expect(isValidSwarmToken(undefined)).toBe(false);
      expect(isValidSwarmToken(12345)).toBe(false);
    });
  });

  describe('loadSwarmDaemonToken & Caching', () => {
    it('should load token from mocked candidate path and cache it', () => {
      const testToken = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
      fs.writeFileSync(mockTokenPath, `  ${testToken}\n  `, 'utf8');

      vi.spyOn(swarmAuthToken, 'getCandidatePaths').mockReturnValue([mockTokenPath]);

      const loaded = swarmAuthToken.loadSwarmDaemonToken();
      expect(loaded).toBe(testToken);

      // Verify caching: even if file is removed, in-memory cached token is returned
      fs.unlinkSync(mockTokenPath);
      const cached = swarmAuthToken.loadSwarmDaemonToken();
      expect(cached).toBe(testToken);

      // Force reload when file is gone should return null
      const reloaded = swarmAuthToken.loadSwarmDaemonToken(true);
      expect(reloaded).toBeNull();
    });

    it('should return null when token file contains invalid content', () => {
      fs.writeFileSync(mockTokenPath, 'invalid-token-content', 'utf8');
      vi.spyOn(swarmAuthToken, 'getCandidatePaths').mockReturnValue([mockTokenPath]);

      const loaded = swarmAuthToken.loadSwarmDaemonToken(true);
      expect(loaded).toBeNull();
    });

    it('should return null when no token file exists', () => {
      vi.spyOn(swarmAuthToken, 'getCandidatePaths').mockReturnValue([
        path.join(tempDir, 'nonexistent.token'),
      ]);

      const loaded = swarmAuthToken.loadSwarmDaemonToken(true);
      expect(loaded).toBeNull();
    });
  });

  describe('getSwarmAuthStatus', () => {
    it('should report tokenFound boolean without exposing token secret', () => {
      const testToken = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      fs.writeFileSync(mockTokenPath, testToken, 'utf8');
      vi.spyOn(swarmAuthToken, 'getCandidatePaths').mockReturnValue([mockTokenPath]);

      const status = swarmAuthToken.getSwarmAuthStatus();
      expect(status.tokenFound).toBe(true);
      expect(status.primaryExpectedPath).toBe(mockTokenPath);
      expect(status.lastAuthError).toBeUndefined();
      // Ensure the secret token value is NOT included in status object
      expect(JSON.stringify(status)).not.toContain(testToken);
    });

    it('should report tokenFound: false when missing and include lastAuthError', () => {
      vi.spyOn(swarmAuthToken, 'getCandidatePaths').mockReturnValue([mockTokenPath]);
      swarmAuthToken.setLastAuthError('Swarm daemon rejected auth (missing or stale token)');

      const status = swarmAuthToken.getSwarmAuthStatus();
      expect(status.tokenFound).toBe(false);
      expect(status.lastAuthError).toBe('Swarm daemon rejected auth (missing or stale token)');
    });
  });
});
