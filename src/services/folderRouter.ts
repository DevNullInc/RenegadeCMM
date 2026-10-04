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
    fileType?: FileType,
    baseModel?: string
  ): string {
    // 1. Check secondary file type overrides
    if (fileType === 'VAE') return 'vae';
    if (fileType === 'Text Encoder') return 'text_encoders';
    if (fileType === 'Config') return 'configs';

    const nameLower = (fileName || '').toLowerCase();
    const baseLower = (baseModel || '').toLowerCase();

    // 2. Specialized model types that have dedicated home directories in ComfyUI
    const specializedTypes: Record<string, string> = {
      LORA: 'loras',
      LoCon: 'loras',
      DoRA: 'loras',
      TextualInversion: 'embeddings',
      VAE: 'vae',
      Controlnet: 'controlnet',
      Upscaler: 'upscale_models',
      Hypernetwork: 'hypernetworks',
      MotionModule: 'model_patches',
      AestheticGradient: 'model_patches',
      Poses: 'workflows',
      Wildcards: 'wildcards',
      Workflows: 'workflows',
      Detection: 'detection',
    };

    const isSpecializedType = Boolean(modelType && specializedTypes[modelType]);

    // 3. Check filename pattern rules
    const nameWithSpaces = (fileName || '').replace(/[-_.]/g, ' ');
    for (const rule of this.config.advancedMappings.filename_patterns) {
      try {
        const flags = rule.case_sensitive === false ? 'i' : '';
        const regex = new RegExp(rule.pattern, flags);
        if (regex.test(fileName) || regex.test(nameWithSpaces)) {
          // If this is a specialized type (e.g. LORA) and matched rule is a generic architecture container
          // (diffusion_models, LLM, checkpoints, unet), preserve the specialized destination.
          if (isSpecializedType && ['diffusion_models', 'LLM', 'checkpoints', 'unet'].includes(rule.folder)) {
            continue;
          }
          return rule.folder;
        }
      } catch (err) {
        logger.warn(`Invalid regex pattern rule: ${rule.pattern}`, err);
      }
    }

    if (isSpecializedType) {
      return specializedTypes[modelType];
    }

    // 4. Base model intelligence for Checkpoint / Other / standalone weights
    const isDiffusionBase =
      /\b(anima|krea|flux|wan|wan2|cogvideo|hunyuan|mochi|ltxv|ltx-video|auraflow|pixart|lumina|chroma|kolors|sd 3|sd 3\.5|sd3)\b/i.test(
        baseLower
      );

    const isLlmBase =
      /\b(qwen|quan|llama|mistral|mixtral|gemma|deepseek|phi|ernie|chatglm|llm)\b/i.test(
        baseLower
      );

    if (isLlmBase) {
      return 'LLM';
    }

    if (isDiffusionBase) {
      return 'diffusion_models';
    }

    // 5. Filename keyword checks for Checkpoint / Other / standalone weights
    if (
      /\b(qwen|quan|llama|mistral|gemma|deepseek|phi)\b/i.test(nameWithSpaces) ||
      /\b(qwen|quan|llama|mistral|gemma|deepseek|phi)\b/i.test(nameLower) ||
      /[-_](qwen|quan|llama|mistral|gemma|deepseek|phi)[-_.]/i.test(nameLower)
    ) {
      return 'LLM';
    }

    if (
      /\b(anima|krea|cogvideo|hunyuan|mochi|ltxv|lumina|chroma|auraflow|pixart)\b/i.test(nameWithSpaces) ||
      /\b(anima|krea|cogvideo|hunyuan|mochi|ltxv|lumina|chroma|auraflow|pixart)\b/i.test(nameLower) ||
      /wan.*video|wan2\.?1|wan_\d/i.test(nameLower) ||
      /flux.*krea/i.test(nameLower)
    ) {
      return 'diffusion_models';
    }

    // 6. Fallback to modelType folder mapping
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

    const baseFolder = this.determineFolder(fileName, modelType, fileType, baseModel);
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
