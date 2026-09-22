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
import { WorkflowScanner } from '../src/services/workflowScanner';

describe('WorkflowScanner', () => {
  const scanner = new WorkflowScanner();

  it('should extract models from ComfyUI API prompt JSON format', () => {
    const promptData = {
      '3': {
        class_type: 'KSampler',
        inputs: { seed: 12345 },
      },
      '4': {
        class_type: 'CheckpointLoaderSimple',
        inputs: {
          ckpt_name: 'v1-5-pruned-emaonly.safetensors',
        },
      },
      '10': {
        class_type: 'LoraLoader',
        inputs: {
          lora_name: 'detail_slider_v1.safetensors',
          strength_model: 1.0,
        },
      },
      '15': {
        class_type: 'VAELoader',
        inputs: {
          vae_name: 'vae-ft-mse-840000-ema-pruned.safetensors',
        },
      },
    };

    const localMap = new Map<string, string>([
      ['v1-5-pruned-emaonly.safetensors', 'D:\\ComfyUI\\models\\checkpoints\\v1-5-pruned-emaonly.safetensors'],
    ]);

    const refs = scanner.extractModelReferences(promptData, localMap);
    expect(refs.length).toBe(3);

    const ckpt = refs.find((r) => r.nodeType === 'CheckpointLoaderSimple');
    expect(ckpt).toBeDefined();
    expect(ckpt?.modelName).toBe('v1-5-pruned-emaonly.safetensors');
    expect(ckpt?.isInstalled).toBe(true);

    const lora = refs.find((r) => r.nodeType === 'LoraLoader');
    expect(lora).toBeDefined();
    expect(lora?.modelName).toBe('detail_slider_v1.safetensors');
    expect(lora?.isInstalled).toBe(false);

    const vae = refs.find((r) => r.nodeType === 'VAELoader');
    expect(vae).toBeDefined();
    expect(vae?.modelName).toBe('vae-ft-mse-840000-ema-pruned.safetensors');
  });

  it('should extract models from ComfyUI UI workflow format', () => {
    const uiData = {
      nodes: [
        {
          id: 4,
          type: 'CheckpointLoaderSimple',
          widgets_values: ['sdxl_base_1.0.safetensors'],
        },
        {
          id: 7,
          type: 'CLIPVisionLoader',
          widgets_values: ['clip_vision_g.safetensors'],
        },
      ],
    };

    const localMap = new Map<string, string>([
      ['sdxl_base_1.0.safetensors', 'D:\\ComfyUI\\models\\checkpoints\\sdxl_base_1.0.safetensors'],
      ['clip_vision_g.safetensors', 'D:\\ComfyUI\\models\\clip_vision\\clip_vision_g.safetensors'],
    ]);

    const refs = scanner.extractModelReferences(uiData, localMap);
    expect(refs.length).toBe(2);
    expect(refs[0].isInstalled).toBe(true);
    expect(refs[1].isInstalled).toBe(true);
  });

  it('should parse raw JSON workflow directly from memory without disk access', async () => {
    const rawWorkflow = {
      workflow: {
        nodes: [
          {
            id: 1,
            type: 'CheckpointLoaderSimple',
            widgets_values: ['flux1-dev.safetensors'],
          },
          {
            id: 2,
            type: 'LoraLoader',
            widgets_values: ['realism_lora_v2.safetensors'],
          },
        ],
      },
    };

    const result = await scanner.parseWorkflow(rawWorkflow, 'custom_node_canvas.json');
    expect(result).toBeDefined();
    expect(result.fileName).toBe('custom_node_canvas.json');
    expect(result.fileType).toBe('json');
    expect(result.modelCount).toBe(2);
    expect(result.models.length).toBe(2);
    expect(result.models.map((m) => m.modelName)).toEqual(
      expect.arrayContaining(['flux1-dev.safetensors', 'realism_lora_v2.safetensors'])
    );
    expect(result.canvasGraph).toBeDefined();
    expect(result.canvasGraph?.nodes?.length).toBe(2);
  });

  it('should build canvasGraph from prompt execution dictionary with multi-slot outputs', async () => {
    const promptWorkflow = {
      prompt: {
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux.safetensors' } },
        '2': { class_type: 'KSampler', inputs: { model: ['1', 0], latent_image: ['3', 0] } },
        '3': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512 } },
        '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: 'a photo of a cat' } },
        '5': { class_type: 'VAEDecode', inputs: { samples: ['2', 0], vae: ['1', 2] } },
      },
    };

    const result = await scanner.parseWorkflow(promptWorkflow, 'prompt_graph.json');
    expect(result.canvasGraph).toBeDefined();
    expect(result.canvasGraph?.nodes?.length).toBe(5);
    expect(result.canvasGraph?.links?.length).toBe(5);

    const ckptNode = result.canvasGraph?.nodes?.find((n) => String(n.id) === '1');
    expect(ckptNode).toBeDefined();
    expect(ckptNode?.outputs?.length).toBe(3); // slots 0, 1, 2
  });

  it('should reject invalid non-ComfyUI JSON payloads with a descriptive error', async () => {
    const invalidJson = { name: 'some random object', count: 42 };
    await expect(scanner.parseWorkflow(invalidJson, 'random.json')).rejects.toThrow(
      'Invalid ComfyUI workflow JSON'
    );
  });

  it('should unpack stringified extra_pnginfo wrapper payloads', async () => {
    const wrappedWorkflow = {
      extra_pnginfo: {
        workflow: JSON.stringify({
          nodes: [
            {
              id: 10,
              type: 'CheckpointLoaderSimple',
              widgets_values: ['Illustrious_vPred_XL.safetensors'],
            },
          ],
        }),
      },
    };

    const result = await scanner.parseWorkflow(wrappedWorkflow, 'Illustrious_vPred_XL_comfyui.json');
    expect(result.models.length).toBe(1);
    expect(result.models[0].modelName).toBe('Illustrious_vPred_XL.safetensors');
    expect(result.nodeTypes).toContain('CheckpointLoaderSimple');
    expect(result.workflowFormat).toBe('full_canvas');
  });

  it('should accurately detect full_canvas vs api_prompt formats', () => {
    const fullCanvas = {
      nodes: [
        { id: 1, type: 'KSampler', pos: [100, 100], size: [200, 100], inputs: [], outputs: [] },
      ],
      links: [],
    };
    expect(scanner.detectWorkflowFormat(fullCanvas)).toBe('full_canvas');

    const apiPrompt = {
      '3': {
        class_type: 'KSampler',
        inputs: { seed: 12345, model: ['4', 0] },
      },
      '4': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'v1-5.safetensors' },
      },
    };
    expect(scanner.detectWorkflowFormat(apiPrompt)).toBe('api_prompt');

    const promptWrapper = {
      prompt: apiPrompt,
    };
    expect(scanner.detectWorkflowFormat(promptWrapper)).toBe('api_prompt');
  });
});

