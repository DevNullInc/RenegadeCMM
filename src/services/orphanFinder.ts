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
import { ModelUsageInfo, OrphanScanResult, WorkflowInfo } from '../types/app';
import { WorkflowScanner } from './workflowScanner';
import { dbManager } from '../db/db';
import { formatBytes } from './precisionInspector';
import { logger } from '../utils/logger';

export class OrphanFinder {
  private workflowScanner: WorkflowScanner;

  constructor(workflowScanner?: WorkflowScanner) {
    this.workflowScanner = workflowScanner || new WorkflowScanner();
  }

  /**
   * Scans workflow directories and cross-references them against all indexed local models in SQLite.
   * Identifies unreferenced (orphan) models and calculates reclaimable disk space.
   */
  async findOrphanModels(workflowDirectories: string | string[]): Promise<OrphanScanResult> {
    const scannedWorkflows = await this.workflowScanner.scanWorkflows(workflowDirectories);

    // Retrieve all local indexed models from SQLite
    const localRows: any[] = await dbManager.all(`
      SELECT id, file_name, file_path, model_type, civitai_name, file_size
      FROM local_models;
    `);

    // Map filename -> list of workflow references
    // We normalize to lowercase basenames and stripped prefixes
    const workflowRefMap = new Map<string, Array<{ filePath: string; fileName: string; fileType: 'json' | 'png' }>>();

    for (const wf of scannedWorkflows) {
      const entry = {
        filePath: wf.filePath,
        fileName: wf.fileName,
        fileType: wf.fileType,
      };

      for (const m of wf.models) {
        const rawModelName = m.modelName || (m as any).name;
        if (!rawModelName) continue;
        const normalizedName = rawModelName.toLowerCase().trim();
        const baseName = path.basename(normalizedName);

        // Add both full relative name and plain basename
        this.addWorkflowRef(workflowRefMap, normalizedName, entry);
        this.addWorkflowRef(workflowRefMap, baseName, entry);
      }
    }

    const orphans: ModelUsageInfo[] = [];
    const activelyUsed: ModelUsageInfo[] = [];
    let orphanBytesTotal = 0;

    for (const row of localRows) {
      const fileName = row.file_name || (row.file_path ? path.basename(row.file_path) : 'unknown');
      const normalizedFileName = fileName.toLowerCase().trim();

      // Check if file exists on disk to get accurate size if missing in database
      let fileSize = Number(row.file_size) || 0;
      if (fileSize === 0 && row.file_path && fs.existsSync(row.file_path)) {
        try {
          fileSize = fs.statSync(row.file_path).size;
        } catch {}
      }

      // Check matches in reference map
      const refs = workflowRefMap.get(normalizedFileName) || [];
      const isOrphan = refs.length === 0;

      const usageInfo: ModelUsageInfo = {
        id: row.id,
        fileName,
        filePath: row.file_path || '',
        modelType: row.model_type || 'Unknown',
        baseModel: row.base_model || 'Unknown',
        fileSize,
        fileSizeFormatted: formatBytes(fileSize),
        referenceCount: refs.length,
        referencedWorkflows: refs,
        isOrphan,
      };

      if (isOrphan) {
        orphans.push(usageInfo);
        orphanBytesTotal += fileSize;
      } else {
        activelyUsed.push(usageInfo);
      }
    }

    logger.info(`Orphan Scan completed: ${orphans.length} orphan(s) found out of ${localRows.length} models across ${scannedWorkflows.length} workflows.`);

    return {
      totalScannedModels: localRows.length,
      totalScannedWorkflows: scannedWorkflows.length,
      orphanCount: orphans.length,
      activeCount: activelyUsed.length,
      orphanBytesTotal,
      orphanBytesFormatted: formatBytes(orphanBytesTotal),
      orphans,
      activelyUsed,
    };
  }

  private addWorkflowRef(
    map: Map<string, Array<{ filePath: string; fileName: string; fileType: 'json' | 'png' }>>,
    key: string,
    ref: { filePath: string; fileName: string; fileType: 'json' | 'png' }
  ) {
    const existing = map.get(key) || [];
    // Avoid duplicate workflow entries for the same model in the same workflow
    if (!existing.some((e) => e.filePath === ref.filePath)) {
      existing.push(ref);
      map.set(key, existing);
    }
  }
}

export const orphanFinder = new OrphanFinder();
