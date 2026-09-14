/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import fs from 'fs';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { LocalModel, ScanProgress } from '../types/app';
import { civitaiClient } from './civitaiClient';
import { dbManager } from '../db/db';
import { computeFileSHA256 } from '../utils/hash';
import { logger } from '../utils/logger';
import { imageCacheService } from './imageCacheService';

const MODEL_EXTENSIONS = new Set([
  '.safetensors',
  '.ckpt',
  '.pt',
  '.bin',
  '.pth',
  '.gguf',
  '.sft',
  '.onnx',
  '.engine',
  '.tensor',
]);

export function resolveModelFileName(filePath: string): string {
  const baseName = path.basename(filePath);
  const normalized = filePath.replace(/\\/g, '/');

  // Check if file is inside a HuggingFace hub / cache blobs directory
  if (normalized.includes('/blobs/')) {
    const parts = normalized.split('/');
    const blobsIdx = parts.lastIndexOf('blobs');
    if (blobsIdx > 0) {
      const parentDir = parts[blobsIdx - 1];
      if (parentDir && parentDir.startsWith('models--')) {
        return parentDir;
      }
      if (parentDir && parentDir !== '' && !parentDir.includes(':')) {
        return parentDir;
      }
    }
  }

  // Check if filename is a pure SHA256 / hex blob hash and parent directory has models-- or model name
  if (/^[a-fA-F0-9]{40,64}$/.test(baseName)) {
    const parts = normalized.split('/');
    const modelFolder = parts.slice(0, -1).reverse().find((p) => p.startsWith('models--'));
    if (modelFolder) {
      return modelFolder;
    }
  }

  return baseName;
}

export function discoverCompanionFiles(filePath: string): {
  companionHash?: string;
  companionInfo?: any;
  companionInfoPath?: string;
  localImagePath?: string;
  localImageUrl?: string;
} {
  const ext = path.extname(filePath);
  const baseWithoutExt = filePath.slice(0, -ext.length);
  const result: {
    companionHash?: string;
    companionInfo?: any;
    companionInfoPath?: string;
    localImagePath?: string;
    localImageUrl?: string;
  } = {};

  // 1. Companion Image Candidates
  const imageExtensions = [
    '.jpeg',
    '.jpg',
    '.png',
    '.webp',
    '.preview.png',
    '.preview.jpg',
    '.preview.jpeg',
    '.preview.webp',
  ];
  for (const imgExt of imageExtensions) {
    const candidate = `${baseWithoutExt}${imgExt}`;
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile() && stat.size > 0) {
          result.localImagePath = candidate;
          result.localImageUrl = `/api/local-image?path=${encodeURIComponent(candidate)}`;
          break;
        }
      } catch {}
    }
  }

  // 2. Companion Hash (.sha256)
  const shaCandidate = `${baseWithoutExt}.sha256`;
  if (fs.existsSync(shaCandidate)) {
    try {
      const content = fs.readFileSync(shaCandidate, 'utf8').trim();
      const match = content.match(/^[a-fA-F0-9]{64}$/);
      if (match) {
        result.companionHash = match[0].toUpperCase();
      }
    } catch {}
  }

  // 3. Companion Metadata Info (.civitai.info, .info, .huggingface.info)
  const infoCandidates = [
    `${baseWithoutExt}.civitai.info`,
    `${baseWithoutExt}.info`,
    `${baseWithoutExt}.huggingface.info`,
  ];
  for (const infoCandidate of infoCandidates) {
    if (fs.existsSync(infoCandidate)) {
      try {
        const raw = fs.readFileSync(infoCandidate, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          result.companionInfo = parsed;
          result.companionInfoPath = infoCandidate;
          break;
        }
      } catch {}
    }
  }

  return result;
}

export class LibraryScanner {
  private watcher: FSWatcher | null = null;
  private isScanning = false;
  private cancelRequested = false;
  private currentProgress: ScanProgress = {
    scannedFiles: 0,
    totalFiles: 0,
    status: 'idle',
  };

  cancelScan() {
    if (this.isScanning) {
      logger.info('Scan cancellation requested by user.');
      this.cancelRequested = true;
    }
  }

  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }

  getScanStatus(): ScanProgress {
    return { ...this.currentProgress };
  }

  async scanDirectory(
    rootPath: string | string[],
    onProgress?: (progress: ScanProgress) => void
  ): Promise<LocalModel[]> {
    if (this.isScanning) {
      logger.warn('Scan already running. Returning current status.');
      return [];
    }
    const rootPaths = Array.isArray(rootPath) ? rootPath.filter(Boolean) : [rootPath].filter(Boolean);
    if (rootPaths.length === 0) {
      throw new Error('No folder paths provided for scanning. Please add model folders in Settings.');
    }

    const existingPaths = rootPaths.filter((p) => fs.existsSync(p));
    const missingPaths = rootPaths.filter((p) => !fs.existsSync(p));

    if (missingPaths.length > 0) {
      logger.warn(`The following configured model folders do not exist on disk: ${missingPaths.join(', ')}`);
    }

    if (existingPaths.length === 0) {
      throw new Error(
        `None of your configured model folders exist on disk (${missingPaths.join(', ')}). Please verify your folder paths in Settings.`
      );
    }

    this.isScanning = true;
    this.cancelRequested = false;
    logger.info(`Starting folder scan on directories: ${existingPaths.join(', ')}`);

    const emitProgress = (p: ScanProgress) => {
      this.currentProgress = { ...p };
      if (onProgress) {
        onProgress(this.currentProgress);
      }
    };

    emitProgress({
      scannedFiles: 0,
      totalFiles: 0,
      status: 'scanning',
      currentFile: 'Discovering model files...',
    });

    try {
      // 1. Collect all model files recursively across all existing root paths (avoiding symlink/junction duplicates)
      const allFiles: string[] = [];
      const seenRealPaths = new Set<string>();
      for (const p of existingPaths) {
        if (this.cancelRequested) break;
        allFiles.push(...this.collectModelFiles(p, seenRealPaths));
      }

      if (this.cancelRequested) {
        emitProgress({ scannedFiles: 0, totalFiles: 0, status: 'idle', currentFile: 'Scan cancelled.' });
        return [];
      }

      emitProgress({
        scannedFiles: 0,
        totalFiles: allFiles.length,
        status: 'hashing',
        currentFile: allFiles.length > 0 ? path.basename(allFiles[0]) : '',
      });

      const scannedModels: LocalModel[] = [];
      const hashesToLookup: { hash: string; localId: string }[] = [];

      // 2. Process each file with Fast-Path Cache Check
      for (let i = 0; i < allFiles.length; i++) {
        if (this.cancelRequested) {
          logger.info('Scan stopped during hashing phase.');
          emitProgress({
            scannedFiles: i,
            totalFiles: allFiles.length,
            status: 'idle',
            currentFile: 'Scan cancelled by user.',
          });
          return scannedModels;
        }

        const filePath = allFiles[i];
        emitProgress({
          scannedFiles: i + 1,
          totalFiles: allFiles.length,
          status: 'hashing',
          currentFile: path.basename(filePath),
        });

        // Yield to Node event loop so Electron IPC progress messages stream live to UI
        await new Promise((r) => setTimeout(r, 1));

        let stats: fs.Stats;
        try {
          stats = fs.statSync(filePath);
        } catch (e) {
          continue;
        }

        const modifiedAt = Math.floor(stats.mtimeMs);
        const fileSize = stats.size;

        // Check SQLite cache by filePath, fileSize, and modifiedAt (case-insensitive for Windows)
        const cached: any = await dbManager.get(
          'SELECT * FROM local_models WHERE file_path = ? COLLATE NOCASE',
          [filePath]
        );

        let sha256 = cached?.sha256;

        // Discover any companion files (.sha256, .civitai.info, preview image)
        const companion = discoverCompanionFiles(filePath);

        // Fast-path: if file size and modified timestamp match, skip SHA256 computation!
        if (!cached || cached.file_size !== fileSize || cached.modified_at !== modifiedAt || !sha256) {
          if (companion.companionHash) {
            sha256 = companion.companionHash;
          } else {
            try {
              let lastByteReport = Date.now();
              sha256 = await computeFileSHA256(filePath, (bytesRead, totalBytes) => {
                const now = Date.now();
                if (now - lastByteReport > 200) {
                  lastByteReport = now;
                  const fileMb = (bytesRead / (1024 * 1024)).toFixed(0);
                  const totalMb = (totalBytes / (1024 * 1024)).toFixed(0);
                  emitProgress({
                    scannedFiles: i + 1,
                    totalFiles: allFiles.length,
                    status: 'hashing',
                    currentFile: `${path.basename(filePath)} (${fileMb}MB / ${totalMb}MB)`,
                  });
                }
              });
            } catch (hashErr) {
              logger.error(`Error hashing file ${filePath}:`, hashErr);
              continue;
            }
          }
        }

        const localId = cached?.id || `loc_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const resolvedFileName = resolveModelFileName(filePath);
        const isLlmPath = filePath.toLowerCase().includes('/llm/') || filePath.toLowerCase().includes('\\llm\\') || filePath.includes('models--');

        let civitaiModelId = cached?.civitai_model_id;
        let civitaiVersionId = cached?.civitai_version_id;
        let civitaiName = cached?.civitai_name || undefined;
        let civitaiBaseModel = cached?.civitai_base_model || undefined;
        let previewUrl = companion.localImageUrl || cached?.preview_url || undefined;
        let modelType = cached?.model_type || (isLlmPath ? ('LLM' as any) : undefined);
        let nsfw = !!cached?.nsfw;

        // Offline metadata extraction from companion .info file if not already matched
        if (!civitaiVersionId && companion.companionInfo) {
          const info = companion.companionInfo;
          if (info.id || info.modelId || info.name) {
            civitaiVersionId = info.id || civitaiVersionId;
            civitaiModelId = info.modelId || info.model?.id || civitaiModelId;
            civitaiName = info.model?.name || info.name || civitaiName;
            civitaiBaseModel = info.baseModel || civitaiBaseModel;
            modelType = info.model?.type || info.type || modelType;
            if (!previewUrl) {
              previewUrl = this.extractPreviewImage(info) || previewUrl;
            }
            const isNsfw = Boolean(
              info.model?.nsfw ||
              (info.images && info.images.some((img: any) => img && (img.nsfw || (img.nsfwLevel && img.nsfwLevel > 1)))) ||
              (info.nsfwLevel && info.nsfwLevel > 1)
            );
            nsfw = isNsfw;
          }
        }

        const localModel: LocalModel = {
          id: localId,
          filePath,
          fileName: resolvedFileName,
          fileSize,
          modifiedAt,
          sha256,
          civitaiModelId,
          civitaiVersionId,
          civitaiName,
          civitaiBaseModel,
          isMatched: !!civitaiVersionId,
          previewUrl,
          localPreviewPath: companion.localImagePath,
          companionInfoPath: companion.companionInfoPath,
          modelType,
          nsfw,
        };

        scannedModels.push(localModel);

        // Save/Update in SQLite. Uses UPSERT so update-check state (has_update,
        // update_*, update_checked_at, ignored_version_id) survives rescans unchanged.
        await dbManager.run(
          `INSERT INTO local_models 
            (id, file_path, file_name, file_size, modified_at, sha256, civitai_model_id, civitai_version_id, civitai_name, scanned_at, preview_url, model_type, nsfw)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?)
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
             nsfw = excluded.nsfw`,
          [
            localModel.id,
            localModel.filePath,
            localModel.fileName,
            localModel.fileSize,
            localModel.modifiedAt,
            localModel.sha256,
            localModel.civitaiModelId || null,
            localModel.civitaiVersionId || null,
            localModel.civitaiName || null,
            localModel.previewUrl || null,
            localModel.modelType || null,
            localModel.nsfw ? 1 : 0,
          ]
        );

        if (!localModel.isMatched && sha256) {
          hashesToLookup.push({ hash: sha256, localId });
        }
      }

      // 3. Perform Bulk CivitAI Hash Lookup for unmatched models
      if (hashesToLookup.length > 0 && !this.cancelRequested) {
        emitProgress({
          scannedFiles: allFiles.length,
          totalFiles: allFiles.length,
          status: 'lookup',
          currentFile: `Querying CivitAI for ${hashesToLookup.length} model(s)...`,
        });

        const uniqueHashes = Array.from(new Set(hashesToLookup.map((h) => h.hash)));
        const versionMap = await civitaiClient.bulkLookupByHashes(uniqueHashes, (done, total) => {
          emitProgress({
            scannedFiles: done,
            totalFiles: total,
            status: 'lookup',
            currentFile: `Checked ${done}/${total} hashes against CivitAI...`,
          });
        });

        // Update local models with matched CivitAI info
        for (const item of scannedModels) {
          if (!item.isMatched && item.sha256) {
            const matchedVersion = versionMap.get(item.sha256.toUpperCase());
            if (matchedVersion) {
              item.isMatched = true;
              item.civitaiVersionId = matchedVersion.id;
              item.civitaiModelId = matchedVersion.modelId;
              item.civitaiName = matchedVersion.model?.name || matchedVersion.name;
              item.civitaiBaseModel = matchedVersion.baseModel;
              const preview = this.extractPreviewImage(matchedVersion);
              item.previewUrl = preview || undefined;
              const modelType = matchedVersion.model?.type || matchedVersion.type;
              item.modelType = modelType;
              const isNsfw = Boolean(
                matchedVersion.model?.nsfw ||
                (matchedVersion.images && matchedVersion.images.some((img: any) => img && (img.nsfw || (img.nsfwLevel && img.nsfwLevel > 1))))
              );
              item.nsfw = isNsfw;

              await dbManager.run(
                'UPDATE local_models SET civitai_model_id = ?, civitai_version_id = ?, civitai_name = ?, preview_url = ?, model_type = COALESCE(?, model_type), nsfw = ? WHERE id = ?',
                [matchedVersion.modelId, matchedVersion.id, item.civitaiName || null, preview, modelType || null, isNsfw ? 1 : 0, item.id]
              );
              if (preview) {
                imageCacheService.prefetchToPermanentCache(preview);
              }
            }
          }
        }
      }

      // 4. Purge stale / phantom records that were inside the scanned directories but deleted from disk
      const scannedRealPaths = new Set(scannedModels.map((m) => m.filePath.toLowerCase()));
      const allDbRows: any[] = await dbManager.all('SELECT id, file_path FROM local_models');
      for (const row of allDbRows) {
        if (!row.file_path) continue;
        const normalizedRowPath = path.resolve(row.file_path).toLowerCase();
        const isInsideScannedRoot = existingPaths.some((r) => normalizedRowPath.startsWith(path.resolve(r).toLowerCase()));
        if (isInsideScannedRoot) {
          if (!scannedRealPaths.has(row.file_path.toLowerCase()) || !fs.existsSync(row.file_path)) {
            await dbManager.run('DELETE FROM local_models WHERE id = ?', [row.id]);
          }
        }
      }

      // 5. Optional: Auto-convert PyTorch pickle models to SafeTensors if opt-in setting is enabled
      try {
        const autoConvertRow: any = await dbManager.get('SELECT value FROM app_config WHERE key = ?', ['auto_convert_pickle_to_safetensors']);
        const shouldAutoConvert = autoConvertRow && JSON.parse(autoConvertRow.value) === true;
        if (shouldAutoConvert && !this.cancelRequested) {
          const deleteOrigRow: any = await dbManager.get('SELECT value FROM app_config WHERE key = ?', ['delete_original_after_conversion']);
          const shouldDeleteOrig = deleteOrigRow ? JSON.parse(deleteOrigRow.value) === true : false;
          const pyPathRow: any = await dbManager.get('SELECT value FROM app_config WHERE key = ?', ['custom_python_path']);
          const customPy = pyPathRow ? JSON.parse(pyPathRow.value) : undefined;
          const comfyInstallRow: any = await dbManager.get('SELECT value FROM app_config WHERE key = ?', ['comfyui_install_dir']);
          const comfyInstall = comfyInstallRow ? JSON.parse(comfyInstallRow.value) : undefined;

          const pickleModels = scannedModels.filter((m) => {
            const ext = path.extname(m.filePath).toLowerCase();
            return ext === '.ckpt' || ext === '.pt' || ext === '.bin';
          });

          if (pickleModels.length > 0) {
            emitProgress({
              scannedFiles: allFiles.length,
              totalFiles: allFiles.length,
              status: 'hashing',
              currentFile: `Auto-converting ${pickleModels.length} pickle model(s) to SafeTensors...`,
            });

            const { modelConverter } = await import('./modelConverter');
            for (const pModel of pickleModels) {
              if (this.cancelRequested) break;
              try {
                await modelConverter.convertPickleToSafetensors(pModel.filePath, {
                  deleteOriginal: shouldDeleteOrig,
                  customPythonPath: customPy,
                  comfyuiInstallDir: comfyInstall,
                });
              } catch (convErr) {
                logger.warn(`Auto-conversion skipped for ${pModel.filePath}:`, convErr);
              }
            }
          }
        }
      } catch (optErr) {
        logger.warn('Error during auto-conversion pass:', optErr);
      }

      // 6. Mark duplicates (only when same hash exists across distinct physical file paths)
      await this.flagDuplicates();

      emitProgress({
        scannedFiles: allFiles.length,
        totalFiles: allFiles.length,
        status: 'completed',
        currentFile: 'Scan completed successfully.',
      });
      logger.info(`Scan complete! Scanned ${scannedModels.length} models.`);
      return scannedModels;
    } catch (err: any) {
      emitProgress({
        scannedFiles: this.currentProgress.scannedFiles,
        totalFiles: this.currentProgress.totalFiles,
        status: 'failed',
        error: err.message,
      });
      logger.error('Library scan failed:', err);
      throw err;
    } finally {
      this.isScanning = false;
      this.cancelRequested = false;
    }
  }

  private collectModelFiles(dirPath: string, seenRealPaths: Set<string> = new Set()): string[] {
    const results: string[] = [];
    try {
      if (!fs.existsSync(dirPath)) return results;

      // Canonical realpath check to avoid traversing symlink/junction aliases multiple times
      let realDir: string;
      try {
        realDir = fs.realpathSync.native(dirPath);
      } catch (e) {
        realDir = path.resolve(dirPath);
      }

      const realDirKey = realDir.toLowerCase();
      if (seenRealPaths.has(realDirKey)) {
        return results;
      }
      seenRealPaths.add(realDirKey);

      const entries = fs.readdirSync(dirPath);

      for (const entryName of entries) {
        try {
          const fullPath = path.join(dirPath, entryName);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            results.push(...this.collectModelFiles(fullPath, seenRealPaths));
          } else if (stat.isFile()) {
            const ext = path.extname(entryName).toLowerCase();
            if (MODEL_EXTENSIONS.has(ext)) {
              let realFile: string;
              try {
                realFile = fs.realpathSync.native(fullPath);
              } catch (e) {
                realFile = path.resolve(fullPath);
              }
              const realFileKey = realFile.toLowerCase();
              if (!seenRealPaths.has(realFileKey)) {
                seenRealPaths.add(realFileKey);
                results.push(realFile);
              }
            }
          }
        } catch (itemErr) {
          // Skip inaccessible or locked files
        }
      }
    } catch (dirErr) {
      logger.warn(`Could not read directory ${dirPath}:`, dirErr);
    }

    return results;
  }

  async flagDuplicates() {
    await dbManager.run('UPDATE local_models SET is_duplicate = 0;');
    await dbManager.run(`
      CREATE TABLE IF NOT EXISTS ignored_duplicates (
        sha256 TEXT PRIMARY KEY,
        known_count INTEGER DEFAULT 2,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Flag as duplicate if distinct physical count > 1 AND (hash is NOT in ignored_duplicates OR count > known_count)
    await dbManager.run(`
      UPDATE local_models 
      SET is_duplicate = 1 
      WHERE sha256 IN (
        SELECT lm.sha256 
        FROM local_models lm
        LEFT JOIN ignored_duplicates ign ON UPPER(lm.sha256) = UPPER(ign.sha256)
        WHERE lm.sha256 IS NOT NULL AND TRIM(lm.sha256) != ''
        GROUP BY lm.sha256 
        HAVING COUNT(DISTINCT lm.file_path COLLATE NOCASE) > 1
           AND (ign.sha256 IS NULL OR COUNT(DISTINCT lm.file_path COLLATE NOCASE) > ign.known_count)
      );
    `);
  }

  async ignoreDuplicateSet(sha256: string, knownCount: number = 2): Promise<boolean> {
    if (!sha256) return false;
    await dbManager.run(`
      CREATE TABLE IF NOT EXISTS ignored_duplicates (
        sha256 TEXT PRIMARY KEY,
        known_count INTEGER DEFAULT 2,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await dbManager.run(
      `INSERT OR REPLACE INTO ignored_duplicates (sha256, known_count, created_at) VALUES (?, ?, CURRENT_TIMESTAMP);`,
      [sha256.toUpperCase(), knownCount]
    );
    await this.flagDuplicates();
    logger.info(`Ignored duplicate set for SHA256: ${sha256} (known count: ${knownCount})`);
    return true;
  }

  async unignoreDuplicateSet(sha256: string): Promise<boolean> {
    if (!sha256) return false;
    await dbManager.run(`DELETE FROM ignored_duplicates WHERE sha256 = ? COLLATE NOCASE;`, [sha256.toUpperCase()]);
    await this.flagDuplicates();
    logger.info(`Unignored duplicate set for SHA256: ${sha256}`);
    return true;
  }

  extractPreviewImage(version: any): string | null {
    if (!version || !version.images || !Array.isArray(version.images) || version.images.length === 0) {
      return null;
    }
    // Look for static image first (exclude .mp4 videos)
    const staticImg = version.images.find(
      (img: any) => img && img.url && (img.type === 'image' || !img.url.toLowerCase().endsWith('.mp4'))
    );
    return staticImg?.url || version.images[0]?.url || null;
  }

  async matchUnidentifiedModels(
    onProgress?: (done: number, total: number) => void
  ): Promise<{ totalChecked: number; newlyMatched: number }> {
    const rows: any[] = await dbManager.all(
      'SELECT id, sha256, file_name, file_path FROM local_models WHERE civitai_version_id IS NULL AND sha256 IS NOT NULL;'
    );

    if (rows.length === 0) {
      return { totalChecked: 0, newlyMatched: 0 };
    }

    logger.info(`Starting CivitAI hash matching for ${rows.length} unidentified model(s)...`);
    const uniqueHashes = Array.from(new Set(rows.map((r) => r.sha256.toUpperCase())));
    const versionMap = await civitaiClient.bulkLookupByHashes(uniqueHashes, onProgress);

    let newlyMatched = 0;
    for (const r of rows) {
      const hashKey = r.sha256.toUpperCase();
      const matchedVersion = versionMap.get(hashKey);
      if (matchedVersion) {
        const preview = this.extractPreviewImage(matchedVersion);
        const modelType = matchedVersion.model?.type || matchedVersion.type;
        const civitaiName = matchedVersion.model?.name || matchedVersion.name || null;
        const isNsfw = Boolean(
          matchedVersion.model?.nsfw ||
          (matchedVersion.images && matchedVersion.images.some((img: any) => img && (img.nsfw || (img.nsfwLevel && img.nsfwLevel > 1))))
        );
        await dbManager.run(
          'UPDATE local_models SET civitai_model_id = ?, civitai_version_id = ?, civitai_name = ?, preview_url = ?, model_type = COALESCE(?, model_type), nsfw = ? WHERE id = ?',
          [matchedVersion.modelId, matchedVersion.id, civitaiName, preview, modelType || null, isNsfw ? 1 : 0, r.id]
        );
        if (preview) {
          imageCacheService.prefetchToPermanentCache(preview);
        }
        newlyMatched++;
      }
    }

    await this.flagDuplicates();
    logger.info(`Matched ${newlyMatched}/${rows.length} previously unidentified models with CivitAI.`);
    return { totalChecked: rows.length, newlyMatched };
  }

  async getIgnoredDuplicates(): Promise<{ sha256: string; knownCount: number }[]> {
    try {
      const rows: any[] = await dbManager.all(`SELECT sha256, known_count FROM ignored_duplicates;`);
      return rows.map((r) => ({ sha256: r.sha256, knownCount: r.known_count }));
    } catch (e) {
      return [];
    }
  }

  startLiveWatcher(rootPath: string, onChange?: (event: string, filePath: string) => void) {
    this.stopLiveWatcher();
    if (!rootPath || !fs.existsSync(rootPath)) return;

    logger.info(`Starting chokidar live filesystem watcher on: ${rootPath}`);
    this.watcher = chokidar.watch(rootPath, {
      ignored: /(^|[\/\\])\..|.*\.part$/,
      persistent: true,
      ignoreInitial: true,
      depth: 6,
    });

    this.watcher.on('add', (filePath) => {
      if (MODEL_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
        logger.info(`File added: ${filePath}`);
        if (onChange) onChange('add', filePath);
      }
    });

    this.watcher.on('unlink', async (filePath) => {
      logger.info(`File deleted: ${filePath}`);
      await dbManager.run('DELETE FROM local_models WHERE file_path = ?', [filePath]);
      if (onChange) onChange('unlink', filePath);
    });
  }

  stopLiveWatcher() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

export const libraryScanner = new LibraryScanner();
