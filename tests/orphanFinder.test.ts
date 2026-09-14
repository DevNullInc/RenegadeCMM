/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { dbManager } from '../src/db/db';
import { OrphanFinder } from '../src/services/orphanFinder';
import { WorkflowScanner } from '../src/services/workflowScanner';

describe('OrphanFinder Service', () => {
  let tempDir: string;
  let workflowDir: string;
  let modelsDir: string;

  beforeEach(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-orphan-fx-')));
    workflowDir = path.join(tempDir, 'workflows');
    modelsDir = path.join(tempDir, 'models');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.mkdirSync(modelsDir, { recursive: true });

    const dbPath = path.join(tempDir, 'orphan.sqlite');
    await dbManager.init(dbPath);
    await dbManager.run('DELETE FROM local_models;');

    // Insert 3 test models:
    // 1. Used in workflow (v1-5-pruned.safetensors)
    // 2. Used in workflow (detail_tweaker_lora.safetensors)
    // 3. Orphan (abandoned_model_v1.safetensors)
    const model1Path = path.join(modelsDir, 'v1-5-pruned.safetensors');
    const model2Path = path.join(modelsDir, 'detail_tweaker_lora.safetensors');
    const orphanPath = path.join(modelsDir, 'abandoned_model_v1.safetensors');

    fs.writeFileSync(model1Path, Buffer.alloc(2048));
    fs.writeFileSync(model2Path, Buffer.alloc(1024));
    fs.writeFileSync(orphanPath, Buffer.alloc(4096));

    await dbManager.run(
      `INSERT INTO local_models (id, file_name, file_path, file_size, modified_at, model_type, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ['1', 'v1-5-pruned.safetensors', model1Path, 2048, Date.now(), 'Checkpoint', 'hash1']
    );

    await dbManager.run(
      `INSERT INTO local_models (id, file_name, file_path, file_size, modified_at, model_type, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ['2', 'detail_tweaker_lora.safetensors', model2Path, 1024, Date.now(), 'LORA', 'hash2']
    );

    await dbManager.run(
      `INSERT INTO local_models (id, file_name, file_path, file_size, modified_at, model_type, sha256)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      ['3', 'abandoned_model_v1.safetensors', orphanPath, 4096, Date.now(), 'Checkpoint', 'hash3']
    );

    // Create a workflow JSON referencing only model1 and model2
    const sampleWorkflow = {
      nodes: [
        {
          id: 1,
          type: 'CheckpointLoaderSimple',
          widgets_values: ['v1-5-pruned.safetensors'],
        },
        {
          id: 2,
          type: 'LoraLoader',
          widgets_values: ['detail_tweaker_lora.safetensors', 0.8, 0.8],
        },
      ],
    };

    fs.writeFileSync(path.join(workflowDir, 'test_workflow.json'), JSON.stringify(sampleWorkflow, null, 2));
  });

  afterEach(async () => {
    try {
      await dbManager.run('DELETE FROM local_models;');
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('accurately identifies active vs orphan models across workflows', async () => {
    const finder = new OrphanFinder(new WorkflowScanner());
    const result = await finder.findOrphanModels(workflowDir);

    expect(result.totalScannedModels).toBe(3);
    expect(result.totalScannedWorkflows).toBe(1);
    expect(result.orphanCount).toBe(1);
    expect(result.activeCount).toBe(2);

    // Verify orphan details
    const orphan = result.orphans[0];
    expect(orphan.fileName).toBe('abandoned_model_v1.safetensors');
    expect(orphan.isOrphan).toBe(true);
    expect(orphan.referenceCount).toBe(0);
    expect(result.orphanBytesTotal).toBe(4096);

    // Verify active details
    const activeNames = result.activelyUsed.map((m) => m.fileName);
    expect(activeNames).toContain('v1-5-pruned.safetensors');
    expect(activeNames).toContain('detail_tweaker_lora.safetensors');

    const activeModel1 = result.activelyUsed.find((m) => m.fileName === 'v1-5-pruned.safetensors');
    expect(activeModel1?.referenceCount).toBe(1);
    expect(activeModel1?.referencedWorkflows[0].fileName).toBe('test_workflow.json');
  });
});
