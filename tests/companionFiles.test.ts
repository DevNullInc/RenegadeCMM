/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Tests for Companion Files (.sha256, .civitai.info, Preview Images)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { downloadManager } from '../src/services/downloadManager';
import { libraryScanner, discoverCompanionFiles } from '../src/services/libraryScanner';
import { dbManager } from '../src/db/db';
import { DownloadTask } from '../src/types/app';
import { imageCacheService } from '../src/services/imageCacheService';

describe('Companion Files (.sha256, .civitai.info, preview images)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-companion-test-')));
    await dbManager.init(':memory:');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('DownloadManager.saveCompanionFiles', () => {
    it('should save .sha256, .civitai.info, and companion image alongside model file', async () => {
      const modelPath = path.join(tempDir, 'g3org3.safetensors');
      fs.writeFileSync(modelPath, 'fake-safetensor-content');

      const mockVersionMetadata = {
        id: 2866298,
        index: 1,
        name: 'Anima v1.0',
        baseModel: 'Anima',
        baseModelType: 'Standard',
        createdAt: '2026-04-17T09:49:31.617Z',
        publishedAt: '2026-04-17T09:50:54.112Z',
        status: 'Published',
        availability: 'Public',
        nsfwLevel: 15,
        description: '<p>Training version without faces</p>',
        covered: true,
        stats: { downloadCount: 385, thumbsUpCount: 26, thumbsDownCount: 0 },
        files: [
          {
            id: 2749380,
            sizeKB: 89757.96875,
            name: 'g3org3.safetensors',
            type: 'Model',
            hashes: {
              SHA256: '87E0DE83E3CC0196320182128946CE115AEEA0DBCF441D16EB63C6680DCF7712',
            },
            downloadUrl: 'https://civitai.com/api/download/models/2866298',
            primary: true,
          },
        ],
        images: [
          {
            url: 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/a674dc33-01c7-4ac6-96fe-ab119b5bc849/original=true/127784785.jpeg',
            nsfwLevel: 8,
            width: 1368,
            height: 2000,
            type: 'image',
          },
        ],
      };

      // Mock imageCacheService.getImage to return a buffer
      vi.spyOn(imageCacheService, 'getImage').mockResolvedValue({
        buffer: Buffer.from('fake-jpeg-binary-data'),
        contentType: 'image/jpeg',
      });

      const task: DownloadTask = {
        id: 'dl_test_1',
        modelVersionId: 2866298,
        modelId: 2500000,
        modelName: 'Anima',
        versionName: 'v1.0',
        modelType: 'Checkpoint',
        baseModel: 'Anima',
        creator: 'TheStygianRenegade',
        targetFolder: 'checkpoints',
        fileName: 'g3org3.safetensors',
        downloadUrl: 'https://civitai.com/api/download/models/2866298',
        sizeKB: 89757,
        sha256: '87E0DE83E3CC0196320182128946CE115AEEA0DBCF441D16EB63C6680DCF7712',
        status: 'completed',
        progress: 100,
        downloadedBytes: 89757000,
        totalBytes: 89757000,
        speedBps: 0,
        computedPath: modelPath,
        versionMetadata: mockVersionMetadata,
      };

      await downloadManager.saveCompanionFiles(task, modelPath);

      // 1. Verify .sha256 file
      const shaFile = path.join(tempDir, 'g3org3.sha256');
      expect(fs.existsSync(shaFile)).toBe(true);
      expect(fs.readFileSync(shaFile, 'utf8').trim()).toBe('87E0DE83E3CC0196320182128946CE115AEEA0DBCF441D16EB63C6680DCF7712');

      // 2. Verify .civitai.info file
      const infoFile = path.join(tempDir, 'g3org3.civitai.info');
      expect(fs.existsSync(infoFile)).toBe(true);
      const parsedInfo = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
      expect(parsedInfo.id).toBe(2866298);
      expect(parsedInfo.name).toBe('Anima v1.0');
      expect(parsedInfo.baseModel).toBe('Anima');
      expect(parsedInfo.files[0].hashes.SHA256).toBe('87E0DE83E3CC0196320182128946CE115AEEA0DBCF441D16EB63C6680DCF7712');

      // 3. Verify companion preview image file
      const imgFile = path.join(tempDir, 'g3org3.jpeg');
      expect(fs.existsSync(imgFile)).toBe(true);
      expect(fs.readFileSync(imgFile).toString()).toBe('fake-jpeg-binary-data');
    });

    it('should save .huggingface.info for Hugging Face downloads', async () => {
      const modelPath = path.join(tempDir, 'flux1-dev.safetensors');
      fs.writeFileSync(modelPath, 'fake-hf-safetensors');

      const task: DownloadTask = {
        id: 'dl_hf_1',
        source: 'huggingface',
        hfRepoId: 'black-forest-labs/FLUX.1-dev',
        hfCommitSha: 'abcdef1234567890',
        modelVersionId: 0,
        modelId: 0,
        modelName: 'FLUX.1-dev',
        versionName: 'main',
        modelType: 'Checkpoint',
        baseModel: 'Flux.1 D',
        targetFolder: 'checkpoints',
        fileName: 'flux1-dev.safetensors',
        downloadUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors',
        sizeKB: 12000000,
        sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        status: 'completed',
        progress: 100,
        downloadedBytes: 12000000000,
        totalBytes: 12000000000,
        speedBps: 0,
        computedPath: modelPath,
      };

      await downloadManager.saveCompanionFiles(task, modelPath);

      const infoFile = path.join(tempDir, 'flux1-dev.huggingface.info');
      expect(fs.existsSync(infoFile)).toBe(true);
      const parsedInfo = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
      expect(parsedInfo.source).toBe('huggingface');
      expect(parsedInfo.repoId).toBe('black-forest-labs/FLUX.1-dev');
      expect(parsedInfo.commitSha).toBe('abcdef1234567890');

      const shaFile = path.join(tempDir, 'flux1-dev.sha256');
      expect(fs.existsSync(shaFile)).toBe(true);
    });
  });

  describe('discoverCompanionFiles helper', () => {
    it('should discover on-disk .sha256, .civitai.info, and preview image', () => {
      const modelPath = path.join(tempDir, 'cyberpunk_lora.safetensors');
      fs.writeFileSync(modelPath, 'dummy');

      const shaPath = path.join(tempDir, 'cyberpunk_lora.sha256');
      fs.writeFileSync(shaPath, '1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF');

      const infoPath = path.join(tempDir, 'cyberpunk_lora.civitai.info');
      fs.writeFileSync(
        infoPath,
        JSON.stringify({
          id: 999123,
          modelId: 888123,
          name: 'Cyberpunk LoRA v2',
          baseModel: 'SDXL 1.0',
          type: 'LORA',
          nsfwLevel: 1,
        })
      );

      const imgPath = path.join(tempDir, 'cyberpunk_lora.png');
      fs.writeFileSync(imgPath, 'fake-png-content');

      const companion = discoverCompanionFiles(modelPath);

      expect(companion.companionHash).toBe('1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF');
      expect(companion.companionInfo?.id).toBe(999123);
      expect(companion.companionInfo?.name).toBe('Cyberpunk LoRA v2');
      expect(companion.companionInfoPath).toBe(infoPath);
      expect(companion.localImagePath).toBe(imgPath);
      expect(companion.localImageUrl).toContain('/api/local-image?path=');
    });
  });

  describe('LibraryScanner offline companion extraction during directory scan', () => {
    it('should scan folder and populate model metadata and local preview from companion files without network', async () => {
      const modelPath = path.join(tempDir, 'g3org3.safetensors');
      fs.writeFileSync(modelPath, 'fake-safetensor-content');

      const shaPath = path.join(tempDir, 'g3org3.sha256');
      fs.writeFileSync(shaPath, '87E0DE83E3CC0196320182128946CE115AEEA0DBCF441D16EB63C6680DCF7712');

      const infoPath = path.join(tempDir, 'g3org3.civitai.info');
      fs.writeFileSync(
        infoPath,
        JSON.stringify({
          id: 2866298,
          modelId: 2500000,
          name: 'Anima v1.0',
          baseModel: 'Anima',
          type: 'Checkpoint',
          nsfwLevel: 15,
        })
      );

      const imgPath = path.join(tempDir, 'g3org3.jpeg');
      fs.writeFileSync(imgPath, 'fake-jpeg-data');

      const scanned = await libraryScanner.scanDirectory(tempDir);

      expect(scanned.length).toBe(1);
      const model = scanned[0];
      expect(model.fileName).toBe('g3org3.safetensors');
      expect(model.sha256).toBe('87E0DE83E3CC0196320182128946CE115AEEA0DBCF441D16EB63C6680DCF7712');
      expect(model.isMatched).toBe(true);
      expect(model.civitaiVersionId).toBe(2866298);
      expect(model.civitaiModelId).toBe(2500000);
      expect(model.civitaiName).toBe('Anima v1.0');
      expect(model.civitaiBaseModel).toBe('Anima');
      expect(model.modelType).toBe('Checkpoint');
      expect(model.nsfw).toBe(true);
      expect(model.previewUrl).toContain('/api/local-image?path=');
      expect(model.localPreviewPath).toBe(imgPath);
      expect(model.companionInfoPath).toBe(infoPath);
    });
  });
});
