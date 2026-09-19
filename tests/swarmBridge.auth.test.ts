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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { swarmBridge } from '../src/services/swarmBridge';
import { swarmAuthToken } from '../src/services/swarmAuthToken';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('SwarmBridge Auth Handshake & Security Protocol', () => {
  const validToken = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const regeneratedToken = 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321';

  beforeEach(() => {
    vi.clearAllMocks();
    swarmAuthToken.clearCache();
    swarmAuthToken.setLastAuthError(undefined);
  });

  describe('checkSwarmStatus (Health is unauthenticated)', () => {
    it('should NOT include Authorization header when querying public health endpoint', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { status: 'ok', version: '0.3.0', peers: 5, seeding: 2 },
      } as any);

      const status = await swarmBridge.checkSwarmStatus('http://127.0.0.1:5180');
      expect(status.online).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://127.0.0.1:5180/api/health',
        expect.objectContaining({
          headers: { Accept: 'application/json' },
        })
      );

      // Verify no Authorization header sent
      const callArgs = mockedAxios.get.mock.calls[0];
      const headers = callArgs[1]?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toBeUndefined();
    });
  });

  describe('notifySwarmModelIngest (Bearer Auth Required)', () => {
    it('should attach Authorization: Bearer header when token is present', async () => {
      vi.spyOn(swarmAuthToken, 'loadSwarmDaemonToken').mockReturnValue(validToken);

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true, ingested: true },
      } as any);

      const res = await swarmBridge.notifySwarmModelIngest(
        'D:/models/checkpoints/flux1.safetensors',
        { fileName: 'flux1.safetensors', sha256: 'a'.repeat(64), modelType: 'Checkpoint' },
        'http://127.0.0.1:5180'
      );

      expect(res.success).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:5180/api/ingest',
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${validToken}`,
          }),
        })
      );
    });

    it('should return SWARM_TOKEN_MISSING and NOT perform network POST when token is missing', async () => {
      vi.spyOn(swarmAuthToken, 'loadSwarmDaemonToken').mockReturnValue(null);

      const res = await swarmBridge.notifySwarmModelIngest(
        'D:/models/checkpoints/flux1.safetensors',
        { fileName: 'flux1.safetensors' },
        'http://127.0.0.1:5180'
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('SWARM_TOKEN_MISSING');
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should reload token once and retry on 401 Unauthorized response', async () => {
      const loadTokenSpy = vi.spyOn(swarmAuthToken, 'loadSwarmDaemonToken')
        .mockReturnValueOnce(validToken) // First call
        .mockReturnValueOnce(regeneratedToken); // Reload call

      // First call fails with 401, retry succeeds with 200
      mockedAxios.post
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockResolvedValueOnce({ status: 200, data: { success: true } });

      const res = await swarmBridge.notifySwarmModelIngest(
        'D:/models/checkpoints/flux1.safetensors',
        { fileName: 'flux1.safetensors' },
        'http://127.0.0.1:5180'
      );

      expect(res.success).toBe(true);
      expect(loadTokenSpy).toHaveBeenCalledWith(true); // force reload invoked
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);

      // Verify second request used the fresh token
      const secondCallArgs = mockedAxios.post.mock.calls[1];
      expect(secondCallArgs[2]?.headers).toEqual(
        expect.objectContaining({
          Authorization: `Bearer ${regeneratedToken}`,
        })
      );
    });

    it('should return 401 error when token reload fails or second attempt is rejected', async () => {
      vi.spyOn(swarmAuthToken, 'loadSwarmDaemonToken')
        .mockReturnValueOnce(validToken)
        .mockReturnValueOnce(null); // No fresh token found

      mockedAxios.post.mockRejectedValueOnce({ response: { status: 401 } });

      const res = await swarmBridge.notifySwarmModelIngest(
        'D:/models/checkpoints/flux1.safetensors',
        { fileName: 'flux1.safetensors' },
        'http://127.0.0.1:5180'
      );

      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(401);
      expect(res.error).toContain('rejected auth');
    });
  });

  describe('focusOrOpenSwarm (Bearer Auth & POST only)', () => {
    it('should send POST with Bearer token and never perform GET', async () => {
      vi.spyOn(swarmAuthToken, 'loadSwarmDaemonToken').mockReturnValue(validToken);

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true, message: 'Window activated' },
      } as any);

      const res = await swarmBridge.focusOrOpenSwarm('http://127.0.0.1:5180');

      expect(res.success).toBe(true);
      expect(res.method).toBe('daemon_focus');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:5180/api/window/focus',
        {},
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${validToken}`,
          }),
        })
      );
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should reload token and retry on 401 during window focus', async () => {
      vi.spyOn(swarmAuthToken, 'loadSwarmDaemonToken')
        .mockReturnValueOnce(validToken)
        .mockReturnValueOnce(regeneratedToken);

      mockedAxios.post
        .mockRejectedValueOnce({ response: { status: 401 } })
        .mockResolvedValueOnce({ status: 200, data: { success: true } });

      const res = await swarmBridge.focusOrOpenSwarm('http://127.0.0.1:5180');

      expect(res.success).toBe(true);
      expect(res.method).toBe('daemon_focus');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });
  });
});
