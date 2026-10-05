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

export const FOLDER_ALIASES: Record<string, string[]> = {
  checkpoints: ['checkpoint', 'checkpoints', 'models'],
  loras: ['lora', 'loras', 'lycoris', 'locon', 'dora'],
  vae: ['vae', 'vaes'],
  embeddings: ['embeddings', 'embedding', 'textual_inversion', 'textualinversion'],
  controlnet: ['controlnet', 'control_net', 'controlnets'],
  upscale_models: ['upscale_models', 'upscalers', 'upscaler', 'esrgan', 'realesrgan', 'upscale', 'swinir', 'hat', 'dat', 'omnisr', 'nmkd'],
  text_encoders: ['text_encoders', 'textencoders', 'clip', 'text_encoder', 'text_encoder_models', 't5'],
  clip: ['clip', 'text_encoders', 'textencoders', 'clip_models'],
  clip_vision: ['clip_vision', 'clipvision', 'clip_vision_models'],
  diffusion_models: ['diffusion_models', 'diffusion', 'unet', 'diffusers'],
  LLM: ['llm', 'llms', 'text_models', 'gguf'],
  hypernetworks: ['hypernetworks', 'hypernetwork'],
  insightface: ['insightface', 'antelopev2', 'buffalo_l', 'buffalo_m', 'buffalo_s', 'models/antelopev2', 'models/buffalo_l', 'face_analysis', 'models'],
  ultralytics: ['ultralytics', 'yolo', 'detection', 'bbox', 'segm', 'afterdetailer', 'adetailer', 'adetailer/bbox', 'adetailer/segm'],
  yolo: ['yolo', 'ultralytics', 'detection', 'bbox', 'segm', 'afterdetailer', 'adetailer'],
  detection: ['detection', 'ultralytics', 'yolo', 'bbox', 'segm', 'afterdetailer', 'adetailer'],
  ipadapter: ['ipadapter', 'ip_adapter', 'ip-adapter'],
  reactor: ['reactor', 'insightface'],
  photomaker: ['photomaker'],
  pulid: ['pulid'],
  gguf: ['gguf', 'llm', 'llms', 'text_models'],
  wildcards: ['wildcards', 'wildcard'],
  workflows: ['workflows', 'workflow'],
};

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

  /**
   * Evaluates if a given directory or alias is logically equivalent to the target ComfyUI model folder.
   */
  isFolderEquivalent(currentFolder: string, targetFolder: string): boolean {
    if (!currentFolder || !targetFolder) return false;
    const curr = currentFolder.trim().toLowerCase();
    const targ = targetFolder.trim().toLowerCase();
    if (curr === targ) return true;

    // Check aliases of targetFolder
    const targetAliases = FOLDER_ALIASES[targetFolder] || FOLDER_ALIASES[targ] || [];
    if (targetAliases.some((a) => a.toLowerCase() === curr)) {
      return true;
    }

    // Check aliases of currentFolder
    const currentAliases = FOLDER_ALIASES[currentFolder] || FOLDER_ALIASES[curr] || [];
    if (currentAliases.some((a) => a.toLowerCase() === targ)) {
      return true;
    }

    return false;
  }

  /**
   * Resolves any folder alias (e.g. 'ESRGAN', 'Lora', 'diffusers') to its standardized canonical ComfyUI folder name.
   */
  getCanonicalFolderName(folder: string): string {
    if (!folder) return '';
    const norm = folder.trim().toLowerCase();
    for (const [canonical, aliases] of Object.entries(FOLDER_ALIASES)) {
      if (canonical.toLowerCase() === norm) return canonical;
      if (aliases.some((a) => a.toLowerCase() === norm)) return canonical;
    }
    for (const standard of COMFYUI_STANDARD_MODEL_SUBFOLDERS) {
      if (standard.toLowerCase() === norm) return standard;
    }
    return folder;
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
      Detection: 'ultralytics',
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

    // 4. Check for explicit AIO / Merged Checkpoint naming
    if (
      /\b(aio|all-in-one|all_in_one|full_version|full-version)\b/i.test(nameWithSpaces) ||
      /[-_](aio|all-in-one|all_in_one|checkpoint|ckpt)[-_.]/i.test(nameLower)
    ) {
      return 'checkpoints';
    }

    // 5. Base model intelligence for Checkpoint / Other / standalone weights
    const isDiffusionBase =
      /\b(minimax|h3|ltx|ltxv|ltx-video|anima|krea|flux|wan|wan2|cogvideo|hunyuan|mochi|auraflow|pixart|lumina|chroma|kolors|cosmos|consisid|omnigen|easycontrol|melbandroformer|sd 3|sd 3\.5|sd3)\b/i.test(
        baseLower
      );

    const isLlmBase =
      /\b(qwen|quan|llama|mistral|mixtral|gemma|deepseek|phi|ernie|chatglm|llm)\b/i.test(
        baseLower
      );

    if (isLlmBase) {
      if (nameLower.endsWith('.gguf') || /\b(gguf|instruct|chat|tokenizer|coder|assistant|text|language)\b/i.test(nameLower) || modelType === 'Other' || /\b(coder|assistant)\b/i.test(nameWithSpaces)) {
        return 'LLM';
      }
    }

    if (isDiffusionBase) {
      return 'diffusion_models';
    }

    // 6. Filename keyword checks for Checkpoint / Other / standalone weights
    if (
      /\b(minimax|h3|ltx|ltxv|anima|krea|cogvideo|hunyuan|mochi|lumina|chroma|auraflow|pixart|cosmos|consisid|omnigen|easycontrol|melbandroformer)\b/i.test(nameWithSpaces) ||
      /\b(minimax|h3|ltx|ltxv|anima|krea|cogvideo|hunyuan|mochi|lumina|chroma|auraflow|pixart|cosmos|consisid|omnigen|easycontrol|melbandroformer)\b/i.test(nameLower) ||
      /wan.*video|wan2\.?1|wan_\d/i.test(nameLower) ||
      /flux.*krea/i.test(nameLower) ||
      /minimax.*h3/i.test(nameLower)
    ) {
      return 'diffusion_models';
    }

    if (
      /\b(qwen|quan|llama|mistral|gemma|deepseek|phi)\b/i.test(nameWithSpaces) ||
      /\b(qwen|quan|llama|mistral|gemma|deepseek|phi)\b/i.test(nameLower) ||
      /[-_](qwen|quan|llama|mistral|gemma|deepseek|phi)[-_.]/i.test(nameLower)
    ) {
      return 'LLM';
    }

    // 6. Direct file pattern fallbacks for GGUF, LoRAs, ONNX, Upscalers, Detection, Clip Vision, and Text Encoders
    if (nameLower.endsWith('.gguf')) {
      return 'gguf';
    }

    if (
      /\b(lora|locon|dora|lycoris)\b/i.test(nameLower) ||
      /[-_](r\d{1,4}|rank\d{1,4}|dim\d{1,4})[-_.]/i.test(nameLower)
    ) {
      return 'loras';
    }

    if (nameLower.endsWith('.onnx') || /\b(insightface|antelope|buffalo)\b/i.test(nameLower)) {
      return 'insightface';
    }

    if (
      nameLower.endsWith('.pt') ||
      /\b(yolo|ultralytics|adetailer|afterdetailer|bbox|segm)\b/i.test(nameLower)
    ) {
      return 'ultralytics';
    }

    if (
      nameLower.endsWith('.pth') ||
      /\b(esrgan|swinir|real-esrgan|realesrgan|ultrasharp|supersharp|remacri|skindiff|upscale|hat|dat|omnisr|nmkd)\b/i.test(nameLower) ||
      /\b[1-8]x\b/i.test(nameLower) ||
      /srx\d/i.test(nameLower)
    ) {
      return 'upscale_models';
    }

    if (
      /\b(clip_vision|clip-vision|clipvision|vision_encoder|vit-[ghlb]|clips?[-_]vit|siglip|open_clip)\b/i.test(nameLower) ||
      /clip.*vit/i.test(nameLower) ||
      /clips?[-_]vit/i.test(nameLower) ||
      /clip.*vision/i.test(nameLower)
    ) {
      return 'clip_vision';
    }

    if (
      /\b(text_encoder|textencoder|t5xxl|t5_|t5-|clip_l|clip_g)\b/i.test(nameLower) ||
      /text.*encoder/i.test(nameLower) ||
      /clip.*encoder/i.test(nameLower)
    ) {
      return 'text_encoders';
    }

    // 7. Fallback to modelType folder mapping
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
