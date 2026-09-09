/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export interface GGUFMetadata {
  valid: boolean;
  version?: number;
  tensorCount?: number;
  metadataKvCount?: number;
  architecture?: string;
  name?: string;
  quantization?: string;
  fileType?: number;
  contextLength?: number;
  recommendedFolder?: string;
  error?: string;
}

const GGUF_MAGIC = 0x46554747; // 'GGUF' in little-endian

const GGML_FILE_TYPES: Record<number, string> = {
  0: 'F32',
  1: 'F16',
  2: 'Q4_0',
  3: 'Q4_1',
  6: 'Q5_0',
  7: 'Q5_1',
  8: 'Q8_0',
  9: 'Q8_1',
  10: 'Q2_K',
  11: 'Q3_K_S',
  12: 'Q3_K_M',
  13: 'Q3_K_L',
  14: 'Q4_K_S',
  15: 'Q4_K_M',
  16: 'Q5_K_S',
  17: 'Q5_K_M',
  18: 'Q6_K',
  19: 'IQ2_XXS',
  20: 'IQ2_XS',
  21: 'IQ3_XXS',
  22: 'IQ1_S',
  23: 'IQ4_NL',
  24: 'IQ3_S',
  25: 'IQ2_S',
  26: 'IQ4_XS',
  32: 'IQ1_M',
  33: 'BF16',
};

const DIFFUSION_ARCHITECTURES = new Set([
  'flux',
  'sd1',
  'sdxl',
  'sd3',
  'wan',
  'hunyuan',
  'cogvideox',
  'auraflow',
  'lumina',
  'hidream',
  'mochi',
]);

const LLM_ARCHITECTURES = new Set([
  'llama',
  'qwen',
  'qwen2',
  'mistral',
  'gemma',
  'gemma2',
  'phi',
  'phi3',
  'deepseek',
  'chatglm',
  'starcoder',
  'command-r',
]);

const TEXT_ENCODER_ARCHITECTURES = new Set([
  'clip',
  't5',
  't5encoder',
  'bert',
]);

export class GGUFParser {
  /**
   * Inspects a GGUF file buffer or file path, extracting architectural metadata
   * and recommending ComfyUI destination folders without loading model weights into memory.
   */
  inspectGGUF(source: string | Buffer): GGUFMetadata {
    let buffer: Buffer;
    let fileName = '';

    if (typeof source === 'string') {
      fileName = path.basename(source);
      if (!fs.existsSync(source)) {
        return { valid: false, error: `File not found: ${source}` };
      }
      let fd: number | null = null;
      try {
        fd = fs.openSync(source, 'r');
        // Read up to 128KB which comfortably encompasses GGUF key-value metadata
        buffer = Buffer.alloc(131072);
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        buffer = buffer.subarray(0, bytesRead);
      } catch (err: any) {
        return { valid: false, error: `Failed to read file: ${err.message}` };
      } finally {
        if (fd !== null) {
          try {
            fs.closeSync(fd);
          } catch {}
        }
      }
    } else {
      buffer = source;
    }

    if (buffer.length < 24) {
      return { valid: false, error: 'File too small to be a valid GGUF archive.' };
    }

    const magic = buffer.readUInt32LE(0);
    if (magic !== GGUF_MAGIC) {
      return { valid: false, error: 'Invalid GGUF header magic (expected GGUF).' };
    }

    const version = buffer.readUInt32LE(4);
    const tensorCount = Number(buffer.readBigUInt64LE(8));
    const metadataKvCount = Number(buffer.readBigUInt64LE(16));

    let offset = 24;
    let architecture: string | undefined;
    let name: string | undefined;
    let fileType: number | undefined;
    let contextLength: number | undefined;

    try {
      for (let i = 0; i < metadataKvCount && offset < buffer.length - 8; i++) {
        // Read key string: uint64 length + utf8 chars
        const keyLen = Number(buffer.readBigUInt64LE(offset));
        offset += 8;
        if (offset + keyLen > buffer.length) break;
        const key = buffer.toString('utf8', offset, offset + keyLen);
        offset += keyLen;

        // Read value type: uint32
        if (offset + 4 > buffer.length) break;
        const valType = buffer.readUInt32LE(offset);
        offset += 4;

        // Extract values of interest
        let strVal: string | undefined;
        let numVal: number | undefined;

        switch (valType) {
          case 0: // UINT8
            numVal = buffer.readUInt8(offset);
            offset += 1;
            break;
          case 1: // INT8
            numVal = buffer.readInt8(offset);
            offset += 1;
            break;
          case 2: // UINT16
            numVal = buffer.readUInt16LE(offset);
            offset += 2;
            break;
          case 3: // INT16
            numVal = buffer.readInt16LE(offset);
            offset += 2;
            break;
          case 4: // UINT32
            numVal = buffer.readUInt32LE(offset);
            offset += 4;
            break;
          case 5: // INT32
            numVal = buffer.readInt32LE(offset);
            offset += 4;
            break;
          case 6: // FLOAT32
            numVal = buffer.readFloatLE(offset);
            offset += 4;
            break;
          case 7: // BOOL
            offset += 1;
            break;
          case 8: { // STRING
            if (offset + 8 > buffer.length) break;
            const strLen = Number(buffer.readBigUInt64LE(offset));
            offset += 8;
            if (offset + strLen > buffer.length) break;
            strVal = buffer.toString('utf8', offset, offset + strLen);
            offset += strLen;
            break;
          }
          case 9: { // ARRAY: uint32 type + uint64 length + items
            if (offset + 12 > buffer.length) break;
            const elemType = buffer.readUInt32LE(offset);
            offset += 4;
            const arrLen = Number(buffer.readBigUInt64LE(offset));
            offset += 8;
            // Skip array elements safely
            offset = this.skipArrayElements(buffer, offset, elemType, arrLen);
            break;
          }
          case 10: // UINT64
            numVal = Number(buffer.readBigUInt64LE(offset));
            offset += 8;
            break;
          case 11: // INT64
            numVal = Number(buffer.readBigInt64LE(offset));
            offset += 8;
            break;
          case 12: // FLOAT64
            numVal = buffer.readDoubleLE(offset);
            offset += 8;
            break;
          default:
            // Unknown type: cannot reliably determine remaining offsets
            offset = buffer.length;
            break;
        }

        if (key === 'general.architecture' && strVal) {
          architecture = strVal.toLowerCase();
        } else if (key === 'general.name' && strVal) {
          name = strVal;
        } else if (key === 'general.file_type' && numVal !== undefined) {
          fileType = numVal;
        } else if (key.endsWith('.context_length') && numVal !== undefined) {
          contextLength = numVal;
        }
      }
    } catch (parseErr: any) {
      logger.warn('GGUF header key-value scan partially truncated:', parseErr.message);
    }

    // Resolve quantization string
    let quantization: string | undefined;
    if (fileType !== undefined && GGML_FILE_TYPES[fileType]) {
      quantization = GGML_FILE_TYPES[fileType];
    }
    // Check filename for explicit quantization overrides (e.g. flux-Q4_K_M.gguf)
    const match = fileName.match(/(Q[0-9]_[A-Z0-9_]+|BF16|F16|F32|IQ[0-9]_[A-Z0-9_]+)/i);
    if (match) {
      quantization = match[1].toUpperCase();
    }

    // Infer recommended ComfyUI folder
    let recommendedFolder = 'gguf';
    if (architecture) {
      const archLower = architecture.toLowerCase();
      if (DIFFUSION_ARCHITECTURES.has(archLower)) {
        recommendedFolder = 'unet';
      } else if (LLM_ARCHITECTURES.has(archLower)) {
        recommendedFolder = 'LLM';
      } else if (TEXT_ENCODER_ARCHITECTURES.has(archLower)) {
        recommendedFolder = 'text_encoders';
      }
    }

    return {
      valid: true,
      version,
      tensorCount,
      metadataKvCount,
      architecture,
      name,
      quantization,
      fileType,
      contextLength,
      recommendedFolder,
    };
  }

  private skipArrayElements(buffer: Buffer, offset: number, elemType: number, len: number): number {
    let cur = offset;
    for (let i = 0; i < len && cur < buffer.length; i++) {
      switch (elemType) {
        case 0:
        case 1:
        case 7:
          cur += 1;
          break;
        case 2:
        case 3:
          cur += 2;
          break;
        case 4:
        case 5:
        case 6:
          cur += 4;
          break;
        case 8: { // String inside array
          if (cur + 8 > buffer.length) return buffer.length;
          const sLen = Number(buffer.readBigUInt64LE(cur));
          cur += 8 + sLen;
          break;
        }
        case 10:
        case 11:
        case 12:
          cur += 8;
          break;
        default:
          return buffer.length;
      }
    }
    return cur;
  }
}

export const ggufParser = new GGUFParser();
