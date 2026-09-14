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
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { dbManager } from '../db/db';
import { ModelConversionResult, PythonEnvironmentStatus } from '../types/app';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export class ModelConverterService {
  private cachedEnv: { env: PythonEnvironmentStatus; timestamp: number; key: string } | null = null;

  /**
   * Resolves the best available Python interpreter and verifies required packages (torch, safetensors).
   */
  async getPythonEnvironment(
    customPythonPath?: string,
    comfyuiInstallDir?: string,
    forceRefresh = false
  ): Promise<PythonEnvironmentStatus> {
    const cacheKey = `${customPythonPath || ''}|${comfyuiInstallDir || ''}`;
    if (!forceRefresh && this.cachedEnv && this.cachedEnv.key === cacheKey && Date.now() - this.cachedEnv.timestamp < 60000) {
      return this.cachedEnv.env;
    }
    const candidates: Array<{ path: string; source: PythonEnvironmentStatus['source'] }> = [];

    // 1. User-configured custom Python path
    if (customPythonPath && customPythonPath.trim()) {
      candidates.push({ path: customPythonPath.trim(), source: 'custom' });
    }

    // 2. ComfyUI Embedded or Venv Python
    if (comfyuiInstallDir && comfyuiInstallDir.trim()) {
      const base = comfyuiInstallDir.trim();
      const isWin = process.platform === 'win32';

      if (isWin) {
        // Portable ComfyUI embedded python
        const embeddedWin = path.join(path.dirname(base), 'python_embeded', 'python.exe');
        const embeddedWinDirect = path.join(base, 'python_embeded', 'python.exe');
        candidates.push({ path: embeddedWin, source: 'comfyui_embedded' });
        candidates.push({ path: embeddedWinDirect, source: 'comfyui_embedded' });

        // ComfyUI virtualenv
        const venvWin = path.join(base, 'venv', 'Scripts', 'python.exe');
        candidates.push({ path: venvWin, source: 'comfyui_venv' });
      } else {
        const venvNix1 = path.join(base, 'venv', 'bin', 'python');
        const venvNix2 = path.join(base, 'venv', 'bin', 'python3');
        candidates.push({ path: venvNix1, source: 'comfyui_venv' });
        candidates.push({ path: venvNix2, source: 'comfyui_venv' });
      }
    }

    // 3. Local CMM Virtual Environment (.venv in project root)
    const projectVenv =
      process.platform === 'win32'
        ? path.join(process.cwd(), '.venv', 'Scripts', 'python.exe')
        : path.join(process.cwd(), '.venv', 'bin', 'python');
    candidates.push({ path: projectVenv, source: 'cmm_venv' });

    // 4. System Python
    candidates.push({ path: process.platform === 'win32' ? 'python.exe' : 'python3', source: 'system' });
    candidates.push({ path: 'python', source: 'system' });

    for (const c of candidates) {
      // If it's a file path that doesn't exist on disk, skip probing
      if ((c.path.includes('/') || c.path.includes('\\')) && !fs.existsSync(c.path)) {
        continue;
      }

      try {
        // Probe version and packages in one fast subcall
        const { stdout } = await execFileAsync(
          c.path,
          [
            '-c',
            `import sys, json
has_torch = False
has_st = False
try:
    import torch
    has_torch = True
except Exception:
    pass
try:
    import safetensors
    has_st = True
except Exception:
    pass
print(json.dumps({
    "version": sys.version.split()[0],
    "has_torch": has_torch,
    "has_st": has_st
}))`,
          ],
          { timeout: 6000 }
        );

        const data = JSON.parse(stdout.trim());
        const isReady = Boolean(data.has_torch && data.has_st);
        const resultEnv: PythonEnvironmentStatus = {
          available: true,
          pythonPath: c.path,
          version: data.version,
          source: c.source,
          hasTorch: data.has_torch,
          hasSafetensors: data.has_st,
          readyForConversion: isReady,
          error: !isReady
            ? `Python found (${data.version}), but missing required packages: ${[!data.has_torch ? 'torch' : '', !data.has_st ? 'safetensors' : ''].filter(Boolean).join(', ')}`
            : undefined,
        };
        this.cachedEnv = { env: resultEnv, timestamp: Date.now(), key: cacheKey };
        return resultEnv;
      } catch (err: any) {
        // Candidate failed execution, continue trying next
      }
    }

    const fallbackEnv: PythonEnvironmentStatus = {
      available: false,
      source: 'none',
      hasTorch: false,
      hasSafetensors: false,
      readyForConversion: false,
      error: 'No compatible Python interpreter found with PyTorch and safetensors installed.',
    };
    this.cachedEnv = { env: fallbackEnv, timestamp: Date.now(), key: cacheKey };
    return fallbackEnv;
  }

  /**
   * Converts a PyTorch pickle file (.ckpt, .pt, .bin) to a secure, zero-copy .safetensors file.
   */
  async convertPickleToSafetensors(
    sourcePath: string,
    options?: {
      deleteOriginal?: boolean;
      targetPath?: string;
      customPythonPath?: string;
      comfyuiInstallDir?: string;
    }
  ): Promise<ModelConversionResult> {
    const startTime = Date.now();

    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        sourcePath,
        error: `Source model file does not exist: ${sourcePath}`,
      };
    }

    const ext = path.extname(sourcePath).toLowerCase();
    if (ext !== '.ckpt' && ext !== '.pt' && ext !== '.bin') {
      return {
        success: false,
        sourcePath,
        error: `File is not a supported pickle format (.ckpt, .pt, .bin): ${ext}`,
      };
    }

    const targetPath = options?.targetPath || sourcePath.replace(/\.(ckpt|pt|bin)$/i, '.safetensors');
    if (sourcePath === targetPath) {
      return {
        success: false,
        sourcePath,
        error: 'Target path cannot be identical to source path',
      };
    }

    const env = await this.getPythonEnvironment(options?.customPythonPath, options?.comfyuiInstallDir);
    if (!env.available || !env.pythonPath || !env.readyForConversion) {
      return {
        success: false,
        sourcePath,
        targetPath,
        error: env.error || 'Python environment with torch and safetensors is not available.',
      };
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'convert_to_safetensors.py');
    if (!fs.existsSync(scriptPath)) {
      return {
        success: false,
        sourcePath,
        targetPath,
        error: `Conversion script not found at ${scriptPath}`,
      };
    }

    const originalStat = fs.statSync(sourcePath);
    logger.info(`Starting conversion of ${sourcePath} -> ${targetPath} using ${env.pythonPath}...`);

    try {
      const { stdout, stderr } = await execFileAsync(
        env.pythonPath,
        [scriptPath, sourcePath, targetPath],
        { timeout: 600000 } // 10 minutes max for massive 10GB+ checkpoints
      );

      let parsedOut: any = {};
      try {
        parsedOut = JSON.parse(stdout.trim());
      } catch {
        // Check if output was logged
      }

      if (!fs.existsSync(targetPath)) {
        throw new Error(parsedOut.error || stderr || 'Target safetensors file was not created by conversion script');
      }

      const targetStat = fs.statSync(targetPath);
      const newSha256 = await this.computeFileSha256(targetPath);

      // Synchronize companion files (.sha256, .civitai.info, preview images)
      await this.synchronizeCompanionFiles(sourcePath, targetPath, newSha256);

      // Update SQLite database record if model was indexed
      const targetFileName = path.basename(targetPath);
      await dbManager.run(
        `UPDATE local_models
         SET file_path = ?, file_name = ?, sha256 = ?, file_size = ?, modified_at = ?
         WHERE file_path = ?;`,
        [targetPath, targetFileName, newSha256, targetStat.size, targetStat.mtimeMs, sourcePath]
      );

      let deletedOriginal = false;
      if (options?.deleteOriginal) {
        try {
          fs.unlinkSync(sourcePath);
          deletedOriginal = true;
          logger.info(`Deleted original legacy pickle model: ${sourcePath}`);
        } catch (delErr: any) {
          logger.warn(`Could not delete original pickle file ${sourcePath}: ${delErr.message}`);
        }
      }

      const elapsed = Date.now() - startTime;
      logger.info(`Successfully converted ${sourcePath} -> ${targetPath} in ${elapsed}ms (${targetStat.size} bytes).`);

      return {
        success: true,
        sourcePath,
        targetPath,
        originalSize: originalStat.size,
        convertedSize: targetStat.size,
        newSha256,
        timeTakenMs: elapsed,
        deletedOriginal,
      };
    } catch (err: any) {
      logger.error(`Pickle to safetensors conversion failed for ${sourcePath}:`, err);

      // Cleanup target partial file if failed
      if (fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {}
      }

      return {
        success: false,
        sourcePath,
        targetPath,
        error: err?.message || 'Conversion execution failed',
      };
    }
  }

  /**
   * Synchronizes companion metadata, preview, and checksum files for the converted model.
   */
  private async synchronizeCompanionFiles(sourcePath: string, targetPath: string, newSha256: string): Promise<void> {
    const sourceDir = path.dirname(sourcePath);
    const sourceBase = path.basename(sourcePath);
    const targetDir = path.dirname(targetPath);
    const targetBase = path.basename(targetPath);

    // 1. Write updated SHA256 checksum file
    const targetShaPath = path.join(targetDir, `${targetBase}.sha256`);
    try {
      fs.writeFileSync(targetShaPath, `${newSha256} *${targetBase}\n`, 'utf-8');
    } catch {}

    // 2. Synchronize info files (.civitai.info, .huggingface.info, .info)
    const infoExtensions = ['.civitai.info', '.huggingface.info', '.info'];
    for (const ext of infoExtensions) {
      const srcInfo = path.join(sourceDir, `${sourceBase}${ext}`);
      const dstInfo = path.join(targetDir, `${targetBase}${ext}`);
      if (fs.existsSync(srcInfo) && !fs.existsSync(dstInfo)) {
        try {
          fs.copyFileSync(srcInfo, dstInfo);
        } catch {}
      }
    }

    // 3. Synchronize preview images (.png, .jpeg, .jpg, .webp)
    const imageExtensions = ['.png', '.jpeg', '.jpg', '.webp', '.preview.png'];
    for (const ext of imageExtensions) {
      const srcImg = path.join(sourceDir, `${sourceBase}${ext}`);
      const dstImg = path.join(targetDir, `${targetBase}${ext}`);
      if (fs.existsSync(srcImg) && !fs.existsSync(dstImg)) {
        try {
          fs.copyFileSync(srcImg, dstImg);
        } catch {}
      }
    }
  }

  private computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}

export const modelConverter = new ModelConverterService();
