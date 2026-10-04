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
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { WorkflowScanner } from '../src/services/workflowScanner';
import { dbManager } from '../src/db/db';

describe('Workflow ZIP Archive Ingestion & Discovery', () => {
  const scanner = new WorkflowScanner();
  let tempDir: string;
  let dbPath: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-workflow-zip-test-'));
    dbPath = path.join(tempDir, 'test_workflow_zip.db');
    (dbManager as any).dbPath = dbPath;
    await dbManager.init();

    // Seed a known local model in sqlite for reference mapping
    await dbManager.run(`
      INSERT OR REPLACE INTO local_models (
        id, file_name, file_path, file_size, modified_at, model_type, sha256
      ) VALUES (
        'lm_1',
        'epicrealism_v5.safetensors',
        'D:\\models\\checkpoints\\epicrealism_v5.safetensors',
        2000000000,
        1700000000,
        'Checkpoint',
        'abc123sha256'
      );
    `);
  });

  afterAll(() => {
    try {
      dbManager.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should discover and extract workflows from .zip archives during folder scan', async () => {
    const zip = new AdmZip();
    const sampleWorkflow = {
      nodes: [
        {
          id: 1,
          type: 'CheckpointLoaderSimple',
          widgets_values: ['epicrealism_v5.safetensors'],
        },
        {
          id: 2,
          type: 'KSampler',
          widgets_values: [123456, 'randomize', 20, 8.0, 'euler', 'normal', 1.0],
        },
      ],
      links: [],
    };

    zip.addFile('workflow.json', Buffer.from(JSON.stringify(sampleWorkflow), 'utf-8'));
    const zipPath = path.join(tempDir, 'animatxt2img_workflow.zip');
    zip.writeZip(zipPath);

    const workflows = await scanner.scanWorkflows([tempDir]);
    expect(workflows.length).toBeGreaterThanOrEqual(1);

    const zipWf = workflows.find((w) => w.filePath === zipPath);
    expect(zipWf).toBeDefined();
    expect(zipWf?.fileType).toBe('zip');
    expect(zipWf?.nodeTypes).toContain('CheckpointLoaderSimple');
    expect(zipWf?.nodeTypes).toContain('KSampler');
    expect(zipWf?.modelCount).toBe(1);
    expect(zipWf?.models[0].modelName).toBe('epicrealism_v5.safetensors');
    expect(zipWf?.models[0].isInstalled).toBe(true);
  });

  it('should parse dropped .zip workflow archive via parseDroppedFile', async () => {
    const zip = new AdmZip();
    const promptWorkflow = {
      '3': {
        class_type: 'KSampler',
        inputs: {
          seed: 42,
          steps: 25,
          cfg: 7.5,
          sampler_name: 'dpmpp_2m',
          scheduler: 'karras',
        },
      },
    };

    zip.addFile('prompt.json', Buffer.from(JSON.stringify(promptWorkflow), 'utf-8'));
    const zipPath = path.join(tempDir, 'dropped_prompt_workflow.zip');
    zip.writeZip(zipPath);

    const res = await scanner.parseDroppedFile(zipPath);
    expect(res.fileName).toBe('dropped_prompt_workflow.zip');
    expect(res.fileType).toBe('zip');
    expect(res.workflowFormat).toBe('api_prompt');
    expect(res.nodes).toContain('KSampler');
  });

  it('should reject zip archives with no valid workflow files', async () => {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('Just some random text with no workflow.', 'utf-8'));
    const emptyZipPath = path.join(tempDir, 'empty_archive.zip');
    zip.writeZip(emptyZipPath);

    await expect(scanner.parseDroppedFile(emptyZipPath)).rejects.toThrow(
      /No ComfyUI workflow JSON or PNG found inside ZIP archive/
    );
  });

  it('should ignore zip-slip path traversal entries in zip archives safely', async () => {
    const zip = new AdmZip();
    const validWf = {
      nodes: [{ id: 1, type: 'CLIPTextEncode', widgets_values: ['masterpiece'] }],
    };
    zip.addFile('../../../etc/evil.json', Buffer.from(JSON.stringify(validWf), 'utf-8'));
    zip.addFile('safe_workflow.json', Buffer.from(JSON.stringify(validWf), 'utf-8'));
    const traversalZipPath = path.join(tempDir, 'traversal_test.zip');
    zip.writeZip(traversalZipPath);

    const res = await scanner.parseDroppedFile(traversalZipPath);
    expect(res.nodes).toContain('CLIPTextEncode');
    expect(res.fileType).toBe('zip');
  });
});
