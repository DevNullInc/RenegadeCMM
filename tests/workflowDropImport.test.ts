/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import zlib from 'zlib';
import { WorkflowScanner } from '../src/services/workflowScanner';

describe('Workflow Drag-and-Drop Import & Security Hardening', () => {
  const scanner = new WorkflowScanner();
  let tempDir: string;
  let mockComfyDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-workflow-drop-test-'));
    mockComfyDir = path.join(tempDir, 'MockComfyUI');
    fs.mkdirSync(path.join(mockComfyDir, 'user', 'default', 'workflows'), { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Helper to construct a minimal valid PNG with a tEXt chunk
  function createPngWithTextChunk(keyword: string, text: string): Buffer {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    
    // IHDR chunk (13 bytes: 1x1 8-bit RGBA)
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(1, 0); // width 1
    ihdrData.writeUInt32BE(1, 4); // height 1
    ihdrData.writeUInt8(8, 8);   // bit depth
    ihdrData.writeUInt8(6, 9);   // color type RGBA
    ihdrData.writeUInt8(0, 10);  // compression
    ihdrData.writeUInt8(0, 11);  // filter
    ihdrData.writeUInt8(0, 12);  // interlace

    const ihdrLength = Buffer.alloc(4);
    ihdrLength.writeUInt32BE(13, 0);
    const ihdrType = Buffer.from('IHDR', 'ascii');
    const ihdrCrc = Buffer.alloc(4); // Dummy CRC for test

    const ihdrChunk = Buffer.concat([ihdrLength, ihdrType, ihdrData, ihdrCrc]);

    // tEXt chunk
    const keyBuf = Buffer.from(keyword, 'latin1');
    const nullSep = Buffer.from([0]);
    const valBuf = Buffer.from(text, 'utf-8');
    const textData = Buffer.concat([keyBuf, nullSep, valBuf]);

    const textLength = Buffer.alloc(4);
    textLength.writeUInt32BE(textData.length, 0);
    const textType = Buffer.from('tEXt', 'ascii');
    const textCrc = Buffer.alloc(4);

    const textChunk = Buffer.concat([textLength, textType, textData, textCrc]);

    // IEND chunk
    const iendLength = Buffer.alloc(4);
    iendLength.writeUInt32BE(0, 0);
    const iendType = Buffer.from('IEND', 'ascii');
    const iendCrc = Buffer.alloc(4);
    const iendChunk = Buffer.concat([iendLength, iendType, iendCrc]);

    return Buffer.concat([pngSignature, ihdrChunk, textChunk, iendChunk]);
  }

  // Helper to construct a PNG with zTXt chunk
  function createPngWithZtxtChunk(keyword: string, text: string): Buffer {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    
    // IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(1, 0);
    ihdrData.writeUInt32BE(1, 4);
    ihdrData.writeUInt8(8, 8);
    ihdrData.writeUInt8(6, 9);
    ihdrData.writeUInt8(0, 10);
    ihdrData.writeUInt8(0, 11);
    ihdrData.writeUInt8(0, 12);

    const ihdrLength = Buffer.alloc(4);
    ihdrLength.writeUInt32BE(13, 0);
    const ihdrType = Buffer.from('IHDR', 'ascii');
    const ihdrCrc = Buffer.alloc(4);
    const ihdrChunk = Buffer.concat([ihdrLength, ihdrType, ihdrData, ihdrCrc]);

    // zTXt chunk: keyword + null + compMethod(0) + deflated text
    const keyBuf = Buffer.from(keyword, 'latin1');
    const nullSep = Buffer.from([0]);
    const compMethod = Buffer.from([0]);
    const compressed = zlib.deflateSync(Buffer.from(text, 'utf-8'));
    const ztxtData = Buffer.concat([keyBuf, nullSep, compMethod, compressed]);

    const ztxtLength = Buffer.alloc(4);
    ztxtLength.writeUInt32BE(ztxtData.length, 0);
    const ztxtType = Buffer.from('zTXt', 'ascii');
    const ztxtCrc = Buffer.alloc(4);
    const ztxtChunk = Buffer.concat([ztxtLength, ztxtType, ztxtData, ztxtCrc]);

    // IEND chunk
    const iendLength = Buffer.alloc(4);
    iendLength.writeUInt32BE(0, 0);
    const iendType = Buffer.from('IEND', 'ascii');
    const iendCrc = Buffer.alloc(4);
    const iendChunk = Buffer.concat([iendLength, iendType, iendCrc]);

    return Buffer.concat([pngSignature, ihdrChunk, ztxtChunk, iendChunk]);
  }

  describe('Magic Byte Verification & File Validation', () => {
    it('should successfully parse a valid dropped .json workflow file', async () => {
      const validWorkflow = {
        nodes: [
          {
            id: 1,
            type: 'CheckpointLoaderSimple',
            widgets_values: ['v1-5-pruned-emaonly.safetensors'],
          },
          {
            id: 2,
            type: 'LoraLoader',
            widgets_values: ['detail_enhancer.safetensors'],
          },
        ],
        links: [],
      };

      const jsonPath = path.join(tempDir, 'valid_workflow.json');
      fs.writeFileSync(jsonPath, JSON.stringify(validWorkflow, null, 2), 'utf-8');

      const result = await scanner.parseDroppedFile(jsonPath);
      expect(result).toBeDefined();
      expect(result.fileType).toBe('json');
      expect(result.fileName).toBe('valid_workflow.json');
      expect(result.nodes).toContain('CheckpointLoaderSimple');
      expect(result.nodes).toContain('LoraLoader');
      expect(result.models.length).toBe(2);
      expect(result.models.map((m) => m.modelName)).toEqual(
        expect.arrayContaining(['v1-5-pruned-emaonly.safetensors', 'detail_enhancer.safetensors'])
      );
    });

    it('should successfully parse a valid dropped .png workflow image (tEXt metadata)', async () => {
      const pngWorkflow = {
        nodes: [
          {
            id: 10,
            type: 'CheckpointLoaderSimple',
            widgets_values: ['sdxl_base_1.0.safetensors'],
          },
        ],
      };

      const pngBuf = createPngWithTextChunk('workflow', JSON.stringify(pngWorkflow));
      const pngPath = path.join(tempDir, 'workflow_image.png');
      fs.writeFileSync(pngPath, pngBuf);

      const result = await scanner.parseDroppedFile(pngPath);
      expect(result).toBeDefined();
      expect(result.fileType).toBe('png');
      expect(result.fileName).toBe('workflow_image.png');
      expect(result.nodes).toContain('CheckpointLoaderSimple');
      expect(result.models.length).toBe(1);
      expect(result.models[0].modelName).toBe('sdxl_base_1.0.safetensors');
    });

    it('should successfully parse a valid dropped .png with compressed zTXt chunk', async () => {
      const ztxtWorkflow = {
        nodes: [
          {
            id: 20,
            type: 'UNETLoader',
            widgets_values: ['flux1-dev.safetensors'],
          },
        ],
      };

      const pngBuf = createPngWithZtxtChunk('workflow', JSON.stringify(ztxtWorkflow));
      const pngPath = path.join(tempDir, 'ztxt_image.png');
      fs.writeFileSync(pngPath, pngBuf);

      const result = await scanner.parseDroppedFile(pngPath);
      expect(result).toBeDefined();
      expect(result.fileType).toBe('png');
      expect(result.nodes).toContain('UNETLoader');
      expect(result.models.length).toBe(1);
      expect(result.models[0].modelName).toBe('flux1-dev.safetensors');
    });

    it('should REJECT disguised binaries (ELF header disguised as .json)', async () => {
      // ELF Magic: 7F 45 4C 46
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const maliciousPath = path.join(tempDir, 'malicious_binary.json');
      fs.writeFileSync(maliciousPath, elfBuffer);

      await expect(scanner.parseDroppedFile(maliciousPath)).rejects.toThrow(
        /Invalid file format: Magic number check failed/i
      );
    });

    it('should REJECT Windows PE executable header disguised as .png', async () => {
      // MZ Header: 4D 5A
      const mzBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const fakePngPath = path.join(tempDir, 'disguised_executable.png');
      fs.writeFileSync(fakePngPath, mzBuffer);

      await expect(scanner.parseDroppedFile(fakePngPath)).rejects.toThrow(
        /Invalid file format: Magic number check failed/i
      );
    });

    it('should reject non-existent file paths gracefully', async () => {
      const nonExistentPath = path.join(tempDir, 'non_existent_file.json');
      await expect(scanner.parseDroppedFile(nonExistentPath)).rejects.toThrow(/File not found/i);
    });

    it('should protect against Prototype Pollution in workflow payloads', async () => {
      const pollutionPayload = JSON.parse(
        '{"__proto__": {"polluted": true}, "nodes": [{"id": 1, "type": "CheckpointLoaderSimple", "widgets_values": ["safe.safetensors"]}]}'
      );

      const filePath = path.join(tempDir, 'pollution_test.json');
      fs.writeFileSync(filePath, JSON.stringify(pollutionPayload), 'utf-8');

      const result = await scanner.parseDroppedFile(filePath);
      expect(result).toBeDefined();
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  describe('Workflow Archiving & Path Traversal Prevention', () => {
    it('should successfully archive a workflow into ComfyUI directory atomically', async () => {
      const workflowData = {
        nodes: [{ id: 1, type: 'CheckpointLoaderSimple', widgets_values: ['model.safetensors'] }],
      };

      const result = await scanner.archiveWorkflow(
        'Portrait_Enhancer_Workflow',
        workflowData,
        false,
        mockComfyDir
      );

      expect(result.success).toBe(true);
      expect(result.fileName).toBe('Portrait_Enhancer_Workflow.json');
      expect(result.filePath).toBeDefined();
      expect(fs.existsSync(result.filePath!)).toBe(true);

      // Verify file content is valid JSON
      const savedContent = JSON.parse(fs.readFileSync(result.filePath!, 'utf-8'));
      expect(savedContent.nodes).toBeDefined();
    });

    it('should REJECT path traversal attempts via targetName (e.g. ../../backdoor)', async () => {
      const workflowData = { nodes: [] };
      const traversalName = '../../etc/cron.d/backdoor';

      const result = await scanner.archiveWorkflow(
        traversalName,
        workflowData,
        false,
        mockComfyDir
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('PATH_TRAVERSAL');
    });

    it('should REJECT null byte injection in targetName', async () => {
      const workflowData = { nodes: [] };
      const nullByteName = 'workflow\0malicious';

      const result = await scanner.archiveWorkflow(
        nullByteName,
        workflowData,
        false,
        mockComfyDir
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('PATH_TRAVERSAL');
    });

    it('should REJECT special path separator characters in targetName', async () => {
      const workflowData = { nodes: [] };
      const badNames = ['workflow/test', 'workflow\\test', 'workflow:test', 'workflow*test'];

      for (const name of badNames) {
        const result = await scanner.archiveWorkflow(name, workflowData, false, mockComfyDir);
        expect(result.success).toBe(false);
        expect(result.code).toBe('PATH_TRAVERSAL');
      }
    });

    it('should detect case-insensitive workflow name collisions and require overwrite flag', async () => {
      const workflowData = {
        nodes: [{ id: 1, type: 'CheckpointLoaderSimple', widgets_values: ['test.safetensors'] }],
      };

      // 1. Initial archive
      const firstSave = await scanner.archiveWorkflow(
        'SDXL_Turbo_Master',
        workflowData,
        false,
        mockComfyDir
      );
      expect(firstSave.success).toBe(true);

      // 2. Second archive with identical name without overwrite -> should fail with FILE_EXISTS
      const duplicateSave = await scanner.archiveWorkflow(
        'SDXL_Turbo_Master',
        workflowData,
        false,
        mockComfyDir
      );
      expect(duplicateSave.success).toBe(false);
      expect(duplicateSave.code).toBe('FILE_EXISTS');

      // 3. Third archive with lowercase name ('sdxl_turbo_master') -> case-insensitive collision check
      const caseCollision = await scanner.archiveWorkflow(
        'sdxl_turbo_master',
        workflowData,
        false,
        mockComfyDir
      );
      expect(caseCollision.success).toBe(false);
      expect(caseCollision.code).toBe('FILE_EXISTS');

      // 4. Overwrite allowed -> should succeed
      const overwriteSave = await scanner.archiveWorkflow(
        'SDXL_Turbo_Master',
        workflowData,
        true,
        mockComfyDir
      );
      expect(overwriteSave.success).toBe(true);
    });
  });
});
