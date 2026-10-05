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
import axios, { AxiosResponse } from 'axios';
import fs from 'fs';
import path from 'path';
import { DownloadTask, ConflictStrategy } from '../types/app';
import { computeFileSHA256 } from '../utils/hash';
import { sanitizeFileName, testFolderWritable } from '../utils/pathUtils';
import { dbManager } from '../db/db';
import { logger } from '../utils/logger';
import { webhookService } from './webhookService';
import { civitaiClient } from './civitaiClient';
import { huggingfaceClient } from './huggingfaceClient';
import { imageCacheService } from './imageCacheService';
import { swarmBridge } from './swarmBridge';

export function sanitizeDownloadUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('token')) {
      parsed.searchParams.delete('token');
      return parsed.toString();
    }
    return url;
  } catch {
    return url.replace(/([?&])token=[^&]*(&|$)/gi, (_match, prefix, suffix) => {
      if (prefix === '?' && suffix === '&') return '?';
      if (prefix === '&' && suffix === '&') return '&';
      return '';
    });
  }
}

/**
 * Determines whether a URL securely targets the CivitAI domain ecosystem (civitai.com, civitai.red,
 * or their subdomains) over HTTPS.
 * Uses WHATWG URL parsing to prevent incomplete URL substring sanitization vulnerabilities.
 */
export function isCivitaiUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'civitai.com' ||
      host.endsWith('.civitai.com') ||
      host === 'civitai.red' ||
      host.endsWith('.civitai.red')
    );
  } catch {
    return false;
  }
}

/**
 * Attaches the CivitAI API token to the URL query string if and only if the URL
 * securely targets CivitAI over HTTPS and does not already contain a token.
 */
export function attachCivitaiToken(url: string, apiKey?: string): string {
  if (!url || !apiKey || !isCivitaiUrl(url)) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('token')) {
      parsed.searchParams.set('token', apiKey.trim());
      return parsed.toString();
    }
  } catch {
    // Malformed URL, return unadjusted
  }
  return url;
}

/**
 * Determines whether a URL securely targets the Hugging Face domain ecosystem (huggingface.co
 * or subdomains such as cdn-lfs.huggingface.co) over HTTPS.
 */
export function isHuggingFaceUrl(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return host === 'huggingface.co' || host.endsWith('.huggingface.co');
  } catch {
    return false;
  }
}

export class DownloadManager {
  private tasks: Map<string, DownloadTask> = new Map();
  private activeDownloads: Map<string, { cancel: () => void; cleanup: () => void }> = new Map();
  private maxConcurrent: number = 2;
  private defaultConflictStrategy: ConflictStrategy = 'rename';
  private strictHashVerification: boolean = true;
  private persistenceTimer: NodeJS.Timeout | null = null;
  private dbReady: boolean = false;
  private civitaiApiKey?: string;
  private huggingfaceToken?: string;

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  setApiKey(key?: string) {
    this.civitaiApiKey = key?.trim() || undefined;
  }

  setHuggingFaceToken(token?: string) {
    this.huggingfaceToken = token?.trim() || undefined;
  }

  /**
   * Load any previously queued / completed downloads from the SQLite `downloads`
   * table into memory and start periodically persisting task state so the queue
   * (including finished downloads) survives application restarts.
   */
  async initPersistence(): Promise<void> {
    try {
      await this.hydrateFromDb();
      this.dbReady = true;
      logger.info(`Restored ${this.tasks.size} persisted download task(s) from database.`);
    } catch (err) {
      logger.warn('Download persistence storage unavailable; downloads will run in memory only.', err);
    }
    if (!this.persistenceTimer) {
      this.persistenceTimer = setInterval(() => {
        this.persistAll().catch(() => {});
      }, 3000);
    }
  }

  private async hydrateFromDb(): Promise<void> {
    let rows: any[] = [];
    try {
      rows = await dbManager.all(
        'SELECT * FROM downloads ORDER BY created_at ASC, id ASC;'
      );
    } catch {
      return;
    }

    for (const r of rows) {
      if (!r || !r.id || this.tasks.has(r.id)) continue;

      // Tasks that were mid-flight at shutdown are queued again so they resume
      // automatically; explicitly paused ones stay paused.
      let status = (r.status || 'paused') as DownloadTask['status'];
      if (status === 'downloading' || status === 'verifying' || status === 'pending') {
        status = 'pending';
      }

      const task: DownloadTask = {
        id: r.id,
        modelVersionId: r.model_version_id || 0,
        modelId: r.model_id || 0,
        modelName: r.model_name || 'Unknown Model',
        versionName: r.version_name || '',
        modelType: r.model_type || 'Checkpoint',
        baseModel: r.base_model || '',
        creator: r.creator || undefined,
        targetFolder: r.target_folder || '',
        targetRoot: r.target_root || undefined,
        fileName: r.file_name || 'model.safetensors',
        downloadUrl: sanitizeDownloadUrl(r.download_url || ''),
        sizeKB: r.size_kb || 0,
        sha256: r.sha256 || undefined,
        status,
        progress: r.progress || 0,
        downloadedBytes: r.downloaded_bytes || 0,
        totalBytes: r.total_bytes || Math.round((r.size_kb || 0) * 1024),
        speedBps: 0,
        error: r.error || undefined,
        computedPath: r.computed_path || '',
        isHashMismatch: !!r.is_hash_mismatch,
        deleteOldVersionFile: r.delete_old_version_file || undefined,
        deleteOldModelId: r.delete_old_model_id || undefined,
        completedAt: r.completed_at || undefined,
        source: (r.source || 'civitai') as 'civitai' | 'huggingface',
        hfRepoId: r.hf_repo_id || undefined,
        hfCommitSha: r.hf_commit_sha || undefined,
      };

      // Stats for prior sessions are historical; live speed starts at 0.
      task.speedBps = 0;
      this.tasks.set(task.id, task);
    }

    // Auto-resume tasks that were pending or mid-download when the app exited.
    this.processQueue();
  }

  private async persistTask(id: string): Promise<void> {
    if (!this.dbReady) return;
    const task = this.tasks.get(id);
    if (!task) return;
    try {
      await dbManager.run(
        `INSERT OR REPLACE INTO downloads
          (id, model_version_id, model_id, model_name, version_name, model_type, base_model, creator,
           target_folder, target_root, file_name, download_url, size_kb, sha256, status, progress,
           downloaded_bytes, total_bytes, speed_bps, error, computed_path, completed_at,
           is_hash_mismatch, delete_old_version_file, delete_old_model_id,
           source, hf_repo_id, hf_commit_sha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          task.id,
          task.modelVersionId || 0,
          task.modelId || 0,
          task.modelName || 'Unknown Model',
          task.versionName || '',
          task.modelType || 'Checkpoint',
          task.baseModel || null,
          task.creator || null,
          task.targetFolder || '',
          task.targetRoot || null,
          task.fileName || '',
          sanitizeDownloadUrl(task.downloadUrl || ''),
          task.sizeKB || 0,
          task.sha256 || null,
          task.status,
          Math.round(task.progress || 0),
          task.downloadedBytes || 0,
          task.totalBytes || 0,
          task.speedBps || 0,
          task.error || null,
          task.computedPath || null,
          task.completedAt || null,
          task.isHashMismatch ? 1 : 0,
          task.deleteOldVersionFile || null,
          task.deleteOldModelId || null,
          task.source || 'civitai',
          task.hfRepoId || null,
          task.hfCommitSha || null,
        ]
      );
    } catch (err) {
      logger.warn(`Failed to persist download task ${id}:`, err);
    }
  }

  private async persistAll(): Promise<void> {
    if (!this.dbReady || this.tasks.size === 0) return;
    for (const id of Array.from(this.tasks.keys())) {
      await this.persistTask(id);
    }
  }

  /** Flush all in-memory tasks to SQLite and stop the periodic timer. Called on app shutdown. */
  async flushAndStopPersistence(): Promise<void> {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
      this.persistenceTimer = null;
    }
    if (!this.dbReady) return;
    // Persist current snapshot — deletions have already removed rows, so only live tasks are written.
    await this.persistAll();
  }

  setMaxConcurrent(max: number) {
    this.maxConcurrent = Math.max(1, Math.min(10, Math.round(max || 2)));
    logger.info(`Download queue concurrency set to ${this.maxConcurrent}`);
    this.processQueue();
  }

  setConflictStrategy(strategy: ConflictStrategy) {
    this.defaultConflictStrategy = strategy;
  }

  setStrictHashVerification(strict: boolean) {
    this.strictHashVerification = strict;
  }

  getTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  getTask(id: string): DownloadTask | undefined {
    return this.tasks.get(id);
  }

  addTask(task: Omit<DownloadTask, 'id' | 'status' | 'progress' | 'downloadedBytes' | 'totalBytes' | 'speedBps'>): DownloadTask {
    const cleanUrl = sanitizeDownloadUrl(task.downloadUrl || '');
    const cleanTargetRoot = (task.targetRoot || '').trim().toLowerCase();
    const cleanTargetFolder = (task.targetFolder || '').trim().toLowerCase();
    const cleanFileName = (task.fileName || '').trim().toLowerCase();
    const cleanSha256 = (task.sha256 || '').trim().toLowerCase();

    // Deduplication check: Refuse to add duplicate download if a task for the exact same file is already in progress (pending, downloading, verifying)
    const existingInProgress = Array.from(this.tasks.values()).find((existing) => {
      const isInProgress =
        existing.status === 'pending' ||
        existing.status === 'downloading' ||
        existing.status === 'verifying';
      if (!isInProgress) return false;

      // 1. Exact SHA256 match (if both specify hash)
      if (cleanSha256 && existing.sha256 && cleanSha256 === existing.sha256.trim().toLowerCase()) {
        return true;
      }

      // 2. Exact Download URL match (if both specify URL)
      if (cleanUrl && existing.downloadUrl && cleanUrl.toLowerCase() === sanitizeDownloadUrl(existing.downloadUrl).toLowerCase()) {
        return true;
      }

      // 3. Exact Model Version ID match with identical filename
      if (
        task.modelVersionId &&
        existing.modelVersionId &&
        task.modelVersionId === existing.modelVersionId &&
        cleanFileName === (existing.fileName || '').trim().toLowerCase()
      ) {
        return true;
      }

      // 4. Exact File Name match (case-insensitive) in the same target folder / root
      if (cleanFileName && cleanFileName === (existing.fileName || '').trim().toLowerCase()) {
        const existingRoot = (existing.targetRoot || '').trim().toLowerCase();
        const existingFolder = (existing.targetFolder || '').trim().toLowerCase();
        if (
          (!cleanTargetRoot || !existingRoot || cleanTargetRoot === existingRoot) &&
          (!cleanTargetFolder || !existingFolder || cleanTargetFolder === existingFolder)
        ) {
          return true;
        }
      }

      return false;
    });

    if (existingInProgress) {
      logger.warn(
        `Duplicate download request rejected: '${task.fileName}' (${task.modelName}) is already in progress [Task ${existingInProgress.id} - Status: ${existingInProgress.status}].`
      );
      return existingInProgress;
    }

    const id = `dl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const fullTask: DownloadTask = {
      ...task,
      id,
      downloadUrl: cleanUrl,
      status: 'pending',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: Math.round(task.sizeKB * 1024),
      speedBps: 0,
    };

    this.tasks.set(id, fullTask);
    this.persistTask(id).catch(() => {});
    this.processQueue();
    return fullTask;
  }

  async pauseTask(id: string): Promise<void> {
    const active = this.activeDownloads.get(id);
    if (active) {
      active.cancel();
      this.activeDownloads.delete(id);
    }
    const task = this.tasks.get(id);
    if (task && (task.status === 'downloading' || task.status === 'pending')) {
      task.status = 'paused';
      task.speedBps = 0;
      logger.info(`Paused download task: ${task.fileName}`);
      await this.persistTask(id);
    }
  }

  async resumeTask(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (task && (task.status === 'paused' || task.status === 'failed')) {
      task.status = 'pending';
      task.error = undefined;
      await this.persistTask(id);
      this.processQueue();
    }
  }

  async cancelTask(id: string): Promise<void> {
    const active = this.activeDownloads.get(id);
    if (active) {
      active.cancel();
      active.cleanup();
      this.activeDownloads.delete(id);
    }
    const task = this.tasks.get(id);
    if (task) {
      // Automatically clean up and delete temporary partial file from disk
      const partFile = `${task.computedPath}.part`;
      try {
        if (fs.existsSync(partFile)) {
          fs.unlinkSync(partFile);
          logger.info(`Deleted partial download file: ${partFile}`);
        }
      } catch (e) {
        logger.warn(`Could not immediately delete partial file ${partFile}:`, e);
      }
      this.tasks.delete(id);
      logger.info(`Cancelled download task and deleted partial data: ${task.fileName}`);
    }
    await this.removePersistedRecord(id);
    this.processQueue();
  }

  /**
   * Permanently removes a download from the queue list (never touches the finished
   * file on disk). Active/incomplete tasks are cancelled and their partial files
   * cleaned up, then the record is deleted from the database.
   */
  async deleteTask(id: string): Promise<boolean> {
    const active = this.activeDownloads.get(id);
    if (active) {
      try {
        active.cancel();
      } catch {}
      try {
        active.cleanup();
      } catch {}
      this.activeDownloads.delete(id);
    }
    const task = this.tasks.get(id);
    if (task) {
      const partFile = `${task.computedPath}.part`;
      try {
        if (fs.existsSync(partFile)) {
          fs.unlinkSync(partFile);
        }
      } catch (e) {
        logger.warn(`Could not delete partial file ${partFile}:`, e);
      }
      this.tasks.delete(id);
    }
    await this.removePersistedRecord(id);
    this.processQueue();
    return true;
  }

  /**
   * Removes every completed download from the queue list. Finished files on disk
   * are never touched — only the queue history entries are cleared.
   */
  async clearFinishedTasks(): Promise<number> {
    const finishedIds = Array.from(this.tasks.values())
      .filter((t) => t.status === 'completed')
      .map((t) => t.id);
    for (const id of finishedIds) {
      this.tasks.delete(id);
      await this.removePersistedRecord(id);
    }
    this.processQueue();
    return finishedIds.length;
  }

  private async removePersistedRecord(id: string): Promise<void> {
    if (!this.dbReady) {
      logger.warn(`[DownloadManager] removePersistedRecord skipped — DB not ready for ${id}`);
      return;
    }
    try {
      const res = await dbManager.run('DELETE FROM downloads WHERE id = ?;', [id]);
      logger.info(`[DownloadManager] Deleted persisted download ${id} (changes=${res.changes})`);
    } catch (err) {
      logger.warn(`Failed to delete persisted download record ${id}:`, err);
    }
  }

  private async processQueue() {
    while (true) {
      const activeCount = Array.from(this.tasks.values()).filter(
        (t) => t.status === 'downloading' || t.status === 'verifying'
      ).length;

      if (activeCount >= this.maxConcurrent) break;

      const nextTask = Array.from(this.tasks.values()).find(
        (t) => t.status === 'pending'
      );

      if (!nextTask) break;

      this.startDownload(nextTask.id);
    }
  }

  private resolveConflict(targetPath: string, strategy: ConflictStrategy): string | null {
    if (!fs.existsSync(targetPath)) return targetPath;

    if (strategy === 'skip') {
      logger.info(`File already exists, skipping: ${targetPath}`);
      return null;
    }

    if (strategy === 'replace') {
      logger.info(`File already exists, overwriting: ${targetPath}`);
      return targetPath;
    }

    if (strategy === 'rename') {
      const ext = path.extname(targetPath);
      const base = targetPath.slice(0, -ext.length);
      let counter = 1;
      let newPath = `${base}_v${counter}${ext}`;
      while (fs.existsSync(newPath)) {
        counter++;
        newPath = `${base}_v${counter}${ext}`;
      }
      logger.info(`File exists, renaming to: ${newPath}`);
      return newPath;
    }

    return targetPath;
  }

  private async startDownload(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;

    task.status = 'downloading';
    this.persistTask(id).catch(() => {});

    const cancelTokenSource = axios.CancelToken.source();
    let writeStream: fs.WriteStream | null = null;
    this.activeDownloads.set(id, {
      cancel: () => cancelTokenSource.cancel('Download cancelled by user'),
      cleanup: () => {
        try {
          if (writeStream && !writeStream.destroyed) {
            writeStream.destroy();
          }
        } catch (e) {}
      },
    });

    try {
      let targetPath = task.computedPath;
      if (!targetPath || !targetPath.trim()) {
        throw new Error(
          'Destination path is empty or could not be determined. Please verify your configured ComfyUI folders in Settings.'
        );
      }

      // Pre-flight sanity check on destination directory before network stream
      const targetDir = path.dirname(targetPath);
      const accessCheck = testFolderWritable(targetDir);
      if (!accessCheck.writable) {
        throw new Error(
          `Cannot write to destination folder (${targetDir}): ${accessCheck.error || 'Destination drive or directory is locked or read-only'}`
        );
      }

      // Handle conflict resolution
      const resolvedPath = this.resolveConflict(targetPath, this.defaultConflictStrategy);
      if (!resolvedPath) {
        task.status = 'completed';
        task.progress = 100;
        task.completedAt = task.completedAt || new Date().toISOString();
        await this.saveCompanionFiles(task, targetPath);
        this.persistTask(id).catch(() => {});
        this.registerCompletedFile(task).catch(() => {});
        this.activeDownloads.delete(id);
        this.processQueue();
        return;
      }
      task.computedPath = resolvedPath;

      const partFile = `${resolvedPath}.part`;

      let existingBytes = 0;
      if (fs.existsSync(partFile)) {
        try {
          existingBytes = fs.statSync(partFile).size;
        } catch {
          existingBytes = 0;
        }
      }

      let lastTime = Date.now();
      let lastBytes = existingBytes;

      const makeRequest = async (useRange: boolean): Promise<AxiosResponse> => {
        const headers: Record<string, string> = {
          'User-Agent': 'RenegadeCMM/1.6.2',
        };
        if (useRange && existingBytes > 0) {
          headers['Range'] = `bytes=${existingBytes}-`;
        }

        const effectiveCivitaiKey = this.civitaiApiKey || civitaiClient.getApiKey();
        const effectiveHfToken = this.huggingfaceToken || huggingfaceClient.getToken();

        let requestUrl = task.downloadUrl;
        if (effectiveCivitaiKey && isCivitaiUrl(requestUrl)) {
          requestUrl = attachCivitaiToken(requestUrl, effectiveCivitaiKey);
          try {
            const parsedReq = new URL(requestUrl);
            const reqHost = parsedReq.hostname.toLowerCase();
            // Primary Civitai endpoints accept Authorization Bearer headers for gated/NSFW/early-access models
            if (
              reqHost === 'civitai.com' ||
              reqHost === 'www.civitai.com' ||
              reqHost === 'civitai.red' ||
              reqHost === 'www.civitai.red'
            ) {
              headers['Authorization'] = `Bearer ${effectiveCivitaiKey}`;
            }
          } catch {}
        }
        if (effectiveHfToken && isHuggingFaceUrl(requestUrl)) {
          try {
            const parsedReq = new URL(requestUrl);
            const reqHost = parsedReq.hostname.toLowerCase();
            // Only inject Bearer auth to the primary Hugging Face host, never directly to external/CDN endpoints
            if (reqHost === 'huggingface.co' || reqHost === 'www.huggingface.co') {
              headers['Authorization'] = `Bearer ${effectiveHfToken}`;
            }
          } catch {}
        }
        return await axios.get(requestUrl, {
          responseType: 'stream',
          headers,
          cancelToken: cancelTokenSource.token,
          maxRedirects: 5,
          beforeRedirect: (options: any) => {
            // When redirected from huggingface.co or civitai.com to S3/CloudFront/CDN storage
            // (e.g. cdn-lfs.huggingface.co, civitai-prod-settled.s3.amazonaws.com, orchestration-model-cache, or AWS presigned URLs),
            // remove Authorization header to prevent AWS S3 HTTP 400 Bad Request
            // ("Only one auth mechanism allowed; query params and Authorization header cannot both be present")
            // and prevent Bearer token leakage to third-party CDNs.
            const targetHost = (options.hostname || '').toLowerCase();
            const isStrictApex =
              targetHost === 'huggingface.co' ||
              targetHost === 'www.huggingface.co' ||
              targetHost === 'civitai.com' ||
              targetHost === 'www.civitai.com' ||
              targetHost === 'civitai.red' ||
              targetHost === 'www.civitai.red';

            const targetPath = (options.path || '').toLowerCase();
            const hasPresignedAuthParams =
              targetPath.includes('x-amz-') ||
              targetPath.includes('signature=') ||
              targetPath.includes('response-content-disposition=');

            if (!isStrictApex || hasPresignedAuthParams) {
              if (options.headers) {
                for (const h of Object.keys(options.headers)) {
                  if (h.toLowerCase() === 'authorization') {
                    delete options.headers[h];
                  }
                }
              }
            }
          },
        });
      };

      let response: AxiosResponse;
      try {
        response = await makeRequest(true);
      } catch (reqErr: any) {
        // If HTTP 416 Range Not Satisfiable (e.g. stale/corrupted .part file or CDN offset mismatch), retry clean from byte 0
        if (
          reqErr.response?.status === 416 ||
          reqErr.message?.includes('416') ||
          (reqErr.response && reqErr.response.status >= 400 && reqErr.response.status < 500 && existingBytes > 0)
        ) {
          logger.warn(
            `Download range request returned error (${reqErr.message}) for ${task.fileName}. Cleaning partial file and restarting from beginning.`
          );
          try {
            if (fs.existsSync(partFile)) {
              fs.unlinkSync(partFile);
            }
          } catch (e) {}
          existingBytes = 0;
          task.downloadedBytes = 0;
          lastBytes = 0;
          response = await makeRequest(false);
        } else {
          throw reqErr;
        }
      }

      // Check if server returned 206 Partial Content or full 200 OK
      const isPartial = response.status === 206;
      if (!isPartial) {
        existingBytes = 0;
        task.downloadedBytes = 0;
        lastBytes = 0;
      } else {
        task.downloadedBytes = existingBytes;
        lastBytes = existingBytes;
      }

      const contentLengthRaw = response.headers['content-length'];
      const totalLength = parseInt(
        Array.isArray(contentLengthRaw)
          ? contentLengthRaw[0]
          : String(contentLengthRaw || '0'),
        10
      );
      if (totalLength > 0) {
        task.totalBytes = existingBytes + totalLength;
      } else if (!task.totalBytes || task.totalBytes <= 0) {
        task.totalBytes = Math.round((task.sizeKB || 0) * 1024);
      }

      writeStream = fs.createWriteStream(partFile, {
        flags: isPartial && existingBytes > 0 ? 'a' : 'w',
      });

      response.data.on('data', (chunk: Buffer) => {
        task.downloadedBytes += chunk.length;
        const now = Date.now();
        const timeDiff = (now - lastTime) / 1000;
        if (timeDiff >= 0.5) {
          const bytesDiff = task.downloadedBytes - lastBytes;
          task.speedBps = Math.round(bytesDiff / timeDiff);
          lastTime = now;
          lastBytes = task.downloadedBytes;
        }

        if (task.totalBytes > 0) {
          task.progress = Math.min(
            99,
            Math.round((task.downloadedBytes / task.totalBytes) * 100)
          );
        } else if (task.downloadedBytes > 0) {
          // If totalBytes was unknown, indicate non-zero downloading activity
          task.progress = Math.max(1, task.progress);
        }
      });

      await new Promise<void>((resolve, reject) => {
        if (!writeStream) return resolve();
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
        response.data.on('error', reject);
        response.data.pipe(writeStream);
      });

      this.activeDownloads.delete(id);

      // Verify SHA256 Hash if provided
      if (task.sha256) {
        task.status = 'verifying';
        logger.info(`Verifying SHA256 hash for task: ${task.fileName}`);
        const computedHash = await computeFileSHA256(partFile);
        if (computedHash.toUpperCase() !== task.sha256.toUpperCase()) {
          if (!this.strictHashVerification) {
            logger.warn(
              `SHA256 hash mismatch ignored (strict mode off): Expected ${task.sha256}, got ${computedHash}. Finalizing download.`
            );
          } else {
            task.status = 'failed';
            task.isHashMismatch = true;
            task.error = `SHA256 hash mismatch! Expected ${task.sha256}, got ${computedHash}`;
            logger.error(task.error);
            this.persistTask(id).catch(() => {});
            this.processQueue();
            return;
          }
        }
      }

      // Atomic rename from .part to final destination
      if (fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
      }
      fs.renameSync(partFile, resolvedPath);

      // If task requested to delete superseded old version upon successful download completion
      if (task.deleteOldVersionFile && typeof task.deleteOldVersionFile === 'string') {
        try {
          const oldPath = path.resolve(task.deleteOldVersionFile);
          const newPath = path.resolve(resolvedPath);
          if (oldPath !== newPath && fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
            logger.info(`Deleted superseded version file after successful update: ${oldPath}`);
            if (task.deleteOldModelId) {
              await dbManager.run('DELETE FROM local_models WHERE id = ?;', [task.deleteOldModelId]);
            } else {
              await dbManager.run('DELETE FROM local_models WHERE file_path = ?;', [oldPath]);
            }
            task.note = `Previous version removed: the superseded file "${path.basename(oldPath)}" was confirmed deleted and its old Library entry was removed. This updated version is now in your Library.`;
          } else {
            task.note = `Previous version was not deleted: the old file "${path.basename(oldPath)}" could not be found on disk (it may already be gone), so nothing was removed.`;
          }
        } catch (delErr) {
          logger.warn(`Failed to delete superseded version file ${task.deleteOldVersionFile}:`, delErr);
          task.note = `Previous version could NOT be deleted: "${path.basename(task.deleteOldVersionFile)}" is still on disk. Check file permissions or delete it manually.`;
        }
      }

      // Save companion files (.sha256, .civitai.info / .huggingface.info, and preview image)
      await this.saveCompanionFiles(task, resolvedPath);

      task.status = 'completed';
      task.progress = 100;
      task.speedBps = 0;
      task.isHashMismatch = false;
      task.completedAt = task.completedAt || new Date().toISOString();
      this.persistTask(id).catch(() => {});
      logger.info(`Successfully completed download: ${task.fileName} -> ${resolvedPath}`);
      this.registerCompletedFile(task).catch(() => {});
      // Trigger Swarm sister app ingest notification (asynchronous, non-blocking)
      try {
        const ingestRes = await swarmBridge.notifySwarmModelIngest(resolvedPath, task);
        if (!ingestRes.success) {
          const errStr = String(ingestRes.error || '');
          const isOffline =
            errStr.includes('ECONNREFUSED') ||
            errStr.includes('daemon unavailable') ||
            errStr.includes('not responding') ||
            errStr.includes('offline');
          if (isOffline) {
            logger.debug(`RenegadeSwarm daemon offline (port 5180). Swarm ingest skipped for ${task.fileName}.`);
          } else {
            logger.warn(`RenegadeSwarm ingest notification failed for ${task.fileName}:`, ingestRes.error);
          }
          task.swarmIngestError = ingestRes.error;
        } else {
          task.swarmIngested = true;
          logger.info(`RenegadeSwarm successfully ingested model: ${task.fileName}`);
        }
      } catch (swarmErr: any) {
        const msg = String(swarmErr?.message || '');
        if (msg.includes('ECONNREFUSED')) {
          logger.debug(`RenegadeSwarm daemon offline: ${msg}`);
        } else {
          logger.warn(`RenegadeSwarm ingest exception for ${task.fileName}:`, msg);
        }
      }
    } catch (err: any) {
      this.activeDownloads.delete(id);
      if (axios.isCancel(err)) {
        logger.info(`Download task cancelled/paused: ${task.fileName}`);
      } else {
        task.status = 'failed';
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          task.requiresAuth = true;
          task.error =
            'This download requires a CivitAI account. Add your API token in Settings (CivitAI API Token) to download NSFW or creator-restricted models.';
        } else {
          task.error = err.message || 'Unknown download error';
        }
        logger.error(`Download failed for task ${task.fileName}:`, err);
        this.persistTask(id).catch(() => {});
      }
    }

    this.processQueue();
  }

  /**
   * Saves companion assets alongside the downloaded model file:
   * 1. <baseName>.sha256 - Plaintext SHA256 hash
   * 2. <baseName>.<host>.info - Complete metadata JSON (e.g. .civitai.info or .huggingface.info)
   * 3. <baseName>.<ext> - Downloaded preview thumbnail (e.g. .jpeg, .png, .webp)
   */
  public async saveCompanionFiles(task: DownloadTask, resolvedPath: string): Promise<void> {
    try {
      if (!fs.existsSync(resolvedPath)) return;
      const ext = path.extname(resolvedPath);
      const baseNameWithoutExt = resolvedPath.slice(0, -ext.length);

      // 1. Write .sha256 companion file
      if (task.sha256 && task.sha256.trim()) {
        try {
          const shaFile = `${baseNameWithoutExt}.sha256`;
          fs.writeFileSync(shaFile, task.sha256.trim(), 'utf8');
          logger.info(`Saved companion hash file: ${shaFile}`);
        } catch (shaErr) {
          logger.warn(`Failed writing companion .sha256 for ${task.fileName}:`, shaErr);
        }
      }

      // 2. Fetch and write .civitai.info or .huggingface.info companion metadata file
      let versionData: any = task.versionMetadata;
      if (!versionData && task.source !== 'huggingface' && task.modelVersionId) {
        try {
          versionData = await civitaiClient.fetchModelVersion(task.modelVersionId);
        } catch (fetchErr) {
          logger.warn(`Could not fetch model version ${task.modelVersionId} metadata from CivitAI:`, fetchErr);
        }
      }

      if (versionData) {
        try {
          const hostName = task.source === 'huggingface' ? 'huggingface' : 'civitai';
          const infoFile = `${baseNameWithoutExt}.${hostName}.info`;
          fs.writeFileSync(infoFile, JSON.stringify(versionData, null, 2), 'utf8');
          logger.info(`Saved companion metadata info file: ${infoFile}`);
        } catch (infoErr) {
          logger.warn(`Failed writing companion .info metadata for ${task.fileName}:`, infoErr);
        }
      } else if (task.source === 'huggingface' || task.hfRepoId) {
        try {
          const hfInfo = {
            id: task.hfRepoId,
            repoId: task.hfRepoId,
            commitSha: task.hfCommitSha,
            fileName: task.fileName,
            modelName: task.modelName,
            modelType: task.modelType,
            baseModel: task.baseModel,
            source: 'huggingface',
            downloadUrl: task.downloadUrl,
            downloadedAt: new Date().toISOString(),
          };
          const infoFile = `${baseNameWithoutExt}.huggingface.info`;
          fs.writeFileSync(infoFile, JSON.stringify(hfInfo, null, 2), 'utf8');
          logger.info(`Saved companion Hugging Face metadata info file: ${infoFile}`);
        } catch (hfInfoErr) {
          logger.warn(`Failed writing companion .huggingface.info for ${task.fileName}:`, hfInfoErr);
        }
      }

      // 3. Download and save primary preview image alongside model file
      let previewUrl = task.previewUrl;
      if (!previewUrl && versionData?.images && Array.isArray(versionData.images) && versionData.images.length > 0) {
        const staticImg = versionData.images.find(
          (img: any) => img && img.url && (img.type === 'image' || !img.url.toLowerCase().endsWith('.mp4'))
        );
        previewUrl = staticImg?.url || versionData.images[0]?.url;
      }

      if (previewUrl && typeof previewUrl === 'string' && previewUrl.startsWith('http')) {
        try {
          const cached = await imageCacheService.getImage(previewUrl, 'library');
          if (cached && cached.buffer) {
            let imgExt = '.jpeg';
            if (cached.contentType?.includes('png') || previewUrl.toLowerCase().includes('.png')) {
              imgExt = '.png';
            } else if (cached.contentType?.includes('webp') || previewUrl.toLowerCase().includes('.webp')) {
              imgExt = '.webp';
            } else if (cached.contentType?.includes('gif')) {
              imgExt = '.gif';
            } else if (cached.contentType?.includes('avif')) {
              imgExt = '.avif';
            }

            const imgFile = `${baseNameWithoutExt}${imgExt}`;
            fs.writeFileSync(imgFile, cached.buffer);
            logger.info(`Saved companion preview image: ${imgFile}`);
          }
        } catch (imgErr) {
          logger.warn(`Failed downloading companion preview image for ${task.fileName}:`, imgErr);
        }
      }
    } catch (companionErr) {
      logger.warn(`Error during companion file generation for ${task.fileName}:`, companionErr);
    }
  }

  /**
   * Registers a just-completed download file into the local library (SQLite `local_models`)
   * so it appears in the Library tab immediately — no full directory scan required, since the
   * file came through the app and the task already carries its SHA256 + CivitAI metadata.
   */
  private async registerCompletedFile(task: DownloadTask): Promise<void> {
    if (!this.dbReady || !task.computedPath) return;
    try {
      if (!fs.existsSync(task.computedPath)) return;
      const stats = fs.statSync(task.computedPath);
      const fileSize = stats.size;
      const modifiedAt = Math.floor(stats.mtimeMs);

      const existing: any = await dbManager.get(
        'SELECT id FROM local_models WHERE file_path = ? COLLATE NOCASE',
        [task.computedPath]
      );
      const localId = existing?.id || `loc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

      await dbManager.run(
        `INSERT INTO local_models
          (id, file_path, file_name, file_size, modified_at, sha256, civitai_model_id,
           civitai_version_id, civitai_name, scanned_at, preview_url, model_type, nsfw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET
           file_path = excluded.file_path,
           file_name = excluded.file_name,
           file_size = excluded.file_size,
           modified_at = excluded.modified_at,
           sha256 = excluded.sha256,
           civitai_model_id = COALESCE(excluded.civitai_model_id, local_models.civitai_model_id),
           civitai_version_id = COALESCE(excluded.civitai_version_id, local_models.civitai_version_id),
           civitai_name = COALESCE(excluded.civitai_name, local_models.civitai_name),
           scanned_at = CURRENT_TIMESTAMP,
           preview_url = COALESCE(excluded.preview_url, local_models.preview_url),
           model_type = COALESCE(excluded.model_type, local_models.model_type),
           nsfw = local_models.nsfw`,
        [
          localId,
          task.computedPath,
          path.basename(task.computedPath),
          fileSize,
          modifiedAt,
          task.sha256 || null,
          task.modelId || null,
          task.modelVersionId || null,
          task.modelName || null,
          task.previewUrl || null,
          task.modelType || null,
        ]
      );
      logger.info(`Registered completed download in library: ${task.computedPath}`);
    } catch (err) {
      logger.warn(`Failed to register completed download into library: ${task.computedPath}`, err);
    }
  }

  async forceCompleteTask(id: string): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task) return false;

    const partFile = `${task.computedPath}.part`;
    try {
      if (fs.existsSync(partFile)) {
        if (fs.existsSync(task.computedPath)) {
          fs.unlinkSync(task.computedPath);
        }
        fs.renameSync(partFile, task.computedPath);
      } else if (!fs.existsSync(task.computedPath)) {
        logger.error(`Cannot force-finish task ${task.fileName}: neither .part nor final file exists.`);
        return false;
      }

      // Save companion files on forced completion
      await this.saveCompanionFiles(task, task.computedPath);

      task.status = 'completed';
      task.progress = 100;
      task.speedBps = 0;
      task.error = undefined;
      task.isHashMismatch = false;
      task.completedAt = task.completedAt || new Date().toISOString();
      logger.info(`Manually forced download completion for: ${task.fileName} -> ${task.computedPath}`);
      this.persistTask(id).catch(() => {});
      this.registerCompletedFile(task).catch(() => {});
      return true;
    } catch (err: any) {
      logger.error(`Failed to force complete download task ${task.fileName}:`, err);
      task.error = `Force completion failed: ${err?.message || err}`;
      return false;
    }
  }
}

export const downloadManager = new DownloadManager();
