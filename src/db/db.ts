/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

export class DatabaseManager {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor(customDbPath?: string) {
    const defaultNewPath = path.join(process.cwd(), 'renegadecmm.sqlite');
    const legacyPath = path.join(process.cwd(), 'civitai_manager.sqlite');

    // Auto-migrate legacy civitai_manager.sqlite to renegadecmm.sqlite if not already migrated
    if (!customDbPath && !fs.existsSync(defaultNewPath) && fs.existsSync(legacyPath)) {
      try {
        fs.renameSync(legacyPath, defaultNewPath);
        if (fs.existsSync(`${legacyPath}-wal`)) {
          fs.renameSync(`${legacyPath}-wal`, `${defaultNewPath}-wal`);
        }
        if (fs.existsSync(`${legacyPath}-shm`)) {
          fs.renameSync(`${legacyPath}-shm`, `${defaultNewPath}-shm`);
        }
        logger.info(`Migrated legacy database civitai_manager.sqlite to renegadecmm.sqlite`);
      } catch (renameErr) {
        logger.warn('Could not rename legacy civitai_manager.sqlite, copying instead:', renameErr);
        try {
          fs.copyFileSync(legacyPath, defaultNewPath);
        } catch {}
      }
    }

    this.dbPath = customDbPath || defaultNewPath;
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          logger.error('Failed to open SQLite database:', err);
          return reject(err);
        }

        try {
          // Enable Write-Ahead Logging (WAL) for concurrent read/write support
          await this.exec('PRAGMA journal_mode = WAL;');
          await this.exec('PRAGMA foreign_keys = ON;');
          await this.ensureBaseSchema();
          await this.runMigrations();
          await this.reconcileDownloadsTable();
          await this.cleanupPhantomDuplicates();
          logger.info(`SQLite database initialized at: ${this.dbPath}`);
          resolve();
        } catch (migrationErr) {
          reject(migrationErr);
        }
      });
    });
  }

  private async ensureBaseSchema(): Promise<void> {
    // 1. App Configuration Table (Key-Value)
    await this.exec(`
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // 2. Local Models Table
    await this.exec(`
      CREATE TABLE IF NOT EXISTS local_models (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        sha256 TEXT,
        civitai_model_id INTEGER,
        civitai_version_id INTEGER,
        civitai_name TEXT,
        scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_duplicate INTEGER DEFAULT 0,
        preview_url TEXT,
        model_type TEXT,
        nsfw INTEGER DEFAULT 0,
        has_update INTEGER DEFAULT 0,
        update_version_id INTEGER,
        update_version_name TEXT,
        update_download_url TEXT,
        ignored_version_id INTEGER,
        update_checked_at INTEGER,
        source TEXT DEFAULT 'civitai',
        hf_repo_id TEXT,
        hf_commit_sha TEXT,
        quantization TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_local_models_sha256 ON local_models(sha256);
      CREATE INDEX IF NOT EXISTS idx_local_models_civitai_version ON local_models(civitai_version_id);
      CREATE INDEX IF NOT EXISTS idx_local_models_civitai_model ON local_models(civitai_model_id);
      CREATE INDEX IF NOT EXISTS idx_local_models_file_path ON local_models(file_path);
    `);

    // 3. Downloads Table
    await this.exec(`
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        model_version_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        model_name TEXT NOT NULL,
        version_name TEXT NOT NULL,
        model_type TEXT NOT NULL,
        base_model TEXT,
        creator TEXT,
        target_folder TEXT NOT NULL,
        target_root TEXT,
        file_name TEXT NOT NULL,
        download_url TEXT NOT NULL,
        size_kb INTEGER,
        sha256 TEXT,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        downloaded_bytes INTEGER DEFAULT 0,
        total_bytes INTEGER DEFAULT 0,
        speed_bps INTEGER DEFAULT 0,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        computed_path TEXT,
        is_hash_mismatch INTEGER DEFAULT 0,
        delete_old_version_file TEXT,
        delete_old_model_id TEXT,
        source TEXT DEFAULT 'civitai',
        hf_repo_id TEXT,
        hf_commit_sha TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
    `);

    // 4. Ignored Model Updates Table
    await this.exec(`
      CREATE TABLE IF NOT EXISTS ignored_model_updates (
        model_id INTEGER,
        version_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (model_id, version_id)
      );
    `);

    // 5. Ignored Duplicates Table
    await this.exec(`
      CREATE TABLE IF NOT EXISTS ignored_duplicates (
        sha256 TEXT PRIMARY KEY,
        known_count INTEGER DEFAULT 2,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. Node Resolution Cache Table (success & failure outcomes per workflow node + install)
    await this.exec(`
      CREATE TABLE IF NOT EXISTS node_resolution_cache (
        node_type TEXT NOT NULL,
        custom_nodes_dir TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        installed_folder TEXT,
        installed_path TEXT,
        manager_json TEXT,
        github_candidates_json TEXT,
        query_used TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (node_type, custom_nodes_dir)
      );
      CREATE INDEX IF NOT EXISTS idx_node_resolution_cache_updated ON node_resolution_cache(updated_at);
    `);

    // 7. Manual Node Mappings Table (user-declared node -> folder overrides). These are
    //    authoritative user fallbacks: when the local scan fails to detect a class but the
    //    user knows which installed folder supplies it, the mapping permanently marks the
    //    node as installed (unlike the TTL-based resolution cache).
    await this.exec(`
      CREATE TABLE IF NOT EXISTS manual_node_mappings (
        node_type TEXT NOT NULL,
        custom_nodes_dir TEXT NOT NULL DEFAULT '',
        folder_name TEXT NOT NULL,
        folder_path TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (node_type, custom_nodes_dir)
      );
      CREATE INDEX IF NOT EXISTS idx_manual_node_mappings_folder ON manual_node_mappings(folder_name);
    `);

    // Ensure all columns exist for existing database files (graceful migration)
    const columnUpdates = [
      'ALTER TABLE local_models ADD COLUMN preview_url TEXT;',
      'ALTER TABLE local_models ADD COLUMN model_type TEXT;',
      'ALTER TABLE local_models ADD COLUMN nsfw INTEGER DEFAULT 0;',
      'ALTER TABLE local_models ADD COLUMN civitai_name TEXT;',
      'ALTER TABLE local_models ADD COLUMN has_update INTEGER DEFAULT 0;',
      'ALTER TABLE local_models ADD COLUMN update_version_id INTEGER;',
      'ALTER TABLE local_models ADD COLUMN update_version_name TEXT;',
      'ALTER TABLE local_models ADD COLUMN update_download_url TEXT;',
      'ALTER TABLE local_models ADD COLUMN ignored_version_id INTEGER;',
      'ALTER TABLE local_models ADD COLUMN update_checked_at INTEGER;',
      'ALTER TABLE downloads ADD COLUMN delete_old_version_file TEXT;',
      'ALTER TABLE downloads ADD COLUMN delete_old_model_id TEXT;',
      'ALTER TABLE downloads ADD COLUMN creator TEXT;',
      'ALTER TABLE downloads ADD COLUMN target_root TEXT;',
      'ALTER TABLE downloads ADD COLUMN is_hash_mismatch INTEGER DEFAULT 0;',
      'ALTER TABLE local_models ADD COLUMN source TEXT DEFAULT \'civitai\';',
      'ALTER TABLE local_models ADD COLUMN hf_repo_id TEXT;',
      'ALTER TABLE local_models ADD COLUMN hf_commit_sha TEXT;',
      'ALTER TABLE local_models ADD COLUMN quantization TEXT;',
      'ALTER TABLE downloads ADD COLUMN source TEXT DEFAULT \'civitai\';',
      'ALTER TABLE downloads ADD COLUMN hf_repo_id TEXT;',
      'ALTER TABLE downloads ADD COLUMN hf_commit_sha TEXT;',
    ];

    for (const sql of columnUpdates) {
      await this.exec(sql).catch(() => {});
    }
  }

  private async runMigrations(): Promise<void> {
    const versionRow: any = await this.get('PRAGMA user_version;');
    const currentVersion = versionRow ? versionRow.user_version : 0;
    logger.info(`Current SQLite schema version: ${currentVersion}`);

    const migrationsDir = path.join(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      // Standalone execution without external SQL files
      await this.exec('PRAGMA user_version = 9;').catch(() => {});
      return;
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const match = file.match(/^(\d+)_/);
      if (!match) continue;

      const fileVersion = parseInt(match[1], 10);
      if (fileVersion > currentVersion) {
        logger.info(`Applying migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        try {
          await this.exec(sql);
        } catch (e: any) {
          // Gracefully ignore duplicate column / table already exists errors
          if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) {
            logger.warn(`Migration ${file} notice:`, e.message);
          }
        }
        await this.exec(`PRAGMA user_version = ${fileVersion};`).catch(() => {});
      }
    }
  }

  private async createCanonicalDownloadsTable(): Promise<void> {
    await this.exec(`
      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        model_version_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        model_name TEXT NOT NULL,
        version_name TEXT NOT NULL,
        model_type TEXT NOT NULL,
        base_model TEXT,
        creator TEXT,
        target_folder TEXT NOT NULL,
        target_root TEXT,
        file_name TEXT NOT NULL,
        download_url TEXT NOT NULL,
        size_kb INTEGER,
        sha256 TEXT,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        downloaded_bytes INTEGER DEFAULT 0,
        total_bytes INTEGER DEFAULT 0,
        speed_bps INTEGER DEFAULT 0,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        computed_path TEXT,
        is_hash_mismatch INTEGER DEFAULT 0,
        delete_old_version_file TEXT,
        delete_old_model_id TEXT,
        source TEXT DEFAULT 'civitai',
        hf_repo_id TEXT,
        hf_commit_sha TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
    `);
  }

  /**
   * Older app versions shipped a `downloads` table with a different column set (e.g.
   * `civitai_version_id`/`civitai_model_id`, `local_path`, `downloaded_at`, no
   * `progress`/`computed_path`). `CREATE TABLE IF NOT EXISTS` never rewrites an existing
   * table, so once created that legacy schema silently stuck around — and every
   * `INSERT OR REPLACE INTO downloads (...)` in the download manager referenced the new
   * column names, failing on it. That is why completed downloads were never actually
   * persisted and vanished on restart. This reconciles the table to the canonical schema
   * (migrating any surviving legacy rows) so persistence works again.
   */
  private async reconcileDownloadsTable(): Promise<void> {
    if (!this.db) return;
    try {
      const cols: any[] = await this.all('PRAGMA table_info(downloads);');
      if (!Array.isArray(cols) || cols.length === 0) return;
      const names = new Set(cols.map((c) => c.name));
      const hasCanonical =
        names.has('model_version_id') &&
        names.has('progress') &&
        names.has('created_at') &&
        names.has('computed_path');
      if (hasCanonical) return;

      logger.warn(
        'Legacy `downloads` table schema detected. Rebuilding to canonical schema and migrating existing records.'
      );

      const legacyNames = Array.from(names);
      const has = (c: string) => legacyNames.includes(c);

      await this.exec('ALTER TABLE downloads RENAME TO downloads_legacy;');
      await this.createCanonicalDownloadsTable();

      // Map canonical columns -> either an existing legacy column (with a sensible
      // fallback) or a constant default. Only columns that exist in the legacy table are
      // referenced, so a badly-drifted old table migrates cleanly.
      const map: Record<string, string> = {
        id: 'id',
        model_version_id: has('civitai_version_id') ? 'COALESCE(civitai_version_id, 0)' : '0',
        model_id: has('civitai_model_id') ? 'COALESCE(civitai_model_id, 0)' : '0',
        model_name: has('model_name') ? `COALESCE(model_name, 'Unknown Model')` : `'Unknown Model'`,
        version_name: has('version_name') ? `COALESCE(version_name, '')` : `''`,
        model_type: has('model_type') ? `COALESCE(model_type, 'Checkpoint')` : `'Checkpoint'`,
        base_model: has('base_model') ? 'base_model' : 'NULL',
        creator: has('creator') ? 'creator' : 'NULL',
        target_folder: has('target_folder') ? `COALESCE(target_folder, '')` : `''`,
        target_root: has('target_root') ? 'target_root' : 'NULL',
        file_name: has('file_name') ? `COALESCE(file_name, 'model.safetensors')` : `'model.safetensors'`,
        download_url: has('download_url') ? `COALESCE(download_url, '')` : `''`,
        size_kb: has('size_kb') ? 'size_kb' : 'NULL',
        sha256: has('sha256') ? 'sha256' : 'NULL',
        status: has('status') ? `COALESCE(status, 'pending')` : `'pending'`,
        progress: has('progress') ? 'COALESCE(progress, 0)' : '0',
        downloaded_bytes: has('downloaded_bytes') ? 'COALESCE(downloaded_bytes, 0)' : '0',
        total_bytes: has('total_bytes') ? 'COALESCE(total_bytes, 0)' : '0',
        speed_bps: has('speed_bps') ? 'COALESCE(speed_bps, 0)' : '0',
        error: has('error') ? 'error' : 'NULL',
        created_at: has('created_at') ? 'created_at' : 'NULL',
        completed_at: has('completed_at')
          ? 'completed_at'
          : has('downloaded_at')
          ? 'downloaded_at'
          : 'NULL',
        computed_path: has('computed_path')
          ? 'computed_path'
          : has('local_path')
          ? 'local_path'
          : 'NULL',
        is_hash_mismatch: has('is_hash_mismatch') ? 'COALESCE(is_hash_mismatch, 0)' : '0',
        delete_old_version_file: has('delete_old_version_file') ? 'delete_old_version_file' : 'NULL',
        delete_old_model_id: has('delete_old_model_id') ? 'delete_old_model_id' : 'NULL',
        source: has('source') ? `COALESCE(source, 'civitai')` : `'civitai'`,
        hf_repo_id: has('hf_repo_id') ? 'hf_repo_id' : 'NULL',
        hf_commit_sha: has('hf_commit_sha') ? 'hf_commit_sha' : 'NULL',
      };

      const insertCols = Object.keys(map).join(', ');
      const selectCols = Object.values(map).join(', ');
      await this.exec(
        `INSERT INTO downloads (${insertCols}) SELECT ${selectCols} FROM downloads_legacy;`
      );
      await this.exec('DROP TABLE downloads_legacy;');
      logger.info('Migrated legacy `downloads` records into canonical schema.');
    } catch (err: any) {
      logger.warn('Failed to reconcile `downloads` table schema:', err);
    }
  }

  exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row as T);
      });
    });
  }

  all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve((rows || []) as T[]);
      });
    });
  }

  async cleanupPhantomDuplicates(): Promise<void> {
    try {
      const rows = await this.all('SELECT id, file_path FROM local_models');
      const seenRealPaths = new Map<string, string>();
      const toDelete: string[] = [];

      for (const r of rows) {
        try {
          if (!r.file_path || !fs.existsSync(r.file_path)) {
            toDelete.push(r.id);
            continue;
          }
          let real: string;
          try {
            real = fs.realpathSync.native(r.file_path);
          } catch (e) {
            real = path.resolve(r.file_path);
          }

          const realKey = real.toLowerCase();
          if (seenRealPaths.has(realKey)) {
            toDelete.push(r.id);
          } else {
            seenRealPaths.set(realKey, r.id);
            if (real !== r.file_path) {
              await this.run(
                'UPDATE local_models SET file_path = ?, file_name = ? WHERE id = ?',
                [real, path.basename(real), r.id]
              );
            }
          }
        } catch (e) {
          toDelete.push(r.id);
        }
      }

      for (const id of toDelete) {
        await this.run('DELETE FROM local_models WHERE id = ?', [id]);
      }

      await this.run('UPDATE local_models SET is_duplicate = 0;');
      await this.run(`
        UPDATE local_models 
        SET is_duplicate = 1 
        WHERE sha256 IN (
          SELECT sha256 
          FROM local_models 
          WHERE sha256 IS NOT NULL AND TRIM(sha256) != ''
          GROUP BY sha256 
          HAVING COUNT(DISTINCT file_path COLLATE NOCASE) > 1
        );
      `);

      if (toDelete.length > 0) {
        logger.info(`Cleaned up ${toDelete.length} phantom / missing duplicate records from database.`);
      }
    } catch (err) {
      logger.warn('Failed during startup duplicate database cleanup:', err);
    }
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.close((err) => {
        if (err) reject(err);
        else {
          this.db = null;
          resolve();
        }
      });
    });
  }
}

export const dbManager = new DatabaseManager();
