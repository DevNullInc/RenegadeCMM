import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { librarySorter } from '../src/services/librarySorter';
import { dbManager } from '../src/db/db';

describe('LibrarySorterService', () => {
  let tempDir: string;
  let checkpointsDir: string;
  let controlnetDir: string;
  let diffusionDir: string;
  let llmDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-sort-test-'));
    const modelsDir = path.join(tempDir, 'models');
    checkpointsDir = path.join(modelsDir, 'checkpoints');
    controlnetDir = path.join(modelsDir, 'controlnet');
    diffusionDir = path.join(modelsDir, 'diffusion_models');
    llmDir = path.join(modelsDir, 'LLM');

    fs.mkdirSync(checkpointsDir, { recursive: true });
    fs.mkdirSync(controlnetDir, { recursive: true });
    fs.mkdirSync(diffusionDir, { recursive: true });
    fs.mkdirSync(llmDir, { recursive: true });

    await dbManager.init(':memory:');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('correctly flags misplaced ControlNet models sitting in the checkpoints directory', async () => {
    const controlnetFile = path.join(checkpointsDir, 'bdsqlsz-canny.safetensors');
    fs.writeFileSync(controlnetFile, 'fake model data');

    const testModels: any[] = [
      {
        id: 'cn-1',
        filePath: controlnetFile,
        fileName: 'bdsqlsz-canny.safetensors',
        modelType: 'Checkpoint',
        civitaiName: 'ControlNetXL (CNXL)',
        civitaiModelType: 'Checkpoint',
        civitaiBaseModel: 'SDXL 1.0',
        civitaiVersionName: 'bdsqlsz-canny',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.totalModels).toBe(1);
    expect(plan.misplacedCount).toBe(1);
    expect(plan.items.length).toBe(1);

    const item = plan.items[0];
    expect(item.id).toBe('cn-1');
    expect(item.currentFolder).toBe('checkpoints');
    expect(item.targetFolder).toBe('controlnet');
    expect(item.resolvedType).toBe('Controlnet');
    expect(item.targetPath).toBe(path.join(controlnetDir, 'bdsqlsz-canny.safetensors'));
  });

  it('correctly flags misplaced Anima diffusion models sitting in the checkpoints directory', async () => {
    const animaFile = path.join(checkpointsDir, 'anima-pencil-xl-v1.0.safetensors');
    fs.writeFileSync(animaFile, 'fake anima model data');

    const testModels: any[] = [
      {
        id: 'anima-1',
        filePath: animaFile,
        fileName: 'anima-pencil-xl-v1.0.safetensors',
        modelType: 'Checkpoint',
        civitaiName: 'Anima Pencil XL',
        civitaiModelType: 'Checkpoint',
        civitaiBaseModel: 'Anima',
        civitaiVersionName: 'v1.0',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.misplacedCount).toBe(1);
    const item = plan.items[0];
    expect(item.currentFolder).toBe('checkpoints');
    expect(item.targetFolder).toBe('diffusion_models');
    expect(item.targetPath).toBe(path.join(diffusionDir, 'anima-pencil-xl-v1.0.safetensors'));
  });

  it('correctly flags misplaced Qwen / Quan LLM models sitting in the checkpoints directory', async () => {
    const qwenFile = path.join(checkpointsDir, 'qwen2.5-coder-7b.gguf');
    fs.writeFileSync(qwenFile, 'fake qwen model data');

    const testModels: any[] = [
      {
        id: 'qwen-1',
        filePath: qwenFile,
        fileName: 'qwen2.5-coder-7b.gguf',
        modelType: 'Other',
        civitaiName: 'Qwen 2.5 Coder',
        civitaiBaseModel: 'Qwen',
        civitaiVersionName: '7B',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.misplacedCount).toBe(1);
    const item = plan.items[0];
    expect(item.currentFolder).toBe('checkpoints');
    expect(item.targetFolder).toBe('LLM');
    expect(item.targetPath).toBe(path.join(llmDir, 'qwen2.5-coder-7b.gguf'));
  });

  it('does NOT flag properly placed Checkpoints in the checkpoints directory', async () => {
    const juggernautFile = path.join(checkpointsDir, 'juggernautXL_v9.safetensors');
    fs.writeFileSync(juggernautFile, 'fake juggernaut model data');

    const testModels: any[] = [
      {
        id: 'chk-1',
        filePath: juggernautFile,
        fileName: 'juggernautXL_v9.safetensors',
        modelType: 'Checkpoint',
        civitaiName: 'Juggernaut XL',
        civitaiBaseModel: 'SDXL 1.0',
        civitaiVersionName: 'v9',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.totalModels).toBe(1);
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(1);
  });

  it('executes sort relocation and moves model along with its companion files', async () => {
    const modelSrc = path.join(checkpointsDir, 'bdsqlsz-canny.safetensors');
    const previewSrc = path.join(checkpointsDir, 'bdsqlsz-canny.preview.png');
    const infoSrc = path.join(checkpointsDir, 'bdsqlsz-canny.civitai.info');

    fs.writeFileSync(modelSrc, 'model bytes');
    fs.writeFileSync(previewSrc, 'png bytes');
    fs.writeFileSync(infoSrc, '{"id": 123}');

    const modelDst = path.join(controlnetDir, 'bdsqlsz-canny.safetensors');
    const previewDst = path.join(controlnetDir, 'bdsqlsz-canny.preview.png');
    const infoDst = path.join(controlnetDir, 'bdsqlsz-canny.civitai.info');

    // Mock dbManager.run
    const dbSpy = vi.spyOn(dbManager, 'run').mockResolvedValue({} as any);

    const result = await librarySorter.executeSort([
      {
        modelId: 'cn-test',
        sourcePath: modelSrc,
        targetPath: modelDst,
      },
    ]);

    expect(result.success).toBe(true);
    expect(result.movedCount).toBe(1);
    expect(fs.existsSync(modelDst)).toBe(true);
    expect(fs.existsSync(previewDst)).toBe(true);
    expect(fs.existsSync(infoDst)).toBe(true);
    expect(fs.existsSync(modelSrc)).toBe(false);

    expect(dbSpy).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE local_models SET file_path = ?'),
      expect.arrayContaining([modelDst, expect.any(Number), 'cn-test'])
    );
    dbSpy.mockRestore();
  });

  it('does NOT flag properly placed models in alias directories (Lora, ESRGAN, antelopev2, TextEncoders)', async () => {
    const loraDir = path.join(tempDir, 'models', 'Lora');
    const esrganDir = path.join(tempDir, 'models', 'ESRGAN');
    const antelopeDir = path.join(tempDir, 'models', 'antelopev2');
    const textEncodersDir = path.join(tempDir, 'models', 'TextEncoders');

    fs.mkdirSync(loraDir, { recursive: true });
    fs.mkdirSync(esrganDir, { recursive: true });
    fs.mkdirSync(antelopeDir, { recursive: true });
    fs.mkdirSync(textEncodersDir, { recursive: true });

    const loraFile = path.join(loraDir, 'anime_style.safetensors');
    const esrganFile = path.join(esrganDir, '1x-ITF-SkinDiffDetail-Lite-v1.pth');
    const antelopeFile = path.join(antelopeDir, '1k3d68.onnx');
    const textEncFile = path.join(textEncodersDir, '10Eros_v1.4_text_encoder.safetensors');

    fs.writeFileSync(loraFile, 'lora');
    fs.writeFileSync(esrganFile, 'upscaler');
    fs.writeFileSync(antelopeFile, 'onnx');
    fs.writeFileSync(textEncFile, 'text encoder');

    const testModels: any[] = [
      {
        id: 'lora-1',
        filePath: loraFile,
        fileName: 'anime_style.safetensors',
        modelType: 'LORA',
      },
      {
        id: 'esrgan-1',
        filePath: esrganFile,
        fileName: '1x-ITF-SkinDiffDetail-Lite-v1.pth',
        modelType: 'Other',
      },
      {
        id: 'antelope-1',
        filePath: antelopeFile,
        fileName: '1k3d68.onnx',
        modelType: 'Other',
      },
      {
        id: 'textenc-1',
        filePath: textEncFile,
        fileName: '10Eros_v1.4_text_encoder.safetensors',
        modelType: 'Other',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.totalModels).toBe(4);
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(4);
  });

  it('correctly handles JoyAI-Echo_r256, HAT_SRx4, and Qwen GGUF without false checkpoint moves', async () => {
    const loraDir = path.join(tempDir, 'models', 'Lora');
    const esrganDir = path.join(tempDir, 'models', 'ESRGAN');
    const ggufDir = path.join(tempDir, 'models', 'GGUF');

    fs.mkdirSync(loraDir, { recursive: true });
    fs.mkdirSync(esrganDir, { recursive: true });
    fs.mkdirSync(ggufDir, { recursive: true });

    const joyAiFile = path.join(loraDir, 'JoyAI-Echo_r256.safetensors');
    const hatFile = path.join(esrganDir, 'HAT_SRx4_ImageNet-pretrain.pth');
    const qwenGgufFile = path.join(ggufDir, 'Goekdeniz-Guelmez.Josiefied-Qwen3-4B-Instruct-2507-gabli.gguf');

    fs.writeFileSync(joyAiFile, 'joy ai lora');
    fs.writeFileSync(hatFile, 'hat upscaler');
    fs.writeFileSync(qwenGgufFile, 'qwen gguf');

    const testModels: any[] = [
      {
        id: 'joy-1',
        filePath: joyAiFile,
        fileName: 'JoyAI-Echo_r256.safetensors',
        modelType: 'Other',
      },
      {
        id: 'hat-1',
        filePath: hatFile,
        fileName: 'HAT_SRx4_ImageNet-pretrain.pth',
        modelType: 'Other',
      },
      {
        id: 'qwen-gguf-1',
        filePath: qwenGgufFile,
        fileName: 'Goekdeniz-Guelmez.Josiefied-Qwen3-4B-Instruct-2507-gabli.gguf',
        modelType: 'Other',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.totalModels).toBe(3);
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(3);
  });

  it('uses chain of custody from companion .civitai.info / .json to correctly identify type and folder', async () => {
    const loraDir = path.join(tempDir, 'models', 'Lora');
    fs.mkdirSync(loraDir, { recursive: true });

    const genericModelFile = path.join(loraDir, 'mysterious_style_v1.safetensors');
    const companionJson = path.join(loraDir, 'mysterious_style_v1.civitai.info');

    fs.writeFileSync(genericModelFile, 'weights');
    fs.writeFileSync(companionJson, JSON.stringify({
      id: 999999,
      model: {
        type: 'LORA',
        name: 'Mysterious Style',
      },
      baseModel: 'Pony',
    }));

    const testModels: any[] = [
      {
        id: 'custody-1',
        filePath: genericModelFile,
        fileName: 'mysterious_style_v1.safetensors',
        modelType: 'Other',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.totalModels).toBe(1);
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(1);
  });

  it('allows ignoring a misplaced model so it is excluded from sorting analysis', async () => {
    const checkpointsDir = path.join(tempDir, 'models', 'checkpoints');
    fs.mkdirSync(checkpointsDir, { recursive: true });

    const specialNodeModel = path.join(checkpointsDir, 'custom_node_weight.safetensors');
    fs.writeFileSync(specialNodeModel, 'custom');

    const testModels: any[] = [
      {
        id: 'special-node-1',
        filePath: specialNodeModel,
        fileName: 'custom_node_weight.safetensors',
        modelType: 'Controlnet',
        civitaiType: 'Controlnet',
        isMatched: true,
      },
    ];

    // Initial analysis should flag it
    const planBefore = await librarySorter.analyzeLibrary({ models: testModels });
    expect(planBefore.misplacedCount).toBe(1);

    // Ignore the model
    await librarySorter.ignoreSortModel('special-node-1', specialNodeModel, 'custom_node_weight.safetensors');

    const ignoredList = await librarySorter.getIgnoredSortModels();
    expect(ignoredList.some((i) => i.modelId === 'special-node-1')).toBe(true);

    // Re-analyzing should now exclude it completely
    const planAfter = await librarySorter.analyzeLibrary({ models: testModels });
    expect(planAfter.misplacedCount).toBe(0);
    expect(planAfter.items.length).toBe(0);

    // Unignore it
    await librarySorter.unignoreSortModel('special-node-1');
    const planUnignored = await librarySorter.analyzeLibrary({ models: testModels });
    expect(planUnignored.misplacedCount).toBe(1);

    // Clean up
    await librarySorter.clearIgnoredSortModels();
  });

  it('completely ignores models in non-standard / custom node folders (whitelist enforcement)', async () => {
    const kgenDir = path.join(tempDir, 'models', 'kgen');
    const tipoDir = path.join(tempDir, 'models', 'TIPO');
    fs.mkdirSync(kgenDir, { recursive: true });
    fs.mkdirSync(tipoDir, { recursive: true });

    const kgenFile = path.join(kgenDir, 'kgen_node_weights.safetensors');
    const tipoFile = path.join(tipoDir, 'tipo_extension.safetensors');
    fs.writeFileSync(kgenFile, 'kgen weights');
    fs.writeFileSync(tipoFile, 'tipo weights');

    const testModels: any[] = [
      {
        id: 'kgen-1',
        filePath: kgenFile,
        fileName: 'kgen_node_weights.safetensors',
        modelType: 'Other',
      },
      {
        id: 'tipo-1',
        filePath: tipoFile,
        fileName: 'tipo_extension.safetensors',
        modelType: 'Other',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    // Non-standard folders are ignored completely by the sorter
    expect(plan.misplacedCount).toBe(0);
    expect(plan.items.length).toBe(0);
  });

  it('preserves subfolder hierarchy and does NOT flag models in standard subdirectories (e.g. diffusion_models/Animas)', async () => {
    const animasDir = path.join(diffusionDir, 'Animas');
    fs.mkdirSync(animasDir, { recursive: true });

    const animacyFile = path.join(animasDir, 'The Animacy ANIMA V2 0 base.safetensors');
    fs.writeFileSync(animacyFile, 'animacy weights');

    const testModels: any[] = [
      {
        id: 'animacy-1',
        filePath: animacyFile,
        fileName: 'The Animacy ANIMA V2 0 base.safetensors',
        modelType: 'Diffusion Model',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.totalModels).toBe(1);
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(1);
  });

  it('correctly keeps clips-vit-g.safetensors in clip_vision without moving to checkpoints', async () => {
    const clipVisionDir = path.join(tempDir, 'models', 'clip_vision');
    fs.mkdirSync(clipVisionDir, { recursive: true });

    const clipVisionFile = path.join(clipVisionDir, 'clips-vit-g.safetensors');
    fs.writeFileSync(clipVisionFile, 'clip vision weights');

    const testModels: any[] = [
      {
        id: 'clip-1',
        filePath: clipVisionFile,
        fileName: 'clips-vit-g.safetensors',
        modelType: 'Other',
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.totalModels).toBe(1);
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(1);
  });

  it('uses tensor inspector to verify unknown files belong in their folder according to internal tensors', async () => {
    const loraDir = path.join(tempDir, 'models', 'loras');
    fs.mkdirSync(loraDir, { recursive: true });

    // Create a mock safetensors file with obscure name but genuine LoRA tensors inside
    const mysteryLoraFile = path.join(loraDir, 'custom_node_export_9981.safetensors');
    const headerObj: Record<string, any> = {
      'lora_unet_down_blocks_0_attentions_0_proj_in.lora_down.weight': {
        dtype: 'F16',
        shape: [32, 32],
        data_offsets: [0, 2048],
      },
      'lora_unet_down_blocks_0_attentions_0_proj_in.lora_up.weight': {
        dtype: 'F16',
        shape: [32, 32],
        data_offsets: [2048, 4096],
      },
    };
    const headerStr = JSON.stringify(headerObj);
    const headerBuf = Buffer.from(headerStr, 'utf-8');
    const headerLenBuf = Buffer.alloc(8);
    headerLenBuf.writeBigUInt64LE(BigInt(headerBuf.length), 0);

    const fd = fs.openSync(mysteryLoraFile, 'w');
    fs.writeSync(fd, headerLenBuf);
    fs.writeSync(fd, headerBuf);
    fs.writeSync(fd, Buffer.alloc(16));
    fs.closeSync(fd);

    const testModels: any[] = [
      {
        id: 'mystery-1',
        filePath: mysteryLoraFile,
        fileName: 'custom_node_export_9981.safetensors',
        modelType: 'Other', // Unknown type and uninformative name
        isMatched: false,
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    // Tensor inspection proves it has LoRA tensors, so it belongs in loras/ and is NOT flagged as misplaced!
    expect(plan.totalModels).toBe(1);
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(1);
  });

  it('uses tensor inspector to accurately identify misplaced ControlNet with tensor evidence', async () => {
    const checkpointsDir = path.join(tempDir, 'models', 'checkpoints');
    fs.mkdirSync(checkpointsDir, { recursive: true });

    // File in checkpoints with obscure name but ControlNet tensors
    const obscureCnFile = path.join(checkpointsDir, 'obscure_adapter_001.safetensors');
    const headerObj: Record<string, any> = {
      'control_model.input_blocks.0.0.weight': {
        dtype: 'F16',
        shape: [32, 32],
        data_offsets: [0, 2048],
      },
      'control_model.zero_convs.0.0.weight': {
        dtype: 'F16',
        shape: [32, 32],
        data_offsets: [2048, 4096],
      },
    };
    const headerStr = JSON.stringify(headerObj);
    const headerBuf = Buffer.from(headerStr, 'utf-8');
    const headerLenBuf = Buffer.alloc(8);
    headerLenBuf.writeBigUInt64LE(BigInt(headerBuf.length), 0);

    const fd = fs.openSync(obscureCnFile, 'w');
    fs.writeSync(fd, headerLenBuf);
    fs.writeSync(fd, headerBuf);
    fs.writeSync(fd, Buffer.alloc(16));
    fs.closeSync(fd);

    const testModels: any[] = [
      {
        id: 'obscure-cn-1',
        filePath: obscureCnFile,
        fileName: 'obscure_adapter_001.safetensors',
        modelType: 'Other',
        isMatched: false,
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });

    expect(plan.misplacedCount).toBe(1);
    const item = plan.items[0];
    expect(item.targetFolder).toBe('controlnet');
    expect(item.resolvedType).toBe('Controlnet');
    expect(item.reason).toContain('ControlNet adapter tensor architecture detected');
  });

  it('keeps Wan2_1_VAE_fp32 in vae folder and does not relocate to checkpoints', async () => {
    const vaeDir = path.join(tempDir, 'models', 'vae');
    fs.mkdirSync(vaeDir, { recursive: true });

    const vaeFile = path.join(vaeDir, 'Wan2_1_VAE_fp32.safetensors');
    fs.writeFileSync(vaeFile, 'wan vae data');

    const testModels: any[] = [
      {
        id: 'wan-vae-1',
        filePath: vaeFile,
        fileName: 'Wan2_1_VAE_fp32.safetensors',
        modelType: 'Checkpoint',
        civitaiName: 'Wan 2.1 Video VAE',
        isMatched: true,
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(1);
  });

  it('keeps anima-lllite-inpainting in ControlNet folder and does not relocate to diffusion_models', async () => {
    const cnDir = path.join(tempDir, 'models', 'ControlNet');
    fs.mkdirSync(cnDir, { recursive: true });

    const inpaintFile = path.join(cnDir, 'anima-lllite-inpainting-v2.safetensors');
    fs.writeFileSync(inpaintFile, 'inpaint data');

    const testModels: any[] = [
      {
        id: 'inpaint-1',
        filePath: inpaintFile,
        fileName: 'anima-lllite-inpainting-v2.safetensors',
        modelType: 'Other',
        isMatched: false,
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(1);
  });

  it('keeps darkUrgeAnima in diffusion_models/Anima and does not force move to checkpoints', async () => {
    const animaDir = path.join(diffusionDir, 'Anima');
    fs.mkdirSync(animaDir, { recursive: true });

    const animaModelFile = path.join(animaDir, 'darkUrgeAnima_v2029B.safetensors');
    fs.writeFileSync(animaModelFile, 'anima diffusion model data');

    const testModels: any[] = [
      {
        id: 'dark-urge-1',
        filePath: animaModelFile,
        fileName: 'darkUrgeAnima_v2029B.safetensors',
        modelType: 'Checkpoint',
        civitaiName: 'Dark Urge Anima',
        civitaiBaseModel: 'Anima',
        isMatched: true,
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(1);
  });

  it('keeps dino_v3_vit_h in clip_vision and does not relocate to upscale_models', async () => {
    const clipVisionDir = path.join(tempDir, 'models', 'clip_vision');
    fs.mkdirSync(clipVisionDir, { recursive: true });

    const dinoFile = path.join(clipVisionDir, 'dino_v3_vit_h.safetensors');
    fs.writeFileSync(dinoFile, 'dino vit data');

    const testModels: any[] = [
      {
        id: 'dino-1',
        filePath: dinoFile,
        fileName: 'dino_v3_vit_h.safetensors',
        modelType: 'Other',
        isMatched: false,
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(1);
  });

  it('keeps ip-adapter-faceid models in ipadapter folder and does not relocate to controlnet', async () => {
    const ipadapterDir = path.join(tempDir, 'models', 'IpAdapter');
    fs.mkdirSync(ipadapterDir, { recursive: true });

    const ipAdapterFile1 = path.join(ipadapterDir, 'ip-adapter-faceid-plusv2_sd15.bin');
    const ipAdapterFile2 = path.join(ipadapterDir, 'ip-adapter-faceid-plusv2_sdxl.bin');
    fs.writeFileSync(ipAdapterFile1, 'ip adapter data 1');
    fs.writeFileSync(ipAdapterFile2, 'ip adapter data 2');

    const testModels: any[] = [
      {
        id: 'ipa-1',
        filePath: ipAdapterFile1,
        fileName: 'ip-adapter-faceid-plusv2_sd15.bin',
        modelType: 'Controlnet',
        isMatched: true,
      },
      {
        id: 'ipa-2',
        filePath: ipAdapterFile2,
        fileName: 'ip-adapter-faceid-plusv2_sdxl.bin',
        modelType: 'Controlnet',
        isMatched: true,
      },
    ];

    const plan = await librarySorter.analyzeLibrary({ models: testModels });
    expect(plan.misplacedCount).toBe(0);
    expect(plan.correctCount).toBe(2);
  });
});

