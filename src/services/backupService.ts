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
import AdmZip from 'adm-zip';
import { dbManager } from '../db/db';
import { logger } from '../utils/logger';

export interface BackupManifest {
  format: 'renegadecmm-backup-zip' | 'renegadecmm-settings';
  version: string;
  createdAt: string;
  stats: {
    modelsCount: number;
    downloadsCount: number;
    configCount: number;
    ignoredUpdatesCount: number;
    ignoredDuplicatesCount: number;
  };
}

export interface RestoreResult {
  success: boolean;
  message?: string;
  stats?: {
    modelsRestored: number;
    missingModelsCount?: number;
    downloadsRestored: number;
    configKeysRestored: number;
    ignoredUpdatesRestored: number;
    ignoredDuplicatesRestored: number;
  };
}

export class BackupService {
  /**
   * Generates a complete .zip backup archive in memory or returns a Buffer.
   */
  async createBackupZip(): Promise<Buffer> {
    try {
      const rawConfigRows = (await dbManager.all('SELECT * FROM app_config;')) || [];
      // Security: Strip private API keys and tokens from exported backup archives
      const configRows = rawConfigRows.filter(
        (r: any) => r && r.key !== 'civitai_api_key' && r.key !== 'huggingface_token'
      );
      const modelRows = (await dbManager.all('SELECT * FROM local_models;')) || [];
      const downloadRows = (await dbManager.all('SELECT * FROM downloads;')) || [];
      
      let ignoredUpdatesRows: any[] = [];
      try {
        ignoredUpdatesRows = (await dbManager.all('SELECT * FROM ignored_model_updates;')) || [];
      } catch (e) {}

      let ignoredDuplicatesRows: any[] = [];
      try {
        ignoredDuplicatesRows = (await dbManager.all('SELECT * FROM ignored_duplicates;')) || [];
      } catch (e) {}

      const manifest: BackupManifest = {
        format: 'renegadecmm-backup-zip',
        version: '1.5.0',
        createdAt: new Date().toISOString(),
        stats: {
          modelsCount: modelRows.length,
          downloadsCount: downloadRows.length,
          configCount: configRows.length,
          ignoredUpdatesCount: ignoredUpdatesRows.length,
          ignoredDuplicatesCount: ignoredDuplicatesRows.length,
        },
      };

      const zip = new AdmZip();

      // 1. Manifest
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

      // 2. Structured JSON snapshots (sanitized)
      zip.addFile('config.json', Buffer.from(JSON.stringify(configRows, null, 2), 'utf8'));
      zip.addFile('models.json', Buffer.from(JSON.stringify(modelRows, null, 2), 'utf8'));
      zip.addFile('downloads.json', Buffer.from(JSON.stringify(downloadRows, null, 2), 'utf8'));
      zip.addFile('ignored_updates.json', Buffer.from(JSON.stringify(ignoredUpdatesRows, null, 2), 'utf8'));
      zip.addFile('ignored_duplicates.json', Buffer.from(JSON.stringify(ignoredDuplicatesRows, null, 2), 'utf8'));

      const zipBuffer = zip.toBuffer();
      logger.info(`Backup zip generated successfully (${zipBuffer.length} bytes, ${modelRows.length} models)`);
      return zipBuffer;
    } catch (err: any) {
      logger.error('Failed to create backup zip:', err);
      throw err;
    }
  }

  /**
   * Exports backup .zip to a physical destination file path.
   */
  async exportBackup(destinationPath: string): Promise<void> {
    const buffer = await this.createBackupZip();
    fs.writeFileSync(destinationPath, buffer);
    logger.info(`Backup successfully exported to: ${destinationPath}`);
  }

  /**
   * Restores from a .zip buffer or file path (also backwards-compatible with legacy .json backups).
   */
  async restoreBackup(source: Buffer | string): Promise<RestoreResult> {
    try {
      let zipBuffer: Buffer;
      if (typeof source === 'string') {
        if (!fs.existsSync(source)) {
          throw new Error(`Backup file not found at: ${source}`);
        }
        zipBuffer = fs.readFileSync(source);
      } else {
        zipBuffer = source;
      }

      // Check if this is a legacy plain JSON file
      const firstFewBytes = zipBuffer.slice(0, 50).toString('utf8').trim();
      if (firstFewBytes.startsWith('{')) {
        return await this.restoreFromJsonString(zipBuffer.toString('utf8'));
      }

      // Parse as standard ZIP archive
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries();
      const getEntryText = (name: string): string | null => {
        const entry = entries.find((e) => e.entryName === name || e.name === name);
        return entry ? entry.getData().toString('utf8') : null;
      };

      let configRows: any[] = [];
      let modelRows: any[] = [];
      let downloadRows: any[] = [];
      let ignoredUpdatesRows: any[] = [];
      let ignoredDuplicatesRows: any[] = [];

      const configText = getEntryText('config.json');
      if (configText) {
        try { configRows = JSON.parse(configText); } catch (e) {}
      }

      const modelsText = getEntryText('models.json');
      if (modelsText) {
        try { modelRows = JSON.parse(modelsText); } catch (e) {}
      }

      const downloadsText = getEntryText('downloads.json');
      if (downloadsText) {
        try { downloadRows = JSON.parse(downloadsText); } catch (e) {}
      }

      const ignoredUpdatesText = getEntryText('ignored_updates.json');
      if (ignoredUpdatesText) {
        try { ignoredUpdatesRows = JSON.parse(ignoredUpdatesText); } catch (e) {}
      }

      const ignoredDuplicatesText = getEntryText('ignored_duplicates.json');
      if (ignoredDuplicatesText) {
        try { ignoredDuplicatesRows = JSON.parse(ignoredDuplicatesText); } catch (e) {}
      }

      await dbManager.exec('BEGIN TRANSACTION;');

      // 1. Restore App Config
      if (Array.isArray(configRows)) {
        for (const cfg of configRows) {
          if (cfg && cfg.key !== undefined) {
            await dbManager.run(
              'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
              [cfg.key, cfg.value]
            );
          }
        }
      }

      // 2. Restore Local Models
      if (Array.isArray(modelRows)) {
        for (const lm of modelRows) {
          if (lm && lm.id && lm.file_path) {
            await dbManager.run(
              `INSERT OR REPLACE INTO local_models 
                (id, file_path, file_name, file_size, modified_at, sha256, civitai_model_id, civitai_version_id, scanned_at, preview_url, model_type, is_duplicate, ignored_version_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                lm.id,
                lm.file_path,
                lm.file_name,
                lm.file_size,
                lm.modified_at,
                lm.sha256,
                lm.civitai_model_id,
                lm.civitai_version_id,
                lm.scanned_at || new Date().toISOString(),
                lm.preview_url || null,
                lm.model_type || null,
                lm.is_duplicate || 0,
                lm.ignored_version_id || null,
              ]
            );
          }
        }
      }

      // 3. Restore Downloads
      if (Array.isArray(downloadRows)) {
        for (const d of downloadRows) {
          if (d && d.id) {
            await dbManager.run(
              `INSERT OR REPLACE INTO downloads 
                (id, model_id, model_name, version_id, version_name, file_name, download_url, destination_path, total_bytes, downloaded_bytes, status, progress, speed, eta, created_at, completed_at, error)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                d.id,
                d.model_id,
                d.model_name,
                d.version_id,
                d.version_name,
                d.file_name,
                d.download_url,
                d.destination_path,
                d.total_bytes || 0,
                d.downloaded_bytes || 0,
                d.status || 'completed',
                d.progress || 100,
                d.speed || 0,
                d.eta || 0,
                d.created_at || new Date().toISOString(),
                d.completed_at || null,
                d.error || null,
              ]
            );
          }
        }
      }

      // 4. Restore Ignored Model Updates
      await dbManager.run(`
        CREATE TABLE IF NOT EXISTS ignored_model_updates (
          model_id INTEGER NOT NULL,
          version_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (model_id, version_id)
        );
      `);
      if (Array.isArray(ignoredUpdatesRows)) {
        for (const iu of ignoredUpdatesRows) {
          if (iu && iu.model_id && iu.version_id) {
            await dbManager.run(
              'INSERT OR REPLACE INTO ignored_model_updates (model_id, version_id, created_at) VALUES (?, ?, ?);',
              [iu.model_id, iu.version_id, iu.created_at || new Date().toISOString()]
            );
          }
        }
      }

      // 5. Restore Ignored Duplicates
      await dbManager.run(`
        CREATE TABLE IF NOT EXISTS ignored_duplicates (
          sha256 TEXT PRIMARY KEY,
          known_count INTEGER DEFAULT 2,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      if (Array.isArray(ignoredDuplicatesRows)) {
        for (const id of ignoredDuplicatesRows) {
          if (id && id.sha256) {
            await dbManager.run(
              'INSERT OR REPLACE INTO ignored_duplicates (sha256, known_count, created_at) VALUES (?, ?, ?);',
              [id.sha256.toUpperCase(), id.known_count || 2, id.created_at || new Date().toISOString()]
            );
          }
        }
      }

      await dbManager.exec('COMMIT;');
      const missingCount = modelRows.filter((lm: any) => lm && lm.file_path && !fs.existsSync(lm.file_path)).length;
      logger.info(`Backup zip restored successfully: ${modelRows.length} models (${missingCount} missing from disk), ${downloadRows.length} downloads, ${configRows.length} config keys.`);

      return {
        success: true,
        message: missingCount > 0 
          ? `Backup restored successfully! ${modelRows.length} model records loaded (${missingCount} missing from local disk).` 
          : 'Backup restored successfully',
        stats: {
          modelsRestored: modelRows.length,
          missingModelsCount: missingCount,
          downloadsRestored: downloadRows.length,
          configKeysRestored: configRows.length,
          ignoredUpdatesRestored: ignoredUpdatesRows.length,
          ignoredDuplicatesRestored: ignoredDuplicatesRows.length,
        },
      };
    } catch (err: any) {
      await dbManager.exec('ROLLBACK;').catch(() => {});
      logger.error('Failed to restore backup zip:', err);
      throw err;
    }
  }

  /**
   * Backwards-compatible legacy JSON restorer.
   */
  private async restoreFromJsonString(jsonStr: string): Promise<RestoreResult> {
    const data = JSON.parse(jsonStr);
    await dbManager.exec('BEGIN TRANSACTION;');

    let configCount = 0;
    let modelCount = 0;

    if (data.settings) {
      for (const [key, val] of Object.entries(data.settings)) {
        await dbManager.run(
          'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
          [key, typeof val === 'string' ? val : JSON.stringify(val)]
        );
        configCount++;
      }
    }

    let missingCount = 0;
    if (Array.isArray(data.localModels)) {
      for (const lm of data.localModels) {
        await dbManager.run(
          `INSERT OR REPLACE INTO local_models 
            (id, file_path, file_name, file_size, modified_at, sha256, civitai_model_id, civitai_version_id, scanned_at, is_duplicate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            lm.id,
            lm.file_path,
            lm.file_name,
            lm.file_size,
            lm.modified_at,
            lm.sha256,
            lm.civitai_model_id,
            lm.civitai_version_id,
            lm.scanned_at || new Date().toISOString(),
            lm.is_duplicate || 0,
          ]
        );
        modelCount++;
        if (lm.file_path && !fs.existsSync(lm.file_path)) {
          missingCount++;
        }
      }
    }

    await dbManager.exec('COMMIT;');
    return {
      success: true,
      message: missingCount > 0
        ? `Legacy JSON backup restored! ${modelCount} models loaded (${missingCount} missing from disk).`
        : 'Legacy JSON backup restored successfully',
      stats: {
        modelsRestored: modelCount,
        missingModelsCount: missingCount,
        downloadsRestored: 0,
        configKeysRestored: configCount,
        ignoredUpdatesRestored: 0,
        ignoredDuplicatesRestored: 0,
      },
    };
  }
}

export const backupService = new BackupService();
