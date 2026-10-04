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
import { folderRouter } from './folderRouter';
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
          civitaiType: r.model_type,
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

    const items: MisplacedModel[] = [];
    const standardFolders = new Set(
      [...COMFYUI_STANDARD_MODEL_SUBFOLDERS, ...Object.values(DEFAULT_FOLDER_MAP)].map((f) =>
        f.toLowerCase()
      )
    );

    for (const model of modelsToInspect) {
      if (!model.filePath) continue;

      const normPath = path.resolve(model.filePath).replace(/\\/g, '/');
      const parts = normPath.split('/');
      const fileName = parts[parts.length - 1] || model.fileName;

      // Resolve true model type using intelligence heuristics
      const resolvedType = resolveEffectiveModelType(
        model.civitaiType || model.modelType,
        model.civitaiName || model.fileName,
        [model.civitaiVersionName, model.fileName].filter((v): v is string => Boolean(v))
      );

      const baseModel = model.civitaiBaseModel || model.baseModel;
      const targetFolder = folderRouter.determineFolder(
        fileName,
        resolvedType,
        undefined,
        baseModel
      );

      // Locate where in the directory hierarchy the standard ComfyUI model folder is
      let foundSubfolderIdx = -1;
      for (let i = parts.length - 2; i >= 0; i--) {
        const folderName = parts[i].toLowerCase();
        if (standardFolders.has(folderName)) {
          foundSubfolderIdx = i;
          break;
        }
      }

      let currentFolder = '';
      let modelsRoot = '';
      let subDirs: string[] = [];

      if (foundSubfolderIdx !== -1) {
        currentFolder = parts[foundSubfolderIdx];
        modelsRoot = parts.slice(0, foundSubfolderIdx).join(path.sep);
        subDirs = parts.slice(foundSubfolderIdx + 1, parts.length - 1);
      } else {
        currentFolder = parts[parts.length - 2] || 'root';
        modelsRoot = parts.slice(0, parts.length - 2).join(path.sep);
        subDirs = [];
      }

      // Check if current folder differs from target folder
      if (currentFolder.toLowerCase() !== targetFolder.toLowerCase()) {
        const targetPath = modelsRoot
          ? path.join(modelsRoot, targetFolder, ...subDirs, fileName)
          : path.join(targetFolder, ...subDirs, fileName);

        const companions = this.findCompanionFiles(model.filePath);

        // Generate descriptive reason
        let reason = '';
        if (resolvedType === 'Controlnet') {
          reason = `ControlNet adapter in '${currentFolder}' folder (relocate to 'controlnet')`;
        } else if (targetFolder === 'diffusion_models') {
          reason = `Diffusion architecture (${baseModel || 'Anima/Flux/Wan'}) in '${currentFolder}' (relocate to 'diffusion_models')`;
        } else if (targetFolder === 'LLM') {
          reason = `LLM / Text model (${baseModel || 'Qwen/Quan/LLaMA'}) in '${currentFolder}' (relocate to 'LLM')`;
        } else if (resolvedType === 'LORA' || resolvedType === 'LoCon' || resolvedType === 'DoRA') {
          reason = `LoRA adapter in '${currentFolder}' folder (relocate to 'loras')`;
        } else if (resolvedType === 'VAE') {
          reason = `VAE model in '${currentFolder}' folder (relocate to 'vae')`;
        } else if (resolvedType === 'TextualInversion') {
          reason = `Embedding in '${currentFolder}' folder (relocate to 'embeddings')`;
        } else if (resolvedType === 'Upscaler') {
          reason = `Upscaler model in '${currentFolder}' folder (relocate to 'upscale_models')`;
        } else if (resolvedType === 'Checkpoint') {
          reason = `Full Checkpoint in '${currentFolder}' folder (relocate to 'checkpoints')`;
        } else {
          reason = `${resolvedType} model in '${currentFolder}' folder (relocate to '${targetFolder}')`;
        }

        items.push({
          id: model.id,
          fileName,
          currentPath: model.filePath,
          currentFolder,
          targetFolder,
          targetPath,
          modelType: model.modelType || 'Other',
          resolvedType,
          baseModel,
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
}

export const librarySorter = new LibrarySorterService();
