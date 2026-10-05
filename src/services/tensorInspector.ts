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
import { ggufParser } from './ggufParser';
import { logger } from '../utils/logger';

export interface TensorInspectionResult {
  inspected: boolean;
  format: 'safetensors' | 'gguf' | 'pickle' | 'unknown';
  detectedType?: string;
  detectedBaseModel?: string;
  targetFolder?: string;
  confidence: 'definitive' | 'high' | 'medium' | 'low';
  evidence: string;
  tensorCount?: number;
  metadata?: Record<string, string>;
}

export class TensorInspectorService {
  /**
   * Performs deep, zero-copy architectural inspection of a model's internal tensor structure and metadata.
   * Reads only header bytes (zero memory overhead) for SafeTensors and GGUF archives.
   */
  public async inspectFile(filePath: string): Promise<TensorInspectionResult> {
    if (!filePath || !fs.existsSync(filePath)) {
      return {
        inspected: false,
        format: 'unknown',
        confidence: 'low',
        evidence: 'File does not exist or inaccessible',
      };
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.gguf') {
      return this.inspectGguf(filePath);
    }

    if (ext === '.safetensors') {
      return this.inspectSafetensors(filePath);
    }

    return {
      inspected: false,
      format: ext === '.pt' || ext === '.ckpt' || ext === '.bin' ? 'pickle' : 'unknown',
      confidence: 'low',
      evidence: `Binary format ${ext} does not expose zero-copy tensor headers`,
    };
  }

  /**
   * Inspects a GGUF file using the GGUF header parser.
   */
  private inspectGguf(filePath: string): TensorInspectionResult {
    try {
      const meta = ggufParser.inspectGGUF(filePath);
      if (!meta.valid) {
        return {
          inspected: false,
          format: 'gguf',
          confidence: 'low',
          evidence: meta.error || 'Invalid GGUF header',
        };
      }

      const arch = (meta.architecture || '').toLowerCase();
      let targetFolder = meta.recommendedFolder || 'gguf';
      let detectedType = 'Other';
      let detectedBaseModel: string | undefined = undefined;

      if (targetFolder === 'diffusion_models') {
        detectedType = 'Diffusion Model';
        detectedBaseModel = arch.toUpperCase();
      } else if (targetFolder === 'LLM') {
        detectedType = 'Other';
        detectedBaseModel = arch.charAt(0).toUpperCase() + arch.slice(1);
      } else if (targetFolder === 'text_encoders') {
        detectedType = 'Other';
        detectedBaseModel = arch.toUpperCase();
      }

      return {
        inspected: true,
        format: 'gguf',
        detectedType,
        detectedBaseModel,
        targetFolder,
        confidence: 'definitive',
        evidence: `GGUF architecture '${meta.architecture}' (${meta.quantization || 'quantized'}) maps to '${targetFolder}'`,
        tensorCount: meta.tensorCount,
      };
    } catch (err: any) {
      logger.warn(`GGUF tensor inspection failed for ${filePath}: ${err.message}`);
      return {
        inspected: false,
        format: 'gguf',
        confidence: 'low',
        evidence: `Inspection error: ${err.message}`,
      };
    }
  }

  /**
   * Inspects SafeTensors header keys and __metadata__ dictionary to authoritatively classify the model.
   */
  private inspectSafetensors(filePath: string): TensorInspectionResult {
    let fd: number | null = null;
    try {
      fd = fs.openSync(filePath, 'r');
      const headerLengthBuf = Buffer.alloc(8);
      const bytesRead = fs.readSync(fd, headerLengthBuf, 0, 8, 0);

      if (bytesRead < 8) {
        return {
          inspected: false,
          format: 'safetensors',
          confidence: 'low',
          evidence: 'File too small for SafeTensors header',
        };
      }

      const headerLength = Number(headerLengthBuf.readBigUInt64LE(0));
      if (headerLength <= 0 || headerLength > 100 * 1024 * 1024) {
        return {
          inspected: false,
          format: 'safetensors',
          confidence: 'low',
          evidence: `Invalid SafeTensors header length: ${headerLength}`,
        };
      }

      const headerBuf = Buffer.alloc(headerLength);
      fs.readSync(fd, headerBuf, 0, headerLength, 8);

      const headerStr = headerBuf.toString('utf-8');
      const headerJson = JSON.parse(headerStr);

      const metadata: Record<string, string> = {};
      const tensorKeys: string[] = [];

      for (const [key, value] of Object.entries(headerJson)) {
        if (key === '__metadata__') {
          if (typeof value === 'object' && value !== null) {
            for (const [mKey, mVal] of Object.entries(value as Record<string, any>)) {
              metadata[mKey] = String(mVal);
            }
          }
          continue;
        }
        tensorKeys.push(key);
      }

      return this.classifySafetensorsTensors(tensorKeys, metadata);
    } catch (err: any) {
      logger.warn(`SafeTensors tensor inspection failed for ${filePath}: ${err.message}`);
      return {
        inspected: false,
        format: 'safetensors',
        confidence: 'low',
        evidence: `Inspection error: ${err.message}`,
      };
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {}
      }
    }
  }

  /**
   * Internal heuristics analyzing the collection of tensor keys and embedded SafeTensors metadata.
   */
  public classifySafetensorsTensors(
    tensorKeys: string[],
    metadata: Record<string, string> = {}
  ): TensorInspectionResult {
    const tensorCount = tensorKeys.length;
    if (tensorCount === 0) {
      return {
        inspected: true,
        format: 'safetensors',
        confidence: 'low',
        evidence: 'Empty SafeTensors archive (0 tensors)',
        metadata,
      };
    }

    // 1. Check Metadata Specifications
    const ssNetworkModule = (metadata['ss_network_module'] || '').toLowerCase();
    const ssBaseModel = metadata['ss_base_model_version'] || metadata['modelspec.architecture'] || metadata['modelspec.title'];
    const modelspecArch = (metadata['modelspec.architecture'] || '').toLowerCase();

    // 2. LoRA / LyCORIS Detection
    const hasLoraKeys = tensorKeys.some((k) =>
      /(?:lora_up|lora_down|lora_unet|lora_te|lycoris|lokr|hada_w|oft_diag|hada_t|lokr_w|diffusers_lora|alpha)/i.test(k)
    );
    const isLoraModule =
      ssNetworkModule.includes('lora') ||
      ssNetworkModule.includes('lycoris') ||
      ssNetworkModule.includes('locon') ||
      ssNetworkModule.includes('loha') ||
      ssNetworkModule.includes('oft') ||
      modelspecArch.includes('lora');

    if (hasLoraKeys || isLoraModule) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'LORA',
        detectedBaseModel: ssBaseModel,
        targetFolder: 'loras',
        confidence: 'definitive',
        evidence: `LoRA/LyCORIS tensor keys detected (${tensorCount} tensors, module: ${ssNetworkModule || 'standard'})`,
        tensorCount,
        metadata,
      };
    }

    // 3. ControlNet Detection
    const hasControlNetKeys = tensorKeys.some((k) =>
      /(?:control_model|controlnet_cond_embedding|input_hint_block|zero_convs|middle_block_out|control_add)/i.test(k)
    );
    if (hasControlNetKeys || modelspecArch.includes('controlnet')) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'Controlnet',
        detectedBaseModel: ssBaseModel,
        targetFolder: 'controlnet',
        confidence: 'definitive',
        evidence: `ControlNet adapter tensor architecture detected (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    // 4. CLIP Vision / Vision Tower / DINO Detection
    const hasVisionKeys = tensorKeys.some((k) =>
      /(?:vision_model|vision_tower|visual\.transformer|vision_model\.encoder|image_encoder|visual_proj|patch_embed|cls_token|pos_embed|dinov?\d?|vit[-_])/i.test(k)
    );
    const hasOnlyVision =
      hasVisionKeys &&
      !tensorKeys.some((k) => /(?:diffusion_model|double_blocks|joint_blocks|model\.layers|decoder\.conv_in)/i.test(k));

    if (hasOnlyVision) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'Other',
        targetFolder: 'clip_vision',
        confidence: 'definitive',
        evidence: `CLIP Vision / Image Encoder tensor keys detected (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    // 5. Standalone Text Encoder (T5 / CLIP-L / CLIP-G / BERT) Detection
    const hasTextEncoderKeys = tensorKeys.some((k) =>
      /(?:text_model\.encoder|transformer\.text_model|encoder\.block\.\d+|shared\.weight|text_projection|cond_stage_model\.transformer)/i.test(k)
    );
    const hasDiffusionKeys = tensorKeys.some((k) =>
      /(?:diffusion_model|double_blocks|single_blocks|joint_blocks|transformer_blocks|input_blocks|out\.2\.weight|time_in\.in_project)/i.test(k)
    );
    const hasVaeKeys = tensorKeys.some((k) =>
      /(?:encoder\.conv_in|decoder\.conv_in|decoder\.mid\.block|post_quant_conv|quant_conv|decoder\.up_blocks|encoder\.down_blocks|model\.encoder|model\.decoder)/i.test(k)
    );

    if (hasTextEncoderKeys && !hasDiffusionKeys && !hasVaeKeys) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'Other',
        targetFolder: 'text_encoders',
        confidence: 'definitive',
        evidence: `Text Encoder (CLIP/T5) tensor architecture detected without diffusion weights (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    // 6. Standalone VAE / Autoencoder Detection (including 3D Video VAEs)
    if (hasVaeKeys && !hasDiffusionKeys && !hasTextEncoderKeys) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'VAE',
        targetFolder: 'vae',
        confidence: 'definitive',
        evidence: `VAE / Autoencoder encoder & decoder tensor blocks detected (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    // 7. IP-Adapter / FaceID Detection
    const hasIpAdapterKeys = tensorKeys.some((k) =>
      /(?:ip_adapter|image_proj|latents|adapter_modules)/i.test(k)
    );
    if (hasIpAdapterKeys) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'Other',
        targetFolder: 'ipadapter',
        confidence: 'high',
        evidence: `IP-Adapter feature projection tensors detected (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    // 8. Upscaler Detection (ESRGAN, HAT, DAT, SwinIR, RealESRGAN)
    const hasUpscalerKeys = tensorKeys.some((k) =>
      /(?:conv_first|body\.\d+\.rdb|conv_last|conv_up\d+|RRDB|conv_hr|rcab|rfdn)/i.test(k)
    );
    if (hasUpscalerKeys && !hasDiffusionKeys && !hasTextEncoderKeys && !hasVisionKeys) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'Upscaler',
        targetFolder: 'upscale_models',
        confidence: 'definitive',
        evidence: `Neural Super-Resolution / Upscaler tensor layers detected (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    // 9. LLM / Transformer Language Model Detection
    const hasLlmKeys = tensorKeys.some((k) =>
      /(?:model\.layers\.\d+|lm_head\.weight|model\.embed_tokens|transformer\.h\.\d+)/i.test(k)
    );
    if (hasLlmKeys && !hasDiffusionKeys) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'Other',
        targetFolder: 'LLM',
        confidence: 'high',
        evidence: `LLM autoregressive transformer architecture detected (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    // 10. Standalone Diffusion Transformer / UNet (Flux, SD3, SDXL UNet, Wan, Hunyuan, CogVideo, Anima)
    const isStandaloneDiffusion = hasDiffusionKeys && !hasTextEncoderKeys && !hasVaeKeys;
    const hasDitBlocks = tensorKeys.some((k) =>
      /(?:double_blocks\.\d+|single_blocks\.\d+|joint_blocks\.\d+|transformer_blocks\.\d+)/i.test(k)
    );

    if (isStandaloneDiffusion || hasDitBlocks) {
      let archName = 'Diffusion Transformer / UNet';
      const hasDoubleBlocks = tensorKeys.some((k) => k.includes('double_blocks'));
      const hasSingleBlocks = tensorKeys.some((k) => k.includes('single_blocks'));
      const hasJointBlocks = tensorKeys.some((k) => k.includes('joint_blocks'));

      if (hasDoubleBlocks && hasSingleBlocks) {
        archName = 'Flux DiT';
      } else if (hasJointBlocks) {
        archName = 'Hunyuan DiT';
      } else if (hasDoubleBlocks) {
        archName = 'SD3 DiT';
      }

      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'Diffusion Model',
        detectedBaseModel: ssBaseModel,
        targetFolder: 'diffusion_models',
        confidence: 'definitive',
        evidence: `Standalone ${archName} diffusion architecture detected (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    // 11. Full Checkpoint Pipeline (Diffusion UNet + Text Encoder and/or VAE bundled)
    if (hasDiffusionKeys) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'Checkpoint',
        detectedBaseModel: ssBaseModel,
        targetFolder: 'checkpoints',
        confidence: 'high',
        evidence: `Complete generator pipeline (UNet + TextEncoder/VAE) detected (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    // 12. Textual Inversion / Embedding (Small tensor count or embedding vectors)
    if (tensorCount <= 10 && (tensorKeys.some((k) => /emb_params|string_to_param|<.*>/i.test(k)) || tensorCount === 1)) {
      return {
        inspected: true,
        format: 'safetensors',
        detectedType: 'TextualInversion',
        targetFolder: 'embeddings',
        confidence: 'high',
        evidence: `Textual inversion embedding vector dictionary detected (${tensorCount} tensors)`,
        tensorCount,
        metadata,
      };
    }

    return {
      inspected: true,
      format: 'safetensors',
      confidence: 'low',
      evidence: `Uncategorized SafeTensors architecture (${tensorCount} tensors)`,
      tensorCount,
      metadata,
    };
  }
}

export const tensorInspector = new TensorInspectorService();
