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
import fs from 'fs';
import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { LocalModel, SaveModelMetadataParams, ScanProgress } from '../types/app';
import { civitaiClient } from './civitaiClient';
import { huggingfaceClient } from './huggingfaceClient';
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

export function parseShardDetails(fileName: string): {
  isShard: boolean;
  prefix?: string;
  partIndex?: number;
  totalParts?: number;
} {
  const baseName = path.basename(fileName);

  // 1. model-00001-of-00005.safetensors or diffusion_pytorch_model-00001-of-00002.safetensors
  const matchOf = baseName.match(/^(.*?)[-_.]?0*(\d+)[-_]of[-_]0*(\d+)\.[a-zA-Z0-9]+$/i);
  if (matchOf) {
    return {
      isShard: true,
      prefix: matchOf[1] ? matchOf[1].replace(/[-_.]$/, '') : 'model',
      partIndex: parseInt(matchOf[2], 10),
      totalParts: parseInt(matchOf[3], 10),
    };
  }

  // 2. model-00001.safetensors or pytorch_model-00001.bin or consolidated.00.pth
  const matchNumbered = baseName.match(/^(model|diffusion_pytorch_model|pytorch_model|consolidated|text_encoder|unet|vae)[-_.]0*(\d+)\.[a-zA-Z0-9]+$/i);
  if (matchNumbered) {
    return {
      isShard: true,
      prefix: matchNumbered[1],
      partIndex: parseInt(matchNumbered[2], 10),
    };
  }

  // 3. name.part1.safetensors / name.chunk1.safetensors
  const matchChunk = baseName.match(/^(.*?)[-_.]?(?:shard|part|chunk)[-_.]?0*(\d+)(?:[-_]of[-_]0*(\d+))?\.[a-zA-Z0-9]+$/i);
  if (matchChunk) {
    return {
      isShard: true,
      prefix: matchChunk[1] ? matchChunk[1].replace(/[-_.]$/, '') : 'model',
      partIndex: parseInt(matchChunk[2], 10),
      totalParts: matchChunk[3] ? parseInt(matchChunk[3], 10) : undefined,
    };
  }

  return { isShard: false };
}

export function inferMetadataFromPath(filePath: string): {
  modelType?: any;
  civitaiCreator?: string;
  hfRepoId?: string;
  source?: 'civitai' | 'huggingface' | 'custom';
  quantization?: string;
  civitaiBaseModel?: string;
} {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const baseName = parts[parts.length - 1] || '';
  const parentFolder = parts.length > 1 ? parts[parts.length - 2] : '';
  const grandParentFolder = parts.length > 2 ? parts[parts.length - 3] : '';

  let modelType: any = undefined;
  let civitaiCreator: string | undefined = undefined;
  let hfRepoId: string | undefined = undefined;
  let source: 'civitai' | 'huggingface' | 'custom' | undefined = undefined;
  let quantization: string | undefined = undefined;
  let civitaiBaseModel: string | undefined = undefined;

  // 1. Quantization extraction from filename (e.g. Q4_K_M, Q8_0, FP8, INT4, INT8, BF16, FP16)
  const quantMatch = baseName.match(/[-_.]?(Q\d+_[A-Z0-9_]+|FP8|FP16|BF16|INT4|INT8|Q\d+_\d+)(?:\.|$)/i);
  if (quantMatch) {
    quantization = quantMatch[1].toUpperCase();
  }

  // 2. Model Type inference from path or extension
  const lowerPath = normalized.toLowerCase();
  if (lowerPath.includes('/loras/') || lowerPath.includes('/lora/')) {
    modelType = 'LORA';
  } else if (lowerPath.includes('/diffusion_models/') || lowerPath.includes('/unet/')) {
    modelType = 'UNET';
  } else if (lowerPath.includes('/llm/') || lowerPath.includes('/gguf/') || baseName.toLowerCase().endsWith('.gguf')) {
    modelType = 'LLM';
  } else if (lowerPath.includes('/geometry_estimation/') || lowerPath.includes('/depth/') || lowerPath.includes('/controlnet/')) {
    modelType = 'ControlNet';
  } else if (lowerPath.includes('/vae/') || lowerPath.includes('/vae_approx/')) {
    modelType = 'VAE';
  } else if (lowerPath.includes('/upscale_models/') || lowerPath.includes('/esrgan/')) {
    modelType = 'Upscaler';
  } else if (lowerPath.includes('/clip_vision/') || lowerPath.includes('/clip/')) {
    modelType = 'CLIP';
  } else if (lowerPath.includes('/text_encoders/')) {
    modelType = 'TextEncoder';
  } else if (lowerPath.includes('/checkpoints/') || lowerPath.includes('/models/checkpoints/')) {
    modelType = 'Checkpoint';
  }

  // 3. Hugging Face author / repo inference
  const genericFolders = ['models', 'data', 'llm', 'gguf', 'loras', 'diffusion_models', 'checkpoints', 'unet', 'geometry_estimation', 'vae', 'clip', 'upscale_models'];
  if (lowerPath.includes('/models--')) {
    const hfHubFolder = parts.find((p) => p.startsWith('models--'));
    if (hfHubFolder) {
      const cleanParts = hfHubFolder.replace('models--', '').split('--');
      if (cleanParts.length >= 2) {
        civitaiCreator = cleanParts[0];
        hfRepoId = `${cleanParts[0]}/${cleanParts.slice(1).join('--')}`;
        source = 'huggingface';
      }
    }
  } else if (
    grandParentFolder &&
    !genericFolders.includes(grandParentFolder.toLowerCase()) &&
    parentFolder &&
    !genericFolders.includes(parentFolder.toLowerCase())
  ) {
    // E.g. .../GGUF/bartowski/google_gemma-4-E2B-it-GGUF/file.gguf
    civitaiCreator = grandParentFolder;
    hfRepoId = `${grandParentFolder}/${parentFolder}`;
    source = 'huggingface';
  } else if (parentFolder && !genericFolders.includes(parentFolder.toLowerCase())) {
    // E.g. .../GGUF/HauhauCS/file.gguf
    if (lowerPath.includes('/gguf/') || lowerPath.includes('/llm/')) {
      civitaiCreator = parentFolder;
      source = 'huggingface';
    }
  }

  // 4. Base model extraction (e.g. SDXL, SD 1.5, Flux, Qwen, Gemma, LLaMA, LTX-Video)
  const baseNameLower = baseName.toLowerCase();
  if (baseNameLower.includes('sdxl')) civitaiBaseModel = 'SDXL 1.0';
  else if (baseNameLower.includes('flux')) civitaiBaseModel = 'Flux.1 D';
  else if (baseNameLower.includes('qwen')) civitaiBaseModel = 'Qwen';
  else if (baseNameLower.includes('gemma')) civitaiBaseModel = 'Gemma';
  else if (baseNameLower.includes('llama')) civitaiBaseModel = 'LLaMA';
  else if (baseNameLower.includes('ltx')) civitaiBaseModel = 'LTX-Video';
  else if (baseNameLower.includes('sd15') || baseNameLower.includes('v1-5') || baseNameLower.includes('sd1.5')) civitaiBaseModel = 'SD 1.5';

  return { modelType, civitaiCreator, hfRepoId, source, quantization, civitaiBaseModel };
}

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

  // Check if filename is a multi-part shard (e.g. model-00004-of-00007.safetensors)
  const shardInfo = parseShardDetails(baseName);
  if (shardInfo.isShard) {
    const parts = normalized.split('/');
    if (parts.length > 1) {
      const parentDir = parts[parts.length - 2];
      const genericFolders = [
        'models',
        'data',
        'llm',
        'gguf',
        'loras',
        'diffusion_models',
        'checkpoints',
        'unet',
        'geometry_estimation',
        'vae',
        'clip',
        'upscale_models',
      ];
      if (parentDir && !genericFolders.includes(parentDir.toLowerCase())) {
        return parentDir;
      }
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
      } catch { }
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
    } catch { }
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
      } catch { }
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

      // Pre-group Multi-Part Shards across collected files
      const multiPartGroups = new Map<string, {
        primaryPath: string;
        secondaryPaths: string[];
        folderName: string;
        totalSize: number;
        maxModified: number;
        totalParts: number;
        availableParts: number;
        shards: any[];
      }>();

      const secondaryShardPaths = new Set<string>();

      // Group by directory
      const dirMap = new Map<string, string[]>();
      for (const fp of allFiles) {
        const dir = path.dirname(fp);
        if (!dirMap.has(dir)) dirMap.set(dir, []);
        dirMap.get(dir)!.push(fp);
      }

      for (const [dir, filesInDir] of dirMap.entries()) {
        const shardEntries: Array<{
          filePath: string;
          fileName: string;
          size: number;
          mtime: number;
          shard: ReturnType<typeof parseShardDetails>;
        }> = [];
        for (const f of filesInDir) {
          const s = parseShardDetails(f);
          if (s.isShard) {
            try {
              const stat = fs.statSync(f);
              shardEntries.push({
                filePath: f,
                fileName: path.basename(f),
                size: stat.size,
                mtime: Math.floor(stat.mtimeMs),
                shard: s,
              });
            } catch { }
          }
        }

        const prefixGroups = new Map<string, typeof shardEntries>();
        for (const entry of shardEntries) {
          const p = entry.shard.prefix || 'model';
          if (!prefixGroups.has(p)) prefixGroups.set(p, []);
          prefixGroups.get(p)!.push(entry);
        }

        for (const [, entries] of prefixGroups.entries()) {
          if (entries.length > 1 || (entries.length === 1 && entries[0].shard.totalParts && entries[0].shard.totalParts > 1)) {
            entries.sort((a, b) => (a.shard.partIndex || 0) - (b.shard.partIndex || 0));
            const primary = entries[0];
            const secondaries = entries.slice(1);
            for (const s of secondaries) {
              secondaryShardPaths.add(s.filePath);
            }

            const expectedTotal = entries.find((e) => e.shard.totalParts)?.shard.totalParts || entries.length;
            const folderName = path.basename(dir);
            const totalSize = entries.reduce((acc, e) => acc + e.size, 0);
            const maxModified = Math.max(...entries.map((e) => e.mtime));

            const shards = entries.map((e) => ({
              fileName: e.fileName,
              filePath: e.filePath,
              fileSize: e.size,
              partIndex: e.shard.partIndex || 1,
              totalParts: expectedTotal,
            }));

            multiPartGroups.set(primary.filePath, {
              primaryPath: primary.filePath,
              secondaryPaths: secondaries.map((s) => s.filePath),
              folderName,
              totalSize,
              maxModified,
              totalParts: expectedTotal,
              availableParts: entries.length,
              shards,
            });
          }
        }
      }

      const filesToProcess = allFiles.filter((f) => !secondaryShardPaths.has(f));

      emitProgress({
        scannedFiles: 0,
        totalFiles: filesToProcess.length,
        status: 'hashing',
        currentFile: filesToProcess.length > 0 ? path.basename(filesToProcess[0]) : '',
      });

      const scannedModels: LocalModel[] = [];
      const hashesToLookup: { hash: string; localId: string }[] = [];

      // 2. Process each file with Fast-Path Cache Check
      for (let i = 0; i < filesToProcess.length; i++) {
        if (this.cancelRequested) {
          logger.info('Scan stopped during hashing phase.');
          emitProgress({
            scannedFiles: i,
            totalFiles: filesToProcess.length,
            status: 'idle',
            currentFile: 'Scan cancelled by user.',
          });
          return scannedModels;
        }

        const filePath = filesToProcess[i];
        emitProgress({
          scannedFiles: i + 1,
          totalFiles: filesToProcess.length,
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

        const mp = multiPartGroups.get(filePath);
        const modifiedAt = mp ? mp.maxModified : Math.floor(stats.mtimeMs);
        const fileSize = mp ? mp.totalSize : stats.size;

        // Clean up individual secondary shard rows in DB if this is a multi-part primary
        if (mp && mp.secondaryPaths.length > 0) {
          for (const secPath of mp.secondaryPaths) {
            await dbManager.run('DELETE FROM local_models WHERE file_path = ? COLLATE NOCASE;', [secPath]).catch(() => { });
          }
        }

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
                    totalFiles: filesToProcess.length,
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
        const resolvedFileName = mp ? mp.folderName : resolveModelFileName(filePath);
        const inferred = inferMetadataFromPath(filePath);

        let civitaiModelId = cached?.civitai_model_id;
        let civitaiVersionId = cached?.civitai_version_id;
        let civitaiName = cached?.civitai_name || (mp ? mp.folderName : undefined);
        let civitaiBaseModel = cached?.civitai_base_model || inferred.civitaiBaseModel || undefined;
        let previewUrl = companion.localImageUrl || cached?.preview_url || undefined;
        let modelType = cached?.model_type || inferred.modelType || (mp ? ('LLM' as any) : undefined);
        let nsfw = !!cached?.nsfw;
        let customLink = cached?.custom_link || undefined;
        let source = cached?.source || inferred.source || (inferred.hfRepoId ? 'huggingface' : 'civitai');
        let hfRepoId = cached?.hf_repo_id || inferred.hfRepoId || undefined;
        let quantization = cached?.quantization || inferred.quantization || undefined;
        let trainedWords: string[] | undefined = undefined;
        let description: string[] | string | undefined = undefined;
        let tags: string[] | undefined = undefined;
        let civitaiCreator: string | undefined = cached?.civitai_creator || inferred.civitaiCreator || undefined;

        // Metadata extraction from companion .info file
        if (companion.companionInfo) {
          const info = companion.companionInfo;
          trainedWords = Array.isArray(info.trainedWords) && info.trainedWords.length > 0
            ? info.trainedWords
            : (Array.isArray(info.model?.trainedWords) && info.model.trainedWords.length > 0 ? info.model.trainedWords : undefined);
          description = info.description || info.model?.description || undefined;
          tags = Array.isArray(info.tags) ? info.tags : (Array.isArray(info.model?.tags) ? info.model.tags : undefined);
          civitaiCreator = info.model?.creator?.username || info.creator?.username || civitaiCreator;
          customLink = info.customLink || customLink;
          if (info.source) source = info.source;
          if (info.hfRepoId) hfRepoId = info.hfRepoId;

          if (!civitaiVersionId) {
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
          civitaiCreator,
          customLink,
          source,
          hfRepoId,
          quantization,
          isMatched: !!civitaiVersionId || !!hfRepoId || !!customLink,
          previewUrl,
          localPreviewPath: companion.localImagePath,
          companionInfoPath: companion.companionInfoPath,
          modelType,
          nsfw,
          trainedWords,
          description: typeof description === 'string' ? description : undefined,
          tags,
          isMultiPart: mp ? true : !!cached?.is_multi_part,
          totalParts: mp ? mp.totalParts : (cached?.total_parts || undefined),
          availableParts: mp ? mp.availableParts : (cached?.available_parts || undefined),
          shards: mp ? mp.shards : (cached?.shards_json ? JSON.parse(cached.shards_json) : undefined),
        };

        scannedModels.push(localModel);

        // Save/Update in SQLite. Uses UPSERT so update-check state survives rescans unchanged.
        await dbManager.run(
          `INSERT INTO local_models 
            (id, file_path, file_name, file_size, modified_at, sha256, civitai_model_id, civitai_version_id, civitai_name, scanned_at, preview_url, model_type, nsfw, custom_link, source, hf_repo_id, quantization, is_multi_part, total_parts, available_parts, shards_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
             nsfw = excluded.nsfw,
             custom_link = COALESCE(excluded.custom_link, local_models.custom_link),
             source = COALESCE(excluded.source, local_models.source),
             hf_repo_id = COALESCE(excluded.hf_repo_id, local_models.hf_repo_id),
             quantization = COALESCE(excluded.quantization, local_models.quantization),
             is_multi_part = excluded.is_multi_part,
             total_parts = excluded.total_parts,
             available_parts = excluded.available_parts,
             shards_json = excluded.shards_json`,
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
            localModel.customLink || null,
            localModel.source || 'civitai',
            localModel.hfRepoId || null,
            localModel.quantization || null,
            localModel.isMultiPart ? 1 : 0,
            localModel.totalParts || null,
            localModel.availableParts || null,
            localModel.shards ? JSON.stringify(localModel.shards) : null,
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
              item.civitaiCreator = matchedVersion.model?.creator?.username || item.civitaiCreator;
              item.trainedWords = Array.isArray(matchedVersion.trainedWords) && matchedVersion.trainedWords.length > 0
                ? matchedVersion.trainedWords
                : (Array.isArray(matchedVersion.model?.trainedWords) && matchedVersion.model.trainedWords.length > 0
                  ? matchedVersion.model.trainedWords
                  : item.trainedWords);
              item.description = matchedVersion.description || item.description;
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
                'UPDATE local_models SET civitai_model_id = ?, civitai_version_id = ?, civitai_name = ?, preview_url = ?, model_type = COALESCE(?, model_type), nsfw = ?, source = ? WHERE id = ?',
                [matchedVersion.modelId, matchedVersion.id, item.civitaiName || null, preview, modelType || null, isNsfw ? 1 : 0, 'civitai', item.id]
              );
              if (preview) {
                imageCacheService.prefetchToPermanentCache(preview);
              }
            }
          }
        }

        // Hugging Face Fallback Identification for remaining unmatched models
        for (const item of scannedModels) {
          if (!item.isMatched) {
            try {
              const hfResult = await huggingfaceClient.matchModel(item.filePath, item.fileName, item.sha256);
              if (hfResult && hfResult.matched && hfResult.repoId) {
                item.isMatched = true;
                item.source = 'huggingface';
                item.hfRepoId = hfResult.repoId;
                item.civitaiName = hfResult.modelName ? `${hfResult.repoId} (${hfResult.modelName})` : hfResult.repoId;
                if (hfResult.modelType) {
                  item.modelType = hfResult.modelType as any;
                }
                await dbManager.run(
                  'UPDATE local_models SET source = ?, hf_repo_id = ?, civitai_name = ?, model_type = COALESCE(?, model_type) WHERE id = ?',
                  ['huggingface', hfResult.repoId, item.civitaiName, hfResult.modelType || null, item.id]
                );
              }
            } catch (hfErr) {
              logger.warn(`Hugging Face lookup skipped for ${item.fileName}:`, hfErr);
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
                const convRes = await modelConverter.convertPickleToSafetensors(pModel.filePath, {
                  deleteOriginal: shouldDeleteOrig,
                  customPythonPath: customPy,
                  comfyuiInstallDir: comfyInstall,
                });
                if (convRes.isYolo) {
                  logger.info(`Auto-conversion preserved YOLO model as .pt: ${pModel.filePath}`);
                } else if (!convRes.success && convRes.scanResult && !convRes.scanResult.isSafe) {
                  logger.error(`Auto-conversion blocked malicious model: ${pModel.filePath} -> ${convRes.error}`);
                }
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
  ): Promise<{ totalChecked: number; newlyMatched: number; civitaiMatched: number; hfMatched: number }> {
    const rows: any[] = await dbManager.all(
      'SELECT id, sha256, file_name, file_path, source, hf_repo_id FROM local_models WHERE civitai_version_id IS NULL AND hf_repo_id IS NULL;'
    );

    if (rows.length === 0) {
      return { totalChecked: 0, newlyMatched: 0, civitaiMatched: 0, hfMatched: 0 };
    }

    logger.info(`Starting two-pronged identification (CivitAI primary + Hugging Face fallback) for ${rows.length} unidentified model(s)...`);

    // 1. First Prong: CivitAI Bulk Hash Matching
    const rowsWithHash = rows.filter((r) => r.sha256 && r.sha256.trim().length > 0);
    const uniqueHashes = Array.from(new Set(rowsWithHash.map((r) => r.sha256.toUpperCase())));
    const versionMap = await civitaiClient.bulkLookupByHashes(uniqueHashes, onProgress);

    let civitaiMatched = 0;
    const unmatchedRows: any[] = [];

    for (const r of rows) {
      const hashKey = r.sha256 ? r.sha256.toUpperCase() : '';
      const matchedVersion = hashKey ? versionMap.get(hashKey) : null;
      if (matchedVersion) {
        const preview = this.extractPreviewImage(matchedVersion);
        const modelType = matchedVersion.model?.type || matchedVersion.type;
        const civitaiName = matchedVersion.model?.name || matchedVersion.name || null;
        const isNsfw = Boolean(
          matchedVersion.model?.nsfw ||
          (matchedVersion.images && matchedVersion.images.some((img: any) => img && (img.nsfw || (img.nsfwLevel && img.nsfwLevel > 1))))
        );
        await dbManager.run(
          'UPDATE local_models SET civitai_model_id = ?, civitai_version_id = ?, civitai_name = ?, preview_url = ?, model_type = COALESCE(?, model_type), nsfw = ?, source = ? WHERE id = ?',
          [matchedVersion.modelId, matchedVersion.id, civitaiName, preview, modelType || null, isNsfw ? 1 : 0, 'civitai', r.id]
        );
        if (preview) {
          imageCacheService.prefetchToPermanentCache(preview);
        }
        civitaiMatched++;
      } else {
        unmatchedRows.push(r);
      }
    }

    // 2. Second Prong: Hugging Face Fallback Identification (LLMs, GGUF, Text Encoders, Diffusers)
    let hfMatched = 0;
    for (const r of unmatchedRows) {
      try {
        const hfResult = await huggingfaceClient.matchModel(r.file_path, r.file_name, r.sha256);
        if (hfResult && hfResult.matched && hfResult.repoId) {
          const title = hfResult.modelName ? `${hfResult.repoId} (${hfResult.modelName})` : hfResult.repoId;
          await dbManager.run(
            'UPDATE local_models SET source = ?, hf_repo_id = ?, civitai_name = ?, model_type = COALESCE(?, model_type) WHERE id = ?',
            ['huggingface', hfResult.repoId, title, hfResult.modelType || null, r.id]
          );
          hfMatched++;
        }
      } catch (hfErr) {
        logger.warn(`Hugging Face fallback matching skipped for ${r.file_name}:`, hfErr);
      }
    }

    await this.flagDuplicates();
    const newlyMatched = civitaiMatched + hfMatched;
    logger.info(
      `Two-pronged model identification complete. Checked: ${rows.length}, Total Matched: ${newlyMatched} (CivitAI: ${civitaiMatched}, Hugging Face: ${hfMatched}).`
    );
    return { totalChecked: rows.length, newlyMatched, civitaiMatched, hfMatched };
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

  async saveModelMetadata(params: SaveModelMetadataParams): Promise<{ success: boolean; error?: string }> {
    try {
      const {
        modelId,
        filePath,
        civitaiName,
        civitaiCreator,
        civitaiBaseModel,
        modelType,
        customLink,
        source,
        hfRepoId,
        civitaiModelId,
        civitaiVersionId,
        previewUrl,
        nsfw,
        trainedWords,
        description,
        tags,
      } = params;

      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: `Model file does not exist at ${filePath}` };
      }

      const ext = path.extname(filePath);
      const baseWithoutExt = filePath.slice(0, -ext.length);
      const companionPath = `${baseWithoutExt}.info`;

      // 1. Prepare companion JSON payload
      let existingData: any = {};
      const existingCompanion = discoverCompanionFiles(filePath);
      if (existingCompanion.companionInfo) {
        existingData = { ...existingCompanion.companionInfo };
      }

      const updatedCompanion = {
        ...existingData,
        id: civitaiVersionId || existingData.id,
        modelId: civitaiModelId || existingData.modelId,
        name: civitaiName || existingData.name,
        type: modelType || existingData.type,
        baseModel: civitaiBaseModel || existingData.baseModel,
        creator: civitaiCreator ? { username: civitaiCreator } : existingData.creator,
        customLink: customLink || existingData.customLink,
        source: source || existingData.source || (customLink?.includes('huggingface.co') ? 'huggingface' : 'civitai'),
        hfRepoId: hfRepoId || existingData.hfRepoId,
        description: description !== undefined ? description : existingData.description,
        tags: tags || existingData.tags || [],
        trainedWords: trainedWords || existingData.trainedWords || [],
        nsfw: nsfw !== undefined ? nsfw : existingData.nsfw,
        images: previewUrl ? [{ url: previewUrl, nsfw: !!nsfw }] : existingData.images || [],
      };

      const targetInfoFile = existingCompanion.companionInfoPath || companionPath;
      fs.writeFileSync(targetInfoFile, JSON.stringify(updatedCompanion, null, 2), 'utf8');

      // 2. Update SQLite database record
      await dbManager.run(
        `UPDATE local_models
         SET civitai_name = ?,
             civitai_creator = ?,
             civitai_base_model = ?,
             model_type = ?,
             custom_link = ?,
             source = ?,
             hf_repo_id = ?,
             civitai_model_id = ?,
             civitai_version_id = ?,
             preview_url = ?,
             nsfw = ?
         WHERE id = ? OR file_path = ? COLLATE NOCASE;`,
        [
          civitaiName || null,
          civitaiCreator || null,
          civitaiBaseModel || null,
          modelType || null,
          customLink || null,
          source || (customLink?.includes('huggingface.co') ? 'huggingface' : 'civitai'),
          hfRepoId || null,
          civitaiModelId || null,
          civitaiVersionId || null,
          previewUrl || null,
          nsfw ? 1 : 0,
          modelId,
          filePath,
        ]
      );

      if (previewUrl && previewUrl.startsWith('http')) {
        imageCacheService.prefetchToPermanentCache(previewUrl);
      }

      return { success: true };
    } catch (err: any) {
      logger.error('Failed to save model metadata:', err);
      return { success: false, error: err?.message || 'Failed to save metadata' };
    }
  }

  async fetchModelMetadataByUrl(urlOrId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const input = (urlOrId || '').trim();
      if (!input) {
        return { success: false, error: 'URL or Model ID is required' };
      }

      // 1. Check if Hugging Face URL or repo pattern (e.g. bartowski/google_gemma-4-E2B-it-GGUF)
      const hfMatch = input.match(/(?:https?:\/\/huggingface\.co\/)?([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i);
      const isHfUrl = input.includes('huggingface.co') || (hfMatch && !/^\d+$/.test(input) && !input.includes('civitai.'));

      if (isHfUrl && hfMatch) {
        const repoId = hfMatch[1].replace(/\/tree\/.*|\/blob\/.*/, '');
        const repoRes = await huggingfaceClient.checkModelRepo(repoId);
        if (repoRes.exists && repoRes.info) {
          const info = repoRes.info;
          let inferredType: any = 'LLM';
          if (info.pipelineTag === 'text-to-image' || (info.tags && info.tags.includes('diffusers'))) {
            inferredType = 'Checkpoint';
          } else if (info.tags && (info.tags.includes('lora') || info.pipelineTag === 'lora')) {
            inferredType = 'LORA';
          } else if (info.pipelineTag === 'controlnet') {
            inferredType = 'ControlNet';
          }

          return {
            success: true,
            data: {
              source: 'huggingface',
              civitaiName: info.modelName || repoId,
              civitaiCreator: info.author || repoId.split('/')[0],
              civitaiBaseModel: info.pipelineTag || (info.tags?.find((t) => ['sdxl', 'flux', 'sd1.5', 'llama', 'qwen', 'gemma'].some((b) => t.toLowerCase().includes(b))) || undefined),
              modelType: inferredType,
              customLink: `https://huggingface.co/${repoId}`,
              hfRepoId: repoId,
              tags: info.tags || [],
              description: `Hugging Face repository: ${repoId}\nPipeline: ${info.pipelineTag || 'unknown'}\nLikes: ${info.likes || 0} | Downloads: ${info.downloads || 0}`,
              previewUrl: undefined,
              nsfw: false,
              trainedWords: [],
            },
          };
        } else {
          return { success: false, error: repoRes.error || `Hugging Face repository "${repoId}" not found` };
        }
      }

      // 2. Check if CivitAI URL or numeric ID
      const civitaiModelMatch = input.match(/(?:civitai\.(?:com|red)\/models\/)?(\d+)/i);
      const civitaiVersionMatch = input.match(/modelVersionId=(\d+)/i);

      if (civitaiVersionMatch) {
        const versionId = parseInt(civitaiVersionMatch[1], 10);
        const vData = await civitaiClient.fetchModelVersion(versionId);
        if (vData) {
          const previewUrl = vData.images && vData.images.length > 0 ? vData.images[0].url : undefined;
          return {
            success: true,
            data: {
              source: 'civitai',
              civitaiName: vData.name || vData.model?.name,
              civitaiCreator: vData.model?.creator?.username,
              civitaiBaseModel: vData.baseModel,
              civitaiModelId: vData.modelId,
              civitaiVersionId: vData.id,
              modelType: vData.model?.type,
              customLink: `https://civitai.com/models/${vData.modelId}?modelVersionId=${vData.id}`,
              description: vData.description || (vData.model as any)?.description,
              tags: (vData.model as any)?.tags || [],
              trainedWords: vData.trainedWords || [],
              previewUrl,
              nsfw: Boolean(vData.model?.nsfw || (vData.images && vData.images.some((i: any) => i.nsfw || (i.nsfwLevel && i.nsfwLevel > 1)))),
            },
          };
        }
      }

      if (civitaiModelMatch) {
        const modelId = parseInt(civitaiModelMatch[1], 10);
        const mData = await civitaiClient.fetchModel(modelId);
        if (mData) {
          const firstVersion = mData.modelVersions && mData.modelVersions.length > 0 ? mData.modelVersions[0] : undefined;
          const previewUrl = firstVersion?.images && firstVersion.images.length > 0 ? firstVersion.images[0].url : undefined;
          return {
            success: true,
            data: {
              source: 'civitai',
              civitaiName: mData.name,
              civitaiCreator: mData.creator?.username,
              civitaiBaseModel: firstVersion?.baseModel,
              civitaiModelId: mData.id,
              civitaiVersionId: firstVersion?.id,
              modelType: mData.type,
              customLink: `https://civitai.com/models/${mData.id}`,
              description: mData.description,
              tags: mData.tags || [],
              trainedWords: firstVersion?.trainedWords || [],
              previewUrl,
              nsfw: Boolean(mData.nsfw || (mData.nsfwLevel && mData.nsfwLevel > 1)),
            },
          };
        }
      }

      return {
        success: false,
        error: `Could not parse URL or ID: "${input}". Please enter a valid CivitAI or HuggingFace link/ID.`,
      };
    } catch (err: any) {
      logger.error('fetchModelMetadataByUrl failed:', err);
      return { success: false, error: err?.message || 'Failed to fetch model metadata' };
    }
  }
}

export const libraryScanner = new LibraryScanner();
