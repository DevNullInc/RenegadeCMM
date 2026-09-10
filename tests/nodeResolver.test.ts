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
import { NodeResolverService } from '../src/services/nodeResolverService';

describe('NodeResolverService', () => {
  let resolver: NodeResolverService;
  let tempDir: string;

  beforeEach(() => {
    resolver = new NodeResolverService();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmm-node-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should detect Python binary in embedded or virtual environment structures', () => {
    // 1. Simulate a Linux venv structure
    const venvDir = path.join(tempDir, 'venv', 'bin');
    fs.mkdirSync(venvDir, { recursive: true });
    const mockVenvPy = path.join(venvDir, 'python');
    fs.writeFileSync(mockVenvPy, '#!/bin/sh');

    const detectedVenv = resolver.detectPythonBinary(tempDir);
    expect(detectedVenv).toBe(mockVenvPy);

    // 2. Simulate Windows portable python_embeded structure
    const winDir = path.join(tempDir, 'win_install');
    const embedDir = path.join(winDir, 'python_embeded');
    fs.mkdirSync(embedDir, { recursive: true });
    const mockEmbedPy = path.join(embedDir, 'python.exe');
    fs.writeFileSync(mockEmbedPy, '');

    const detectedEmbed = resolver.detectPythonBinary(winDir);
    expect(detectedEmbed).toBe(mockEmbedPy);
  });

  it('should scan local custom nodes, extract NODE_CLASS_MAPPINGS, and detect dependencies', async () => {
    const customNodesDir = path.join(tempDir, 'custom_nodes');
    const impactPackDir = path.join(customNodesDir, 'ComfyUI-Impact-Pack');
    fs.mkdirSync(impactPackDir, { recursive: true });

    // Write __init__.py containing NODE_CLASS_MAPPINGS
    const initPyContent = `
from .nodes import ImpactWildcardProcessor, ImpactKSampler

NODE_CLASS_MAPPINGS = {
    "ImpactWildcardProcessor": ImpactWildcardProcessor,
    "ImpactKSampler": ImpactKSampler,
    "ImpactImageBatch": None
}
`;
    fs.writeFileSync(path.join(impactPackDir, '__init__.py'), initPyContent);
    fs.writeFileSync(path.join(impactPackDir, 'requirements.txt'), 'numpy>=1.22.0\npillow\n');
    fs.writeFileSync(path.join(impactPackDir, 'install.py'), 'print("Installing impact pack")');

    const pkgs = await resolver.inspectLocalCustomNodes(customNodesDir);
    expect(pkgs.length).toBe(1);

    const pkg = pkgs[0];
    expect(pkg.folderName).toBe('ComfyUI-Impact-Pack');
    expect(pkg.hasRequirements).toBe(true);
    expect(pkg.hasInstallScript).toBe(true);
    expect(pkg.nodeClasses).toContain('ImpactWildcardProcessor');
    expect(pkg.nodeClasses).toContain('ImpactKSampler');
    expect(pkg.nodeClasses).toContain('ImpactImageBatch');
  });

  it('should resolve node as installed when mapped via NODE_CLASS_MAPPINGS even if folder name differs', async () => {
    const customNodesDir = path.join(tempDir, 'custom_nodes');
    const customDir = path.join(customNodesDir, 'my_custom_pack');
    fs.mkdirSync(customDir, { recursive: true });

    fs.writeFileSync(
      path.join(customDir, 'nodes.py'),
      'NODE_CLASS_MAPPINGS = { "LTXVideoSampler": object }'
    );

    const res = await resolver.resolveMissingNode('LTXVideoSampler', customNodesDir, tempDir);
    expect(res.isInstalled).toBe(true);
    expect(res.installedFolder).toBe('my_custom_pack');
  });

  it('should sanitize search query by removing prefixes and suffixes', async () => {
    // Test query building internally without triggering external network calls
    const mockFetcher = (resolver as any);
    let capturedQuery = '';
    mockFetcher.executeGitHubSearch = async (q: string, _limit: number) => {
      capturedQuery = q;
      return [];
    };

    await resolver.searchGitHubNodes('ComfyUI-LTXVideoSampler', 3);
    // Should prioritize topic:comfyui and strip prefix/suffix
    expect(capturedQuery).toBe('ComfyUI LTXVideo in:name,description');
  });

  it('should extract node class types from workflow JSON in WorkflowScanner', async () => {
    const { WorkflowScanner } = await import('../src/services/workflowScanner');
    const scanner = new WorkflowScanner();

    const workflowData = {
      nodes: [
        { id: 1, type: 'CheckpointLoaderSimple' },
        { id: 2, type: 'LTXVideoSampler' },
        { id: 3, type: 'ImpactWildcardProcessor' },
      ],
    };

    const types = scanner.extractNodeTypes(workflowData);
    expect(types).toEqual(['CheckpointLoaderSimple', 'ImpactWildcardProcessor', 'LTXVideoSampler']);

    const promptData = {
      '1': { class_type: 'KSampler', inputs: {} },
      '2': { class_type: 'DualCLIPLoader', inputs: {} },
    };

    const promptTypes = scanner.extractNodeTypes(promptData);
    expect(promptTypes).toEqual(['DualCLIPLoader', 'KSampler']);
  });

  it('should detect ComfyUI-Model-Manager companion node in custom_nodes', async () => {
    const customNodesDir = path.join(tempDir, 'custom_nodes');
    const cmmNodeDir = path.join(customNodesDir, 'ComfyUI-Model-Manager');
    fs.mkdirSync(cmmNodeDir, { recursive: true });
    fs.writeFileSync(path.join(cmmNodeDir, 'cmm_client.py'), '# CMM Python Client');
    fs.writeFileSync(
      path.join(cmmNodeDir, '__init__.py'),
      'NODE_CLASS_MAPPINGS = { "CMMInspectWorkflow": object, "CMMDownloadModel": object }'
    );

    const pkgs = await resolver.inspectLocalCustomNodes(customNodesDir);
    expect(pkgs.length).toBe(1);
    expect(pkgs[0].folderName).toBe('ComfyUI-Model-Manager');
    expect(pkgs[0].nodeClasses).toContain('CMMInspectWorkflow');
    expect(pkgs[0].nodeClasses).toContain('CMMDownloadModel');
  });

  it('should verify full ComfyUI directory structure markers', async () => {
    const comfyRootDir = path.join(tempDir, 'mock_comfyui');
    const modelsDir = path.join(comfyRootDir, 'models');
    const checkpointsDir = path.join(modelsDir, 'checkpoints');
    const lorasDir = path.join(modelsDir, 'loras');
    const customNodes = path.join(comfyRootDir, 'custom_nodes');
    const inputDir = path.join(comfyRootDir, 'input');
    const outputDir = path.join(comfyRootDir, 'output');

    fs.mkdirSync(checkpointsDir, { recursive: true });
    fs.mkdirSync(lorasDir, { recursive: true });
    fs.mkdirSync(customNodes, { recursive: true });
    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(comfyRootDir, 'main.py'), '# ComfyUI Main');
    fs.writeFileSync(path.join(comfyRootDir, 'extra_model_paths.yaml'), '# Extra paths');

    expect(fs.existsSync(path.join(comfyRootDir, 'main.py'))).toBe(true);
    expect(fs.existsSync(path.join(comfyRootDir, 'models'))).toBe(true);
    expect(fs.existsSync(path.join(comfyRootDir, 'custom_nodes'))).toBe(true);
    expect(fs.existsSync(path.join(comfyRootDir, 'input'))).toBe(true);
    expect(fs.existsSync(path.join(comfyRootDir, 'output'))).toBe(true);
    expect(fs.existsSync(path.join(comfyRootDir, 'extra_model_paths.yaml'))).toBe(true);
  });
});
