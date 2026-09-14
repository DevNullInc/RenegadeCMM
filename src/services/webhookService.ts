/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import axios from 'axios';
import { DownloadTask, WebhookConfig } from '../types/app';
import { logger } from '../utils/logger';
import { isSafeNetworkUrl } from '../utils/securityValidator';

export class WebhookService {
  private config: WebhookConfig = {};

  updateConfig(cfg?: WebhookConfig) {
    this.config = cfg || {};
  }

  async triggerDownloadComplete(task: DownloadTask): Promise<boolean> {
    const url = this.config.on_download_complete;
    if (!url || typeof url !== 'string') {
      return false;
    }

    const check = isSafeNetworkUrl(url);
    if (!check.safe) {
      logger.warn(`Security: Blocked unsafe webhook URL [${url}]:`, check.reason);
      return false;
    }

    const payload = {
      event: 'on_download_complete',
      timestamp: new Date().toISOString(),
      data: {
        id: task.id,
        modelId: task.modelId,
        modelVersionId: task.modelVersionId,
        modelName: task.modelName,
        versionName: task.versionName,
        modelType: task.modelType,
        baseModel: task.baseModel,
        fileName: task.fileName,
        filePath: task.computedPath,
        fileSize: task.totalBytes,
        sha256: task.sha256,
      },
    };

    return this.sendWebhook(url, payload);
  }

  async triggerUpdateAvailable(updates: any[]): Promise<boolean> {
    const url = this.config.on_update_available;
    if (!url || typeof url !== 'string' || updates.length === 0) {
      return false;
    }

    const check = isSafeNetworkUrl(url);
    if (!check.safe) {
      logger.warn(`Security: Blocked unsafe webhook URL [${url}]:`, check.reason);
      return false;
    }

    const payload = {
      event: 'on_update_available',
      timestamp: new Date().toISOString(),
      data: {
        count: updates.length,
        updates,
      },
    };

    return this.sendWebhook(url, payload);
  }

  async testWebhook(
    url: string,
    event: 'on_download_complete' | 'on_update_available' = 'on_download_complete'
  ): Promise<{ success: boolean; status?: number; error?: string }> {
    const check = isSafeNetworkUrl(url);
    if (!check.safe) {
      return { success: false, error: `Invalid webhook URL: ${check.reason}` };
    }

    const testPayload = {
      event,
      timestamp: new Date().toISOString(),
      test: true,
      message: 'Test event from Renegade Core Model Manager',
      data: {
        modelName: 'Test Model (DreamShaper)',
        fileName: 'dreamshaper_v8.safetensors',
        modelType: 'Checkpoint',
        fileSize: 2147483648,
      },
    };

    try {
      const res = await axios.post(url.trim(), testPayload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RenegadeCMM/Webhook',
        },
      });
      return { success: res.status >= 200 && res.status < 300, status: res.status };
    } catch (err: any) {
      const status = err.response?.status;
      const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      return { success: false, status, error: errMsg };
    }
  }

  private async sendWebhook(url: string, payload: any): Promise<boolean> {
    const check = isSafeNetworkUrl(url);
    if (!check.safe) {
      logger.warn(`Security: Blocked unsafe webhook URL [${url}]:`, check.reason);
      return false;
    }

    try {
      logger.info(`Dispatching webhook [${payload.event}] to: ${url}`);
      await axios.post(url.trim(), payload, {
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RenegadeCMM/Webhook',
        },
      });
      logger.info(`Successfully sent webhook [${payload.event}] to: ${url}`);
      return true;
    } catch (err: any) {
      logger.warn(`Failed to deliver webhook [${payload.event}] to ${url}:`, err.message);
      return false;
    }
  }
}

export const webhookService = new WebhookService();
