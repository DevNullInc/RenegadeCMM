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

  it('scans clean pickle files and marks them safe for conversion', async () => {
    const cleanPt = path.join(tempDir, 'clean_model.pt');
    // Protocol 0 pickle dictionary: {'weight': 1}
    fs.writeFileSync(cleanPt, Buffer.from("(dp0\nS'weight'\np1\nI1\ns."));

    const scan = await modelConverter.scanPickleModel(cleanPt);
    expect(scan.isSafe).toBe(true);
    expect(scan.isYolo).toBe(false);
    expect(scan.recommendation).toBe('safe_convert');
    expect(scan.dangerousGlobals).toHaveLength(0);
  }, 15000);

  it('detects and bans malicious pickle files containing execution sinks (e.g. os.system)', async () => {
    const malPt = path.join(tempDir, 'malicious_exploit.pt');
    // Pickle opcode referencing os.system
    fs.writeFileSync(malPt, Buffer.from("cos\nsystem\nq\x00(X\x08\x00\x00\x00calc.exeq\x01tq\x02Rq\x03."));

    const scan = await modelConverter.scanPickleModel(malPt);
    expect(scan.isSafe).toBe(false);
    expect(scan.recommendation).toBe('quarantine_dangerous');
    expect(scan.dangerousGlobals.some((g) => g.includes('system'))).toBe(true);

    // Verify convertPickleToSafetensors drops the banhammer
    const conv = await modelConverter.convertPickleToSafetensors(malPt);
    expect(conv.success).toBe(false);
    expect(conv.error).toContain('SECURITY BAN');
  }, 15000);

  it('detects YOLO/Ultralytics layer class hierarchies and preserves .pt format', async () => {
    const yoloPt = path.join(tempDir, 'yolov8n.pt');
    // Pickle opcode referencing ultralytics.nn.tasks.DetectionModel
    fs.writeFileSync(yoloPt, Buffer.from("cultralytics.nn.tasks\nDetectionModel\nq\x00)Rq\x01."));

    const scan = await modelConverter.scanPickleModel(yoloPt);
    expect(scan.isSafe).toBe(true);
    expect(scan.isYolo).toBe(true);
    expect(scan.recommendation).toBe('preserve_yolo_pt');
    expect(scan.yoloLayers.some((l) => l.toLowerCase().includes('detectionmodel'))).toBe(true);

    // Verify convertPickleToSafetensors skips conversion to preserve YOLO functionality
    const conv = await modelConverter.convertPickleToSafetensors(yoloPt);
    expect(conv.success).toBe(false);
    expect(conv.skipped).toBe(true);
    expect(conv.isYolo).toBe(true);
    expect(conv.error).toContain('YOLO');
  }, 15000);
});
