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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { testFolderWritable, sanitizeFileName, normalizePath } from '../src/utils/pathUtils';
import { DownloadManager } from '../src/services/downloadManager';

describe('Folder Writeability Sanity Check & Download Pre-flight', () => {
  let tempTestDir: string;

  beforeEach(() => {
    tempTestDir = path.join(os.tmpdir(), `cmm-write-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('correctly verifies a valid, writable directory', () => {
    const result = testFolderWritable(tempTestDir);
    expect(result.exists).toBe(true);
    expect(result.writable).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('handles non-existent subdirectory creation check gracefully', () => {
    const subDir = path.join(tempTestDir, 'nested', 'checkpoints');
    const result = testFolderWritable(subDir);
    expect(result.exists).toBe(true);
    expect(result.writable).toBe(true);
    expect(fs.existsSync(subDir)).toBe(true);
  });

  it('fails with informative error when path is empty or invalid', () => {
    const resultEmpty = testFolderWritable('');
    expect(resultEmpty.writable).toBe(false);
    expect(resultEmpty.exists).toBe(false);
    expect(resultEmpty.error).toBe('Path is required');

    const resultNull = testFolderWritable(null as any);
    expect(resultNull.writable).toBe(false);
    expect(resultNull.exists).toBe(false);
  });

  it('detects locked/permission-denied folders when probe write fails', () => {
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      const err: any = new Error('Permission denied');
      err.code = 'EACCES';
      throw err;
    });

    const result = testFolderWritable(tempTestDir);
    expect(result.writable).toBe(false);
    expect(result.error).toContain('Permission denied: Drive or directory is locked or read-only');

    spy.mockRestore();
  });

  it('detects unmounted/disconnected drives when directory creation fails with ENOENT', () => {
    const fakeDrivePath = 'Z:\\MissingDrive\\models';
    const spy = vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
      const err: any = new Error('No such file or directory');
      err.code = 'ENOENT';
      throw err;
    });

    const result = testFolderWritable(fakeDrivePath);
    expect(result.writable).toBe(false);
    expect(result.exists).toBe(false);
    expect(result.error).toContain('Drive or parent directory not found');

    spy.mockRestore();
  });

  it('fails download task immediately when target directory fails writeability sanity check', async () => {
    const dm = new DownloadManager();
    dm.setMaxConcurrent(1);

    // Mock testFolderWritable returning unwritable
    const unwritablePath = 'X:\\LockedDrive\\models';

    const task = dm.addTask({
      downloadUrl: 'https://example.com/model.safetensors',
      fileName: 'test_model.safetensors',
      modelType: 'Checkpoint',
      targetRoot: unwritablePath,
      computedPath: path.join(unwritablePath, 'checkpoints', 'test_model.safetensors'),
    });

    // Wait for event loop to process startDownload
    await new Promise((resolve) => setTimeout(resolve, 50));

    const tasks = dm.getTasks();
    const updated = tasks.find((t) => t.id === task.id);
    expect(updated).toBeDefined();
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toContain('Cannot write to destination folder');
  });

  it('refuses duplicate downloads when identical file name, hash, or download URL is already in progress', () => {
    const dm = new DownloadManager(0); // 0 active concurrency to keep tasks in pending status

    const firstTask = dm.addTask({
      downloadUrl: 'https://civitai.com/api/download/models/12345',
      fileName: 'flux_realism.safetensors',
      modelType: 'Checkpoint',
      sha256: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
      modelVersionId: 12345,
      modelName: 'Flux Realism',
      sizeKB: 1000,
    });

    expect(dm.getTasks().length).toBe(1);

    // 1. Attempt adding exact same modelVersionId
    const dup1 = dm.addTask({
      downloadUrl: 'https://civitai.com/api/download/models/12345',
      fileName: 'flux_realism.safetensors',
      modelType: 'Checkpoint',
      modelVersionId: 12345,
      modelName: 'Flux Realism',
      sizeKB: 1000,
    });
    expect(dup1.id).toBe(firstTask.id);
    expect(dm.getTasks().length).toBe(1);

    // 2. Attempt adding exact same SHA256
    const dup2 = dm.addTask({
      downloadUrl: 'https://civitai.com/api/download/models/99999',
      fileName: 'flux_realism_copy.safetensors',
      modelType: 'Checkpoint',
      sha256: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
      modelName: 'Flux Realism',
      sizeKB: 1000,
    });
    expect(dup2.id).toBe(firstTask.id);
    expect(dm.getTasks().length).toBe(1);

    // 3. Attempt adding exact same download URL
    const dup3 = dm.addTask({
      downloadUrl: 'https://civitai.com/api/download/models/12345',
      fileName: 'flux_different_name.safetensors',
      modelType: 'Checkpoint',
      modelName: 'Flux Realism',
      sizeKB: 1000,
    });
    expect(dup3.id).toBe(firstTask.id);
    expect(dm.getTasks().length).toBe(1);

    // 4. Attempt adding exact same file name in the same folder
    const dup4 = dm.addTask({
      downloadUrl: 'https://mirror.com/models/other',
      fileName: 'flux_realism.safetensors',
      modelType: 'Checkpoint',
      modelName: 'Flux Realism',
      sizeKB: 1000,
    });
    expect(dup4.id).toBe(firstTask.id);
    expect(dm.getTasks().length).toBe(1);
  });
});
