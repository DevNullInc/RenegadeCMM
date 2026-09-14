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
import crypto from 'crypto';
import { dbManager } from '../src/db/db';
import {
  canHardlinkFiles,
  formatBytes,
  computeFileSHA256,
  storageOptimizer,
} from '../src/services/storageOptimizer';

describe('Storage Optimizer & Swarm Packaging Service', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-opt-test-')));
    const dbPath = path.join(tempDir, 'opt.sqlite');
    await dbManager.init(dbPath);
    await dbManager.run('DELETE FROM local_models;');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('formats bytes into human readable binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 5)).toBe('5 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB');
  });

  it('correctly assesses canHardlinkFiles across paths and devices', () => {
    const fileA = path.join(tempDir, 'modelA.safetensors');
    const fileB = path.join(tempDir, 'modelB.safetensors');
    fs.writeFileSync(fileA, 'sample data');
    fs.writeFileSync(fileB, 'sample data');

    // Same file check
    expect(canHardlinkFiles(fileA, fileA).canLink).toBe(false);

    // Sibling files on same drive
    const siblingCheck = canHardlinkFiles(fileA, fileB);
    expect(siblingCheck.canLink).toBe(true);

    // Cross drive mock on Windows or different device mock
    const crossCheck = canHardlinkFiles('C:\\models\\a.safetensors', 'D:\\models\\b.safetensors');
    expect(crossCheck.canLink).toBe(false);
  });

  it('computes accurate SHA256 hashes of test model files', async () => {
    const file = path.join(tempDir, 'test.safetensors');
    const content = 'RenegadeSwarm & RenegadeCMM companion test';
    fs.writeFileSync(file, content);

    const expected = crypto.createHash('sha256').update(content).digest('hex').toUpperCase();
    const actual = await computeFileSHA256(file);
    expect(actual).toBe(expected);
  });

  it('executes atomic hardlink deduplication and synchronizes companion files', async () => {
    const masterDir = path.join(tempDir, 'comfy_checkpoints');
    const duplicateDir = path.join(tempDir, 'forge_checkpoints');
    fs.mkdirSync(masterDir, { recursive: true });
    fs.mkdirSync(duplicateDir, { recursive: true });

    const masterPath = path.join(masterDir, 'dreamshaper.safetensors');
    const duplicatePath = path.join(duplicateDir, 'dreamshaper_copy.safetensors');
    const modelPayload = 'Heavy 4GB Tensor Weight Data Simulation';

    fs.writeFileSync(masterPath, modelPayload);
    fs.writeFileSync(duplicatePath, modelPayload);

    // Create companion files for master
    const masterSha = crypto.createHash('sha256').update(modelPayload).digest('hex').toUpperCase();
    fs.writeFileSync(path.join(masterDir, 'dreamshaper.sha256'), masterSha);
    fs.writeFileSync(path.join(masterDir, 'dreamshaper.civitai.info'), '{"name":"Dreamshaper"}');
    fs.writeFileSync(path.join(masterDir, 'dreamshaper.png'), 'fake image buffer');

    const ok = await storageOptimizer.executeHardlink(masterPath, duplicatePath);
    expect(ok).toBe(true);

    // Verify inode matching (hardlink)
    const masterStat = fs.statSync(masterPath);
    const dupStat = fs.statSync(duplicatePath);
    expect(dupStat.ino).toBe(masterStat.ino);
    expect(dupStat.nlink).toBeGreaterThanOrEqual(2);

    // Verify companion files were synchronized alongside duplicate
    expect(fs.existsSync(path.join(duplicateDir, 'dreamshaper_copy.sha256'))).toBe(true);
    expect(fs.readFileSync(path.join(duplicateDir, 'dreamshaper_copy.sha256'), 'utf8')).toBe(masterSha);
    expect(fs.existsSync(path.join(duplicateDir, 'dreamshaper_copy.civitai.info'))).toBe(true);
    expect(fs.existsSync(path.join(duplicateDir, 'dreamshaper_copy.png'))).toBe(true);
  });

  it('packages companion files (.sha256, .civitai.info, preview) for existing unpacked models', async () => {
    const modelPath = path.join(tempDir, 'flux_dev.safetensors');
    fs.writeFileSync(modelPath, 'Flux Model Tensor Simulation');

    const sha = await computeFileSHA256(modelPath);

    // Insert into DB using exact schema
    await dbManager.run(
      `INSERT INTO local_models (
        id, file_path, file_name, file_size, modified_at, civitai_name, model_type, sha256, civitai_version_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      ['test-model-1', modelPath, 'flux_dev.safetensors', 1024, Date.now(), 'Flux.1-dev', 'Checkpoint', sha, 123456]
    );

    const result = await storageOptimizer.packageCompanionFilesForModel(modelPath);
    expect(result.sha256Created).toBe(true);
    expect(result.infoJsonCreated).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify created files
    const shaPath = path.join(tempDir, 'flux_dev.sha256');
    const infoPath = path.join(tempDir, 'flux_dev.civitai.info');
    expect(fs.existsSync(shaPath)).toBe(true);
    expect(fs.readFileSync(shaPath, 'utf8')).toBe(sha);
    expect(fs.existsSync(infoPath)).toBe(true);

    const parsedInfo = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    expect(parsedInfo.name).toBe('Flux.1-dev');
    expect(parsedInfo.packagedBy).toBe('RenegadeCMM');
  });

  it('scans and clusters duplicate files across library directories', async () => {
    const dirA = path.join(tempDir, 'dirA');
    const dirB = path.join(tempDir, 'dirB');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });

    const path1 = path.join(dirA, 'model1.safetensors');
    const path2 = path.join(dirB, 'model2.safetensors');
    const content = 'Identical Checkpoint Buffer Content';
    fs.writeFileSync(path1, content);
    fs.writeFileSync(path2, content);

    const hash = await computeFileSHA256(path1);

    await dbManager.run(
      `INSERT INTO local_models (id, file_path, file_name, file_size, modified_at, sha256) VALUES (?, ?, ?, ?, ?, ?);`,
      ['dup-1', path1, 'model1.safetensors', content.length, Date.now(), hash]
    );
    await dbManager.run(
      `INSERT INTO local_models (id, file_path, file_name, file_size, modified_at, sha256) VALUES (?, ?, ?, ?, ?, ?);`,
      ['dup-2', path2, 'model2.safetensors', content.length, Date.now(), hash]
    );

    const scanResult = await storageOptimizer.scanDuplicates();
    expect(scanResult.totalDuplicates).toBe(1);
    expect(scanResult.duplicateClusters.length).toBe(1);
    expect(scanResult.duplicateClusters[0].sha256).toBe(hash);
    expect(scanResult.potentialSavingsBytes).toBe(content.length);
  });
});
