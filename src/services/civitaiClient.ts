/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import axios, { AxiosInstance } from 'axios';
import {
  CivitAIModel,
  CivitAIModelVersion,
  ModelListResponse,
  ModelType,
  SearchParams,
} from '../types/civitai';
import { RateLimiter } from '../utils/rateLimiter';
import { logger } from '../utils/logger';

export class CivitAIClient {
  private baseUrl: string = 'https://civitai.com/api/v1';
  private apiKey?: string;
  private rateLimiter: RateLimiter;
  private axiosInstance: AxiosInstance;

  constructor(apiKey?: string, baseUrl = 'https://civitai.com/api/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.rateLimiter = new RateLimiter(apiKey ? 20 : 10);
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      paramsSerializer: {
        indexes: null,
      },
    });
  }

  setApiKey(key?: string) {
    this.apiKey = key;
    this.rateLimiter.setRateLimit(key ? 20 : 10);
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
    this.axiosInstance.defaults.baseURL = url;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'RenegadeCMM/1.5.0',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async validateApiKey(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await this.rateLimiter.executeWithRetry(() =>
        this.axiosInstance.get('/models', {
          params: { limit: 1 },
          headers: this.getHeaders(),
        })
      );
      return true;
    } catch (err) {
      logger.error('API key validation failed:', err);
      return false;
    }
  }

  async fetchModels(params: SearchParams = {}): Promise<ModelListResponse> {
    return this.rateLimiter.executeWithRetry(async () => {
      const queryParams: Record<string, any> = {};
      if (params.query) queryParams.query = params.query;
      if (params.types && params.types.length > 0) queryParams.types = params.types;
      if (params.baseModels && params.baseModels.length > 0) queryParams.baseModels = params.baseModels;
      if (params.sort) queryParams.sort = params.sort;
      if (params.period) queryParams.period = params.period;
      if (params.nsfw !== undefined) queryParams.nsfw = params.nsfw;
      if (params.limit) queryParams.limit = params.limit;

      if (params.query) {
        if (params.cursor) queryParams.cursor = params.cursor;
      } else {
        if (params.page) queryParams.page = params.page;
        if (params.cursor) queryParams.cursor = params.cursor;
      }

      if (params.tag) queryParams.tag = params.tag;
      if (params.username) queryParams.username = params.username;

      logger.info(`[CivitAI API] GET /models`, queryParams);

      try {
        const res = await this.axiosInstance.get('/models', {
          params: queryParams,
          headers: this.getHeaders(),
        });

        return {
          items: res.data.items || res.data || [],
          metadata: res.data.metadata || {},
        };
      } catch (err: any) {
        const status = err.response?.status;
        const errDetails = err.response?.data?.message || err.response?.data?.error || err.message;
        logger.error(`[CivitAI API] GET /models failed (status ${status}):`, errDetails);
        // Re-throw a plain Error for the renderer, but carry the axios code/status so
        // RateLimiter's retry logic can still classify ECONNABORTED ("aborted" — CivitAI
        // reset the body stream after sending headers) as a transient, retryable failure.
        const wrapped: Error & { code?: string; status?: number } = new Error(
          typeof errDetails === 'string' ? errDetails : JSON.stringify(errDetails)
        );
        wrapped.code = err?.code;
        wrapped.status = status;
        throw wrapped;
      }
    });
  }

  async fetchModel(id: number): Promise<CivitAIModel> {
    return this.rateLimiter.executeWithRetry(async () => {
      const res = await this.axiosInstance.get(`/models/${id}`, {
        headers: this.getHeaders(),
      });
      return res.data;
    });
  }

  async fetchModelVersion(id: number): Promise<CivitAIModelVersion> {
    return this.rateLimiter.executeWithRetry(async () => {
      const res = await this.axiosInstance.get(`/model-versions/${id}`, {
        headers: this.getHeaders(),
      });
      return res.data;
    });
  }

  async fetchModelVersionMini(id: number): Promise<Partial<CivitAIModelVersion>> {
    return this.rateLimiter.executeWithRetry(async () => {
      const res = await this.axiosInstance.get(`/model-versions/mini/${id}`, {
        headers: this.getHeaders(),
      });
      return res.data;
    });
  }

  async lookupByHash(hash: string): Promise<CivitAIModelVersion | null> {
    return this.rateLimiter.executeWithRetry(async () => {
      try {
        const res = await this.axiosInstance.get(`/model-versions/by-hash/${hash}`, {
          headers: this.getHeaders(),
        });
        return res.data;
      } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
      }
    });
  }

  async bulkLookupByHashes(
    hashes: string[],
    onProgress?: (done: number, total: number) => void
  ): Promise<Map<string, CivitAIModelVersion>> {
    if (hashes.length === 0) return new Map();

    const resultMap = new Map<string, CivitAIModelVersion>();
    const CONCURRENCY = 4;
    let completed = 0;

    for (let i = 0; i < hashes.length; i += CONCURRENCY) {
      const chunk = hashes.slice(i, i + CONCURRENCY);
      const promises = chunk.map(async (hash) => {
        try {
          const version = await this.lookupByHash(hash);
          if (version) {
            resultMap.set(hash.toUpperCase(), version);
            // Also index other hash keys in files (SHA256, AutoV1, AutoV2, etc.)
            if (version.files && Array.isArray(version.files)) {
              for (const f of version.files) {
                if (f.hashes) {
                  for (const h of Object.values(f.hashes)) {
                    if (h) resultMap.set(String(h).toUpperCase(), version);
                  }
                }
              }
            }
          }
        } catch (err) {
          logger.warn(`Hash lookup skipped/failed for ${hash}:`, err);
        } finally {
          completed++;
          if (onProgress) onProgress(completed, hashes.length);
        }
      });
      await Promise.all(promises);
    }

    return resultMap;
  }

  async fetchEnums(): Promise<{ modelTypes: ModelType[]; baseModels: string[] }> {
    return this.rateLimiter.executeWithRetry(async () => {
      try {
        const res = await this.axiosInstance.get('/enums', {
          headers: this.getHeaders(),
        });
        const modelTypes = res.data.modelType || res.data.modelTypes || res.data.ModelType || [];
        const baseModels = res.data.baseModel || res.data.baseModels || res.data.BaseModel || [];
        return {
          modelTypes: modelTypes.length > 0 ? modelTypes : [
            'Checkpoint', 'LORA', 'LoCon', 'DoRA', 'TextualInversion', 'Hypernetwork',
            'VAE', 'Controlnet', 'Upscaler', 'MotionModule', 'AestheticGradient',
            'Poses', 'Wildcards', 'Workflows', 'Detection', 'Other'
          ],
          baseModels: baseModels.length > 0 ? baseModels : [
            'SD 1.4', 'SD 1.5', 'SD 1.5 LCM', 'SD 1.5 Hyper',
            'SD 2.0', 'SD 2.1', 'SD 2.1 768', 'SD 2.1 Unclip',
            'SDXL 0.9', 'SDXL 1.0', 'SDXL 1.0 LCM', 'SDXL Turbo', 'SDXL Lightning', 'SDXL Hyper',
            'SD 3', 'SD 3.5', 'SD 3.5 Medium', 'SD 3.5 Large', 'SD 3.5 Large Turbo',
            'Pony', 'Illustrious', 'NoobAI',
            'Flux.1 D', 'Flux.1 S', 'Flux.1 Krea', 'Flux.1 Kontext', 'Flux.2 D',
            'Wan Video', 'CogVideoX', 'Hunyuan 1', 'Hunyuan Video', 'Mochi', 'LTXV',
            'AuraFlow', 'Kolors', 'PixArt a', 'PixArt E', 'Lumina', 'Anima', 'Chroma', 'Ernie', 'Qwen', 'Other'
          ],
        };
      } catch (err) {
        logger.warn('Failed to fetch enums from CivitAI API, returning defaults');
        return {
          modelTypes: [
            'Checkpoint', 'LORA', 'LoCon', 'DoRA', 'TextualInversion', 'Hypernetwork',
            'VAE', 'Controlnet', 'Upscaler', 'MotionModule', 'AestheticGradient',
            'Poses', 'Wildcards', 'Workflows', 'Detection', 'Other'
          ],
          baseModels: [
            'SD 1.4', 'SD 1.5', 'SD 1.5 LCM', 'SD 1.5 Hyper',
            'SD 2.0', 'SD 2.1', 'SD 2.1 768', 'SD 2.1 Unclip',
            'SDXL 0.9', 'SDXL 1.0', 'SDXL 1.0 LCM', 'SDXL Turbo', 'SDXL Lightning', 'SDXL Hyper',
            'SD 3', 'SD 3.5', 'SD 3.5 Medium', 'SD 3.5 Large', 'SD 3.5 Large Turbo',
            'Pony', 'Illustrious', 'NoobAI',
            'Flux.1 D', 'Flux.1 S', 'Flux.1 Krea', 'Flux.1 Kontext', 'Flux.2 D',
            'Wan Video', 'CogVideoX', 'Hunyuan 1', 'Hunyuan Video', 'Mochi', 'LTXV',
            'AuraFlow', 'Kolors', 'PixArt a', 'PixArt E', 'Lumina', 'Anima', 'Chroma', 'Ernie', 'Qwen', 'Other'
          ],
        };
      }
    });
  }

  getDownloadUrl(versionId: number): string {
    return `https://civitai.com/api/download/models/${versionId}`;
  }
}

export const civitaiClient = new CivitAIClient();
