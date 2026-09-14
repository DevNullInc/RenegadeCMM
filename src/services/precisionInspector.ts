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
import { ModelPrecisionInfo, TensorPrecisionSummary } from '../types/app';
import { ggufParser } from './ggufParser';
import { logger } from '../utils/logger';

const OPTIMIZER_KEY_REGEX = /(?:optimizer|exp_avg|exp_avg_sq|adam|momentum|\.step$|loss_scale|model_ema|ema_decay)/i;

/**
 * Format raw byte quantities into human-readable disk sizes (B, KB, MB, GB, TB).
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export class PrecisionInspector {
  /**
   * Inspects a model file and extracts precision, tensor counts, optimizer states, and prunable savings.
   */
  async inspectModel(filePath: string): Promise<ModelPrecisionInfo> {
    const fileName = path.basename(filePath);

    if (!fs.existsSync(filePath)) {
      return {
        filePath,
        fileName,
        format: 'unknown',
        fileSize: 0,
        fileSizeFormatted: '0 B',
        precisionSummary: this.createEmptyPrecisionSummary(),
        error: `File does not exist: ${filePath}`,
      };
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.gguf') {
      return this.inspectGgufModel(filePath, fileName, stat.size);
    }

    if (ext === '.safetensors') {
      return this.inspectSafetensorsModel(filePath, fileName, stat.size);
    }

    if (ext === '.pt' || ext === '.bin' || ext === '.ckpt') {
      return {
        filePath,
        fileName,
        format: 'pickle/bin',
        fileSize: stat.size,
        fileSizeFormatted: formatBytes(stat.size),
        precisionSummary: {
          ...this.createEmptyPrecisionSummary(),
          primaryPrecision: 'Unknown',
        },
        metadata: {
          recommendation: 'Legacy PyTorch/Pickle format detected. Recommend converting to .safetensors for instant zero-copy loading and security.',
        },
      };
    }

    return {
      filePath,
      fileName,
      format: 'unknown',
      fileSize: stat.size,
      fileSizeFormatted: formatBytes(stat.size),
      precisionSummary: this.createEmptyPrecisionSummary(),
      error: `Unsupported file format: ${ext}`,
    };
  }

  /**
   * Zero-copy safetensors header parser and tensor analysis.
   */
  private inspectSafetensorsModel(filePath: string, fileName: string, fileSize: number): ModelPrecisionInfo {
    let fd: number | null = null;
    try {
      fd = fs.openSync(filePath, 'r');
      const headerLengthBuf = Buffer.alloc(8);
      const bytesRead = fs.readSync(fd, headerLengthBuf, 0, 8, 0);

      if (bytesRead < 8) {
        throw new Error('File too short to be a valid safetensors archive');
      }

      const headerLength = Number(headerLengthBuf.readBigUInt64LE(0));

      if (headerLength <= 0 || headerLength > 100 * 1024 * 1024) {
        throw new Error(`Invalid safetensors header length: ${headerLength} bytes`);
      }

      const headerBuf = Buffer.alloc(headerLength);
      fs.readSync(fd, headerBuf, 0, headerLength, 8);

      const headerStr = headerBuf.toString('utf-8');
      const headerJson = JSON.parse(headerStr);

      let f32Count = 0;
      let f16Count = 0;
      let bf16Count = 0;
      let i8Count = 0;
      let otherCount = 0;
      let totalTensors = 0;
      let totalParameters = 0;
      let optimizerTensorCount = 0;
      let estimatedOptimizerBytes = 0;

      const metadata: Record<string, string> = {};

      for (const [key, value] of Object.entries(headerJson)) {
        if (key === '__metadata__') {
          if (typeof value === 'object' && value !== null) {
            for (const [mKey, mVal] of Object.entries(value as Record<string, any>)) {
              metadata[mKey] = String(mVal);
            }
          }
          continue;
        }

        const tensor = value as { dtype?: string; shape?: number[]; data_offsets?: [number, number] };
        totalTensors++;

        const dtype = (tensor.dtype || '').toUpperCase();
        const shape = Array.isArray(tensor.shape) ? tensor.shape : [];
        const paramCount = shape.length > 0 ? shape.reduce((acc, dim) => acc * Math.max(1, dim), 1) : 1;
        totalParameters += paramCount;

        const isOptimizer = OPTIMIZER_KEY_REGEX.test(key);
        if (isOptimizer) {
          optimizerTensorCount++;
          if (tensor.data_offsets && Array.isArray(tensor.data_offsets) && tensor.data_offsets.length >= 2) {
            estimatedOptimizerBytes += Math.max(0, tensor.data_offsets[1] - tensor.data_offsets[0]);
          }
        }

        if (dtype === 'F32') {
          f32Count++;
        } else if (dtype === 'F16') {
          f16Count++;
        } else if (dtype === 'BF16') {
          bf16Count++;
        } else if (dtype === 'I8' || dtype === 'U8' || dtype === 'INT8' || dtype === 'UINT8') {
          i8Count++;
        } else {
          otherCount++;
        }
      }

      // Determine primary precision
      let primaryPrecision: TensorPrecisionSummary['primaryPrecision'] = 'Unknown';
      if (f32Count > 0 && f16Count === 0 && bf16Count === 0) {
        primaryPrecision = 'FP32';
      } else if (f16Count > 0 && f32Count === 0 && bf16Count === 0) {
        primaryPrecision = 'FP16';
      } else if (bf16Count > 0 && f32Count === 0 && f16Count === 0) {
        primaryPrecision = 'BF16';
      } else if (f32Count > 0 && (f16Count > 0 || bf16Count > 0)) {
        primaryPrecision = 'Mixed FP32/FP16';
      } else if (i8Count > 0 && f32Count === 0 && f16Count === 0 && bf16Count === 0) {
        primaryPrecision = 'Quantized / GGUF';
      }

      // Calculate prunable savings estimates
      let prunableBytesEstimate = 0;

      // 1. Optimizer states can be stripped 100%
      if (estimatedOptimizerBytes > 0) {
        prunableBytesEstimate += estimatedOptimizerBytes;
      }

      // 2. Pure FP32 weights can be halved in size when pruned to FP16/BF16
      if (primaryPrecision === 'FP32' && estimatedOptimizerBytes === 0) {
        prunableBytesEstimate += Math.round(fileSize * 0.48); // ~50% savings minus headers
      }

      const prunablePercentageEstimate = fileSize > 0
        ? Math.min(100, parseFloat(((prunableBytesEstimate / fileSize) * 100).toFixed(1)))
        : 0;

      const precisionSummary: TensorPrecisionSummary = {
        f32Count,
        f16Count,
        bf16Count,
        i8Count,
        otherCount,
        totalTensors,
        totalParameters,
        primaryPrecision,
        hasOptimizerStates: optimizerTensorCount > 0,
        optimizerTensorCount,
        estimatedOptimizerBytes,
        prunableBytesEstimate,
        prunablePercentageEstimate,
      };

      return {
        filePath,
        fileName,
        format: 'safetensors',
        fileSize,
        fileSizeFormatted: formatBytes(fileSize),
        precisionSummary,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
    } catch (err: any) {
      logger.warn(`Failed to inspect safetensors header for ${filePath}: ${err.message}`);
      return {
        filePath,
        fileName,
        format: 'safetensors',
        fileSize,
        fileSizeFormatted: formatBytes(fileSize),
        precisionSummary: this.createEmptyPrecisionSummary(),
        error: `Safetensors header inspection failed: ${err.message}`,
      };
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {}
      }
    }
  }

  /**
   * Inspects GGUF quantized models using ggufParser.
   */
  private inspectGgufModel(filePath: string, fileName: string, fileSize: number): ModelPrecisionInfo {
    try {
      const ggufMeta = ggufParser.inspectGGUF(filePath);
      if (!ggufMeta.valid) {
        return {
          filePath,
          fileName,
          format: 'gguf',
          fileSize,
          fileSizeFormatted: formatBytes(fileSize),
          precisionSummary: this.createEmptyPrecisionSummary(),
          error: ggufMeta.error || 'Invalid GGUF header',
        };
      }

      const quant = ggufMeta.quantization || 'Quantized';
      const precisionSummary: TensorPrecisionSummary = {
        f32Count: 0,
        f16Count: quant === 'F16' ? (ggufMeta.tensorCount || 0) : 0,
        bf16Count: quant === 'BF16' ? (ggufMeta.tensorCount || 0) : 0,
        i8Count: quant.startsWith('Q8') ? (ggufMeta.tensorCount || 0) : 0,
        otherCount: ggufMeta.tensorCount || 0,
        totalTensors: ggufMeta.tensorCount || 0,
        totalParameters: 0,
        primaryPrecision: 'Quantized / GGUF',
        hasOptimizerStates: false,
        optimizerTensorCount: 0,
        estimatedOptimizerBytes: 0,
        prunableBytesEstimate: 0,
        prunablePercentageEstimate: 0,
      };

      return {
        filePath,
        fileName,
        format: 'gguf',
        fileSize,
        fileSizeFormatted: formatBytes(fileSize),
        precisionSummary,
        quantization: quant,
        architecture: ggufMeta.architecture,
      };
    } catch (err: any) {
      return {
        filePath,
        fileName,
        format: 'gguf',
        fileSize,
        fileSizeFormatted: formatBytes(fileSize),
        precisionSummary: this.createEmptyPrecisionSummary(),
        error: `GGUF inspection failed: ${err.message}`,
      };
    }
  }

  private createEmptyPrecisionSummary(): TensorPrecisionSummary {
    return {
      f32Count: 0,
      f16Count: 0,
      bf16Count: 0,
      i8Count: 0,
      otherCount: 0,
      totalTensors: 0,
      totalParameters: 0,
      primaryPrecision: 'Unknown',
      hasOptimizerStates: false,
      optimizerTensorCount: 0,
      estimatedOptimizerBytes: 0,
      prunableBytesEstimate: 0,
      prunablePercentageEstimate: 0,
    };
  }
}

export const precisionInspector = new PrecisionInspector();
