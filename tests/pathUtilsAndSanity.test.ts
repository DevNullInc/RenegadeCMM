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
});
