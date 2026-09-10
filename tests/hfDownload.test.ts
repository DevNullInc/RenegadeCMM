/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { isHuggingFaceUrl, downloadManager } from '../src/services/downloadManager';
import { dbManager } from '../src/db/db';
import { DownloadTask } from '../src/types/app';

describe('Hugging Face Download Engine & Schema Migration v9', () => {
  beforeAll(async () => {
    await dbManager.init(':memory:');
  });

  describe('isHuggingFaceUrl validation', () => {
    it('should validate official Hugging Face HTTPS endpoints', () => {
      expect(
        isHuggingFaceUrl('https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors')
      ).toBe(true);
      expect(isHuggingFaceUrl('https://cdn-lfs.huggingface.co/repos/123/456')).toBe(true);
      expect(isHuggingFaceUrl('https://huggingface.co/api/models/test')).toBe(true);
    });

    it('should reject spoofed hosts, invalid protocols, and cleartext HTTP', () => {
      expect(isHuggingFaceUrl('https://attacker-huggingface.co/model.safetensors')).toBe(false);
      expect(isHuggingFaceUrl('https://evil.com/?target=huggingface.co')).toBe(false);
      expect(isHuggingFaceUrl('https://huggingface.co.evil.org/model')).toBe(false);
      expect(isHuggingFaceUrl('http://huggingface.co/model.safetensors')).toBe(false);
      expect(isHuggingFaceUrl('')).toBe(false);
      expect(isHuggingFaceUrl(undefined as any)).toBe(false);
    });
  });

  describe('Database Schema Migration v9', () => {
    it('should set PRAGMA user_version to 9', async () => {
      const row: any = await dbManager.get('PRAGMA user_version;');
      expect(row?.user_version).toBe(9);
    });

    it('should contain Hugging Face columns in local_models table', async () => {
      const cols: any[] = await dbManager.all('PRAGMA table_info(local_models);');
      const names = cols.map((c) => c.name);
      expect(names).toContain('source');
      expect(names).toContain('hf_repo_id');
      expect(names).toContain('hf_commit_sha');
      expect(names).toContain('quantization');
    });

    it('should contain Hugging Face columns in downloads table', async () => {
      const cols: any[] = await dbManager.all('PRAGMA table_info(downloads);');
      const names = cols.map((c) => c.name);
      expect(names).toContain('source');
      expect(names).toContain('hf_repo_id');
      expect(names).toContain('hf_commit_sha');
    });
  });

  describe('DownloadTask Hugging Face lifecycle', () => {
    it('should support adding and configuring a Hugging Face download task', async () => {
      downloadManager.setHuggingFaceToken('hf_test_token_123456789');

      const task: DownloadTask = {
        id: 'hf-task-flux-01',
        source: 'huggingface',
        hfRepoId: 'black-forest-labs/FLUX.1-dev',
        hfCommitSha: 'a1b2c3d4e5f6',
        modelVersionId: 0,
        modelId: 0,
        modelName: 'FLUX.1-dev',
        versionName: 'main',
        modelType: 'Checkpoint',
        baseModel: 'FLUX.1',
        creator: 'black-forest-labs',
        targetFolder: 'unet',
        fileName: 'flux1-dev.safetensors',
        downloadUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors',
        sizeKB: 24000000,
        status: 'pending',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 24576000000,
        speedBps: 0,
        computedPath: '/tmp/models/unet/flux1-dev.safetensors',
      };

      expect(task.source).toBe('huggingface');
      expect(task.hfRepoId).toBe('black-forest-labs/FLUX.1-dev');
      expect(isHuggingFaceUrl(task.downloadUrl)).toBe(true);
    });
  });
});
