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
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { dbManager } from '../db/db';
import { ModelConversionResult, PickleScanResult, PythonEnvironmentStatus } from '../types/app';
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
pkgs = {}
for mod in ['torch', 'safetensors', 'numpy', 'transformers', 'accelerate']:
    try:
        m = __import__(mod)
        pkgs[mod] = getattr(m, '__version__', 'installed')
    except Exception:
        pkgs[mod] = None
print(json.dumps({
    "version": sys.version.split()[0],
    "packages": pkgs,
    "has_torch": pkgs['torch'] is not None,
    "has_st": pkgs['safetensors'] is not None,
    "has_numpy": pkgs['numpy'] is not None,
    "has_transformers": pkgs['transformers'] is not None,
    "has_accelerate": pkgs['accelerate'] is not None
}))`,
          ],
          { timeout: 6000 }
        );

        const data = JSON.parse(stdout.trim());
        const isReady = Boolean(data.has_torch && data.has_st);
        const missingCore = [!data.has_torch ? 'torch' : '', !data.has_st ? 'safetensors' : ''].filter(Boolean);
        const resultEnv: PythonEnvironmentStatus = {
          available: true,
          pythonPath: c.path,
          version: data.version,
          source: c.source,
          hasTorch: Boolean(data.has_torch),
          hasSafetensors: Boolean(data.has_st),
          hasNumpy: Boolean(data.has_numpy),
          hasTransformers: Boolean(data.has_transformers),
          hasAccelerate: Boolean(data.has_accelerate),
          packages: data.packages || {},
          readyForConversion: isReady,
          error: !isReady
            ? `Python found (${data.version}), but missing required core packages: ${missingCore.join(', ')}`
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
      hasNumpy: false,
      hasTransformers: false,
      hasAccelerate: false,
      packages: {},
      readyForConversion: false,
      error: 'No compatible Python interpreter found with PyTorch and safetensors installed.',
    };
    this.cachedEnv = { env: fallbackEnv, timestamp: Date.now(), key: cacheKey };
    return fallbackEnv;
  }

  /**
   * Scans a PyTorch / pickle file's byte stream opcodes without code execution.
   * Identifies dangerous execution sinks (e.g. os.system, eval) and YOLO/Ultralytics layer definitions.
   */
  async scanPickleModel(
    sourcePath: string,
    options?: {
      customPythonPath?: string;
      comfyuiInstallDir?: string;
    }
  ): Promise<PickleScanResult> {
    if (!fs.existsSync(sourcePath)) {
      return {
        filePath: sourcePath,
        isSafe: false,
        isYolo: false,
        hasPythonCode: false,
        requiresPythonRuntime: false,
        dangerousGlobals: [],
        safeGlobals: [],
        yoloLayers: [],
        totalOpcodes: 0,
        recommendation: 'not_pickle',
        details: `File not found on disk: ${sourcePath}`,
      };
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'scan_pickle_safety.py');
    const env = await this.getPythonEnvironment(options?.customPythonPath, options?.comfyuiInstallDir);
    const pythonBin =
      env.available && env.pythonPath ? env.pythonPath : process.platform === 'win32' ? 'python.exe' : 'python3';

    try {
      const { stdout } = await execFileAsync(pythonBin, [scriptPath, sourcePath], { timeout: 30000 });
      const parsed: PickleScanResult = JSON.parse(stdout.trim());
      if (parsed.isSafe && (parsed.isYolo || parsed.recommendation === 'preserve_yolo_pt')) {
        try {
          const row: any = await dbManager.get(`SELECT sha256 FROM local_models WHERE file_path = ?`, [sourcePath]);
          let sha = row?.sha256;
          if (!sha) {
            sha = await this.computeFileSha256(sourcePath);
          }
          await dbManager.run(
            `UPDATE local_models
             SET pickle_scan_status = 'safe_yolo_pt', pickle_scanned_sha256 = ?, pickle_scanned_at = ?
             WHERE file_path = ?;`,
            [sha, Date.now(), sourcePath]
          );
        } catch (dbErr) {
          logger.warn(`Failed to update pickle_scan_status in db for ${sourcePath}:`, dbErr);
        }
      }
      return parsed;
    } catch (err: any) {
      logger.warn(`Pickle opcode scan failed via Python subprocess for ${sourcePath}:`, err?.message);
      return {
        filePath: sourcePath,
        isSafe: false,
        isYolo: false,
        hasPythonCode: false,
        requiresPythonRuntime: false,
        dangerousGlobals: [],
        safeGlobals: [],
        yoloLayers: [],
        totalOpcodes: 0,
        recommendation: 'not_pickle',
        details: `Opcode scan failed: ${err?.message || 'Unknown error'}`,
      };
    }
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

    // 0. Bytecode Opcode Safety & YOLO Pre-flight Scan (Zero Execution)
    const scanResult = await this.scanPickleModel(sourcePath, options);
    if (!scanResult.isSafe) {
      const dangStr = scanResult.dangerousGlobals.join(', ');
      logger.error(
        `[SECURITY BAN] Blocked malicious pickle model from conversion: ${sourcePath} -> Sinks: ${dangStr}`
      );
      return {
        success: false,
        sourcePath,
        targetPath,
        scanResult,
        error: `SECURITY BAN: Model contains dangerous executable opcodes (${dangStr}). Execution blocked.`,
      };
    }

    if (scanResult.isYolo || scanResult.recommendation === 'preserve_yolo_pt') {
      logger.info(
        `YOLO detector model detected: ${sourcePath}. Preserving as .pt to maintain bounding box detector functionality.`
      );
      try {
        const row: any = await dbManager.get(`SELECT sha256 FROM local_models WHERE file_path = ?`, [sourcePath]);
        let sha = row?.sha256;
        if (!sha) {
          sha = await this.computeFileSha256(sourcePath);
        }
        await dbManager.run(
          `UPDATE local_models
           SET pickle_scan_status = 'safe_yolo_pt', pickle_scanned_sha256 = ?, pickle_scanned_at = ?
           WHERE file_path = ?;`,
          [sha, Date.now(), sourcePath]
        );
      } catch (dbErr) {
        logger.warn(`Failed to update pickle_scan_status for ${sourcePath}:`, dbErr);
      }
      return {
        success: false,
        skipped: true,
        isYolo: true,
        sourcePath,
        targetPath,
        scanResult,
        error:
          'YOLO/Ultralytics models require Python layer definitions and will NOT function if converted to .safetensors. File preserved as .pt.',
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
        tensorCount: typeof parsedOut?.tensorCount === 'number' ? parsedOut.tensorCount : undefined,
        modelType: typeof parsedOut?.modelType === 'string' ? parsedOut.modelType : undefined,
        architecture: typeof parsedOut?.architecture === 'string' ? parsedOut.architecture : undefined,
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
