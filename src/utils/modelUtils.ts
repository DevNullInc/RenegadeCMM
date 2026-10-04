/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * Licensed under the Business Source License 1.1 (BUSL-1.1).
 */

import { ModelType } from '../types/civitai';

const SUBTYPE_PATTERNS: Array<{ key: string; regex: RegExp }> = [
  { key: 'anytest', regex: /\b(anytest|any test)\b/i },
  { key: 'openpose', regex: /\b(openpose|open pose|pose)\b/i },
  { key: 'canny', regex: /\b(canny)\b/i },
  { key: 'depth', regex: /\b(depth|midas|zoe|marigold)\b/i },
  { key: 'lineart', regex: /\b(lineart|line art|anime lineart)\b/i },
  { key: 'normal', regex: /\b(normal|normalbae|surface normal)\b/i },
  { key: 'segment', regex: /\b(segment|seg|segmentation|ade20k|sam)\b/i },
  { key: 'softedge', regex: /\b(softedge|soft edge|hed|pidinet|teed)\b/i },
  { key: 'scribble', regex: /\b(scribble|sketch)\b/i },
  { key: 'mlsd', regex: /\b(mlsd|m lsd|mlsdv\d*)\b/i },
  { key: 'inpaint', regex: /\b(inpaint|inpainting)\b/i },
  { key: 'ip-adapter', regex: /\b(ip adapter|ipadapter|instantid)\b/i },
  { key: 't2i-adapter', regex: /\b(t2i adapter|t2iadapter)\b/i },
  { key: 'tile', regex: /\b(tile|blur)\b/i },
  { key: 'recolor', regex: /\b(recolor|color)\b/i },
  { key: 'qrcode', regex: /\b(qrcode|qr code|pattern)\b/i },
  { key: 'face', regex: /\b(face|faceid|pulid|reactor)\b/i },
];

/**
 * Extracts specific ControlNet, adapter, or model flavor sub-types.
 */
export function extractSubType(versionName?: string, fileName?: string): string {
  const raw = `${versionName || ''} ${fileName || ''}`.toLowerCase();
  const str = raw.replace(/[-_.]/g, ' ');
  for (const { key, regex } of SUBTYPE_PATTERNS) {
    if (regex.test(str) || regex.test(raw)) {
      return key;
    }
  }
  return '';
}

/**
 * Normalizes base model names / architecture variants for intelligent matching.
 * e.g., 'Anima', 'Pony', 'Illustrious', 'SDXL', 'Flux', 'SD 1.5', etc.
 */
export function normalizeBaseModel(baseModel?: string, versionName?: string): string {
  const str = `${baseModel || ''} ${versionName || ''}`.toLowerCase();

  // Specific known architectures / ecosystems
  if (str.includes('illustrious') || str.includes('il-xl') || str.includes('ill-xl')) return 'illustrious';
  if (str.includes('anima')) return 'anima';
  if (str.includes('noob') || str.includes('noobai')) return 'noobai';
  if (str.includes('pony') || str.includes('pdxl')) return 'pony';
  if (str.includes('flux')) return 'flux';
  if (str.includes('sdxl') || str.includes('xl 1.0') || str.includes('sd xl')) return 'sdxl';
  if (str.includes('sd 1.5') || str.includes('sd1.5') || str.includes('v1-5') || str.includes('v1.5')) return 'sd15';
  if (str.includes('sd 2.1') || str.includes('sd2.1') || str.includes('sd 2.0') || str.includes('sd2.0')) return 'sd2';
  if (str.includes('sd 3.5') || str.includes('sd3.5') || str.includes('sd 3') || str.includes('sd3')) return 'sd3';
  if (str.includes('hunyuan') || str.includes('hy-video')) return 'hunyuan';
  if (str.includes('wan2') || str.includes('wan 2') || str.includes('wan')) return 'wan';
  if (str.includes('cogvideo') || str.includes('cog')) return 'cogvideo';
  if (str.includes('ltxv') || str.includes('ltx')) return 'ltxv';
  if (str.includes('mochi')) return 'mochi';
  if (str.includes('pixart')) return 'pixart';
  if (str.includes('auraflow')) return 'auraflow';
  if (str.includes('lumina')) return 'lumina';
  if (str.includes('krea')) return 'krea';
  if (str.includes('qwen')) return 'qwen';
  if (str.includes('llama')) return 'llama';
  if (str.includes('mistral')) return 'mistral';
  if (str.includes('gemma')) return 'gemma';
  if (str.includes('deepseek')) return 'deepseek';

  // Fallback: sanitized baseModel string if present
  if (baseModel && baseModel.trim()) {
    const cleaned = baseModel.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleaned) return cleaned;
  }

  return 'unknown';
}

export interface ModelFlavor {
  baseArch: string;
  subType: string;
}

/**
 * Extracts both base architecture and model flavor/sub-type from metadata.
 */
export function extractModelFlavor(baseModel?: string, versionName?: string, fileName?: string): ModelFlavor {
  return {
    baseArch: normalizeBaseModel(baseModel, versionName),
    subType: extractSubType(versionName, fileName),
  };
}

/**
 * Determines whether two model versions belong to the exact same base architecture and sub-type family.
 */
export function isFlavorMatch(flavorA: ModelFlavor, flavorB: ModelFlavor): boolean {
  // 1. Architecture check
  if (flavorA.baseArch !== 'unknown' && flavorB.baseArch !== 'unknown') {
    if (flavorA.baseArch !== flavorB.baseArch) return false;
  }

  // 2. Sub-type / Tool check (e.g. canny vs depth vs openpose vs anytest)
  if (flavorA.subType !== '' || flavorB.subType !== '') {
    if (flavorA.subType !== flavorB.subType) return false;
  }

  return true;
}

/**
 * Legacy/simple architecture comparison.
 */
export function isArchitectureMatch(archA: string, archB: string): boolean {
  if (archA === 'unknown' || archB === 'unknown') {
    return archA === archB;
  }
  return archA === archB;
}

/**
 * Intelligently resolves the true ModelType even if CivitAI API mislabeled it as Checkpoint or Other.
 */
export function resolveEffectiveModelType(
  rawType?: ModelType | string,
  modelName?: string,
  versionNames?: Array<string | { name?: string }>
): ModelType {
  const versionsJoined = versionNames
    ? versionNames.map((v) => (typeof v === 'string' ? v : v?.name || '')).join(' ')
    : '';
  const fullText = `${rawType || ''} ${modelName || ''} ${versionsJoined}`.toLowerCase();

  // ControlNet / Adapters
  if (
    fullText.includes('controlnet') ||
    fullText.includes('control-net') ||
    fullText.includes('control net') ||
    fullText.includes('cnxl') ||
    fullText.includes('t2i-adapter') ||
    fullText.includes('ip-adapter') ||
    (SUBTYPE_PATTERNS.some(({ regex }) => regex.test(fullText)) && (fullText.includes('control') || fullText.includes('adapter')))
  ) {
    return 'Controlnet';
  }

  // LoRA / LyCORIS / LoCon / DoRA
  if (
    fullText.includes('lora') ||
    fullText.includes('locon') ||
    fullText.includes('dora') ||
    fullText.includes('lycoris')
  ) {
    if (rawType === 'LoCon') return 'LoCon';
    if (rawType === 'DoRA') return 'DoRA';
    return 'LORA';
  }

  // Textual Inversion / Embeddings
  if (
    fullText.includes('embedding') ||
    fullText.includes('textualinversion') ||
    fullText.includes('textual inversion')
  ) {
    return 'TextualInversion';
  }

  // VAE
  if (fullText.includes('vae') && !fullText.includes('checkpoint')) {
    return 'VAE';
  }

  // Upscalers
  if (fullText.includes('upscaler') || fullText.includes('esrgan') || fullText.includes('upscale')) {
    return 'Upscaler';
  }

  // Hypernetworks
  if (fullText.includes('hypernetwork')) {
    return 'Hypernetwork';
  }

  // Motion Modules / AnimateDiff
  if (fullText.includes('motionmodule') || fullText.includes('animatediff')) {
    return 'MotionModule';
  }

  // Wildcards
  if (fullText.includes('wildcard')) {
    return 'Wildcards';
  }

  // Poses
  if (fullText.includes('pose') && !fullText.includes('openpose') && !fullText.includes('controlnet')) {
    return 'Poses';
  }

  if (rawType && rawType !== 'Other') {
    return rawType as ModelType;
  }

  return 'Checkpoint';
}
