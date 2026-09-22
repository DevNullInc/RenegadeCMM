/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { LocalModel } from '../types/app';
import { CivitAIModelVersion } from '../types/civitai';
import { civitaiClient } from './civitaiClient';
import { dbManager } from '../db/db';
import { logger } from '../utils/logger';
import { webhookService } from './webhookService';

export interface UpdateInfo {
  currentVersionId: number;
  latestVersionId: number;
  latestVersionName: string;
  hasUpdate: boolean;
  publishedAt?: string;
  downloadUrl?: string;
  changelog?: string;
}

export interface BatchUpdateProgress {
  scanned: number;
  total: number;
  updatesFound: number;
  currentModel?: string;
}

export interface BatchUpdateResult {
  totalChecked: number;
  updatesFound: number;
  modelsWithUpdates: Array<{
    id: string;
    filePath: string;
    fileName: string;
    civitaiModelId: number;
    currentVersionId: number;
    latestVersionId: number;
    latestVersionName: string;
    downloadUrl?: string;
  }>;
}

export class VersionManager {
  // True when the installed local file hash already matches a file hash the given
  // CivitAI version publishes. Used to treat a model as up-to-date even when CivitAI
  // has bumped the version id, so already-current files don't produce update banners.
  private versionFileMatchesHash(version: CivitAIModelVersion, localHash?: string): boolean {
    if (!localHash) return false;
    const target = String(localHash).trim().toUpperCase();
    if (!target || target.length < 16) return false;
    if (!version.files || version.files.length === 0) return false;
    for (const file of version.files) {
      if (file && file.hashes) {
        for (const hashValue of Object.values(file.hashes)) {
          if (hashValue && String(hashValue).trim().toUpperCase() === target) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Best-effort upload/publish date for a version, used to decide which upload is newer.
  // Prefers the explicit publishedAt (upload date) and falls back to createdAt.
  private getVersionDate(version: CivitAIModelVersion): number {
    const raw = version?.publishedAt || version?.createdAt;
    if (!raw) return 0;
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  // Decides whether a newer upload exists, comparing by upload/publish DATE rather than a
  // raw version-id mismatch. This prevents older uploads from being reported as updates
  // when the installed file is already the newest-dated version but sits lower in the
  // CivitAI version list (or carries a different version id).
  private evaluateUpdate(
    modelVersions: CivitAIModelVersion[],
    installedVersionIds: Set<number>,
    localHash?: string
  ): { hasUpdate: boolean; latestVersion: CivitAIModelVersion; installedVersion?: CivitAIModelVersion } {
    // Newest-dated remote version (a date decision, not array index) so an older upload that
    // happens to sit at index 0 is never treated as the "latest".
    let latestVersion = modelVersions[0];
    for (const v of modelVersions) {
      if (this.getVersionDate(v) > this.getVersionDate(latestVersion)) {
        latestVersion = v;
      }
    }

    // Newest-dated version among EVERY installed local file for this model. When the model is
    // installed for multiple consumers (e.g. one LoRA used by several workflows), the date check
    // defaults to the LATEST installed date, so a file uploaded between two installs is not
    // falsely reported as an update when the newest upload is already installed.
    let installedVersion: CivitAIModelVersion | undefined;
    let newestInstalledDate = 0;
    for (const v of modelVersions) {
      if (installedVersionIds.has(v.id)) {
        const d = this.getVersionDate(v);
        if (d > newestInstalledDate) {
          newestInstalledDate = d;
          installedVersion = v;
        }
      }
    }

    const hashMatchesLatest = this.versionFileMatchesHash(latestVersion, localHash);

    // Nothing of this model is installed -> nothing to update.
    if (!installedVersion) {
      return { hasUpdate: false, latestVersion };
    }

    // Update only when a remote version is dated strictly NEWER than the latest installed
    // date, and that newest-dated version isn't already installed.
    const newerExists = this.getVersionDate(latestVersion) > newestInstalledDate
      && !installedVersionIds.has(latestVersion.id);
    const hasUpdate = newerExists && !hashMatchesLatest;
    return { hasUpdate, latestVersion, installedVersion };
  }

  // All version ids installed locally for a given CivitAI model (every local_models row).
  private async getInstalledVersionIds(modelId: number): Promise<Set<number>> {
    const rows = await dbManager.all(
      'SELECT civitai_version_id FROM local_models WHERE civitai_model_id = ? AND civitai_version_id IS NOT NULL;',
      [modelId]
    );
    return new Set(rows.map((r: any) => Number(r.civitai_version_id)));
  }

  async checkForUpdates(localModel: LocalModel): Promise<UpdateInfo | null> {
    if (!localModel.civitaiModelId || !localModel.civitaiVersionId) {
      return null;
    }

    try {
      const fullModel = await civitaiClient.fetchModel(localModel.civitaiModelId);
      if (!fullModel || !fullModel.modelVersions || fullModel.modelVersions.length === 0) {
        return null;
      }

      const nowChecked = Date.now();
      const installedVersionIds = await this.getInstalledVersionIds(localModel.civitaiModelId);
      const { hasUpdate: newerExists, latestVersion } = this.evaluateUpdate(
        fullModel.modelVersions,
        installedVersionIds,
        localModel.sha256
      );
      const isIgnored = await this.isUpdateIgnored(localModel.civitaiModelId, latestVersion.id);
      const hasUpdate = newerExists && !isIgnored;
      const downloadUrl = civitaiClient.getDownloadUrl(latestVersion.id);

      // Persist update status to database (cached until the file changes via update_checked_at).
      if (hasUpdate) {
        await dbManager.run(
          `UPDATE local_models SET has_update = 1, update_version_id = ?, update_version_name = ?, update_download_url = ?, update_checked_at = ? WHERE id = ?;`,
          [latestVersion.id, latestVersion.name, downloadUrl, nowChecked, localModel.id]
        );
      } else {
        await dbManager.run(
          `UPDATE local_models SET has_update = 0, update_version_id = NULL, update_version_name = NULL, update_download_url = NULL, update_checked_at = ? WHERE id = ?;`,
          [nowChecked, localModel.id]
        );
      }

      return {
        currentVersionId: localModel.civitaiVersionId,
        latestVersionId: latestVersion.id,
        latestVersionName: latestVersion.name,
        hasUpdate,
        publishedAt: latestVersion.publishedAt,
        downloadUrl,
        changelog: latestVersion.description,
      };
    } catch (err) {
      logger.error(`Error checking update for model ID ${localModel.civitaiModelId}:`, err);
      return null;
    }
  }

  async batchCheckAllUpdates(
    onProgress?: (progress: BatchUpdateProgress) => void,
    options?: { force?: boolean }
  ): Promise<BatchUpdateResult> {
    logger.info('Starting batch check for model updates...');
    const force = options?.force === true;
    // Unless forced, skip models already checked since their file last changed - the
    // result is cached until the local file mtime changes (update_checked_at < modified_at).
    const localRows = await dbManager.all(
      force
        ? 'SELECT * FROM local_models WHERE civitai_model_id IS NOT NULL AND civitai_version_id IS NOT NULL;'
        : `SELECT * FROM local_models WHERE civitai_model_id IS NOT NULL AND civitai_version_id IS NOT NULL
           AND (update_checked_at IS NULL OR update_checked_at < modified_at);`
    );

    const total = localRows.length;
    if (total === 0) {
      return { totalChecked: 0, updatesFound: 0, modelsWithUpdates: [] };
    }

    // Every installed version id per CivitAI model (drawn from ALL local_models rows, not just
    // the cached ones being re-checked), so the date check defaults to the latest installed date
    // even when a model has multiple installed copies.
    const installedRows = await dbManager.all(
      'SELECT DISTINCT civitai_model_id, civitai_version_id FROM local_models WHERE civitai_model_id IS NOT NULL AND civitai_version_id IS NOT NULL;'
    );
    const installedByModel = new Map<number, Set<number>>();
    for (const r of installedRows) {
      const modelId = Number(r.civitai_model_id);
      if (!installedByModel.has(modelId)) installedByModel.set(modelId, new Set());
      installedByModel.get(modelId)!.add(Number(r.civitai_version_id));
    }

    // Cache model details to prevent repetitive API calls for models with multiple local files
    const modelCache = new Map<number, any>();
    const modelsWithUpdates: BatchUpdateResult['modelsWithUpdates'] = [];
    let scanned = 0;
    let updatesFound = 0;

    for (const row of localRows) {
      scanned++;
      const modelId = row.civitai_model_id;
      const currentVersionId = row.civitai_version_id;

      if (onProgress) {
        onProgress({
          scanned,
          total,
          updatesFound,
          currentModel: row.file_name,
        });
      }

      try {
        let fullModel = modelCache.get(modelId);
        if (!fullModel) {
          fullModel = await civitaiClient.fetchModel(modelId);
          if (fullModel) {
            modelCache.set(modelId, fullModel);
          }
          // Pacing pause between uncached model lookups to avoid hammering the CivitAI endpoint
          await new Promise((r) => setTimeout(r, 120));
        }

        if (fullModel && fullModel.modelVersions && fullModel.modelVersions.length > 0) {
          const nowChecked = Date.now();
          const installedVersionIds = installedByModel.get(modelId) || new Set<number>();
          const { hasUpdate: newerExists, latestVersion } = this.evaluateUpdate(
            fullModel.modelVersions,
            installedVersionIds,
            row.sha256
          );
          const isIgnored = await this.isUpdateIgnored(modelId, latestVersion.id);
          const hasUpdate = newerExists && !isIgnored;

          if (hasUpdate) {
            updatesFound++;
            const downloadUrl = civitaiClient.getDownloadUrl(latestVersion.id);

            await dbManager.run(
              `UPDATE local_models SET has_update = 1, update_version_id = ?, update_version_name = ?, update_download_url = ?, update_checked_at = ? WHERE id = ?;`,
              [latestVersion.id, latestVersion.name, downloadUrl, nowChecked, row.id]
            );

            modelsWithUpdates.push({
              id: row.id,
              filePath: row.file_path,
              fileName: row.file_name,
              civitaiModelId: modelId,
              currentVersionId,
              latestVersionId: latestVersion.id,
              latestVersionName: latestVersion.name,
              downloadUrl,
            });
          } else {
            await dbManager.run(
              `UPDATE local_models SET has_update = 0, update_version_id = NULL, update_version_name = NULL, update_download_url = NULL, update_checked_at = ? WHERE id = ?;`,
              [nowChecked, row.id]
            );
          }
        }
      } catch (e) {
        logger.warn(`Failed to check update for model ${row.file_name} (ID: ${modelId}):`, e);
      }
    }

    logger.info(`Batch update check finished. Checked ${total} models, found ${updatesFound} update(s).`);
    if (modelsWithUpdates.length > 0) {
      webhookService.triggerUpdateAvailable(modelsWithUpdates).catch((err) => {
        logger.warn('Error triggering update available webhook:', err);
      });
    }
    return {
      totalChecked: total,
      updatesFound,
      modelsWithUpdates,
    };
  }

  async isUpdateIgnored(modelId: number, versionId: number): Promise<boolean> {
    try {
      const row = await dbManager.get(
        'SELECT 1 FROM ignored_model_updates WHERE model_id = ? AND version_id = ?;',
        [modelId, versionId]
      );
      return !!row;
    } catch {
      return false;
    }
  }

  async ignoreUpdate(modelId: number, versionId: number): Promise<boolean> {
    try {
      await dbManager.run(
        'INSERT OR REPLACE INTO ignored_model_updates (model_id, version_id) VALUES (?, ?);',
        [modelId, versionId]
      );
      // Clear has_update for this model if this was the update version
      await dbManager.run(
        'UPDATE local_models SET has_update = 0 WHERE civitai_model_id = ? AND update_version_id = ?;',
        [modelId, versionId]
      );
      return true;
    } catch (err) {
      logger.error('Failed to ignore update:', err);
      return false;
    }
  }

  async unignoreUpdate(modelId: number, versionId: number): Promise<boolean> {
    try {
      await dbManager.run(
        'DELETE FROM ignored_model_updates WHERE model_id = ? AND version_id = ?;',
        [modelId, versionId]
      );
      return true;
    } catch (err) {
      logger.error('Failed to unignore update:', err);
      return false;
    }
  }

  async getIgnoredUpdates(): Promise<{ modelId: number; versionId: number }[]> {
    try {
      const rows = await dbManager.all('SELECT model_id, version_id FROM ignored_model_updates;');
      return rows.map((r: any) => ({ modelId: r.model_id, versionId: r.version_id }));
    } catch {
      return [];
    }
  }

  async getVersionHistory(modelId: number): Promise<CivitAIModelVersion[]> {
    const fullModel = await civitaiClient.fetchModel(modelId);
    return fullModel.modelVersions || [];
  }
}

export const versionManager = new VersionManager();
