/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * Licensed under the Business Source License 1.1 (BUSL-1.1).
 * Single-user evaluation model with fully functional features.
 * Commercial enterprise license required for organizations with > 5 persons.
 * Inquiries: licensing@renegadeinc.net
 * Converts to GNU General Public License v3.0 or later (GPL-3.0-or-later) after 4 years.
 * See LICENSE for full terms and conditions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { swarmBridge } from '../src/services/swarmBridge';
import { swarmAuthToken } from '../src/services/swarmAuthToken';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

describe('SwarmBridge Sister Application Health Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(swarmAuthToken, 'loadSwarmDaemonToken').mockReturnValue('a'.repeat(64));
  });

  describe('normalizeUrl', () => {
    it('should default to http://127.0.0.1:5180 when no URL is provided', () => {
      expect(swarmBridge.normalizeUrl()).toBe('http://127.0.0.1:5180');
      expect(swarmBridge.normalizeUrl('')).toBe('http://127.0.0.1:5180');
      expect(swarmBridge.normalizeUrl('   ')).toBe('http://127.0.0.1:5180');
    });

    it('should strip trailing slashes and ensure http prefix', () => {
      expect(swarmBridge.normalizeUrl('127.0.0.1:5180/')).toBe('http://127.0.0.1:5180');
      expect(swarmBridge.normalizeUrl('http://localhost:8081///')).toBe('http://localhost:8081');
      expect(swarmBridge.normalizeUrl('https://127.0.0.1:8443')).toBe('https://127.0.0.1:8443');
    });
  });

  describe('checkSwarmStatus', () => {
    it('should correctly parse online status from /api/health with telemetry', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: {
          status: 'ok',
          version: '1.2.0',
          peers: 14,
          seeding: 5,
        },
      } as any);

      const res = await swarmBridge.checkSwarmStatus('http://127.0.0.1:5180');

      expect(mockedAxios.get).toHaveBeenCalledWith('http://127.0.0.1:5180/api/health', expect.any(Object));
      expect(res.online).toBe(true);
      expect(res.version).toBe('1.2.0');
      expect(res.peers).toBe(14);
      expect(res.seeding).toBe(5);
      expect(res.serverUrl).toBe('http://127.0.0.1:5180');
    });

    it('should fallback to /health if /api/health fails', async () => {
      mockedAxios.get
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockResolvedValueOnce({
          status: 200,
          data: {
            status: 'ok',
            version: '1.0.0-rc1',
            peers: 8,
            seeding: 2,
          },
        } as any);

      const res = await swarmBridge.checkSwarmStatus('http://127.0.0.1:5180');

      expect(res.online).toBe(true);
      expect(res.version).toBe('1.0.0-rc1');
      expect(res.peers).toBe(8);
      expect(res.seeding).toBe(2);
    });

    it('should return offline status when all endpoints fail', async () => {
      mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const res = await swarmBridge.checkSwarmStatus('http://127.0.0.1:5180');

      expect(res.online).toBe(false);
      expect(res.serverUrl).toBe('http://127.0.0.1:5180');
      expect(res.error).toBeDefined();
    });
  });

  describe('focusOrOpenSwarm', () => {
    it('should successfully call /api/window/focus endpoint when daemon is running', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true, message: 'Window activated' },
      } as any);

      const res = await swarmBridge.focusOrOpenSwarm('http://127.0.0.1:5180');

      expect(mockedAxios.post).toHaveBeenCalledWith('http://127.0.0.1:5180/api/window/focus', {}, expect.any(Object));
      expect(res.success).toBe(true);
      expect(res.method).toBe('daemon_focus');
    });
  });

  describe('notifySwarmModelIngest', () => {
    it('should dispatch model ingest notification to /api/ingest', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true, ingested: true },
      } as any);

      const res = await swarmBridge.notifySwarmModelIngest(
        'D:/models/checkpoints/flux1.safetensors',
        { fileName: 'flux1.safetensors', sha256: 'deadbeef123', modelType: 'Checkpoint' },
        'http://127.0.0.1:5180'
      );

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:5180/api/ingest',
        expect.objectContaining({
          filePath: 'D:/models/checkpoints/flux1.safetensors',
          fileName: 'flux1.safetensors',
          sha256: 'deadbeef123',
          modelType: 'Checkpoint',
        }),
        expect.any(Object)
      );
      expect(res.success).toBe(true);
    });
  });

  describe('sendSisterWakeup', () => {
    it('should successfully send wakeup ping to Swarm sister app on /api/sister/wakeup', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true, message: 'Swarm sister wakeup acknowledged' },
      } as any);

      const res = await swarmBridge.sendSisterWakeup('http://127.0.0.1:5180');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://127.0.0.1:5180/api/sister/wakeup',
        expect.objectContaining({ source: 'cmm', ts: expect.any(Number) }),
        expect.objectContaining({
          timeout: 400,
          headers: expect.objectContaining({
            'Authorization': `Bearer ${'a'.repeat(64)}`,
            'X-Swarm-Auth-Token': 'a'.repeat(64),
          }),
        })
      );
      expect(res.success).toBe(true);
    });

    it('should swallow network errors/timeouts cleanly when Swarm is offline', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5180'));

      const res = await swarmBridge.sendSisterWakeup('http://127.0.0.1:5180');

      expect(res.success).toBe(false);
      expect(res.error).toContain('ECONNREFUSED');
    });
  });
});

