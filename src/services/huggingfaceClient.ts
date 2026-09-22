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
      'User-Agent': 'RenegadeCMM/1.6.1 (HuggingFace Integration)',
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
          'User-Agent': 'RenegadeCMM/1.6.1',
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

  inferModelType(info: HFModelInfo, fileName: string): string {
    const fn = fileName.toLowerCase();
    if (fn.endsWith('.gguf')) return 'GGUF';
    const tag = (info.pipelineTag || '').toLowerCase();
    const tags = (info.tags || []).map((t) => t.toLowerCase());

    if (tag === 'text-generation' || tags.includes('llm') || tags.includes('llama') || tags.includes('qwen') || tags.includes('text-generation')) {
      return 'LLM';
    }
    if (tag === 'text-to-image' || tags.includes('diffusers') || tags.includes('stable-diffusion') || tags.includes('flux')) {
      if (fn.includes('lora') || tags.includes('lora')) return 'LORA';
      if (fn.includes('controlnet') || tags.includes('controlnet')) return 'Controlnet';
      if (fn.includes('vae') || tags.includes('vae')) return 'VAE';
      return 'Checkpoint';
    }
    if (fn.includes('t5') || fn.includes('clip') || tags.includes('text-encoder')) {
      return 'TextualInversion';
    }
    return 'Other';
  }

  /**
   * Identifies an unmatched local model file against Hugging Face repositories.
   * Checks HF cache structures, exact SHA256 LFS hash matches, and repository sibling file matches.
   */
  async matchModel(
    filePath: string,
    fileName: string,
    sha256?: string
  ): Promise<{
    matched: boolean;
    repoId?: string;
    modelName?: string;
    author?: string;
    modelType?: string;
    pipelineTag?: string;
    tags?: string[];
    fileInRepo?: string;
    info?: HFModelInfo;
  } | null> {
    // 1. Direct local Hugging Face cache folder check
    const cacheInfo = this.parseLocalHFCache(filePath);
    if (cacheInfo.isHFCache && cacheInfo.repoId) {
      const repoCheck = await this.checkModelRepo(cacheInfo.repoId);
      if (repoCheck.exists && repoCheck.info) {
        return {
          matched: true,
          repoId: cacheInfo.repoId,
          modelName: repoCheck.info.modelName,
          author: repoCheck.info.author,
          pipelineTag: repoCheck.info.pipelineTag,
          tags: repoCheck.info.tags,
          modelType: this.inferModelType(repoCheck.info, fileName),
          fileInRepo: fileName,
          info: repoCheck.info,
        };
      }
    }

    // 2. Clean base filename for searching
    const cleanBaseName = fileName
      .replace(/\.(safetensors|gguf|bin|pt|ckpt|onnx)$/i, '')
      .replace(/^models--/, '')
      .replace(/[_\.]/g, ' ')
      .replace(/\b(fp8|fp16|bf16|e4m3fn|e5m2|q4_k_m|q4_0|q4_1|q5_k_m|q5_0|q8_0|q8_1)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanBaseName.length < 3) {
      return null;
    }

    // 3. Search Hugging Face model hub
    const searchResults = await this.searchModels(cleanBaseName, 6);
    if (!searchResults || searchResults.length === 0) {
      return null;
    }

    const targetShaUpper = sha256 ? sha256.toUpperCase().trim() : null;
    const targetFileLower = fileName.toLowerCase().trim();

    // 3a. Exact SHA256 match in LFS siblings
    if (targetShaUpper) {
      for (const repo of searchResults) {
        if (repo.siblings && Array.isArray(repo.siblings)) {
          for (const sib of repo.siblings) {
            const sibSha = sib.lfs?.sha256 ? String(sib.lfs.sha256).toUpperCase().trim() : null;
            if (sibSha && sibSha === targetShaUpper) {
              return {
                matched: true,
                repoId: repo.id,
                modelName: repo.modelName,
                author: repo.author,
                pipelineTag: repo.pipelineTag,
                tags: repo.tags,
                modelType: this.inferModelType(repo, fileName),
                fileInRepo: sib.rfilename,
                info: repo,
              };
            }
          }
        }
      }
    }

    // 3b. Exact filename match in repo siblings
    for (const repo of searchResults) {
      if (repo.siblings && Array.isArray(repo.siblings)) {
        for (const sib of repo.siblings) {
          const sibBase = path.basename(sib.rfilename || '').toLowerCase();
          if (sibBase === targetFileLower) {
            return {
              matched: true,
              repoId: repo.id,
              modelName: repo.modelName,
              author: repo.author,
              pipelineTag: repo.pipelineTag,
              tags: repo.tags,
              modelType: this.inferModelType(repo, fileName),
              fileInRepo: sib.rfilename,
              info: repo,
            };
          }
        }
      }
    }

    // 3c. Direct name match (e.g. repo name corresponds directly to query)
    const normalizedQuery = cleanBaseName.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const repo of searchResults) {
      const normalizedRepoName = repo.modelName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedRepoName === normalizedQuery && normalizedRepoName.length >= 4) {
        return {
          matched: true,
          repoId: repo.id,
          modelName: repo.modelName,
          author: repo.author,
          pipelineTag: repo.pipelineTag,
          tags: repo.tags,
          modelType: this.inferModelType(repo, fileName),
          fileInRepo: fileName,
          info: repo,
        };
      }
    }

    return null;
  }
}

export const huggingfaceClient = new HuggingFaceClient();
