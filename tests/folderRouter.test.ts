import path from 'path';
import { describe, it, expect } from 'vitest';
import { FolderRouter } from '../src/services/folderRouter';

describe('FolderRouter', () => {
  it('should map standard model types correctly', () => {
    const router = new FolderRouter({ rootPath: 'D:\\ComfyUI\\models' });

    expect(
      router.computePath({ fileName: 'sdxl.safetensors', modelType: 'Checkpoint' }).folderName
    ).toBe('checkpoints');

    expect(
      router.computePath({ fileName: 'my_lora.safetensors', modelType: 'LORA' }).folderName
    ).toBe('loras');

    expect(
      router.computePath({ fileName: 'esrgan.pth', modelType: 'Upscaler' }).folderName
    ).toBe('upscale_models');
  });

  it('should match regex pattern overrides', () => {
    const router = new FolderRouter({ rootPath: 'D:\\ComfyUI\\models' });

    expect(
      router.computePath({ fileName: 'ip-adapter_sdxl.safetensors', modelType: 'Other' }).folderName
    ).toBe('ipadapter');

    expect(
      router.computePath({ fileName: 'qwen_2.5_coder.gguf', modelType: 'Other' }).folderName
    ).toBe('gguf');
  });

  it('should scaffold standard ComfyUI model subdirectories and exclude workflows', () => {
    const router = new FolderRouter();
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const tempDir = path.join(os.tmpdir(), `cmm-scaffold-test-${Date.now()}`);
    try {
      const result = router.scaffoldModelSubfolders(tempDir);

      expect(result.created).toContain('checkpoints');
      expect(result.created).toContain('loras');
      expect(result.created).toContain('vae');
      expect(result.created).toContain('controlnet');
      expect(result.created).toContain('upscale_models');
      expect(result.created).toContain('embeddings');
      expect(result.created).toContain('diffusion_models');
      expect(result.created).toContain('text_encoders');
      expect(result.created).not.toContain('workflows');

      // Verify directories actually exist on disk
      expect(fs.existsSync(path.join(tempDir, 'checkpoints'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'loras'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'workflows'))).toBe(false);

      // Running a second time should detect them as existing without re-creating
      const secondResult = router.scaffoldModelSubfolders(tempDir);
      expect(secondResult.created.length).toBe(0);
      expect(secondResult.existing).toContain('checkpoints');
      expect(secondResult.existing).toContain('loras');
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should prevent path traversal when fileName or creator contains directory traversal markers', () => {
    const testRoot = path.resolve('/tmp/comfy_models');
    const router = new FolderRouter({ rootPath: testRoot });

    // fileName with traversal attempts
    const result1 = router.computePath({
      fileName: '../../etc/passwd',
      modelType: 'Checkpoint',
    });
    expect(result1.fullPath.startsWith(testRoot)).toBe(true);
    expect(result1.fullPath).not.toContain('..');

    // dot-dot as fileName
    const result2 = router.computePath({
      fileName: '..',
      modelType: 'Checkpoint',
    });
    expect(result2.fullPath.startsWith(testRoot)).toBe(true);
    expect(result2.fullPath.replace(/\\/g, '/')).not.toContain('/../');

    // creator with traversal
    router.updateConfig({ separateByCreator: true });
    const result3 = router.computePath({
      fileName: 'model.safetensors',
      modelType: 'Checkpoint',
      creator: '../../../malicious_creator',
    });
    expect(result3.fullPath.startsWith(testRoot)).toBe(true);
    expect(result3.fullPath).not.toContain('..');
  });
});
