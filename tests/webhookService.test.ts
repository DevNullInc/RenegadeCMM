/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { describe, it, expect, vi } from 'vitest';
import { WebhookService } from '../src/services/webhookService';
import axios from 'axios';

vi.mock('axios');

describe('WebhookService', () => {
  it('should ignore dispatch when URL is not configured', async () => {
    const service = new WebhookService();
    const result = await service.triggerDownloadComplete({
      id: 'dl_123',
      modelVersionId: 1,
      modelId: 2,
      modelName: 'Test Model',
      versionName: 'v1.0',
      modelType: 'Checkpoint',
      baseModel: 'SD 1.5',
      targetFolder: 'checkpoints',
      fileName: 'model.safetensors',
      downloadUrl: 'http://example.com/dl',
      sizeKB: 1024,
      status: 'completed',
      progress: 100,
      downloadedBytes: 1024,
      totalBytes: 1024,
      speedBps: 0,
      computedPath: 'D:\\ComfyUI\\models\\checkpoints\\model.safetensors',
    });
    expect(result).toBe(false);
  });

  it('should dispatch on_download_complete when URL is configured', async () => {
    const service = new WebhookService();
    service.updateConfig({ on_download_complete: 'http://localhost:8080/cmm/webhook' });

    vi.mocked(axios.post).mockResolvedValueOnce({ status: 200, data: { ok: true } } as any);

    const result = await service.triggerDownloadComplete({
      id: 'dl_123',
      modelVersionId: 100,
      modelId: 200,
      modelName: 'DreamShaper',
      versionName: 'v8',
      modelType: 'Checkpoint',
      baseModel: 'SD 1.5',
      targetFolder: 'checkpoints',
      fileName: 'dreamshaper_8.safetensors',
      downloadUrl: 'http://example.com/dl',
      sizeKB: 2048,
      status: 'completed',
      progress: 100,
      downloadedBytes: 2048 * 1024,
      totalBytes: 2048 * 1024,
      speedBps: 0,
      computedPath: 'D:\\ComfyUI\\models\\checkpoints\\dreamshaper_8.safetensors',
    });

    expect(result).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:8080/cmm/webhook',
      expect.objectContaining({
        event: 'on_download_complete',
        data: expect.objectContaining({
          modelName: 'DreamShaper',
          fileName: 'dreamshaper_8.safetensors',
        }),
      }),
      expect.any(Object)
    );
  });

  it('should dispatch on_update_available when updates are present', async () => {
    const service = new WebhookService();
    service.updateConfig({ on_update_available: 'http://localhost:8080/cmm/update' });

    vi.mocked(axios.post).mockResolvedValueOnce({ status: 200, data: { ok: true } } as any);

    const updates = [
      { id: '1', fileName: 'flux_v1.safetensors', latestVersionName: 'v2.0' },
    ];
    const result = await service.triggerUpdateAvailable(updates);

    expect(result).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:8080/cmm/update',
      expect.objectContaining({
        event: 'on_update_available',
        data: expect.objectContaining({
          count: 1,
        }),
      }),
      expect.any(Object)
    );
  });

  it('should test webhook connectivity and return status', async () => {
    const service = new WebhookService();
    vi.mocked(axios.post).mockResolvedValueOnce({ status: 200 } as any);

    const testRes = await service.testWebhook('http://localhost:8080/test', 'on_download_complete');
    expect(testRes.success).toBe(true);
    expect(testRes.status).toBe(200);
  });
});
