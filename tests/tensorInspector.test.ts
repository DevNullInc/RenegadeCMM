import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { tensorInspector } from '../src/services/tensorInspector';

function createMockSafetensorsFile(
  filePath: string,
  tensorKeys: string[],
  metadata: Record<string, string> = {}
): void {
  const headerObj: Record<string, any> = {};
  if (Object.keys(metadata).length > 0) {
    headerObj['__metadata__'] = metadata;
  }
  for (const key of tensorKeys) {
    headerObj[key] = {
      dtype: 'F16',
      shape: [64, 64],
      data_offsets: [0, 8192],
    };
  }

  const headerStr = JSON.stringify(headerObj);
  const headerBuf = Buffer.from(headerStr, 'utf-8');
  const headerLenBuf = Buffer.alloc(8);
  headerLenBuf.writeBigUInt64LE(BigInt(headerBuf.length), 0);

  const fd = fs.openSync(filePath, 'w');
  fs.writeSync(fd, headerLenBuf);
  fs.writeSync(fd, headerBuf);
  // Write a small dummy payload
  fs.writeSync(fd, Buffer.alloc(16));
  fs.closeSync(fd);
}

describe('TensorInspectorService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-tensor-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('accurately classifies LoRA models by tensor keys and metadata', async () => {
    const loraPath = path.join(tempDir, 'sample_lora.safetensors');
    createMockSafetensorsFile(
      loraPath,
      [
        'lora_unet_down_blocks_0_attentions_0_proj_in.lora_down.weight',
        'lora_unet_down_blocks_0_attentions_0_proj_in.lora_up.weight',
      ],
      { ss_network_module: 'networks.lora', ss_base_model_version: 'sd_xl_base_v1-0' }
    );

    const result = await tensorInspector.inspectFile(loraPath);
    expect(result.inspected).toBe(true);
    expect(result.targetFolder).toBe('loras');
    expect(result.detectedType).toBe('LORA');
    expect(result.confidence).toBe('definitive');
  });

  it('accurately classifies ControlNet adapters by control_model keys', async () => {
    const cnPath = path.join(tempDir, 'sample_controlnet.safetensors');
    createMockSafetensorsFile(cnPath, [
      'control_model.input_blocks.0.0.weight',
      'control_model.zero_convs.0.0.weight',
      'controlnet_cond_embedding.conv_in.weight',
    ]);

    const result = await tensorInspector.inspectFile(cnPath);
    expect(result.inspected).toBe(true);
    expect(result.targetFolder).toBe('controlnet');
    expect(result.detectedType).toBe('Controlnet');
    expect(result.confidence).toBe('definitive');
  });

  it('accurately classifies CLIP Vision encoders', async () => {
    const visionPath = path.join(tempDir, 'clips-vit-g.safetensors');
    createMockSafetensorsFile(visionPath, [
      'vision_model.encoder.layers.0.self_attn.q_proj.weight',
      'vision_model.encoder.layers.0.self_attn.k_proj.weight',
      'vision_model.embeddings.patch_embedding.weight',
    ]);

    const result = await tensorInspector.inspectFile(visionPath);
    expect(result.inspected).toBe(true);
    expect(result.targetFolder).toBe('clip_vision');
    expect(result.confidence).toBe('definitive');
  });

  it('accurately classifies standalone Text Encoders (T5 / CLIP)', async () => {
    const textEncPath = path.join(tempDir, 't5xxl_fp16.safetensors');
    createMockSafetensorsFile(textEncPath, [
      'encoder.block.0.layer.0.SelfAttention.q.weight',
      'encoder.block.0.layer.0.SelfAttention.k.weight',
      'shared.weight',
    ]);

    const result = await tensorInspector.inspectFile(textEncPath);
    expect(result.inspected).toBe(true);
    expect(result.targetFolder).toBe('text_encoders');
    expect(result.confidence).toBe('definitive');
  });

  it('accurately classifies standalone VAE models', async () => {
    const vaePath = path.join(tempDir, 'sdxl_vae.safetensors');
    createMockSafetensorsFile(vaePath, [
      'encoder.conv_in.weight',
      'encoder.mid.block_1.conv1.weight',
      'decoder.conv_in.weight',
      'post_quant_conv.weight',
    ]);

    const result = await tensorInspector.inspectFile(vaePath);
    expect(result.inspected).toBe(true);
    expect(result.targetFolder).toBe('vae');
    expect(result.detectedType).toBe('VAE');
    expect(result.confidence).toBe('definitive');
  });

  it('accurately classifies standalone Flux / SD3 DiT diffusion models', async () => {
    const fluxPath = path.join(tempDir, 'flux1-dev.safetensors');
    createMockSafetensorsFile(fluxPath, [
      'double_blocks.0.img_attn.qkv.weight',
      'double_blocks.0.txt_attn.qkv.weight',
      'single_blocks.0.linear1.weight',
      'time_in.in_project.weight',
    ]);

    const result = await tensorInspector.inspectFile(fluxPath);
    expect(result.inspected).toBe(true);
    expect(result.targetFolder).toBe('diffusion_models');
    expect(result.detectedType).toBe('Diffusion Model');
    expect(result.evidence).toContain('Flux DiT');
  });

  it('accurately classifies Super-Resolution / Upscaler models', async () => {
    const upscalerPath = path.join(tempDir, '4x_NMKD_Superscale.safetensors');
    createMockSafetensorsFile(upscalerPath, [
      'conv_first.weight',
      'body.0.rdb1.conv1.weight',
      'conv_last.weight',
      'conv_up1.weight',
    ]);

    const result = await tensorInspector.inspectFile(upscalerPath);
    expect(result.inspected).toBe(true);
    expect(result.targetFolder).toBe('upscale_models');
    expect(result.detectedType).toBe('Upscaler');
  });

  it('accurately classifies complete Checkpoint pipelines with UNet and TextEncoder', async () => {
    const ckptPath = path.join(tempDir, 'sdxl_base.safetensors');
    createMockSafetensorsFile(ckptPath, [
      'model.diffusion_model.input_blocks.0.0.weight',
      'model.diffusion_model.out.2.weight',
      'conditioner.embedders.0.transformer.text_model.encoder.layers.0.self_attn.q_proj.weight',
      'first_stage_model.decoder.conv_in.weight',
    ]);

    const result = await tensorInspector.inspectFile(ckptPath);
    expect(result.inspected).toBe(true);
    expect(result.targetFolder).toBe('checkpoints');
    expect(result.detectedType).toBe('Checkpoint');
  });
});
