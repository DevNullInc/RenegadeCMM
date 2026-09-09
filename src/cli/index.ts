#!/usr/bin/env node
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
import { dbManager } from '../db/db';
import { civitaiClient } from '../services/civitaiClient';
import { libraryScanner } from '../services/libraryScanner';
import { folderRouter } from '../services/folderRouter';
import { downloadManager } from '../services/downloadManager';
import { versionManager } from '../services/versionManager';
import { backupService } from '../services/backupService';
import { huggingfaceClient } from '../services/huggingfaceClient';
import { workflowScanner } from '../services/workflowScanner';
import { decryptKey, encryptKey, isLegacyEncrypted } from '../utils/secureStorage';
import { logger } from '../utils/logger';

function printBanner() {
  console.log('\x1b[35m');
  console.log('  +----------------------------------------------+');
  console.log('  |   Renegade Core Model Manager (CMM) - CLI Runner  |');
  console.log('  +----------------------------------------------+');
  console.log('\x1b[0m');
}

function printHelp() {
  printBanner();
  console.log(`Usage: cmm <command> [options]\n`);
  console.log(`Commands:`);
  console.log(`  scan                     Scan ComfyUI model directories`);
  console.log(`  download                 Download model from CivitAI`);
  console.log(`  check-updates            Check installed models for new versions`);
  console.log(`  export                   Export model database & configuration`);
  console.log(`  hf check <repo_id>       Inspect Hugging Face model repository`);
  console.log(`  hf whoami                Check Hugging Face CLI login status`);
  console.log(`  workflows                Scan workflows for referenced models\n`);
  console.log(`Options:`);
  console.log(`  --path <dir>             Specify custom directory path`);
  console.log(`  --id <modelId>           CivitAI Model ID to download`);
  console.log(`  --version <versionId>    Specific version ID to download`);
  console.log(`  --output <file>          Target output path for export`);
  console.log(`  --format <json|zip>      Export format (default: zip)`);
  console.log(`  -h, --help               Show help information\n`);
  console.log(`Examples:`);
  console.log(`  cmm scan --path D:\\ComfyUI\\models`);
  console.log(`  cmm download --id 827184 --version 2514310`);
  console.log(`  cmm check-updates`);
  console.log(`  cmm export --format json --output backup.json`);
  console.log(`  cmm hf check black-forest-labs/FLUX.1-dev`);
  console.log(`  cmm workflows --path D:\\ComfyUI\\workflows\n`);
}

function parseArgs(args: string[]) {
  const options: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        options[key] = next;
        i++;
      } else {
        options[key] = 'true';
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        options[key] = next;
        i++;
      } else {
        options[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return { command: positional[0], subCommand: positional[1], extra: positional.slice(2), options };
}

async function loadConfig() {
  await dbManager.init();
  try {
    const rows = await dbManager.all('SELECT key, value FROM app_config;');
    const cfg: any = {};
    rows.forEach((r: any) => {
      try {
        cfg[r.key] = JSON.parse(r.value);
      } catch {
        cfg[r.key] = r.value;
      }
    });

    if (cfg.civitai_api_key) {
      const key = decryptKey(cfg.civitai_api_key);
      civitaiClient.setApiKey(key);
      downloadManager.setApiKey(key);
      if (isLegacyEncrypted(cfg.civitai_api_key) && key) {
        await dbManager.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);', [
          'civitai_api_key',
          JSON.stringify(encryptKey(key)),
        ]);
      }
    }
    if (cfg.mirror_url) {
      civitaiClient.setBaseUrl(cfg.mirror_url);
    }
    if (cfg.huggingface_token) {
      const hfToken = decryptKey(cfg.huggingface_token);
      huggingfaceClient.setToken(hfToken);
      downloadManager.setHuggingFaceToken(hfToken);
      if (isLegacyEncrypted(cfg.huggingface_token) && hfToken) {
        await dbManager.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);', [
          'huggingface_token',
          JSON.stringify(encryptKey(hfToken)),
        ]);
      }
    }

    folderRouter.updateConfig({
      rootPath: cfg.comfyui_root || cfg.comfyui_folders?.[0] || '',
      folderPaths: cfg.comfyui_folders || (cfg.comfyui_root ? [cfg.comfyui_root] : []),
      folderMappings: cfg.folder_mappings || {},
      separateByBaseModel: !!cfg.organize_by?.base_model,
      separateByCreator: !!cfg.organize_by?.creator,
      advancedMappings: cfg.advanced_mappings || { filename_patterns: [] },
    });

    return cfg;
  } catch {
    return {};
  }
}

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
  const { command, subCommand, extra, options } = parseArgs(argv);

  if (!command || command === 'help' || options['help'] || options['h']) {
    printHelp();
    return 0;
  }

  printBanner();
  const cfg = await loadConfig();

  switch (command.toLowerCase()) {
    case 'scan': {
      const scanPaths = options['path']
        ? [options['path']]
        : cfg.comfyui_folders || (cfg.comfyui_root ? [cfg.comfyui_root] : []);

      if (scanPaths.length === 0) {
        console.error('\x1b[31m[!] Error: No ComfyUI model folder path configured. Specify with --path <path>\x1b[0m');
        return 1;
      }

      console.log(`\x1b[36m>> Scanning directory: ${scanPaths.join(', ')}\x1b[0m`);
      let lastReport = 0;
      const models = await libraryScanner.scanDirectory(scanPaths, (p) => {
        const now = Date.now();
        if (now - lastReport > 200 || p.status === 'completed') {
          lastReport = now;
          process.stdout.write(`\r\x1b[K  [${p.status.toUpperCase()}] ${p.scannedFiles}/${p.totalFiles} - ${p.currentFile || ''}`);
        }
      });
      console.log('\n');
      console.log(`\x1b[32m[ok] Scan complete! Scanned ${models.length} model(s).\x1b[0m`);
      return 0;
    }

    case 'download': {
      const modelId = parseInt(options['id'] || subCommand, 10);
      const versionId = options['version'] ? parseInt(options['version'], 10) : undefined;

      if (!modelId || isNaN(modelId)) {
        console.error('\x1b[31m[!] Error: Model ID is required. Example: cmm download --id 827184\x1b[0m');
        return 1;
      }

      console.log(`\x1b[36m>> Fetching CivitAI metadata for Model ID ${modelId}...\x1b[0m`);
      const model = await civitaiClient.fetchModel(modelId);
      if (!model || !model.modelVersions || model.modelVersions.length === 0) {
        console.error('\x1b[31m[!] Error: Model not found or has no versions available.\x1b[0m');
        return 1;
      }

      const version = versionId
        ? model.modelVersions.find((v) => v.id === versionId) || model.modelVersions[0]
        : model.modelVersions[0];

      const file = version.files?.[0];
      const fileName = file?.name || `${model.name}_${version.name}.safetensors`;
      const downloadUrl = civitaiClient.getDownloadUrl(version.id);

      const computed = folderRouter.computePath({
        fileName,
        modelType: model.type,
        baseModel: version.baseModel,
        creator: model.creator?.username,
      });

      console.log(`\x1b[32m[ok] Target: ${computed.fullPath}\x1b[0m`);
      console.log(`\x1b[36m>> Starting download: ${fileName} (${((file?.sizeKB || 0) / 1024).toFixed(1)} MB)...\x1b[0m`);

      const task = downloadManager.addTask({
        modelVersionId: version.id,
        modelId: model.id,
        modelName: model.name,
        versionName: version.name,
        modelType: model.type,
        baseModel: version.baseModel,
        targetFolder: computed.folderName,
        fileName,
        downloadUrl,
        sizeKB: file?.sizeKB || 0,
        sha256: file?.hashes?.SHA256,
        computedPath: computed.fullPath,
      });

      // Poll until task finishes
      await new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          const t = downloadManager.getTask(task.id);
          if (!t) return resolve();
          const speedMb = (t.speedBps / (1024 * 1024)).toFixed(2);
          process.stdout.write(`\r\x1b[K  [${t.status.toUpperCase()}] ${t.progress}% (${speedMb} MB/s)`);

          if (t.status === 'completed') {
            clearInterval(interval);
            console.log(`\n\x1b[32m[ok] Successfully downloaded ${fileName} to ${t.computedPath}\x1b[0m`);
            resolve();
          } else if (t.status === 'failed') {
            clearInterval(interval);
            console.log(`\n\x1b[31m[!] Download failed: ${t.error}\x1b[0m`);
            resolve();
          }
        }, 300);
      });

      return 0;
    }

    case 'check-updates': {
      console.log(`\x1b[36m>> Checking local library for updates on CivitAI...\x1b[0m`);
      const result = await versionManager.batchCheckAllUpdates((p) => {
        process.stdout.write(`\r\x1b[K  Checking ${p.scanned}/${p.total} models (${p.updatesFound} updates found)...`);
      });
      console.log('\n');
      if (result.modelsWithUpdates.length === 0) {
        console.log(`\x1b[32m[ok] All ${result.totalChecked} installed model(s) are up to date!\x1b[0m`);
      } else {
        console.log(`\x1b[33m[!] Found ${result.updatesFound} update(s):\x1b[0m`);
        result.modelsWithUpdates.forEach((m) => {
          console.log(`  - ${m.fileName}: New version available -> "${m.latestVersionName}" (ID: ${m.latestVersionId})`);
        });
      }
      return 0;
    }

    case 'export': {
      const format = (options['format'] || 'zip').toLowerCase();
      const outputPath = options['output'] || `cmm-backup-${new Date().toISOString().slice(0, 10)}.${format}`;
      console.log(`\x1b[36m>> Exporting database and configuration to ${outputPath} (${format})...\x1b[0m`);

      if (format === 'json') {
        const rows = await dbManager.all('SELECT * FROM local_models;');
        const rawConfigRows = await dbManager.all('SELECT * FROM app_config;');
        const configRows = rawConfigRows.filter(
          (r: any) => r && r.key !== 'civitai_api_key' && r.key !== 'huggingface_token'
        );
        const exportData = {
          exportedAt: new Date().toISOString(),
          version: '1.5.0',
          config: configRows,
          models: rows,
        };
        fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');
      } else {
        const zipBuffer = await backupService.createBackupZip();
        fs.writeFileSync(outputPath, zipBuffer);
      }

      console.log(`\x1b[32m[ok] Export completed successfully: ${outputPath}\x1b[0m`);
      return 0;
    }

    case 'hf': {
      const sub = (subCommand || '').toLowerCase();
      if (sub === 'check') {
        const repoId = extra[0] || options['repo'] || options['id'];
        if (!repoId) {
          console.error('\x1b[31m[!] Error: Hugging Face repo ID required. Example: cmm hf check black-forest-labs/FLUX.1-dev\x1b[0m');
          return 1;
        }
        console.log(`\x1b[36m>> Checking Hugging Face Hub for: ${repoId}...\x1b[0m`);
        const result = await huggingfaceClient.checkModelRepo(repoId);
        if (!result.exists) {
          console.log(`\x1b[31m[!] ${result.error || 'Repository does not exist.'}\x1b[0m`);
          return 1;
        }

        console.log(`\x1b[32m[ok] Repository: ${result.info?.id}\x1b[0m`);
        console.log(`  - Pipeline Tag : ${result.info?.pipelineTag || 'N/A'}`);
        console.log(`  - Private      : ${result.info?.private ? 'Yes' : 'No'}`);
        console.log(`  - Gated        : ${result.info?.gated ? 'Yes (Token required)' : 'No'}`);
        console.log(`  - Downloads    : ${result.info?.downloads ?? 'N/A'}`);
        console.log(`  - Likes        : ${result.info?.likes ?? 'N/A'}`);
        if (result.safetensorsFiles && result.safetensorsFiles.length > 0) {
          console.log(`  - Safetensors  : ${result.safetensorsFiles.slice(0, 5).join(', ')}${result.safetensorsFiles.length > 5 ? ` (+${result.safetensorsFiles.length - 5} more)` : ''}`);
        }
        if (result.ggufFiles && result.ggufFiles.length > 0) {
          console.log(`  - GGUF files   : ${result.ggufFiles.slice(0, 5).join(', ')}`);
        }
        return 0;
      } else if (sub === 'whoami') {
        const whoami = await huggingfaceClient.getCliWhoami();
        if (whoami.available) {
          console.log(`\x1b[32m[ok] Hugging Face CLI is installed.\x1b[0m Output:\n${whoami.output}`);
        } else {
          console.log(`\x1b[33m[!] Hugging Face CLI ('hf') is not installed in PATH. (Optional - standalone REST API is active).\x1b[0m`);
        }
        return 0;
      } else {
        console.log('Unknown hf command. Available: cmm hf check <repo_id>, cmm hf whoami');
        return 1;
      }
    }

    case 'workflows': {
      const wfPaths = options['path']
        ? [options['path']]
        : cfg.comfyui_folders || (cfg.comfyui_root ? [cfg.comfyui_root] : []);
      console.log(`\x1b[36m>> Scanning workflows in: ${wfPaths.join(', ')}...\x1b[0m`);
      const workflows = await workflowScanner.scanWorkflows(wfPaths);
      console.log(`\x1b[32m[ok] Analyzed ${workflows.length} workflow file(s).\x1b[0m\n`);
      workflows.forEach((wf) => {
        console.log(`\x1b[36mWorkflow: ${wf.fileName} (${wf.fileType.toUpperCase()}) - ${wf.modelCount} referenced model(s)\x1b[0m`);
        wf.models.forEach((m) => {
          const statusTag = m.isInstalled ? '\x1b[32m[INSTALLED]\x1b[0m' : '\x1b[31m[MISSING]\x1b[0m';
          console.log(`  ${statusTag} ${m.nodeType} -> ${m.modelName}`);
        });
      });
      return 0;
    }

    default: {
      console.error(`\x1b[31m[!] Unknown command: "${command}". Run "cmm --help" for available commands.\x1b[0m`);
      return 1;
    }
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error('\x1b[31m[!] Fatal CLI error:\x1b[0m', err);
    process.exit(1);
  });
}
