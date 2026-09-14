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
import { dbManager } from '../db/db';
import { logger } from '../utils/logger';
import { civitaiClient } from './civitaiClient';
import { discoverCompanionFiles } from './libraryScanner';
import { ALLOWED_MODEL_EXTENSIONS, sanitizePathString } from '../utils/securityValidator';
import type {
  DuplicateModelFile,
  DuplicateCluster,
  StorageOptimizerScanResult,
  HardlinkExecutionResult,
  CompanionPackageResult,
  BulkCompanionPackageResult,
} from '../types/app';

export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export async function computeFileSHA256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath, { highWaterMark: 8 * 1024 * 1024 });
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toUpperCase()));
    stream.on('error', reject);
  });
}

export function canHardlinkFiles(
  path1: string,
  path2: string,
  stat1?: fs.Stats,
  stat2?: fs.Stats
): { canLink: boolean; reason?: string } {
  const resolved1 = path.resolve(path1);
  const resolved2 = path.resolve(path2);

  if (resolved1.toLowerCase() === resolved2.toLowerCase()) {
    return { canLink: false, reason: 'Target is the same file path.' };
  }

  // Windows volume root check (e.g. C:\ vs D:\)
  const root1 = path.parse(resolved1).root.toLowerCase();
  const root2 = path.parse(resolved2).root.toLowerCase();
  if (root1 !== root2) {
    return {
      canLink: false,
      reason: `Cross-drive links not supported by filesystem (${root1} vs ${root2}).`,
    };
  }

  // Device ID check on POSIX/ext4/btrfs
  if (stat1 && stat2 && stat1.dev !== undefined && stat2.dev !== undefined) {
    if (stat1.dev !== stat2.dev) {
      return {
        canLink: false,
        reason: 'Files reside on different filesystem mount devices.',
      };
    }
  }

  return { canLink: true };
}

export class StorageOptimizerService {
  /**
   * Scans the local model library to find identical files by SHA-256 hash.
   * Identifies already-hardlinked files (shared inode) and computes reclaimable space.
   */
  public async scanDuplicates(): Promise<StorageOptimizerScanResult> {
    const rows = await dbManager.all('SELECT * FROM local_models ORDER BY id ASC;');
    const hashGroups = new Map<string, Array<{ row: any; stat: fs.Stats; filePath: string }>>();

    let totalScanned = 0;
    let crossDriveCount = 0;

    for (const r of rows) {
      const filePath = r.file_path;
      if (!filePath || !fs.existsSync(filePath)) continue;

      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size === 0) continue;
        totalScanned++;

        let hash = r.sha256 ? r.sha256.toUpperCase() : null;
        if (!hash) {
          try {
            hash = await computeFileSHA256(filePath);
            await dbManager.run('UPDATE local_models SET sha256 = ? WHERE id = ?;', [hash, r.id]);
          } catch {
            continue;
          }
        }

        if (!hashGroups.has(hash)) {
          hashGroups.set(hash, []);
        }
        hashGroups.get(hash)!.push({ row: r, stat, filePath });
      } catch (err) {
        logger.warn(`Optimizer scan failed for file ${filePath}:`, err);
      }
    }

    const duplicateClusters: DuplicateCluster[] = [];
    let totalDuplicates = 0;
    let totalSavingsBytes = 0;

    for (const [sha256, entries] of hashGroups.entries()) {
      if (entries.length < 2) continue;

      // Primary master candidate is the first valid entry
      const masterEntry = entries[0];
      const masterStat = masterEntry.stat;
      const masterPath = masterEntry.filePath;
      const fileSize = masterStat.size;

      const clusterFiles: DuplicateModelFile[] = [];

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const isMaster = i === 0;
        const isHardlinked =
          !isMaster &&
          entry.stat.ino === masterStat.ino &&
          entry.stat.dev === masterStat.dev &&
          entry.stat.nlink > 1;

        const linkCheck = canHardlinkFiles(masterPath, entry.filePath, masterStat, entry.stat);
        if (!linkCheck.canLink && !isMaster) {
          crossDriveCount++;
        }

        clusterFiles.push({
          id: entry.row.id,
          filePath: entry.filePath,
          fileName: path.basename(entry.filePath),
          fileSize: entry.stat.size,
          sha256,
          modelType: entry.row.model_type || 'Checkpoint',
          baseModel: entry.row.base_model || '',
          civitaiName: entry.row.civitai_name || undefined,
          isMaster,
          isHardlinked,
          inode: entry.stat.ino,
          dev: entry.stat.dev,
          canHardlink: linkCheck.canLink && !isHardlinked,
          reason: isHardlinked ? 'Already hardlinked (zero duplicate space)' : linkCheck.reason,
        });

        if (!isMaster && !isHardlinked) {
          totalDuplicates++;
          if (linkCheck.canLink) {
            totalSavingsBytes += fileSize;
          }
        }
      }

      // Potential savings for this cluster
      const nonLinkedCount = clusterFiles.filter((f) => !f.isMaster && !f.isHardlinked && f.canHardlink).length;
      const clusterSavings = nonLinkedCount * fileSize;

      duplicateClusters.push({
        sha256,
        fileSize,
        masterPath,
        files: clusterFiles,
        potentialSavingsBytes: clusterSavings,
      });
    }

    return {
      totalScannedFiles: totalScanned,
      duplicateClusters,
      totalDuplicates,
      potentialSavingsBytes: totalSavingsBytes,
      potentialSavingsFormatted: formatBytes(totalSavingsBytes),
      crossDriveIncompatibles: crossDriveCount,
    };
  }

  /**
   * Atomically replaces a duplicate model file with an NTFS/ext4 hardlink pointing to masterPath.
   * Also synchronizes/links companion files (.sha256, .info, .preview) to the duplicate directory.
   */
  public async executeHardlink(masterPath: string, duplicatePath: string): Promise<boolean> {
    const resolvedMaster = sanitizePathString(masterPath);
    const resolvedDuplicate = sanitizePathString(duplicatePath);

    if (!resolvedMaster || !resolvedDuplicate) {
      throw new Error('Invalid or unsafe file path provided for hardlink execution.');
    }

    if (resolvedMaster.toLowerCase() === resolvedDuplicate.toLowerCase()) {
      throw new Error('Master and duplicate target are the exact same path.');
    }

    const masterExt = path.extname(resolvedMaster).toLowerCase();
    const dupExt = path.extname(resolvedDuplicate).toLowerCase();
    if (!ALLOWED_MODEL_EXTENSIONS.has(masterExt) || !ALLOWED_MODEL_EXTENSIONS.has(dupExt)) {
      throw new Error('Hardlink deduplication is only permitted for supported AI model file types.');
    }

    if (!fs.existsSync(resolvedMaster)) {
      throw new Error(`Master file does not exist: ${resolvedMaster}`);
    }
    if (!fs.existsSync(resolvedDuplicate)) {
      throw new Error(`Duplicate file does not exist: ${resolvedDuplicate}`);
    }

    const masterStat = fs.statSync(resolvedMaster);
    const dupStat = fs.statSync(resolvedDuplicate);

    // Verify hardlink capability
    const linkCheck = canHardlinkFiles(resolvedMaster, resolvedDuplicate, masterStat, dupStat);
    if (!linkCheck.canLink) {
      throw new Error(`Cannot hardlink files: ${linkCheck.reason}`);
    }

    // If already hardlinked, nothing to do
    if (masterStat.ino === dupStat.ino && masterStat.dev === dupStat.dev && masterStat.nlink > 1) {
      logger.info(`Files are already hardlinked: ${resolvedDuplicate} -> ${resolvedMaster}`);
      return true;
    }

    // Atomic Hardlink replacement:
    // 1. Create temp hardlink in target folder
    const targetDir = path.dirname(resolvedDuplicate);
    const tempLinkPath = path.join(targetDir, `.cmm-tmp-link-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);

    try {
      fs.linkSync(resolvedMaster, tempLinkPath);
      // 2. Atomic rename over existing duplicate
      fs.renameSync(tempLinkPath, resolvedDuplicate);
      logger.info(`Successfully deduplicated with hardlink: ${resolvedDuplicate} -> ${resolvedMaster}`);

      // 3. Ensure duplicate folder also has companion packaging
      await this.syncCompanionsForHardlink(resolvedMaster, resolvedDuplicate);

      return true;
    } catch (err: any) {
      if (fs.existsSync(tempLinkPath)) {
        try {
          fs.unlinkSync(tempLinkPath);
        } catch {}
      }
      logger.error(`Failed hardlink execution for ${resolvedDuplicate}:`, err);
      throw err;
    }
  }

  /**
   * Synchronizes companion files from master to duplicate directory so both copies are fully packaged.
   */
  private async syncCompanionsForHardlink(masterPath: string, duplicatePath: string): Promise<void> {
    try {
      const masterCompanions = discoverCompanionFiles(masterPath);
      const masterExt = path.extname(masterPath);
      const masterBase = masterPath.slice(0, -masterExt.length);

      const dupExt = path.extname(duplicatePath);
      const dupBase = duplicatePath.slice(0, -dupExt.length);

      // Sibling .sha256
      if (masterCompanions.companionHash) {
        const dupShaFile = `${dupBase}.sha256`;
        if (!fs.existsSync(dupShaFile)) {
          fs.writeFileSync(dupShaFile, masterCompanions.companionHash.trim(), 'utf8');
        }
      }

      // Sibling .info metadata (preserve multi-part suffix like .civitai.info)
      if (masterCompanions.companionInfoPath && fs.existsSync(masterCompanions.companionInfoPath)) {
        const suffix = masterCompanions.companionInfoPath.slice(masterBase.length);
        const dupInfoFile = `${dupBase}${suffix}`;
        if (!fs.existsSync(dupInfoFile)) {
          fs.copyFileSync(masterCompanions.companionInfoPath, dupInfoFile);
        }
      }

      // Sibling preview image (preserve multi-part suffix like .preview.png)
      if (masterCompanions.localImagePath && fs.existsSync(masterCompanions.localImagePath)) {
        const suffix = masterCompanions.localImagePath.slice(masterBase.length);
        const dupImgFile = `${dupBase}${suffix}`;
        if (!fs.existsSync(dupImgFile)) {
          fs.copyFileSync(masterCompanions.localImagePath, dupImgFile);
        }
      }
    } catch (err) {
      logger.warn(`Failed companion sync for hardlinked file ${duplicatePath}:`, err);
    }
  }

  /**
   * Generates missing companion triplet files (.sha256, .civitai.info / .huggingface.info, preview image)
   * for a specific model in the library so it is 100% compatible with RenegadeSwarm packaging.
   */
  public async packageCompanionFilesForModel(filePath: string): Promise<CompanionPackageResult> {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return {
        filePath: resolvedPath,
        sha256Created: false,
        infoJsonCreated: false,
        imageCreated: false,
        error: 'Model file not found on disk',
      };
    }

    const ext = path.extname(resolvedPath);
    const baseWithoutExt = resolvedPath.slice(0, -ext.length);

    let sha256Created = false;
    let infoJsonCreated = false;
    let imageCreated = false;

    try {
      // 1. Check or create .sha256 companion
      const shaFile = `${baseWithoutExt}.sha256`;
      let sha256Hash: string | null = null;
      if (!fs.existsSync(shaFile)) {
        // Check if DB already has hash (matching both normalized and native slash paths)
        const altPath = resolvedPath.includes('\\') ? resolvedPath.replace(/\\/g, '/') : resolvedPath.replace(/\//g, '\\');
        const row = await dbManager.get(
          'SELECT sha256, civitai_model_id, civitai_version_id, civitai_name, model_type, preview_url FROM local_models WHERE file_path = ? OR file_path = ?;',
          [resolvedPath, altPath]
        );
        sha256Hash = row?.sha256 || null;
        if (!sha256Hash) {
          sha256Hash = await computeFileSHA256(resolvedPath);
          await dbManager.run('UPDATE local_models SET sha256 = ? WHERE file_path = ? OR file_path = ?;', [sha256Hash, resolvedPath, altPath]);
        }
        fs.writeFileSync(shaFile, sha256Hash.trim(), 'utf8');
        sha256Created = true;
      } else {
        sha256Hash = fs.readFileSync(shaFile, 'utf8').trim();
      }

      // 2. Check or create .info companion
      const possibleInfoFiles = [
        `${baseWithoutExt}.civitai.info`,
        `${baseWithoutExt}.huggingface.info`,
        `${baseWithoutExt}.info`,
      ];
      const hasInfoFile = possibleInfoFiles.some((f) => fs.existsSync(f));

      const altPath = resolvedPath.includes('\\') ? resolvedPath.replace(/\\/g, '/') : resolvedPath.replace(/\//g, '\\');
      const row = await dbManager.get('SELECT * FROM local_models WHERE file_path = ? OR file_path = ?;', [resolvedPath, altPath]);

      if (!hasInfoFile && row) {
        let infoData: any = null;
        const isHf = Boolean(row.hf_repo_id);
        const infoFileName = isHf ? `${baseWithoutExt}.huggingface.info` : `${baseWithoutExt}.civitai.info`;

        // If Civitai ID exists, try fetching official metadata
        if (!isHf && row.civitai_version_id) {
          try {
            infoData = await civitaiClient.fetchModelVersion(row.civitai_version_id);
          } catch {}
        }

        // Fallback to structured DB record
        if (!infoData) {
          infoData = {
            id: row.civitai_version_id || 0,
            modelId: row.civitai_model_id || 0,
            name: row.civitai_name || path.basename(resolvedPath),
            modelType: row.model_type || 'Checkpoint',
            hashes: {
              SHA256: sha256Hash,
            },
            files: [
              {
                name: path.basename(resolvedPath),
                sizeKB: Math.round((fs.statSync(resolvedPath).size || 0) / 1024),
                hashes: {
                  SHA256: sha256Hash,
                },
              },
            ],
            images: row.preview_url ? [{ url: row.preview_url }] : [],
            packagedBy: 'RenegadeCMM',
            packagedAt: new Date().toISOString(),
          };
        }

        fs.writeFileSync(infoFileName, JSON.stringify(infoData, null, 2), 'utf8');
        infoJsonCreated = true;
      }

      // 3. Check or create preview image
      const companions = discoverCompanionFiles(resolvedPath);
      if (!companions.localImagePath && row?.preview_url) {
        // If preview image exists in local cache or can be saved
        const previewCandidates = [
          `${baseWithoutExt}.png`,
          `${baseWithoutExt}.jpg`,
          `${baseWithoutExt}.jpeg`,
          `${baseWithoutExt}.webp`,
        ];
        if (!previewCandidates.some((p) => fs.existsSync(p))) {
          // Check local image cache
          const cacheDir = path.join(process.cwd(), 'cache', 'images');
          if (fs.existsSync(cacheDir)) {
            const cachedFiles = fs.readdirSync(cacheDir);
            const foundCached = cachedFiles.find((c) => c.includes(sha256Hash || '___nonexistent'));
            if (foundCached) {
              const cachedPath = path.join(cacheDir, foundCached);
              const targetImg = `${baseWithoutExt}.png`;
              fs.copyFileSync(cachedPath, targetImg);
              imageCreated = true;
            }
          }
        }
      }

      return {
        filePath: resolvedPath,
        sha256Created,
        infoJsonCreated,
        imageCreated,
      };
    } catch (err: any) {
      logger.error(`Failed packaging companions for ${resolvedPath}:`, err);
      return {
        filePath: resolvedPath,
        sha256Created,
        infoJsonCreated,
        imageCreated,
        error: err.message || 'Unknown packaging error',
      };
    }
  }

  /**
   * Bulk scans all library models and generates missing companion triplets.
   */
  public async packageAllMissingCompanions(): Promise<BulkCompanionPackageResult> {
    const rows = await dbManager.all('SELECT file_path FROM local_models;');
    let shaCount = 0;
    let infoCount = 0;
    let imgCount = 0;
    let processed = 0;
    const errors: Array<{ filePath: string; error: string }> = [];

    for (const r of rows) {
      if (!r.file_path || !fs.existsSync(r.file_path)) continue;
      processed++;
      const result = await this.packageCompanionFilesForModel(r.file_path);
      if (result.sha256Created) shaCount++;
      if (result.infoJsonCreated) infoCount++;
      if (result.imageCreated) imgCount++;
      if (result.error) {
        errors.push({ filePath: r.file_path, error: result.error });
      }
    }

    return {
      totalModels: rows.length,
      processed,
      sha256CreatedCount: shaCount,
      infoJsonCreatedCount: infoCount,
      imageCreatedCount: imgCount,
      errors,
    };
  }
}

export const storageOptimizer = new StorageOptimizerService();
