/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import path from 'path';
import fs from 'fs';
import { ModelType, FileType } from '../types/civitai';
import {
  FolderConfig,
  FilenamePatternRule,
  DEFAULT_FOLDER_MAP,
  DEFAULT_FILENAME_PATTERNS,
  COMFYUI_STANDARD_MODEL_SUBFOLDERS,
} from '../types/app';
import { sanitizeFileName } from '../utils/pathUtils';
import { logger } from '../utils/logger';

export class FolderRouter {
  private config: FolderConfig;

  constructor(config?: Partial<FolderConfig>) {
    this.config = {
      rootPath: config?.rootPath || '',
      folderMappings: { ...DEFAULT_FOLDER_MAP, ...(config?.folderMappings || {}) },
      separateByBaseModel: config?.separateByBaseModel ?? false,
      separateByCreator: config?.separateByCreator ?? false,
      advancedMappings: {
        filename_patterns:
          config?.advancedMappings?.filename_patterns || DEFAULT_FILENAME_PATTERNS,
      },
    };
  }

  updateConfig(newConfig: Partial<FolderConfig>) {
    this.config = {
      ...this.config,
      ...newConfig,
      folderMappings: {
        ...this.config.folderMappings,
        ...(newConfig.folderMappings || {}),
      },
      advancedMappings: {
        filename_patterns:
          newConfig.advancedMappings?.filename_patterns ||
          this.config.advancedMappings.filename_patterns,
      },
    };
  }

  determineFolder(
    fileName: string,
    modelType: ModelType,
    fileType?: FileType
  ): string {
    // 1. Check secondary file type overrides
    if (fileType === 'VAE') return 'vae';
    if (fileType === 'Text Encoder') return 'text_encoders';
    if (fileType === 'Config') return 'configs';

    // 2. Check filename pattern rules
    for (const rule of this.config.advancedMappings.filename_patterns) {
      try {
        const flags = rule.case_sensitive === false ? 'i' : '';
        const regex = new RegExp(rule.pattern, flags);
        if (regex.test(fileName)) {
          return rule.folder;
        }
      } catch (err) {
        logger.warn(`Invalid regex pattern rule: ${rule.pattern}`, err);
      }
    }

    // 3. Fallback to modelType folder mapping
    return this.config.folderMappings[modelType] || 'checkpoints';
  }

  computePath(params: {
    fileName: string;
    modelType: ModelType;
    baseModel?: string;
    creator?: string;
    fileType?: FileType;
    targetRoot?: string;
  }): { folderName: string; fullPath: string; relativePath: string } {
    const { fileName, modelType, baseModel, creator, fileType, targetRoot } = params;

    const baseFolder = this.determineFolder(fileName, modelType, fileType);
    const sanitizedBaseFolder = sanitizeFileName(baseFolder);
    const sanitizedFileName = sanitizeFileName(fileName);

    const pathParts: string[] = [sanitizedBaseFolder];

    if (this.config.separateByBaseModel && baseModel) {
      pathParts.push(sanitizeFileName(baseModel));
    }

    if (this.config.separateByCreator && creator) {
      pathParts.push(sanitizeFileName(creator));
    }

    const relativePath = path.join(...pathParts, sanitizedFileName);
    const effectiveRoot = targetRoot || this.config.rootPath || (this.config.folderPaths && this.config.folderPaths[0]) || '';
    let fullPath = effectiveRoot
      ? path.join(effectiveRoot, relativePath)
      : relativePath;

    // Boundary check: Ensure fullPath never escapes effectiveRoot
    if (effectiveRoot) {
      const resolvedRoot = path.resolve(effectiveRoot);
      const resolvedTarget = path.resolve(fullPath);
      const rel = path.relative(resolvedRoot, resolvedTarget);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        logger.warn(`Security: Path traversal attempt blocked in computePath for: ${relativePath}`);
        fullPath = path.join(effectiveRoot, sanitizedFileName);
      }
    }

    return {
      folderName: baseFolder,
      fullPath,
      relativePath,
    };
  }

  ensureTargetDirectory(targetPath: string): void {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created destination folder: ${dir}`);
    }
  }

  /**
   * Scaffolds and verifies standard ComfyUI model subdirectories in a directory.
   * Workflows directory is explicitly excluded as workflows live in workflow folders.
   */
  scaffoldModelSubfolders(targetDir: string): { targetDir: string; created: string[]; existing: string[] } {
    if (!targetDir) return { targetDir: '', created: [], existing: [] };

    // Only ever create directories under absolute paths. Refuse relative/loose values so raw
    // (unvalidated) text can never be escalated into folders on disk (e.g. "comfyui", "c", "/models").
    if (!path.isAbsolute(targetDir)) {
      logger.warn(`Refusing to scaffold non-absolute model directory: ${targetDir}`);
      return { targetDir, created: [], existing: [] };
    }

    const created: string[] = [];
    const existing: string[] = [];

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        logger.info(`Created base model directory: ${targetDir}`);
      }

      for (const sub of COMFYUI_STANDARD_MODEL_SUBFOLDERS) {
        const subPath = path.join(targetDir, sub);
        if (!fs.existsSync(subPath)) {
          try {
            fs.mkdirSync(subPath, { recursive: true });
            created.push(sub);
            logger.info(`Scaffolded missing ComfyUI model subfolder: ${subPath}`);
          } catch (e: any) {
            logger.warn(`Failed to create model subfolder ${subPath}:`, e.message);
          }
        } else {
          existing.push(sub);
        }
      }
    } catch (err: any) {
      logger.warn(`Error scaffolding model subfolders in ${targetDir}:`, err.message);
    }

    return { targetDir, created, existing };
  }
}

export const folderRouter = new FolderRouter();
