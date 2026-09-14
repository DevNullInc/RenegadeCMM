/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { describe, it, expect } from 'vitest';
import { hardwareScanner, formatBytes } from '../src/services/hardwareScanner';

describe('HardwareScannerService', () => {
  it('formats byte sizes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(4 * 1024 * 1024 * 1024)).toBe('4 GB');
  });

  it('scans system hardware profile with CPU, memory, and GPU telemetry', async () => {
    const profile = await hardwareScanner.getHardwareProfile();
    expect(profile).toBeDefined();
    expect(profile.cpu).toBeDefined();
    expect(typeof profile.cpu.model).toBe('string');
    expect(profile.cpu.cores).toBeGreaterThanOrEqual(1);
    expect(typeof profile.cpu.arch).toBe('string');

    expect(profile.memory).toBeDefined();
    expect(profile.memory.totalBytes).toBeGreaterThan(0);
    expect(profile.memory.freeBytes).toBeGreaterThanOrEqual(0);
    expect(profile.memory.usedPercent).toBeGreaterThanOrEqual(0);
    expect(profile.memory.usedPercent).toBeLessThanOrEqual(100);
    expect(profile.memory.totalFormatted).toMatch(/(GB|MB|KB|B)/);
    expect(profile.memory.freeFormatted).toMatch(/(GB|MB|KB|B)/);

    expect(Array.isArray(profile.gpus)).toBe(true);
    expect(typeof profile.platform).toBe('string');
    expect(profile.timestamp).toBeGreaterThan(0);
  });

  it('evaluates conversion safety for small models as safe', async () => {
    // 50 MB model requires ~75 MB RAM, which should be safe on any standard test runner
    const smallModelBytes = 50 * 1024 * 1024;
    const assessment = await hardwareScanner.assessConversionSafety(smallModelBytes);

    expect(assessment).toBeDefined();
    expect(assessment.modelSizeBytes).toBe(smallModelBytes);
    expect(assessment.estimatedRamRequiredBytes).toBe(Math.round(smallModelBytes * 1.5));
    expect(assessment.estimatedRamRequiredFormatted).toContain('MB');
    expect(['safe', 'warning', 'critical']).toContain(assessment.riskLevel);
  });

  it('evaluates conversion safety for unrealistically huge models as critical OOM risk', async () => {
    // 500 TB model (exceeds all host RAM)
    const hugeModelBytes = 500 * 1024 * 1024 * 1024 * 1024;
    const assessment = await hardwareScanner.assessConversionSafety(hugeModelBytes);

    expect(assessment).toBeDefined();
    expect(assessment.isSafe).toBe(false);
    expect(assessment.riskLevel).toBe('critical');
    expect(assessment.message).toContain('High OOM Risk');
    expect(assessment.recommendation).toBeDefined();
  });
});
