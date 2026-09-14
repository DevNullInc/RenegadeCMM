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
import { precisionInspector, formatBytes } from '../src/services/precisionInspector';

function createMockSafetensors(filePath: string, headerObj: any, dataLength: number = 1024) {
  const headerJson = JSON.stringify(headerObj);
  const headerBuf = Buffer.from(headerJson, 'utf-8');
  const headerLenBuf = Buffer.alloc(8);
  headerLenBuf.writeBigUInt64LE(BigInt(headerBuf.length), 0);
  const dataBuf = Buffer.alloc(dataLength);

  const fullBuf = Buffer.concat([headerLenBuf, headerBuf, dataBuf]);
  fs.writeFileSync(filePath, fullBuf);
}

describe('PrecisionInspector Service', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-prec-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('correctly formats raw byte counts', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 15)).toBe('15 MB');
    expect(formatBytes(1024 * 1024 * 1024 * 4)).toBe('4 GB');
  });

  it('inspects pure FP16 safetensors models', async () => {
    const modelPath = path.join(tempDir, 'model_fp16.safetensors');
    createMockSafetensors(modelPath, {
      __metadata__: { format: 'pt' },
      'model.diffusion_model.input_blocks.0.0.weight': {
        dtype: 'F16',
        shape: [320, 4, 3, 3],
        data_offsets: [0, 23040],
      },
      'model.diffusion_model.out.2.weight': {
        dtype: 'F16',
        shape: [4, 320, 3, 3],
        data_offsets: [23040, 46080],
      },
    });

    const info = await precisionInspector.inspectModel(modelPath);
    expect(info.format).toBe('safetensors');
    expect(info.precisionSummary.primaryPrecision).toBe('FP16');
    expect(info.precisionSummary.f16Count).toBe(2);
    expect(info.precisionSummary.f32Count).toBe(0);
    expect(info.precisionSummary.hasOptimizerStates).toBe(false);
    expect(info.precisionSummary.prunableBytesEstimate).toBe(0);
  });

  it('inspects pure FP32 safetensors models and calculates prunable savings', async () => {
    const modelPath = path.join(tempDir, 'model_fp32.safetensors');
    createMockSafetensors(modelPath, {
      'model.diffusion_model.weight': {
        dtype: 'F32',
        shape: [1024, 1024],
        data_offsets: [0, 4194304],
      },
    }, 4194304);

    const info = await precisionInspector.inspectModel(modelPath);
    expect(info.format).toBe('safetensors');
    expect(info.precisionSummary.primaryPrecision).toBe('FP32');
    expect(info.precisionSummary.f32Count).toBe(1);
    expect(info.precisionSummary.prunableBytesEstimate).toBeGreaterThan(0);
    expect(info.precisionSummary.prunablePercentageEstimate).toBeCloseTo(48, 0);
  });

  it('detects unneeded optimizer tensors and calculates exact strip savings', async () => {
    const modelPath = path.join(tempDir, 'model_with_adam.safetensors');
    createMockSafetensors(modelPath, {
      'model.diffusion_model.weight': {
        dtype: 'F16',
        shape: [1024, 1024],
        data_offsets: [0, 2097152],
      },
      'optimizer.state.exp_avg.weight': {
        dtype: 'F32',
        shape: [1024, 1024],
        data_offsets: [2097152, 6291456], // 4MB optimizer tensor
      },
      'optimizer.state.exp_avg_sq.weight': {
        dtype: 'F32',
        shape: [1024, 1024],
        data_offsets: [6291456, 10485760], // 4MB optimizer tensor
      },
    }, 10485760);

    const info = await precisionInspector.inspectModel(modelPath);
    expect(info.precisionSummary.hasOptimizerStates).toBe(true);
    expect(info.precisionSummary.optimizerTensorCount).toBe(2);
    expect(info.precisionSummary.estimatedOptimizerBytes).toBe(8388608); // 8MB
    expect(info.precisionSummary.prunableBytesEstimate).toBe(8388608);
  });

  it('handles non-existent files gracefully', async () => {
    const info = await precisionInspector.inspectModel(path.join(tempDir, 'missing.safetensors'));
    expect(info.format).toBe('unknown');
    expect(info.error).toContain('does not exist');
  });

  it('handles legacy pickle/ckpt files', async () => {
    const ckptPath = path.join(tempDir, 'legacy_v1.ckpt');
    fs.writeFileSync(ckptPath, Buffer.from('PK...fake binary'));

    const info = await precisionInspector.inspectModel(ckptPath);
    expect(info.format).toBe('pickle/bin');
    expect(info.metadata?.recommendation).toContain('safetensors');
  });
});
