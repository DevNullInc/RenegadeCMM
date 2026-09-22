/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { describe, it, expect, vi } from 'vitest';
import { HuggingFaceClient } from '../src/services/huggingfaceClient';
import axios from 'axios';

vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { baseURL: '' },
  };
  return {
    default: {
      create: vi.fn(() => mockAxiosInstance),
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

describe('HuggingFaceClient', () => {
  it('should parse local HF cache folder path into human-readable repo title', () => {
    const client = new HuggingFaceClient();
    const parsed = client.parseLocalHFCache(
      'D:/ComfyUI/models/LLM/models--Qwen--Qwen2.5-7B-Instruct/snapshots/12345/model.safetensors'
    );
    expect(parsed.isHFCache).toBe(true);
    expect(parsed.repoId).toBe('Qwen/Qwen2.5-7B-Instruct');
  });

  it('should generate valid hf CLI download commands', () => {
    const client = new HuggingFaceClient();
    const cmd1 = client.getDownloadCommand('black-forest-labs/FLUX.1-dev');
    expect(cmd1).toBe('hf download black-forest-labs/FLUX.1-dev');

    const cmd2 = client.getDownloadCommand('black-forest-labs/FLUX.1-dev', 'flux1-dev.safetensors', 'D:\\models\\checkpoints');
    expect(cmd2).toBe('hf download black-forest-labs/FLUX.1-dev flux1-dev.safetensors --local-dir "D:\\models\\checkpoints"');
  });

  it('should handle repo check and separate safetensors/gguf files', async () => {
    const client = new HuggingFaceClient('fake_token');
    (client as any).axiosInstance.get = vi.fn().mockResolvedValueOnce({
      data: {
        id: 'stabilityai/stable-diffusion-xl-base-1.0',
        private: false,
        gated: false,
        pipeline_tag: 'text-to-image',
        tags: ['diffusers', 'stable-diffusion'],
        downloads: 500000,
        likes: 4000,
        siblings: [
          { rfilename: 'sd_xl_base_1.0.safetensors', size: 6938000000 },
          { rfilename: 'sd_xl_base_1.0.gguf', size: 4000000000 },
          { rfilename: 'README.md', size: 1024 },
        ],
      },
    });

    const result = await client.checkModelRepo('stabilityai/stable-diffusion-xl-base-1.0');
    expect(result.exists).toBe(true);
    expect(result.info?.modelName).toBe('stable-diffusion-xl-base-1.0');
    expect(result.info?.author).toBe('stabilityai');
    expect(result.safetensorsFiles).toContain('sd_xl_base_1.0.safetensors');
    expect(result.ggufFiles).toContain('sd_xl_base_1.0.gguf');
  });

  it('should reject invalid or traversal repo IDs', async () => {
    const client = new HuggingFaceClient();
    const result1 = await client.checkModelRepo('../../../etc/passwd');
    expect(result1.exists).toBe(false);
    expect(result1.error).toContain('Invalid Hugging Face repo ID format');

    const result2 = await client.checkModelRepo('invalid repo with spaces/model');
    expect(result2.exists).toBe(false);
    expect(result2.error).toContain('Invalid Hugging Face repo ID format');
  });

  it('should identify local model via Hugging Face search and match siblings', async () => {
    const client = new HuggingFaceClient();
    (client as any).axiosInstance.get = vi.fn().mockResolvedValueOnce({
      data: [
        {
          id: 'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF',
          author: 'Qwen',
          pipeline_tag: 'text-generation',
          tags: ['llm', 'qwen', 'gguf'],
          siblings: [
            {
              rfilename: 'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
              size: 4500000000,
              lfs: { sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2' },
            },
          ],
        },
      ],
    });

    const match = await client.matchModel(
      'D:/ComfyUI/models/LLM/qwen2.5-coder-7b-instruct-q4_k_m.gguf',
      'qwen2.5-coder-7b-instruct-q4_k_m.gguf',
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
    );

    expect(match).not.toBeNull();
    expect(match?.matched).toBe(true);
    expect(match?.repoId).toBe('Qwen/Qwen2.5-Coder-7B-Instruct-GGUF');
    expect(match?.modelType).toBe('GGUF');
  });

  it('should infer appropriate model types from metadata and filenames', () => {
    const client = new HuggingFaceClient();
    expect(client.inferModelType({ id: 'test', modelName: 'test', private: false, gated: false, tags: ['llm'] }, 'model.gguf')).toBe('GGUF');
    expect(client.inferModelType({ id: 'test', modelName: 'test', private: false, gated: false, tags: ['llm'], pipelineTag: 'text-generation' }, 'model.safetensors')).toBe('LLM');
    expect(client.inferModelType({ id: 'test', modelName: 'test', private: false, gated: false, tags: ['diffusers'], pipelineTag: 'text-to-image' }, 'flux1-lora.safetensors')).toBe('LORA');
    expect(client.inferModelType({ id: 'test', modelName: 'test', private: false, gated: false, tags: ['diffusers'], pipelineTag: 'text-to-image' }, 'flux1-dev.safetensors')).toBe('Checkpoint');
  });
});
