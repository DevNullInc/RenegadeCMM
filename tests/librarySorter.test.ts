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

  beforeEach(() => {
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
});
