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
import { dbManager } from '../db/db';
import { logger } from '../utils/logger';
import { folderRouter, FOLDER_ALIASES } from './folderRouter';
import { tensorInspector } from './tensorInspector';
import { resolveEffectiveModelType } from '../utils/modelUtils';
import {
  LocalModel,
  MisplacedModel,
  LibrarySortPlan,
  ExecuteLibrarySortResult,
  COMFYUI_STANDARD_MODEL_SUBFOLDERS,
  DEFAULT_FOLDER_MAP,
} from '../types/app';

export class LibrarySorterService {
  /**
   * Discovers all companion files for a given model file (e.g. preview images, metadata json, configs).
   */
  public findCompanionFiles(modelFilePath: string): string[] {
    const companions: string[] = [];
    if (!modelFilePath || !fs.existsSync(modelFilePath)) return companions;

    const dir = path.dirname(modelFilePath);
    const baseName = path.parse(modelFilePath).name;

    try {
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir);
        for (const entry of entries) {
          if (entry === path.basename(modelFilePath)) continue;
          if (
            entry.startsWith(`${baseName}.`) ||
            entry.startsWith(`${baseName}_`) ||
            entry.startsWith(`${baseName}-`)
          ) {
            companions.push(path.join(dir, entry));
          }
        }
      }
    } catch (err) {
      logger.warn(`Failed finding companion files for ${modelFilePath}:`, err);
    }

    return companions;
  }

  /**
   * Reads CivitAI / CMM metadata from companion JSON/info files for chain of custody.
   */
  public extractCompanionType(companionPaths: string[]): { type?: any; baseModel?: string } {
    for (const p of companionPaths) {
      const lower = p.toLowerCase();
      if (!lower.endsWith('.json') && !lower.endsWith('.info') && !lower.endsWith('.civitai.info')) continue;
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8');
          const data = JSON.parse(content);
          const type = data.type || data.model?.type || data.modelType || data.civitaiType;
          const baseModel = data.baseModel || data.model?.baseModel || data.civitaiBaseModel;
          if (type) {
            return { type, baseModel: baseModel ? String(baseModel) : undefined };
          }
        }
      } catch {}
    }
    return {};
  }

  /**
   * Analyzes local models to detect misplaced files that belong in different ComfyUI model subdirectories.
   */
  public async analyzeLibrary(options?: {
    models?: LocalModel[];
    modelIds?: string[];
  }): Promise<LibrarySortPlan> {
    let modelsToInspect: LocalModel[] = [];

    if (options?.models && options.models.length > 0) {
      modelsToInspect = options.models;
    } else {
      try {
        const rows = await dbManager.all('SELECT * FROM local_models ORDER BY file_name ASC;');
        modelsToInspect = rows.map((r: any) => ({
          id: String(r.id),
          filePath: r.file_path,
          fileName: r.file_name,
          fileSize: r.file_size || 0,
          modifiedAt: r.modified_at || 0,
          modelType: r.model_type,
          baseModel: r.base_model,
          civitaiName: r.civitai_name,
          civitaiType: r.is_matched ? r.model_type : undefined,
          civitaiBaseModel: r.civitai_base_model || r.base_model,
          civitaiVersionName: r.civitai_version_name,
          previewUrl: r.preview_url,
          isMatched: Boolean(r.is_matched),
        }));
      } catch (err) {
        logger.error('Failed to load local models for library sort analysis:', err);
        return { totalModels: 0, misplacedCount: 0, correctCount: 0, items: [] };
      }
    }

    if (options?.modelIds && options.modelIds.length > 0) {
      const idSet = new Set(options.modelIds);
      modelsToInspect = modelsToInspect.filter((m) => idSet.has(m.id));
    }

    await this.ensureIgnoredTable();
    let ignoredIdSet = new Set<string>();
    try {
      const ignoredRows = await dbManager.all('SELECT model_id, file_path FROM ignored_sort_models;');
      ignoredIdSet = new Set((ignoredRows || []).map((r: any) => String(r.model_id)));
    } catch {}

    const items: MisplacedModel[] = [];
    const allAliases = Object.values(FOLDER_ALIASES).flat();
    const standardFolders = new Set(
      [
        ...COMFYUI_STANDARD_MODEL_SUBFOLDERS,
        ...Object.values(DEFAULT_FOLDER_MAP),
        ...Object.keys(FOLDER_ALIASES),
        ...allAliases,
      ]
        .map((f) => f.toLowerCase())
        .filter((f) => f !== 'models' && f !== 'root')
    );

    // All standard folders except 'checkpoints' are specialized categories
    const specializedStandardFolders = new Set(
      [
        ...COMFYUI_STANDARD_MODEL_SUBFOLDERS.filter((f) => f.toLowerCase() !== 'checkpoints'),
        ...Object.keys(FOLDER_ALIASES).filter((f) => f.toLowerCase() !== 'checkpoints'),
        ...Object.entries(FOLDER_ALIASES)
          .filter(([canonical]) => canonical.toLowerCase() !== 'checkpoints')
          .flatMap(([, aliases]) => aliases),
      ].map((f) => f.toLowerCase())
    );

    for (const model of modelsToInspect) {
      if (!model.filePath || ignoredIdSet.has(model.id)) continue;

      const normPath = path.resolve(model.filePath).replace(/\\/g, '/');
      const parts = normPath.split('/');
      const fileName = parts[parts.length - 1] || model.fileName;

      // Locate where in the directory hierarchy the standard ComfyUI model folder is
      let foundSubfolderIdx = -1;
      for (let i = parts.length - 2; i >= 0; i--) {
        const folderName = parts[i].toLowerCase();
        if (folderName === 'models' || folderName === 'root' || /^[a-z]:$/i.test(folderName)) {
          continue;
        }
        if (standardFolders.has(folderName)) {
          foundSubfolderIdx = i;
          break;
        }
      }

      // PURE WHITELIST RULE:
      // If the model does not reside inside an official standard ComfyUI model subfolder
      // (e.g. node-specific folders like 'kgen', 'TIPO', 'custom_nodes', or top-level outside standard folders),
      // the Auto-Sorter strictly ignores and skips it so node-specific requirements are never disturbed.
      if (foundSubfolderIdx === -1) {
        continue;
      }

      const standardFolder = parts[foundSubfolderIdx];
      const canonicalStandardFolder = folderRouter.getCanonicalFolderName(standardFolder);
      const modelsRoot = parts.slice(0, foundSubfolderIdx).join(path.sep);
      const subDirs = parts.slice(foundSubfolderIdx + 1, parts.length - 1);
      const currentFolderDisplay = subDirs.length > 0 ? `${standardFolder}/${subDirs.join('/')}` : standardFolder;

      const companions = this.findCompanionFiles(model.filePath);
      const companionMeta = this.extractCompanionType(companions);

      const effectiveCivitaiType = companionMeta.type || (model.isMatched ? model.civitaiType || model.modelType : undefined);
      let effectiveBaseModel = companionMeta.baseModel || model.civitaiBaseModel || model.baseModel;

      // Resolve true model type using intelligence heuristics + companion chain of custody
      let resolvedType = resolveEffectiveModelType(
        effectiveCivitaiType,
        model.civitaiName || model.fileName,
        [model.civitaiVersionName, model.fileName].filter((v): v is string => Boolean(v))
      );

      let targetFolder = folderRouter.determineFolder(
        fileName,
        resolvedType,
        undefined,
        effectiveBaseModel
      );

      const isCurrentFolderSpecialized =
        specializedStandardFolders.has(standardFolder.toLowerCase()) ||
        specializedStandardFolders.has(canonicalStandardFolder.toLowerCase());

      // Contextual folder protection: If the file resides in an existing valid specialized folder
      // do not blindly relocate it to checkpoints or other generic destinations when it is legitimately placed.
      if (isCurrentFolderSpecialized) {
        const isExplicitCheckpointName =
          /\b(aio|all-in-one|all_in_one|full_version|full-version)\b/i.test(fileName) ||
          /[-_](aio|all-in-one|all_in_one|checkpoint|ckpt)[-_.]/i.test(fileName);

        const isVaeFolder = canonicalStandardFolder.toLowerCase() === 'vae';
        const isDiffusionFolder = canonicalStandardFolder.toLowerCase() === 'diffusion_models';
        const isIpAdapterFolder = canonicalStandardFolder.toLowerCase() === 'ipadapter';
        const isClipVisionFolder = canonicalStandardFolder.toLowerCase() === 'clip_vision';
        const isControlNetFolder = canonicalStandardFolder.toLowerCase() === 'controlnet';

        const isDiffusionModelFamily =
          /\b(minimax|h3|ltx|ltxv|anima|krea|flux|wan|cogvideo|hunyuan|mochi|auraflow|pixart|lumina|chroma|cosmos|consisid|omnigen|easycontrol|melbandroformer)\b/i.test(
            `${fileName} ${effectiveBaseModel || ''}`
          );

        if (targetFolder === 'checkpoints') {
          let hasAuthoritativeCheckpointProof = false;
          if (isVaeFolder) {
            hasAuthoritativeCheckpointProof = isExplicitCheckpointName && !/vae/i.test(fileName);
          } else if (isDiffusionFolder && isDiffusionModelFamily) {
            hasAuthoritativeCheckpointProof = false;
          } else if (isIpAdapterFolder || isClipVisionFolder) {
            hasAuthoritativeCheckpointProof = false;
          } else {
            hasAuthoritativeCheckpointProof =
              isExplicitCheckpointName &&
              ((companionMeta.type && companionMeta.type.toLowerCase() === 'checkpoint') ||
                (model.isMatched && (model.civitaiType === 'Checkpoint' || model.modelType === 'Checkpoint')));
          }

          if (!hasAuthoritativeCheckpointProof) {
            targetFolder = canonicalStandardFolder;
          }
        }

        // Protect ControlNet / inpainting / LLLite adapters in controlnet folder
        if (isControlNetFolder && targetFolder === 'diffusion_models') {
          if (/(?:control|lllite|inpaint|adapter|canny|depth|openpose|tile|recolor|lineart|softedge|scribble)/i.test(fileName)) {
            targetFolder = 'controlnet';
            resolvedType = 'Controlnet';
          }
        }

        // Protect IP-Adapters in ipadapter folder
        if (isIpAdapterFolder && (targetFolder === 'controlnet' || targetFolder === 'checkpoints')) {
          if (/(?:ip[-_]?adapter|faceid|instantid|image[-_]?proj)/i.test(fileName)) {
            targetFolder = 'ipadapter';
          }
        }

        // Protect Vision models in clip_vision folder
        if (isClipVisionFolder && (targetFolder === 'upscale_models' || targetFolder === 'checkpoints')) {
          if (/(?:clip|vision|vit|dino|siglip|open_clip)/i.test(fileName)) {
            targetFolder = 'clip_vision';
          }
        }

        // Protect VAE in vae folder
        if (isVaeFolder && targetFolder !== 'vae') {
          if (/(?:vae)/i.test(fileName)) {
            targetFolder = 'vae';
            resolvedType = 'VAE';
          }
        }
      }

      // Check if current standard folder differs from target folder (accounting for acceptable folder aliases)
      const isInitiallyMisplaced =
        !folderRouter.isFolderEquivalent(standardFolder, targetFolder) &&
        !folderRouter.isFolderEquivalent(canonicalStandardFolder, targetFolder);

      let tensorEvidence: string | undefined = undefined;

      // Tensor Architecture Inspector: Inspect internal tensors for unknown models or candidate-misplaced models
      // to authoritatively verify if the model belongs in its current folder before flagging it.
      if (isInitiallyMisplaced || resolvedType === 'Other' || !model.isMatched) {
        try {
          const tensorInfo = await tensorInspector.inspectFile(model.filePath);
          if (tensorInfo.inspected && tensorInfo.confidence !== 'low' && tensorInfo.targetFolder) {
            tensorEvidence = tensorInfo.evidence;
            if (
              folderRouter.isFolderEquivalent(standardFolder, tensorInfo.targetFolder) ||
              folderRouter.isFolderEquivalent(canonicalStandardFolder, tensorInfo.targetFolder)
            ) {
              // Tensors inside confirm that the file is correctly placed in its current folder
              targetFolder = canonicalStandardFolder;
              if (tensorInfo.detectedType) resolvedType = tensorInfo.detectedType as any;
              if (tensorInfo.detectedBaseModel && !effectiveBaseModel) {
                effectiveBaseModel = tensorInfo.detectedBaseModel;
              }
            } else {
              // Tensors authoritatively confirm it belongs in a different folder
              targetFolder = tensorInfo.targetFolder;
              if (tensorInfo.detectedType) resolvedType = tensorInfo.detectedType as any;
              if (tensorInfo.detectedBaseModel && !effectiveBaseModel) {
                effectiveBaseModel = tensorInfo.detectedBaseModel;
              }
            }
          }
        } catch (err) {
          logger.warn(`Failed tensor inspection for ${model.filePath}:`, err);
        }
      }

      // Final check if current standard folder differs from target folder
      if (
        !folderRouter.isFolderEquivalent(standardFolder, targetFolder) &&
        !folderRouter.isFolderEquivalent(canonicalStandardFolder, targetFolder)
      ) {
        const targetPath = modelsRoot
          ? path.join(modelsRoot, targetFolder, ...subDirs, fileName)
          : path.join(targetFolder, ...subDirs, fileName);

        // Generate descriptive reason with consistent phrasing and tensor evidence when available
        let reason = '';
        if (tensorEvidence) {
          reason = `${tensorEvidence} in '${currentFolderDisplay}' (relocate to '${targetFolder}')`;
        } else if (resolvedType === 'Controlnet' || targetFolder === 'controlnet') {
          reason = `ControlNet adapter in '${currentFolderDisplay}' (relocate to 'controlnet')`;
        } else if (targetFolder === 'diffusion_models') {
          reason = `Diffusion architecture (${effectiveBaseModel || 'Anima/Flux/Wan'}) in '${currentFolderDisplay}' (relocate to 'diffusion_models')`;
        } else if (targetFolder === 'LLM') {
          reason = `LLM / Text model (${effectiveBaseModel || 'Qwen/Quan/LLaMA'}) in '${currentFolderDisplay}' (relocate to 'LLM')`;
        } else if (resolvedType === 'LORA' || resolvedType === 'LoCon' || resolvedType === 'DoRA' || targetFolder === 'loras') {
          reason = `LoRA adapter in '${currentFolderDisplay}' (relocate to 'loras')`;
        } else if (resolvedType === 'VAE' || targetFolder === 'vae') {
          reason = `VAE model in '${currentFolderDisplay}' (relocate to 'vae')`;
        } else if (resolvedType === 'TextualInversion' || targetFolder === 'embeddings') {
          reason = `Embedding in '${currentFolderDisplay}' (relocate to 'embeddings')`;
        } else if (resolvedType === 'Upscaler' || targetFolder === 'upscale_models') {
          reason = `Upscaler model in '${currentFolderDisplay}' (relocate to 'upscale_models')`;
        } else if (targetFolder === 'clip_vision') {
          reason = `CLIP Vision model in '${currentFolderDisplay}' (relocate to 'clip_vision')`;
        } else if (targetFolder === 'text_encoders') {
          reason = `Text Encoder in '${currentFolderDisplay}' (relocate to 'text_encoders')`;
        } else if (resolvedType === 'Checkpoint' || targetFolder === 'checkpoints') {
          reason = `Full Checkpoint in '${currentFolderDisplay}' (relocate to 'checkpoints')`;
        } else {
          reason = `${resolvedType} model in '${currentFolderDisplay}' (relocate to '${targetFolder}')`;
        }

        items.push({
          id: model.id,
          fileName,
          currentPath: model.filePath,
          currentFolder: currentFolderDisplay,
          targetFolder,
          targetPath,
          modelType: model.modelType || 'Other',
          resolvedType,
          baseModel: effectiveBaseModel,
          reason,
          companionFiles: companions,
          fileSize: model.fileSize,
          previewUrl: model.previewUrl,
        });
      }
    }

    return {
      totalModels: modelsToInspect.length,
      misplacedCount: items.length,
      correctCount: modelsToInspect.length - items.length,
      items,
    };
  }

  /**
   * Executes moving the planned items to their designated destination folders and updating the database.
   */
  public async executeSort(
    planItems: Array<{ modelId: string; sourcePath: string; targetPath: string }>,
    onProgress?: (p: { current: number; total: number; file: string }) => void
  ): Promise<ExecuteLibrarySortResult> {
    let movedCount = 0;
    const errors: Array<{ modelId: string; file: string; error: string }> = [];
    const movedFiles: Array<{ modelId: string; from: string; to: string }> = [];

    const total = planItems.length;

    for (let i = 0; i < total; i++) {
      const item = planItems[i];
      const sourcePath = item.sourcePath;
      let targetPath = item.targetPath;

      if (onProgress) {
        onProgress({ current: i + 1, total, file: path.basename(sourcePath) });
      }

      if (!fs.existsSync(sourcePath)) {
        errors.push({
          modelId: item.modelId,
          file: sourcePath,
          error: 'Source model file no longer exists on disk',
        });
        continue;
      }

      try {
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // If target file already exists and is not the source itself, avoid destructive overwrite
        if (fs.existsSync(targetPath) && path.resolve(sourcePath) !== path.resolve(targetPath)) {
          const srcStat = fs.statSync(sourcePath);
          const dstStat = fs.statSync(targetPath);
          if (srcStat.size === dstStat.size) {
            // Already present in destination with identical size
            try {
              fs.unlinkSync(sourcePath);
            } catch {}
          } else {
            // Name collision: make unique filename
            const ext = path.extname(targetPath);
            const base = path.basename(targetPath, ext);
            targetPath = path.join(targetDir, `${base}_sorted_${Date.now()}${ext}`);
          }
        }

        // Move primary model file
        if (path.resolve(sourcePath) !== path.resolve(targetPath) && fs.existsSync(sourcePath)) {
          try {
            fs.renameSync(sourcePath, targetPath);
          } catch (renErr: any) {
            if (renErr.code === 'EXDEV') {
              fs.copyFileSync(sourcePath, targetPath);
              fs.unlinkSync(sourcePath);
            } else {
              throw renErr;
            }
          }
        }

        // Move companion files
        const srcDir = path.dirname(sourcePath);
        const base = path.parse(sourcePath).name;
        if (fs.existsSync(srcDir)) {
          const entries = fs.readdirSync(srcDir);
          for (const entry of entries) {
            if (entry === path.basename(sourcePath)) continue;
            if (
              entry.startsWith(`${base}.`) ||
              entry.startsWith(`${base}_`) ||
              entry.startsWith(`${base}-`)
            ) {
              const compSrc = path.join(srcDir, entry);
              const compDst = path.join(targetDir, entry);
              try {
                if (fs.existsSync(compSrc) && path.resolve(compSrc) !== path.resolve(compDst)) {
                  try {
                    fs.renameSync(compSrc, compDst);
                  } catch (ce: any) {
                    if (ce.code === 'EXDEV') {
                      fs.copyFileSync(compSrc, compDst);
                      fs.unlinkSync(compSrc);
                    }
                  }
                }
              } catch (compErr) {
                logger.warn(`Could not move companion file ${compSrc}:`, compErr);
              }
            }
          }
        }

        // Update database record
        await dbManager.run(
          'UPDATE local_models SET file_path = ?, updated_at = ? WHERE id = ?',
          [targetPath, Math.floor(Date.now() / 1000), item.modelId]
        );

        movedCount++;
        movedFiles.push({ modelId: item.modelId, from: sourcePath, to: targetPath });
        logger.info(`Auto-sorted model [${item.modelId}] from ${sourcePath} to ${targetPath}`);
      } catch (e: any) {
        logger.error(`Error auto-sorting file ${sourcePath}:`, e);
        errors.push({
          modelId: item.modelId,
          file: sourcePath,
          error: e.message || String(e),
        });
      }
    }

    return {
      success: errors.length === 0,
      movedCount,
      failedCount: errors.length,
      errors,
      movedFiles,
    };
  }

  public async ensureIgnoredTable(): Promise<void> {
    try {
      if (typeof (dbManager as any).exec === 'function') {
        await dbManager.exec(`
          CREATE TABLE IF NOT EXISTS ignored_sort_models (
            model_id TEXT PRIMARY KEY,
            file_path TEXT,
            file_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
      } else if (typeof (dbManager as any).run === 'function') {
        await dbManager.run(`
          CREATE TABLE IF NOT EXISTS ignored_sort_models (
            model_id TEXT PRIMARY KEY,
            file_path TEXT,
            file_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
    } catch {
      // In-memory / mocked unit test environments
    }
  }

  public async ignoreSortModel(modelId: string, filePath?: string, fileName?: string): Promise<{ success: boolean; modelId: string }> {
    await this.ensureIgnoredTable();
    await dbManager.run(
      'INSERT OR REPLACE INTO ignored_sort_models (model_id, file_path, file_name, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP);',
      [modelId, filePath || null, fileName || null]
    );
    logger.info(`Ignored misplaced sort model [${modelId}] (${fileName || filePath})`);
    return { success: true, modelId };
  }

  public async unignoreSortModel(modelId: string): Promise<{ success: boolean; modelId: string }> {
    await this.ensureIgnoredTable();
    await dbManager.run('DELETE FROM ignored_sort_models WHERE model_id = ?;', [modelId]);
    logger.info(`Unignored sort model [${modelId}]`);
    return { success: true, modelId };
  }

  public async getIgnoredSortModels(): Promise<Array<{ modelId: string; filePath: string; fileName: string; createdAt: string }>> {
    await this.ensureIgnoredTable();
    const rows = await dbManager.all('SELECT * FROM ignored_sort_models ORDER BY created_at DESC;');
    return (rows || []).map((r: any) => ({
      modelId: r.model_id,
      filePath: r.file_path,
      fileName: r.file_name,
      createdAt: r.created_at,
    }));
  }

  public async clearIgnoredSortModels(): Promise<{ success: boolean }> {
    await this.ensureIgnoredTable();
    await dbManager.run('DELETE FROM ignored_sort_models;');
    logger.info('Cleared all ignored sort models');
    return { success: true };
  }
}

export const librarySorter = new LibrarySorterService();

