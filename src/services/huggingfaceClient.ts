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
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export interface HFModelInfo {
  id: string;
  author?: string;
  modelName: string;
  private: boolean;
  gated: boolean | string;
  pipelineTag?: string;
  tags: string[];
  downloads?: number;
  likes?: number;
  lastModified?: string;
  sha?: string;
  siblings?: { rfilename: string; size?: number; lfs?: { sha256?: string; size?: number } }[];
}

export class HuggingFaceClient {
  private baseUrl: string = 'https://huggingface.co/api';
  private token?: string;
  private axiosInstance: AxiosInstance;

  constructor(token?: string) {
    this.token = token;
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
    });
  }

  setToken(token?: string) {
    this.token = token?.trim() || undefined;
  }

  getToken(): string | undefined {
    return this.token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'RenegadeCMM/1.5.0 (HuggingFace Integration)',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async validateToken(customToken?: string): Promise<{ valid: boolean; username?: string; orgs?: string[]; error?: string }> {
    const tokenToTest = (customToken && !customToken.startsWith('•')) ? customToken : this.token;
    if (!tokenToTest) {
      return { valid: false, error: 'No Hugging Face token provided' };
    }

    try {
      const res = await axios.get('https://huggingface.co/api/whoami-v2', {
        headers: {
          Authorization: `Bearer ${tokenToTest}`,
          'User-Agent': 'RenegadeCMM/1.5.0',
        },
        timeout: 10000,
      });

      const data = res.data;
      const orgs = (data.orgs || []).map((o: any) => o.name || o.subdomain);
      return {
        valid: true,
        username: data.name || data.fullname,
        orgs,
      };
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message;
      logger.warn('Hugging Face token validation failed:', errMsg);
      return { valid: false, error: errMsg };
    }
  }

  async checkModelRepo(repoId: string): Promise<{
    exists: boolean;
    info?: HFModelInfo;
    error?: string;
    safetensorsFiles?: string[];
    ggufFiles?: string[];
  }> {
    const cleanRepoId = repoId.replace(/^hf:\/\/(models\/)?/, '').replace(/^\/+/, '').trim();
    if (!cleanRepoId || !/^[a-zA-Z0-9_.-]+(\/[a-zA-Z0-9_.-]+)?$/.test(cleanRepoId)) {
      return { exists: false, error: 'Invalid Hugging Face repo ID format' };
    }

    try {
      const res = await this.axiosInstance.get(`/models/${cleanRepoId}`, {
        headers: this.getHeaders(),
        params: {
          blobs: true,
        },
      });

      const data = res.data;
      const parts = cleanRepoId.split('/');
      const author = parts.length > 1 ? parts[0] : undefined;
      const modelName = parts.length > 1 ? parts[1] : parts[0];

      const siblings: any[] = data.siblings || [];
      const safetensorsFiles = siblings
        .map((s) => s.rfilename)
        .filter((f) => f && f.toLowerCase().endsWith('.safetensors'));
      const ggufFiles = siblings
        .map((s) => s.rfilename)
        .filter((f) => f && f.toLowerCase().endsWith('.gguf'));

      const info: HFModelInfo = {
        id: data.id || cleanRepoId,
        author: author || data.author,
        modelName,
        private: !!data.private,
        gated: data.gated || false,
        pipelineTag: data.pipeline_tag,
        tags: data.tags || [],
        downloads: data.downloads,
        likes: data.likes,
        lastModified: data.lastModified,
        sha: data.sha,
        siblings,
      };

      return {
        exists: true,
        info,
        safetensorsFiles,
        ggufFiles,
      };
    } catch (err: any) {
      if (err.response?.status === 404) {
        return { exists: false, error: `Hugging Face model repository "${cleanRepoId}" not found (404).` };
      }
      if (err.response?.status === 401 || err.response?.status === 403) {
        return {
          exists: true,
          error: `Access restricted. This repository is private or gated. A valid Hugging Face Access Token is required.`,
        };
      }
      return { exists: false, error: err.response?.data?.message || err.message };
    }
  }

  async searchModels(query: string, limit = 20): Promise<HFModelInfo[]> {
    const cleanQuery = typeof query === 'string' ? query.trim().slice(0, 200) : '';
    const safeLimit = Math.min(Math.max(1, parseInt(String(limit), 10) || 20), 100);

    try {
      const res = await this.axiosInstance.get('/models', {
        headers: this.getHeaders(),
        params: {
          search: cleanQuery,
          limit: safeLimit,
          full: true,
        },
      });

      return (res.data || []).map((data: any) => {
        const parts = (data.id || '').split('/');
        return {
          id: data.id,
          author: parts.length > 1 ? parts[0] : data.author,
          modelName: parts.length > 1 ? parts[1] : parts[0],
          private: !!data.private,
          gated: data.gated || false,
          pipelineTag: data.pipeline_tag,
          tags: data.tags || [],
          downloads: data.downloads,
          likes: data.likes,
          lastModified: data.lastModified,
          sha: data.sha,
          siblings: data.siblings || [],
        };
      });
    } catch (err: any) {
      logger.error('Error searching Hugging Face models:', err);
      return [];
    }
  }

  parseLocalHFCache(filePath: string): { isHFCache: boolean; repoId?: string; resolvedTitle?: string } {
    const normalized = filePath.replace(/\\/g, '/');
    const match = normalized.match(/models--([a-zA-Z0-9_\-\.]+)/);
    if (match) {
      const raw = match[1];
      let repoId = raw;
      const dashIdx = raw.indexOf('--');
      if (dashIdx > 0) {
        const org = raw.substring(0, dashIdx);
        const model = raw.substring(dashIdx + 2);
        repoId = `${org}/${model}`;
      }
      return {
        isHFCache: true,
        repoId,
        resolvedTitle: repoId,
      };
    }
    return { isHFCache: false };
  }

  async isCliAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('hf', ['--version']);
      return stdout.toLowerCase().includes('huggingface') || stdout.toLowerCase().includes('hf');
    } catch {
      return false;
    }
  }

  async getCliWhoami(): Promise<{ available: boolean; loggedIn: boolean; output?: string }> {
    try {
      const { stdout } = await execFileAsync('hf', ['auth', 'whoami']);
      const text = stdout.trim();
      return {
        available: true,
        loggedIn: !text.toLowerCase().includes('not logged in') && text.length > 0,
        output: text,
      };
    } catch (err: any) {
      return { available: false, loggedIn: false, output: err.message };
    }
  }

  getDownloadCommand(repoId: string, filename?: string, localDir?: string): string {
    const cleanRepo = repoId.replace(/^hf:\/\/(models\/)?/, '');
    if (filename && localDir) {
      return `hf download ${cleanRepo} ${filename} --local-dir "${localDir}"`;
    }
    if (filename) {
      return `hf download ${cleanRepo} ${filename}`;
    }
    if (localDir) {
      return `hf download ${cleanRepo} --local-dir "${localDir}"`;
    }
    return `hf download ${cleanRepo}`;
  }
}

export const huggingfaceClient = new HuggingFaceClient();
