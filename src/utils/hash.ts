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
import crypto from 'crypto';
import fs from 'fs';

export interface HashProgressCallback {
  (bytesProcessed: number, totalBytes: number): void;
}

export async function computeFileSHA256(
  filePath: string,
  onProgress?: HashProgressCallback
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const stats = fs.statSync(filePath);
      const totalBytes = stats.size;
      let bytesProcessed = 0;

      const hash = crypto.createHash('sha256');
      // Use 64MB high-performance streaming buffer to saturate NVMe / SSD disk I/O
      // and utilize hardware SHA-NI / AVX-512 CPU crypto instructions with minimal syscall overhead
      const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 * 1024 });

      stream.on('data', (chunk: Buffer | string) => {
        hash.update(chunk);
        const len = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        bytesProcessed += len;
        if (onProgress) {
          onProgress(bytesProcessed, totalBytes);
        }
      });

      stream.on('end', () => {
        resolve(hash.digest('hex').toUpperCase());
      });

      stream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
