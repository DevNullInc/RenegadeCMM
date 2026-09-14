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
import { modelConverter } from '../src/services/modelConverter';

describe('ModelConverterService (Pickle to SafeTensors)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-converter-test-'));
    const dbPath = path.join(tempDir, 'converter.sqlite');
    await dbManager.init(dbPath);
  });

  afterEach(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('detects available Python environment on system', async () => {
    const env = await modelConverter.getPythonEnvironment();
    expect(env).toBeDefined();
    expect(typeof env.available).toBe('boolean');
    expect(typeof env.hasTorch).toBe('boolean');
    expect(typeof env.hasSafetensors).toBe('boolean');
  }, 15000);

  it('rejects conversion of non-existent files', async () => {
    const fakePath = path.join(tempDir, 'nonexistent.ckpt');
    const result = await modelConverter.convertPickleToSafetensors(fakePath);
    expect(result.success).toBe(false);
    expect(result.error).toContain('does not exist');
  });

  it('rejects conversion of non-pickle files (e.g. .safetensors)', async () => {
    const stPath = path.join(tempDir, 'already_safe.safetensors');
    fs.writeFileSync(stPath, Buffer.alloc(100));

    const result = await modelConverter.convertPickleToSafetensors(stPath);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not a supported pickle format');
  });

  it('handles invalid python path candidate without crashing', async () => {
    const env = await modelConverter.getPythonEnvironment('/invalid/fake/python/path/python.exe', undefined, true);
    expect(env).toBeDefined();
  }, 15000);
});
