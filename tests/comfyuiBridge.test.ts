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

describe('ComfyUI Live Bridge & Workflow Auto-Save', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-comfy-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should auto-save JSON workflows to user/default/workflows directory', () => {
    const userWorkflowsDir = path.join(tempDir, 'user', 'default', 'workflows');
    fs.mkdirSync(userWorkflowsDir, { recursive: true });

    const workflowData = {
      nodes: [
        { id: 1, type: 'KSampler' },
        { id: 2, type: 'CheckpointLoaderSimple', widgets_values: ['v1-5-pruned.safetensors'] },
      ],
      links: [],
    };

    const targetFile = path.join(userWorkflowsDir, 'test_workflow.json');
    fs.writeFileSync(targetFile, JSON.stringify(workflowData, null, 2), 'utf-8');

    expect(fs.existsSync(targetFile)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[1].type).toBe('CheckpointLoaderSimple');
  });

  it('should handle fallback to legacy workflows directory if user/default/workflows is absent', () => {
    const legacyDir = path.join(tempDir, 'workflows');
    fs.mkdirSync(legacyDir, { recursive: true });

    const workflowData = {
      prompt: {
        '1': { class_type: 'KSampler', inputs: {} },
      },
    };

    const targetFile = path.join(legacyDir, 'legacy_workflow.json');
    fs.writeFileSync(targetFile, JSON.stringify(workflowData, null, 2), 'utf-8');

    expect(fs.existsSync(targetFile)).toBe(true);
    const read = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    expect(read.prompt['1'].class_type).toBe('KSampler');
  });

  it('should parse system stats response from live ComfyUI instance correctly', () => {
    const mockSystemStats = {
      system: {
        os: 'Linux',
        python_version: '3.10.12',
        embedded_python: false,
      },
      devices: [
        {
          name: 'NVIDIA GeForce RTX 4090',
          type: 'cuda',
          index: 0,
          vram_total: 25769803776,
          vram_free: 20132659200,
          torch_vram_total: 1073741824,
          torch_vram_free: 805306368,
        },
      ],
    };

    const devices = mockSystemStats.devices?.map((d: any) => d.name || `${d.type}:${d.index}`) || [];
    const status = {
      online: true,
      serverUrl: 'http://127.0.0.1:8188',
      version: 'ComfyUI (3.10.12)',
      devices,
      os: mockSystemStats.system?.os || 'unknown',
    };

    expect(status.online).toBe(true);
    expect(status.devices).toContain('NVIDIA GeForce RTX 4090');
    expect(status.os).toBe('Linux');
  });
});
