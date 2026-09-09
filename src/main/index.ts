/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { app, BrowserWindow, ipcMain, dialog, Menu, shell, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import fs from 'fs';
import os from 'os';
import child_process from 'child_process';
import http from 'http';
import { dbManager } from '../db/db';
import { civitaiClient } from '../services/civitaiClient';
import { folderRouter } from '../services/folderRouter';
import { downloadManager } from '../services/downloadManager';
import { libraryScanner } from '../services/libraryScanner';
import { versionManager } from '../services/versionManager';
import { backupService } from '../services/backupService';
import { imageCacheService } from '../services/imageCacheService';
import axios from 'axios';
import { webhookService } from '../services/webhookService';
import { huggingfaceClient } from '../services/huggingfaceClient';
import { ggufParser } from '../services/ggufParser';
import { workflowScanner } from '../services/workflowScanner';
import { nodeResolverService } from '../services/nodeResolverService';
import { encryptKey, decryptKey, isLegacyEncrypted } from '../utils/secureStorage';
import { logger } from '../utils/logger';
import { AppConfig, AppUpdateCheckResult } from '../types/app';
import { APP_VERSION, BUILD_CONFIG } from '../version';

app.setName('renegadecmm');

let mainWindow: BrowserWindow | null = null;
let currentConfig: AppConfig = {
  comfyui_root: '',
  comfyui_folders: [],
  comfyui_install_dir: '',
  comfyui_custom_nodes_dir: '',
  civitai_api_key: '',
  mirror_url: '',
  huggingface_token: '',
  webhooks: {
    on_download_complete: '',
    on_update_available: '',
  },
  folder_mappings: {},
  advanced_mappings: { filename_patterns: [] },
  organize_by: { base_model: false, creator: false },
  conflict_strategy: 'rename',
  nsfw_max_visible_level: 5,
  nsfw_blur_enabled: true,
  local_api_enabled: true,
  local_api_port: 5174,
  comfyui_server_url: 'http://127.0.0.1:8188',
};

function isValidFolderPath(p: string): boolean {
  const s = (p || '').trim();
  if (!s || s.length < 3 || s.length > 500) return false;
  if (/[\0<>"|?*\x00-\x1F]/.test(s)) return false;
  if (/[`$;|&]/.test(s)) return false;
  const segs = s.split(/[\\/]+/);
  if (segs.includes('..') || segs.includes('.')) return false;
  const isWinAbs = /^[a-zA-Z]:[\\/]/.test(s);
  const isUnc = /^\\\\[^\\]+\\[^\\]+/.test(s);
  const isUnixAbs = /^\//.test(s);
  if (!isWinAbs && !isUnc && !isUnixAbs) return false;
  if (s.slice(2).includes(':')) return false;
  return true;
}
function sanitizeFolderPath(p: string): string | null {
  const t = (p || '').trim().replace(/\\{2,}/g, '\\');
  if (!t) return null;
  if (!isValidFolderPath(t)) return null;
  if (t.length > 3 && /[\\/]$/.test(t)) return t.replace(/[\\/]+$/, '');
  return t;
}
function sanitizeFolderList(list: any): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const s = sanitizeFolderPath(String(raw || ''));
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function getAppIcon(): string | undefined {
  const candidates = [
    path.join(__dirname, '../icon.png'),
    path.join(__dirname, '../../public/icon.png'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(app.getAppPath(), 'dist/icon.png'),
    path.join(app.getAppPath(), 'build/icon.png'),
    path.join(app.getAppPath(), 'public/icon.png'),
    path.join(app.getAppPath(), 'build/icons/512x512.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return undefined;
}

async function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1124,
    minHeight: 720,
    title: 'Renegade Core Model Manager (RenegadeCMM)',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });

  try {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const u = details.url.toLowerCase();
      if (u.includes('127.0.0.1:') || u.includes('localhost:') || u.includes('comfy')) {
        const responseHeaders = { ...details.responseHeaders };
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['X-Frame-Options'];
        if (responseHeaders['content-security-policy']) {
          responseHeaders['content-security-policy'] = responseHeaders['content-security-policy'].map((csp: string) =>
            csp.replace(/frame-ancestors[^;]+;?/gi, '')
          );
        }
        callback({ cancel: false, responseHeaders });
        return;
      }
      callback({ cancel: false, responseHeaders: details.responseHeaders });
    });
  } catch (err: any) {
    logger.warn('Failed to register onHeadersReceived for ComfyUI frame embedding:', err?.message);
  }

  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  // Security: Prevent untrusted window creation and redirect external links to default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Security: Guard against unexpected top-level navigation away from the local application
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      const isLocalApp =
        parsed.protocol === 'file:' ||
        parsed.protocol === 'app:' ||
        ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
          (parsed.port === '5173' || parsed.port === '5174' || parsed.port === String(process.env.PORT || '')));
      if (!isLocalApp) {
        event.preventDefault();
        if (navigationUrl.startsWith('http://') || navigationUrl.startsWith('https://')) {
          shell.openExternal(navigationUrl);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  const indexPath = path.join(__dirname, '../index.html');
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || (process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:5173');
  const fs = require('fs');

  let loaded = false;
  // Try loading from Vite server if running
  try {
    await mainWindow.loadURL(devServerUrl);
    loaded = true;
  } catch (e) {
    logger.info(`Vite server not responding at ${devServerUrl}, falling back to static files.`);
  }

  // Load the compiled static app
  if (!loaded) {
    if (fs.existsSync(indexPath)) {
      await mainWindow.loadFile(indexPath);
    } else {
      await mainWindow.loadURL(devServerUrl);
    }
  }
}

import { getSanitizedConfig } from '../utils/configSanitizer';
export { getSanitizedConfig };

async function loadConfigFromDb() {
  try {
    const rows = await dbManager.all('SELECT key, value FROM app_config;');
    const cfgObj: any = {};
    rows.forEach((r: any) => {
      try {
        cfgObj[r.key] = JSON.parse(r.value);
      } catch (e) {
        cfgObj[r.key] = r.value;
      }
    });

    if (cfgObj.comfyui_root) currentConfig.comfyui_root = cfgObj.comfyui_root;
    if (cfgObj.comfyui_folders) {
      let f = cfgObj.comfyui_folders;
      if (typeof f === 'string') {
        try {
          f = JSON.parse(f);
        } catch {}
      }
      currentConfig.comfyui_folders = sanitizeFolderList(f);
    }
    if (cfgObj.comfyui_install_dir !== undefined) currentConfig.comfyui_install_dir = cfgObj.comfyui_install_dir;
    if (cfgObj.comfyui_custom_nodes_dir !== undefined) currentConfig.comfyui_custom_nodes_dir = cfgObj.comfyui_custom_nodes_dir;
    if ((!currentConfig.comfyui_folders || currentConfig.comfyui_folders.length === 0) && currentConfig.comfyui_root) {
      currentConfig.comfyui_folders = [currentConfig.comfyui_root];
    }
    if (currentConfig.comfyui_folders && currentConfig.comfyui_folders.length > 0 && !currentConfig.comfyui_root) {
      currentConfig.comfyui_root = currentConfig.comfyui_folders[0];
    }
    logger.info(`[Config] Loaded from DB: folders=${JSON.stringify(currentConfig.comfyui_folders)} install_dir=${currentConfig.comfyui_install_dir} root=${currentConfig.comfyui_root}`);
    if (cfgObj.civitai_api_key) {
      const decrypted = decryptKey(cfgObj.civitai_api_key);
      currentConfig.civitai_api_key = decrypted;
      civitaiClient.setApiKey(decrypted);
      downloadManager.setApiKey(decrypted);
      if (isLegacyEncrypted(cfgObj.civitai_api_key) && decrypted) {
        const reEncrypted = encryptKey(decrypted);
        await dbManager.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);', [
          'civitai_api_key',
          JSON.stringify(reEncrypted),
        ]);
        logger.info('[Security] Seamlessly upgraded CivitAI API key to machine-bound encryption at rest.');
      }
    }
    if (cfgObj.mirror_url !== undefined) {
      currentConfig.mirror_url = cfgObj.mirror_url;
      const baseApiUrl = (cfgObj.mirror_url && cfgObj.mirror_url.trim()) ? cfgObj.mirror_url.trim() : 'https://civitai.com/api/v1';
      civitaiClient.setBaseUrl(baseApiUrl);
    }
    if (cfgObj.huggingface_token) {
      const decryptedHf = decryptKey(cfgObj.huggingface_token);
      currentConfig.huggingface_token = decryptedHf;
      huggingfaceClient.setToken(decryptedHf);
      downloadManager.setHuggingFaceToken(decryptedHf);
      if (isLegacyEncrypted(cfgObj.huggingface_token) && decryptedHf) {
        const reEncryptedHf = encryptKey(decryptedHf);
        await dbManager.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);', [
          'huggingface_token',
          JSON.stringify(reEncryptedHf),
        ]);
        logger.info('[Security] Seamlessly upgraded Hugging Face token to machine-bound encryption at rest.');
      }
    }
    if (cfgObj.webhooks) {
      currentConfig.webhooks = cfgObj.webhooks;
      webhookService.updateConfig(cfgObj.webhooks);
    }
    if (cfgObj.folder_mappings) currentConfig.folder_mappings = cfgObj.folder_mappings;
    if (cfgObj.advanced_mappings) currentConfig.advanced_mappings = cfgObj.advanced_mappings;
    if (cfgObj.organize_by) currentConfig.organize_by = cfgObj.organize_by;
    if (cfgObj.conflict_strategy) {
      currentConfig.conflict_strategy = cfgObj.conflict_strategy;
      downloadManager.setConflictStrategy(cfgObj.conflict_strategy);
    }
    if (cfgObj.nsfw_max_visible_level !== undefined) {
      currentConfig.nsfw_max_visible_level = cfgObj.nsfw_max_visible_level;
    }
    if (cfgObj.nsfw_blur_enabled !== undefined) {
      currentConfig.nsfw_blur_enabled = cfgObj.nsfw_blur_enabled;
    }
    if (cfgObj.strict_hash_verification !== undefined) {
      currentConfig.strict_hash_verification = cfgObj.strict_hash_verification;
      downloadManager.setStrictHashVerification(cfgObj.strict_hash_verification);
    }
    if (cfgObj.max_concurrent_downloads !== undefined) {
      currentConfig.max_concurrent_downloads = cfgObj.max_concurrent_downloads;
      downloadManager.setMaxConcurrent(cfgObj.max_concurrent_downloads);
    }
    if (cfgObj.default_download_folder !== undefined) {
      currentConfig.default_download_folder = cfgObj.default_download_folder;
    }
    if (cfgObj.local_api_enabled !== undefined) {
      currentConfig.local_api_enabled = cfgObj.local_api_enabled;
    }
    if (cfgObj.local_api_port !== undefined) {
      currentConfig.local_api_port = cfgObj.local_api_port;
    }
    if (cfgObj.comfyui_server_url !== undefined && typeof cfgObj.comfyui_server_url === 'string') {
      currentConfig.comfyui_server_url = cfgObj.comfyui_server_url;
    }

    folderRouter.updateConfig({
      rootPath: currentConfig.comfyui_root || currentConfig.comfyui_folders[0] || '',
      folderPaths: currentConfig.comfyui_folders,
      folderMappings: currentConfig.folder_mappings,
      separateByBaseModel: currentConfig.organize_by.base_model,
      separateByCreator: currentConfig.organize_by.creator,
      advancedMappings: currentConfig.advanced_mappings,
    });
  } catch (err) {
    logger.error('Error loading config from SQLite:', err);
  }
}

function scaffoldConfiguredModelFolders(config: AppConfig, specificDir?: string): { targetDir: string; created: string[]; existing: string[] }[] {
  const results: { targetDir: string; created: string[]; existing: string[] }[] = [];
  const targets = new Set<string>();

  if (specificDir && typeof specificDir === 'string' && specificDir.trim()) {
    targets.add(specificDir.trim());
  } else {
    if (config.comfyui_folders && Array.isArray(config.comfyui_folders)) {
      for (const f of config.comfyui_folders) {
        if (f && typeof f === 'string' && f.trim()) targets.add(f.trim());
      }
    }
    if (config.comfyui_root && typeof config.comfyui_root === 'string' && config.comfyui_root.trim()) {
      const modelsSub = path.join(config.comfyui_root.trim(), 'models');
      if (fs.existsSync(modelsSub)) {
        targets.add(modelsSub);
      } else {
        targets.add(config.comfyui_root.trim());
      }
    }
  }

  for (const dir of targets) {
    if (dir && typeof dir === 'string' && dir.trim()) {
      try {
        const res = folderRouter.scaffoldModelSubfolders(dir.trim());
        results.push(res);
      } catch (err: any) {
        logger.warn(`Failed to scaffold model subfolders for ${dir}:`, err?.message || err);
      }
    }
  }

  return results;
}

function getSubdirectories(dirPath: string): string[] {
  try {
    if (!fs.existsSync(dirPath)) return [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '__pycache__')
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

/** Lists the drive roots plus the contents of a directory, for the in-app folder browser. */
function listDirectoryEntries(dirPath?: string) {
  const roots =
    process.platform === 'win32'
      ? Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}:\\`)
      : [path.parse(os.homedir()).root];
  const availableRoots = roots.filter((r) => fs.existsSync(r));

  let target = dirPath && dirPath.trim() ? path.resolve(dirPath.trim()) : availableRoots[0] || os.homedir();

  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) target = path.dirname(target);
  } catch {
    target = path.dirname(target);
  }

  const isRoot = availableRoots.includes(target) || path.parse(target).root === target;
  const entries: DirectoryEntry[] = [];
  if (!isRoot) {
    try {
      const parent = path.dirname(target);
      entries.push({ name: '..', isDirectory: true, path: parent });
    } catch {}
  }
  try {
    const items = fs.readdirSync(target, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const item of items) {
      if (item.name.startsWith('.') || item.name === '__pycache__') continue;
      entries.push({ name: item.name, isDirectory: true, path: path.join(target, item.name) });
    }
  } catch {}
  entries.sort((a, b) => {
    if (a.name === '..') return -1;
    if (b.name === '..') return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    path: target,
    name: path.basename(target) || target,
    parent: path.dirname(target),
    isRoot,
    roots: availableRoots,
    entries,
  };
}

function checkCmmCompanionNode(nodes: string[], customNodesDir: string): { installed: boolean; folderName?: string } {
  if (!customNodesDir || !nodes || nodes.length === 0) {
    return { installed: false };
  }
  for (const folderName of nodes) {
    const lower = folderName.toLowerCase();
    if (
      lower === 'comfyui-model-manager' ||
      lower === 'comfyui_model_manager' ||
      lower === 'comfyui-civitai-manager' ||
      lower === 'comfyui-civitai-manager-node' ||
      lower === 'comfyui_civitai_manager_node' ||
      lower === 'comfyui-civitai-manager-comfyui'
    ) {
      return { installed: true, folderName };
    }
    try {
      const fullFolderPath = path.join(customNodesDir, folderName);
      if (fs.existsSync(fullFolderPath) && fs.statSync(fullFolderPath).isDirectory()) {
        if (
          fs.existsSync(path.join(fullFolderPath, 'cmm_client.py')) ||
          fs.existsSync(path.join(fullFolderPath, 'web', 'js', 'cmm_bridge.js')) ||
          fs.existsSync(path.join(fullFolderPath, 'web', 'cmm_bridge.js')) ||
          fs.existsSync(path.join(fullFolderPath, 'cmm_bridge.js')) ||
          fs.existsSync(path.join(fullFolderPath, 'datatypes.py'))
        ) {
          return { installed: true, folderName };
        }
      }
    } catch {}
  }
  return { installed: false };
}

function findComfyUIRoot(rawPath: string): string {
  const norm = path.resolve(rawPath);
  if (!fs.existsSync(norm)) return norm;

  // 1. Direct ComfyUI root check
  if (
    fs.existsSync(path.join(norm, 'main.py')) ||
    (fs.existsSync(path.join(norm, 'custom_nodes')) && fs.existsSync(path.join(norm, 'models')))
  ) {
    return norm;
  }

  // 2. Windows portable wrapper check: e.g. D:\ComfyUI_windows_portable\ComfyUI
  const subComfy = path.join(norm, 'ComfyUI');
  if (
    fs.existsSync(subComfy) &&
    (fs.existsSync(path.join(subComfy, 'main.py')) ||
      (fs.existsSync(path.join(subComfy, 'custom_nodes')) && fs.existsSync(path.join(subComfy, 'models'))))
  ) {
    return subComfy;
  }

  // 3. User passed custom_nodes or models subfolder directly
  const basename = path.basename(norm).toLowerCase();
  if (basename === 'custom_nodes' || basename === 'models') {
    const parent = path.dirname(norm);
    if (
      fs.existsSync(path.join(parent, 'main.py')) ||
      fs.existsSync(path.join(parent, 'custom_nodes')) ||
      fs.existsSync(path.join(parent, 'models'))
    ) {
      return parent;
    }
  }

  return norm;
}

function analyzeComfyUIStructure(dirPath: string) {
  const norm = path.resolve(dirPath);
  const exists = fs.existsSync(norm);
  if (!exists) {
    return {
      hasMainPy: false,
      hasCustomNodes: false,
      hasModelsDir: false,
      hasInputDir: false,
      hasOutputDir: false,
      hasComfyCore: false,
      hasExtraModelPaths: false,
      detectedModelsDir: path.join(norm, 'models'),
      modelsDirExists: false,
      detectedModelSubdirs: [] as string[],
      confidenceScore: 0,
    };
  }

  const hasMainPy = fs.existsSync(path.join(norm, 'main.py'));
  const hasComfyCore = fs.existsSync(path.join(norm, 'comfy')) && fs.statSync(path.join(norm, 'comfy')).isDirectory();
  const hasCustomNodes = fs.existsSync(path.join(norm, 'custom_nodes')) && fs.statSync(path.join(norm, 'custom_nodes')).isDirectory();
  const hasModelsDir = fs.existsSync(path.join(norm, 'models')) && fs.statSync(path.join(norm, 'models')).isDirectory();
  const hasInputDir = fs.existsSync(path.join(norm, 'input')) && fs.statSync(path.join(norm, 'input')).isDirectory();
  const hasOutputDir = fs.existsSync(path.join(norm, 'output')) && fs.statSync(path.join(norm, 'output')).isDirectory();
  const hasExtraModelPaths =
    fs.existsSync(path.join(norm, 'extra_model_paths.yaml')) ||
    fs.existsSync(path.join(norm, 'extra_model_paths.yaml.example')) ||
    fs.existsSync(path.join(norm, 'extra_model_paths.yml'));

  const detectedModelsDir = path.join(norm, 'models');
  const modelsDirExists = hasModelsDir;

  const detectedModelSubdirs: string[] = [];
  if (hasModelsDir) {
    const commonSubdirs = [
      'checkpoints',
      'loras',
      'vae',
      'controlnet',
      'diffusion_models',
      'embeddings',
      'upscale_models',
      'unet',
      'clip',
      'clip_vision',
      'gligen',
      'style_models',
      'photomaker',
    ];
    for (const sub of commonSubdirs) {
      if (fs.existsSync(path.join(detectedModelsDir, sub))) {
        detectedModelSubdirs.push(sub);
      }
    }
  }

  let score = 0;
  if (hasMainPy) score += 35;
  if (hasCustomNodes) score += 25;
  if (hasModelsDir) score += 20;
  if (hasComfyCore) score += 10;
  if (hasInputDir) score += 5;
  if (hasOutputDir) score += 5;
  if (hasExtraModelPaths) score += 5;
  const confidenceScore = Math.min(100, score);

  return {
    hasMainPy,
    hasCustomNodes,
    hasModelsDir,
    hasInputDir,
    hasOutputDir,
    hasComfyCore,
    hasExtraModelPaths,
    detectedModelsDir,
    modelsDirExists,
    detectedModelSubdirs,
    confidenceScore,
  };
}

function inspectComfyUIInstall(installPath?: string) {
  const rawPath = (installPath || currentConfig.comfyui_install_dir || '').trim();

  // If no explicit path specified, infer from primary model folder (e.g. /path/to/ComfyUI/models -> /path/to/ComfyUI)
  if (!rawPath) {
    const primaryModelFolder = currentConfig.comfyui_root || (currentConfig.comfyui_folders && currentConfig.comfyui_folders[0]) || '';
    if (primaryModelFolder) {
      const parent = path.dirname(primaryModelFolder);
      if (fs.existsSync(parent)) {
        const structure = analyzeComfyUIStructure(parent);
        const hasCustomNodes = structure.hasCustomNodes;
        const nodes = hasCustomNodes ? getSubdirectories(path.join(parent, 'custom_nodes')) : [];
        const cmmCheck = checkCmmCompanionNode(nodes, path.join(parent, 'custom_nodes'));
        const isValid = structure.confidenceScore >= 35 || structure.hasMainPy || (structure.hasModelsDir && structure.hasCustomNodes);

        if (isValid) {
          return {
            valid: true,
            inferred: true,
            installDir: parent,
            customNodesDir: hasCustomNodes ? path.join(parent, 'custom_nodes') : '',
            customNodesExist: hasCustomNodes,
            installedNodes: nodes,
            nodeCount: nodes.length,
            cmmNodeInstalled: cmmCheck.installed,
            cmmNodeFolderName: cmmCheck.folderName,
            structure,
            autoModelsDir: structure.detectedModelsDir,
          };
        }
      }
    }
    return {
      valid: false,
      inferred: false,
      installDir: '',
      customNodesDir: '',
      customNodesExist: false,
      installedNodes: [],
      nodeCount: 0,
      cmmNodeInstalled: false,
    };
  }

  const effectiveRoot = findComfyUIRoot(rawPath);
  const exists = fs.existsSync(effectiveRoot);
  if (!exists) {
    const structure = analyzeComfyUIStructure(effectiveRoot);
    return {
      valid: false,
      inferred: false,
      installDir: rawPath,
      customNodesDir: '',
      customNodesExist: false,
      installedNodes: [],
      nodeCount: 0,
      cmmNodeInstalled: false,
      structure,
      autoModelsDir: path.join(path.resolve(rawPath), 'models'),
    };
  }

  const structure = analyzeComfyUIStructure(effectiveRoot);
  const customNodesDir = structure.hasCustomNodes ? path.join(effectiveRoot, 'custom_nodes') : '';
  const installedNodes = structure.hasCustomNodes ? getSubdirectories(customNodesDir) : [];
  const cmmCheck = checkCmmCompanionNode(installedNodes, customNodesDir);

  const isValid =
    structure.hasMainPy ||
    (structure.hasModelsDir && structure.hasCustomNodes) ||
    (structure.hasComfyCore && structure.hasCustomNodes) ||
    structure.confidenceScore >= 35;

  return {
    valid: isValid,
    inferred: effectiveRoot !== path.resolve(rawPath),
    installDir: effectiveRoot,
    customNodesDir,
    customNodesExist: structure.hasCustomNodes,
    installedNodes,
    nodeCount: installedNodes.length,
    cmmNodeInstalled: cmmCheck.installed,
    cmmNodeFolderName: cmmCheck.folderName,
    structure,
    autoModelsDir: structure.detectedModelsDir,
  };
}

/**
 * Determines the custom_nodes directory to scan for node resolution, in priority order:
 * explicit caller override, configured custom_nodes dir, the install dir's custom_nodes,
 * or (as a last resort) a real inferred install. Never falls back to a syntactically
 * derived "sibling" dir that does not actually belong to a ComfyUI install.
 */
function resolveCustomNodesDir(config: AppConfig, explicitCustomNodesDir?: string): string {
  if (explicitCustomNodesDir && explicitCustomNodesDir.trim()) return explicitCustomNodesDir.trim();
  if (config.comfyui_custom_nodes_dir && config.comfyui_custom_nodes_dir.trim()) {
    return config.comfyui_custom_nodes_dir.trim();
  }
  if (config.comfyui_install_dir && config.comfyui_install_dir.trim()) {
    return path.join(config.comfyui_install_dir.trim(), 'custom_nodes');
  }
  const inferred = inspectComfyUIInstall();
  return inferred && inferred.customNodesDir ? inferred.customNodesDir : '';
}

/** Deletes resolution-cache rows that were written against a now-stale custom_nodes dir. */
async function purgeStaleNodeResolutionCache() {
  try {
    const good = resolveCustomNodesDir(currentConfig);
    if (!good) return;
    await dbManager.run(
      "DELETE FROM node_resolution_cache WHERE custom_nodes_dir != '' AND custom_nodes_dir != ?;",
      [good]
    );
  } catch (err) {
    logger.warn('Failed to prune stale node resolution cache:', err);
  }
}

function autoDetectComfyUIInstall() {
  const candidates: string[] = [];

  // 1. From existing config
  if (currentConfig.comfyui_install_dir) {
    candidates.push(currentConfig.comfyui_install_dir);
  }

  // 2. From model folders
  const allFolders = [currentConfig.comfyui_root, ...(currentConfig.comfyui_folders || [])].filter(Boolean);
  for (const folder of allFolders) {
    const parent = path.dirname(folder);
    candidates.push(parent);
    const grandparent = path.dirname(parent);
    candidates.push(grandparent);
  }

  // 3. From common standard OS locations
  const homeDir = os.homedir();
  if (process.platform === 'win32') {
    const drives = ['C:', 'D:', 'E:', 'F:'];
    for (const d of drives) {
      candidates.push(
        path.join(d, 'ComfyUI'),
        path.join(d, 'comfyui'),
        path.join(d, 'ComfyUI_windows_portable'),
        path.join(d, 'ComfyUI_windows_portable', 'ComfyUI'),
        path.join(d, 'AI', 'ComfyUI'),
        path.join(d, 'AI', 'comfyui'),
        path.join(d, 'AI', 'ComfyUI_windows_portable', 'ComfyUI'),
        path.join(d, 'stable-diffusion', 'ComfyUI'),
        path.join(d, 'sd', 'ComfyUI')
      );
    }
    candidates.push(
      path.join(homeDir, 'ComfyUI'),
      path.join(homeDir, 'comfyui'),
      path.join(homeDir, 'Desktop', 'ComfyUI'),
      path.join(homeDir, 'Desktop', 'ComfyUI_windows_portable', 'ComfyUI'),
      path.join(homeDir, 'Documents', 'ComfyUI')
    );
  } else {
    // Linux / macOS
    candidates.push(
      path.join(homeDir, 'ComfyUI'),
      path.join(homeDir, 'comfyui'),
      path.join(homeDir, 'ai', 'ComfyUI'),
      path.join(homeDir, 'ai', 'comfyui'),
      path.join(homeDir, 'AI', 'ComfyUI'),
      path.join(homeDir, 'AI', 'comfyui'),
      path.join(homeDir, 'Projects', 'ComfyUI'),
      path.join(homeDir, 'projects', 'comfyui'),
      path.join(homeDir, 'stable-diffusion', 'ComfyUI'),
      '/opt/ComfyUI',
      '/opt/comfyui',
      '/workspace/ComfyUI',
      '/workspace/comfyui'
    );
  }

  const uniqueCandidates = Array.from(new Set(candidates.map((c) => path.resolve(c))));
  let bestMatch: { installPath: string; info: any; score: number } | null = null;

  for (const candidate of uniqueCandidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const info = inspectComfyUIInstall(candidate);
      if (info.valid) {
        const score = info.structure?.confidenceScore || 0;
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { installPath: info.installDir || candidate, info, score };
          if (score >= 90) break;
        }
      }
    } catch {}
  }

  if (bestMatch) {
    return {
      found: true,
      path: bestMatch.installPath,
      info: bestMatch.info,
      candidatesChecked: uniqueCandidates.length,
      message: `Detected ComfyUI installation at: ${bestMatch.installPath}`,
    };
  }

  return {
    found: false,
    candidatesChecked: uniqueCandidates.length,
    message: 'Could not automatically find a valid ComfyUI directory. Please specify your installation folder manually.',
  };
}

async function pullMissingModel(modelData: any, targetRoot?: string) {
  let versionId = modelData.civitaiVersionId || modelData.civitai_version_id || modelData.versionId;
  let modelId = modelData.civitaiModelId || modelData.civitai_model_id || modelData.modelId;
  let modelName = modelData.civitaiName || modelData.civitai_name || modelData.fileName || 'model';
  let modelType = modelData.modelType || modelData.model_type || 'Checkpoint';
  let baseModel = modelData.civitaiBaseModel || modelData.baseModel || 'SD 1.5';
  let creator = modelData.civitaiCreator || modelData.creator || '';
  let fileName = modelData.fileName || modelData.file_name || 'model.safetensors';
  let downloadUrl = modelData.downloadUrl || modelData.updateDownloadUrl;
  let sha256 = modelData.sha256;
  let sizeKB = Math.round((modelData.fileSize || 0) / 1024);

  // If no versionId but SHA256 is present, look up CivitAI by hash
  if (!versionId && sha256) {
    try {
      const version = await civitaiClient.lookupByHash(sha256);
      if (version) {
        versionId = version.id;
        modelId = version.modelId;
        modelName = version.model?.name || version.name || modelName;
        modelType = (version.model?.type as any) || modelType;
        baseModel = version.baseModel || baseModel;

        const matchedFile = version.files?.find((f: any) =>
          f.hashes && Object.values(f.hashes).some((h: any) => String(h).toUpperCase() === String(sha256).toUpperCase())
        ) || version.files?.[0];

        if (matchedFile) {
          fileName = matchedFile.name || fileName;
          downloadUrl = matchedFile.downloadUrl || downloadUrl;
          if (matchedFile.sizeKB) sizeKB = matchedFile.sizeKB;
        }

        const previewUrl = version.images?.[0]?.url;

        // Update local_models in SQLite with newly discovered CivitAI metadata
        if (modelData.id) {
          await dbManager.run(
            'UPDATE local_models SET civitai_model_id = ?, civitai_version_id = ?, civitai_name = ?, model_type = COALESCE(?, model_type), preview_url = COALESCE(?, preview_url) WHERE id = ?;',
            [modelId, versionId, modelName, modelType, previewUrl, modelData.id]
          );
        }
      } else {
        return {
          success: false,
          error: `Model hash (${sha256.substring(0, 12)}...) was not found on CivitAI. It may be private, unindexed, or removed.`,
        };
      }
    } catch (e: any) {
      return {
        success: false,
        error: `Failed to query CivitAI for hash: ${e.message || 'Lookup error'}`,
      };
    }
  }

  if (!versionId && !downloadUrl) {
    return {
      success: false,
      error: 'Cannot pull model: missing CivitAI Version ID and SHA256 hash.',
    };
  }

  if (!downloadUrl && versionId) {
    downloadUrl = civitaiClient.getDownloadUrl(versionId);
  }

  const effectiveRoot =
    targetRoot ||
    currentConfig.default_download_folder ||
    currentConfig.comfyui_root ||
    (currentConfig.comfyui_folders && currentConfig.comfyui_folders[0]);

  const computed = folderRouter.computePath({
    fileName,
    modelType,
    baseModel,
    creator,
    targetRoot: effectiveRoot,
  });

  const task = downloadManager.addTask({
    modelVersionId: versionId || 0,
    modelId: modelId || 0,
    modelName,
    versionName: modelData.updateVersionName || 'Restored',
    modelType,
    baseModel,
    creator,
    fileName,
    downloadUrl,
    sizeKB,
    sha256,
    targetFolder: computed.folderName,
    targetRoot: effectiveRoot,
    computedPath: computed.fullPath,
  });

  return { success: true, task, message: `Download queued for ${modelName}` };
}

function isNewerVersion(remoteTag: string, localVersion: string): boolean {
  const cleanRemote = remoteTag.replace(/^v/i, '').trim();
  const cleanLocal = localVersion.replace(/^v/i, '').trim();
  if (!cleanRemote) return false;
  if (!cleanLocal) return true;
  if (cleanRemote === cleanLocal) return false;

  const rParts = cleanRemote.split('.').map((p) => parseInt(p, 10) || 0);
  const lParts = cleanLocal.split('.').map((p) => parseInt(p, 10) || 0);
  const maxLen = Math.max(rParts.length, lParts.length);

  for (let i = 0; i < maxLen; i++) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

async function checkDevelopmentGitUpdate(): Promise<AppUpdateCheckResult> {
  const repoOwner = 'DevNullInc';
  const repoName = 'RenegadeCMM';
  const githubUrl = `https://github.com/${repoOwner}/${repoName}`;
  const releasesUrl = `https://github.com/${repoOwner}/${repoName}/releases`;

  let isPackaged = false;
  try {
    isPackaged = Boolean(app && app.isPackaged);
  } catch {
    isPackaged = false;
  }

  const isReleaseMode = !BUILD_CONFIG.IS_DEV_BUILD || process.env.CMM_RELEASE_BUILD === 'true';

  // If built/configured for formal production release, check GitHub Releases API
  if (isReleaseMode) {
    try {
      const res = await axios.get(`https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`, {
        timeout: 4500,
        headers: {
          'User-Agent': 'RenegadeCMM',
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      const releaseData = res.data;
      const remoteTag: string = releaseData?.tag_name || '';
      const releaseHtmlUrl: string = releaseData?.html_url || releasesUrl;
      const releaseMsg: string = releaseData?.name || releaseData?.body?.split('\n')[0] || '';
      const releaseDate: string = releaseData?.published_at || '';

      const isUpdateAvailable = Boolean(remoteTag && isNewerVersion(remoteTag, APP_VERSION));

      return {
        isUpdateAvailable,
        isDevelopmentVersion: false,
        isReleaseMode: true,
        currentVersion: APP_VERSION,
        latestReleaseTag: remoteTag || undefined,
        remoteCommitMessage: releaseMsg,
        remoteCommitDate: releaseDate,
        githubUrl: releasesUrl,
        isPackaged,
      };
    } catch (releaseErr: any) {
      logger.warn('Failed to check for latest GitHub release:', releaseErr?.message || releaseErr);
      return {
        isUpdateAvailable: false,
        isDevelopmentVersion: false,
        isReleaseMode: true,
        currentVersion: APP_VERSION,
        githubUrl: releasesUrl,
        isPackaged,
        error: releaseErr?.message || 'Failed to check GitHub releases',
      };
    }
  }

  let currentCommit = '';

  // 1. Determine local commit SHA
  try {
    const cwdPath = (app && typeof app.getAppPath === 'function') ? app.getAppPath() : process.cwd();
    const gitHead = child_process.execSync('git rev-parse HEAD', {
      cwd: cwdPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 2500,
    }).trim();
    if (gitHead && /^[0-9a-f]{40}$/i.test(gitHead)) {
      currentCommit = gitHead;
    }
  } catch {
    currentCommit = process.env.GIT_COMMIT || '';
  }

  // 2. Fetch latest commit from GitHub main branch
  try {
    const res = await axios.get(`https://api.github.com/repos/${repoOwner}/${repoName}/commits/main`, {
      timeout: 4500,
      headers: {
        'User-Agent': 'RenegadeCMM',
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    const remoteData = res.data;
    const remoteSha: string = remoteData.sha || '';
    const remoteMsg: string = (remoteData.commit?.message || '').split('\n')[0];
    const remoteDate: string = remoteData.commit?.author?.date || '';
    const remoteAuthor: string = remoteData.commit?.author?.name || '';
    const commitUrl: string = remoteData.html_url || `${githubUrl}/commit/${remoteSha}`;

    const shortRemote = remoteSha ? remoteSha.substring(0, 7) : '';
    const shortLocal = currentCommit ? currentCommit.substring(0, 7) : '';

    // Update is available if remote commit exists and differs from local commit
    const isUpdateAvailable = Boolean(
      remoteSha && (!shortLocal || shortLocal.toLowerCase() !== shortRemote.toLowerCase())
    );

    return {
      isUpdateAvailable,
      isDevelopmentVersion: true,
      isReleaseMode: false,
      currentVersion: APP_VERSION,
      currentCommit: shortLocal || undefined,
      remoteCommit: shortRemote || undefined,
      remoteCommitMessage: remoteMsg,
      remoteCommitDate: remoteDate,
      remoteCommitAuthor: remoteAuthor,
      githubUrl: commitUrl,
      isPackaged,
    };
  } catch (err: any) {
    logger.warn('Failed to check for remote development updates on GitHub:', err?.message || err);
    return {
      isUpdateAvailable: false,
      isDevelopmentVersion: true,
      isReleaseMode: false,
      currentVersion: APP_VERSION,
      currentCommit: currentCommit ? currentCommit.substring(0, 7) : undefined,
      githubUrl,
      isPackaged,
      error: err?.message || 'Failed to check GitHub',
    };
  }
}

function resolveWorkflowScanPaths(config: AppConfig, customPaths?: string | string[]): string[] {
  if (customPaths) {
    const list = Array.isArray(customPaths) ? customPaths : [customPaths];
    const filtered = list.filter(Boolean);
    if (filtered.length > 0) return filtered;
  }

  const candidateDirs = new Set<string>();
  // Prefer the explicit install dir — stale model-folder entries (e.g. a previous
  // ComfyUI on F:\) must not pollute the scan when the user has switched to D:\....
  const primaryRoots = new Set<string>();
  if (config.comfyui_install_dir && config.comfyui_install_dir.trim()) {
    primaryRoots.add(config.comfyui_install_dir.trim());
  }

  // Only fall back to root/folders if install_dir is not set or does not exist
  const hasUsablePrimary = Array.from(primaryRoots).some((p) => p && fs.existsSync(p));
  const baseRoots = hasUsablePrimary ? primaryRoots : new Set<string>();

  if (!hasUsablePrimary) {
    if (config.comfyui_root) baseRoots.add(config.comfyui_root);
    if (config.comfyui_folders && config.comfyui_folders.length > 0) {
      for (const f of config.comfyui_folders) {
        if (f) {
          baseRoots.add(f);
          const parent = path.dirname(f);
          if (parent && parent !== f) {
            baseRoots.add(parent);
          }
        }
      }
    }
    // Still include install_dir even if it didn't exist, for diagnostics
    for (const p of primaryRoots) baseRoots.add(p);
  }

  for (const root of baseRoots) {
    if (!root || !fs.existsSync(root)) continue;

    // Check specific workflow directory subpaths
    const subPaths = [
      'workflows',
      path.join('user', 'default', 'workflows'),
    ];

    for (const sub of subPaths) {
      const targetPath = sub ? path.join(root, sub) : root;
      if (fs.existsSync(targetPath)) {
        try {
          const stat = fs.statSync(targetPath);
          if (stat.isDirectory()) {
            candidateDirs.add(targetPath);
          }
        } catch {}
      }
    }
  }

  return Array.from(candidateDirs);
}

async function checkComfyUIStatus(targetUrl?: string): Promise<{ online: boolean; serverUrl: string; version?: string; devices?: string[]; os?: string; error?: string }> {
  let url = (targetUrl && targetUrl.trim()) ? targetUrl.trim() : (currentConfig.comfyui_server_url || 'http://127.0.0.1:8188');
  url = url.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  try {
    const res = await axios.get(`${url}/system_stats`, {
      timeout: 1500,
      headers: { 'Accept': 'application/json' },
    });

    if (res.status === 200 && res.data) {
      const data = res.data;
      const devices = Array.isArray(data.devices)
        ? data.devices.map((d: any) => d.name || d.type || 'Device')
        : [];
      const version = data.system?.comfyui_version || data.system?.version || 'Active';
      return {
        online: true,
        serverUrl: url,
        version: String(version),
        devices,
        os: data.system?.os,
      };
    }
  } catch (err: any) {
    try {
      const fallback = await axios.get(`${url}/prompt`, { timeout: 1000 });
      if (fallback.status === 200) {
        return {
          online: true,
          serverUrl: url,
          version: 'Active',
          devices: [],
        };
      }
    } catch {}
  }

  return {
    online: false,
    serverUrl: url,
    error: 'ComfyUI server not responding',
  };
}

async function saveComfyUIWorkflow(fileName: string, data: any, fileType = 'json'): Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string }> {
  try {
    if (!fileName || !data) {
      return { success: false, error: 'Missing fileName or data payload' };
    }

    let targetDir = '';
    if (currentConfig.comfyui_install_dir && fs.existsSync(currentConfig.comfyui_install_dir)) {
      const modernUserWf = path.join(currentConfig.comfyui_install_dir, 'user', 'default', 'workflows');
      const rootWf = path.join(currentConfig.comfyui_install_dir, 'workflows');
      if (fs.existsSync(modernUserWf)) {
        targetDir = modernUserWf;
      } else if (fs.existsSync(rootWf)) {
        targetDir = rootWf;
      } else {
        fs.mkdirSync(modernUserWf, { recursive: true });
        targetDir = modernUserWf;
      }
    } else {
      const scanPaths = resolveWorkflowScanPaths(currentConfig);
      if (scanPaths.length > 0) {
        targetDir = scanPaths[0];
      }
    }

    if (!targetDir) {
      return {
        success: false,
        error: 'No ComfyUI installation directory or workflow folder configured. Set ComfyUI path in Settings.',
      };
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let cleanName = path.basename(fileName).replace(/[\\/:*?"<>|]/g, '_');
    const isPng = fileType === 'png' || cleanName.toLowerCase().endsWith('.png');
    if (!isPng && !cleanName.toLowerCase().endsWith('.json')) {
      cleanName = `${cleanName}.json`;
    }

    const fullPath = path.join(targetDir, cleanName);

    if (isPng) {
      if (typeof data === 'string' && data.startsWith('data:image/')) {
        const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));
      } else if (Buffer.isBuffer(data)) {
        fs.writeFileSync(fullPath, data);
      } else {
        const jsonName = cleanName.replace(/\.png$/i, '.json');
        const jsonPath = path.join(targetDir, jsonName);
        const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        fs.writeFileSync(jsonPath, jsonStr, 'utf-8');
        return { success: true, filePath: jsonPath, fileName: jsonName };
      }
    } else {
      const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      fs.writeFileSync(fullPath, jsonStr, 'utf-8');
    }

    logger.info(`[Workflows] Auto-saved workflow to ComfyUI directory: ${fullPath}`);
    return { success: true, filePath: fullPath, fileName: cleanName };
  } catch (err: any) {
    logger.error('Failed to save workflow to ComfyUI:', err);
    return { success: false, error: err?.message || 'Failed to save workflow' };
  }
}

async function executeComfyUIPrompt(promptData: any, serverUrl?: string): Promise<{ success: boolean; prompt_id?: string; number?: number; error?: string }> {
  let url = (serverUrl && serverUrl.trim()) ? serverUrl.trim() : (currentConfig.comfyui_server_url || 'http://127.0.0.1:8188');
  url = url.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  try {
    const payload = promptData.prompt ? promptData : { prompt: promptData };
    const res = await axios.post(`${url}/prompt`, payload, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });
    return {
      success: true,
      prompt_id: res.data?.prompt_id,
      number: res.data?.number,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.response?.data?.error?.message || err?.message || 'Failed to queue prompt in ComfyUI',
    };
  }
}

function startHttpBridgeServer() {
  const apiPort =
    parseInt(process.env.API_PORT || process.env.BRIDGE_PORT || process.env.CMM_PORT || '', 10) || 5174;

  const server = http.createServer(async (req, res) => {
    // Enforce strict localhost only (127.0.0.1 / ::1 / ::ffff:127.0.0.1)
    const remoteIp = req.socket.remoteAddress || '';
    const isLocal =
      remoteIp === '127.0.0.1' ||
      remoteIp === '::1' ||
      remoteIp === '::ffff:127.0.0.1' ||
      remoteIp.endsWith('127.0.0.1');

    if (!isLocal) {
      logger.warn(`Security: Blocked non-localhost HTTP bridge connection attempt from ${remoteIp}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access forbidden: Localhost (127.0.0.1) connections only' }));
      return;
    }

    // Host header verification to protect against DNS rebinding attacks
    const rawHost = req.headers.host || '';
    const hostHeader = rawHost.split(':')[0].toLowerCase();
    const isAllowedHost =
      hostHeader === 'localhost' ||
      hostHeader === '127.0.0.1' ||
      hostHeader === '::1' ||
      hostHeader === '[::1]' ||
      !hostHeader;

    if (!isAllowedHost) {
      logger.warn(`Security: Blocked invalid Host header in HTTP bridge: ${rawHost}`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Access forbidden: Invalid Host header' }));
      return;
    }

    // Origin header verification to guard against DNS rebinding & browser CSRF
    const origin = req.headers.origin;
    let isOriginAllowed = false;
    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        if (
          parsedOrigin.protocol === 'app:' ||
          parsedOrigin.protocol === 'file:' ||
          parsedOrigin.protocol === 'vscode-webview:'
        ) {
          isOriginAllowed = true;
        } else if (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:') {
          const h = parsedOrigin.hostname.toLowerCase();
          if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') {
            isOriginAllowed = true;
          }
        }
      } catch {
        isOriginAllowed = false;
      }

      if (!isOriginAllowed) {
        logger.warn(`Security: Blocked untrusted Origin header in HTTP bridge: ${origin}`);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access forbidden: Untrusted Origin' }));
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5173');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || '';

    const getBody = (): Promise<any> =>
      new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk) => (data += chunk));
        req.on('end', () => {
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            resolve({});
          }
        });
      });

    try {
      if ((url === '/api/status' || url === '/api/health' || url === '/health') && req.method === 'GET') {
        const isApiEnabled = currentConfig.local_api_enabled !== false;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: isApiEnabled ? 'online' : 'disabled',
            enabled: isApiEnabled,
            uptime: process.uptime(),
            pid: process.pid,
            name: 'RenegadeCMM',
            version: '1.5.0',
            port: apiPort,
            host: '127.0.0.1',
            localhostOnly: true,
          })
        );
        return;
      }

      // If Local API Bridge is disabled in settings, reject external API endpoints
      const pathname = url.split('?')[0];
      const isConfigEndpoint = pathname === '/api/config' || pathname === '/api/save-config';
      if (currentConfig.local_api_enabled === false && !isConfigEndpoint) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Local API Bridge is disabled in Settings.' }));
        return;
      }

      if (url === '/api/config' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getSanitizedConfig(currentConfig, false)));
      } else if (url === '/api/save-config' && req.method === 'POST') {
        const body = await getBody();
        // Sanitize folder paths server-side — never trust client-supplied paths
        if (body.comfyui_root !== undefined) {
          const s = body.comfyui_root ? sanitizeFolderPath(String(body.comfyui_root)) : '';
          if (body.comfyui_root && !s) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid comfyui_root path' }));
            return;
          }
          body.comfyui_root = s || '';
        }
        if (body.comfyui_folders !== undefined) {
          body.comfyui_folders = sanitizeFolderList(body.comfyui_folders);
        }
        if (body.comfyui_install_dir !== undefined) {
          const s = body.comfyui_install_dir ? sanitizeFolderPath(String(body.comfyui_install_dir)) : '';
          if (body.comfyui_install_dir && !s) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid comfyui_install_dir path' }));
            return;
          }
          body.comfyui_install_dir = s || '';
        }
        if (body.comfyui_custom_nodes_dir !== undefined) {
          const s = body.comfyui_custom_nodes_dir ? sanitizeFolderPath(String(body.comfyui_custom_nodes_dir)) : '';
          if (body.comfyui_custom_nodes_dir && !s) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid comfyui_custom_nodes_dir path' }));
            return;
          }
          body.comfyui_custom_nodes_dir = s || '';
        }

        const configToMerge = { ...body };
        if (configToMerge.civitai_api_key !== undefined && String(configToMerge.civitai_api_key).startsWith('•')) {
          delete configToMerge.civitai_api_key;
        }
        if (configToMerge.huggingface_token !== undefined && String(configToMerge.huggingface_token).startsWith('•')) {
          delete configToMerge.huggingface_token;
        }
        currentConfig = { ...currentConfig, ...configToMerge };

        if (body.comfyui_root !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['comfyui_root', JSON.stringify(body.comfyui_root)]
          );
        }
        if (body.comfyui_folders !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['comfyui_folders', JSON.stringify(body.comfyui_folders)]
          );
        }
        if (body.comfyui_install_dir !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['comfyui_install_dir', JSON.stringify(body.comfyui_install_dir)]
          );
        }
        if (body.comfyui_custom_nodes_dir !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['comfyui_custom_nodes_dir', JSON.stringify(body.comfyui_custom_nodes_dir)]
          );
        }
        if (body.civitai_api_key !== undefined) {
          const keyVal = String(body.civitai_api_key).trim();
          if (!keyVal.startsWith('•')) {
            if (keyVal === '') {
              currentConfig.civitai_api_key = '';
              await dbManager.run('DELETE FROM app_config WHERE key = ?;', ['civitai_api_key']);
              civitaiClient.setApiKey('');
              downloadManager.setApiKey('');
            } else {
              currentConfig.civitai_api_key = keyVal;
              const encrypted = encryptKey(keyVal);
              await dbManager.run(
                'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
                ['civitai_api_key', JSON.stringify(encrypted)]
              );
              civitaiClient.setApiKey(keyVal);
              downloadManager.setApiKey(keyVal);
            }
          }
        }
        if (body.mirror_url !== undefined) {
          const baseApiUrl = (body.mirror_url && body.mirror_url.trim()) ? body.mirror_url.trim() : 'https://civitai.com/api/v1';
          civitaiClient.setBaseUrl(baseApiUrl);
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['mirror_url', JSON.stringify(body.mirror_url)]
          );
        }
        if (body.huggingface_token !== undefined) {
          const tokenVal = String(body.huggingface_token).trim();
          if (!tokenVal.startsWith('•')) {
            if (tokenVal === '') {
              currentConfig.huggingface_token = '';
              await dbManager.run('DELETE FROM app_config WHERE key = ?;', ['huggingface_token']);
              huggingfaceClient.setToken('');
              downloadManager.setHuggingFaceToken('');
            } else {
              currentConfig.huggingface_token = tokenVal;
              const encryptedHf = encryptKey(tokenVal);
              await dbManager.run(
                'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
                ['huggingface_token', JSON.stringify(encryptedHf)]
              );
              huggingfaceClient.setToken(tokenVal);
              downloadManager.setHuggingFaceToken(tokenVal);
            }
          }
        }
        if (body.webhooks !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['webhooks', JSON.stringify(body.webhooks)]
          );
          webhookService.updateConfig(body.webhooks);
        }
        if (body.folder_mappings) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['folder_mappings', JSON.stringify(body.folder_mappings)]
          );
        }
        if (body.advanced_mappings) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['advanced_mappings', JSON.stringify(body.advanced_mappings)]
          );
        }
        if (body.organize_by !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['organize_by', JSON.stringify(body.organize_by)]
          );
        }
        if (body.conflict_strategy !== undefined) {
          downloadManager.setConflictStrategy(body.conflict_strategy);
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['conflict_strategy', JSON.stringify(body.conflict_strategy)]
          );
        }
        if (body.nsfw_max_visible_level !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['nsfw_max_visible_level', JSON.stringify(body.nsfw_max_visible_level)]
          );
        }
        if (body.nsfw_blur_enabled !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['nsfw_blur_enabled', JSON.stringify(body.nsfw_blur_enabled)]
          );
        }

        if (body.strict_hash_verification !== undefined) {
          downloadManager.setStrictHashVerification(body.strict_hash_verification);
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['strict_hash_verification', JSON.stringify(body.strict_hash_verification)]
          );
        }

        if (body.max_concurrent_downloads !== undefined) {
          downloadManager.setMaxConcurrent(body.max_concurrent_downloads);
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['max_concurrent_downloads', JSON.stringify(body.max_concurrent_downloads)]
          );
        }

        if (body.default_download_folder !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['default_download_folder', JSON.stringify(body.default_download_folder)]
          );
        }

        if (body.local_api_enabled !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['local_api_enabled', JSON.stringify(body.local_api_enabled)]
          );
        }

        if (body.local_api_port !== undefined) {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['local_api_port', JSON.stringify(body.local_api_port)]
          );
        }

        if (body.comfyui_server_url !== undefined && typeof body.comfyui_server_url === 'string') {
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['comfyui_server_url', JSON.stringify(body.comfyui_server_url.trim())]
          );
        }

        folderRouter.updateConfig({
          rootPath: currentConfig.comfyui_root,
          folderPaths: currentConfig.comfyui_folders,
          folderMappings: currentConfig.folder_mappings,
          separateByBaseModel: currentConfig.organize_by.base_model,
          separateByCreator: currentConfig.organize_by.creator,
          advancedMappings: currentConfig.advanced_mappings,
        });

        try {
          await dbManager.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(currentConfig));
      } else if (url === '/api/scaffold-model-folders' && req.method === 'POST') {
        const body = await getBody();
        const results = scaffoldConfiguredModelFolders(currentConfig, body?.targetDir || body?.targetPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, results }));
      } else if (url === '/api/comfyui-install' && req.method === 'GET') {
        const result = inspectComfyUIInstall();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (url === '/api/check-comfyui-install' && req.method === 'POST') {
        const body = await getBody();
        const result = inspectComfyUIInstall(body.installPath || body.path);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if ((url === '/api/auto-detect-comfyui' || url === '/api/autodetect-comfyui') && (req.method === 'GET' || req.method === 'POST')) {
        const result = autoDetectComfyUIInstall();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (
        (url === '/api/nodes/resolve' || url.startsWith('/api/nodes/resolve?') || url === '/api/resolve-node' || url.startsWith('/api/resolve-node?')) &&
        (req.method === 'GET' || req.method === 'POST')
      ) {
        let nodeType = '';
        let searchGitHub = false;
        let forceRefresh = false;
        if (req.method === 'GET') {
          const parsedUrl = new URL(url, `http://${req.headers.host || 'localhost'}`);
          nodeType = parsedUrl.searchParams.get('nodeType') || parsedUrl.searchParams.get('node_type') || parsedUrl.searchParams.get('type') || parsedUrl.searchParams.get('name') || '';
          searchGitHub = parsedUrl.searchParams.get('searchGitHub') === 'true';
          forceRefresh = parsedUrl.searchParams.get('forceRefresh') === 'true';
        } else {
          const body = await getBody();
          nodeType = body.nodeType || body.node_type || body.type || body.name || '';
          searchGitHub = body.searchGitHub === true;
          forceRefresh = body.forceRefresh === true;
        }
        const targetNodesDir = resolveCustomNodesDir(currentConfig);
        const resolution = await nodeResolverService.resolveMissingNode(
          nodeType,
          targetNodesDir,
          currentConfig.comfyui_install_dir,
          { searchGitHub, forceRefresh }
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resolution));
      } else if (url === '/api/nodes/search-github' && req.method === 'POST') {
        const body = await getBody();
        const query = body.query || body.q || '';
        const limit = parseInt(body.limit, 10) || 3;
        const candidates = await nodeResolverService.searchGitHubNodes(query, limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ query, candidates }));
      } else if (url === '/api/nodes/clone' && req.method === 'POST') {
        const body = await getBody();
        const targetNodesDir = resolveCustomNodesDir(currentConfig, body.customNodesDir);
        const cloneRes = await nodeResolverService.cloneCustomNode(
          body.gitUrl,
          targetNodesDir,
          currentConfig.comfyui_install_dir,
          body.folderName
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cloneRes));
      } else if (url === '/api/nodes/install-deps' && req.method === 'POST') {
        const body = await getBody();
        const depRes = await nodeResolverService.installNodeDependencies(
          body.folderPath || body.targetPath,
          currentConfig.comfyui_install_dir
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(depRes));
      } else if (url === '/api/nodes/installed' && req.method === 'GET') {
        const targetNodesDir = resolveCustomNodesDir(currentConfig);
        const pkgs = await nodeResolverService.inspectLocalCustomNodes(targetNodesDir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(pkgs));
      } else if (url === '/api/nodes/mark-installed' && req.method === 'POST') {
        const body = await getBody();
        const targetNodesDir = resolveCustomNodesDir(currentConfig, body.customNodesDir);
        const markRes = await nodeResolverService.markNodeInstalled(
          body.nodeType,
          body.folderName,
          targetNodesDir
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(markRes));
      } else if ((url === '/api/health' || url === '/health') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), pid: process.pid }));
      } else if (url === '/api/scan-library' && req.method === 'POST') {
        const body = await getBody();
        // Fire-and-forget background scan to prevent HTTP socket headers timeout on large model directories
        libraryScanner
          .scanDirectory(body.rootPath, (progress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('scan-progress', progress);
            }
          })
          .catch((err) => {
            logger.error('Error during HTTP library scan:', err);
          });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Scan started in background' }));
      } else if (url === '/api/cancel-scan' && req.method === 'POST') {
        libraryScanner.cancelScan();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Scan cancellation requested' }));
      } else if (url === '/api/models' && req.method === 'GET') {
        const parsedUrl = new URL(url, `http://${req.headers.host}`);
        const params = Object.fromEntries(parsedUrl.searchParams.entries());
        const data = await civitaiClient.fetchModels(params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } else if (url.startsWith('/api/model/') && req.method === 'GET') {
        const id = parseInt(url.split('/')[3], 10);
        const data = await civitaiClient.fetchModel(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } else if (url.startsWith('/api/version/') && req.method === 'GET') {
        const id = parseInt(url.split('/')[3], 10);
        const data = await civitaiClient.fetchModelVersion(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } else if (url === '/api/check-all-updates' && req.method === 'POST') {
        const body = await getBody();
        const result = await versionManager.batchCheckAllUpdates(undefined, {
          force: !!body?.force,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (url === '/api/force-complete-download' && req.method === 'POST') {
        const body = await getBody();
        const success = await downloadManager.forceCompleteTask(body.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } else if (url === '/api/local-models' && req.method === 'GET') {
        // Flags persist across scans/loads, but self-clear once the flagged update
        // version is actually installed locally.
        await dbManager.run(
          `UPDATE local_models SET has_update = 0, update_version_id = NULL, update_version_name = NULL, update_download_url = NULL
           WHERE has_update = 1 AND update_version_id IS NOT NULL AND civitai_version_id = update_version_id;`
        );
        const rows = await dbManager.all('SELECT * FROM local_models ORDER BY file_name ASC;');
        const models = rows.map((r: any) => ({
          id: r.id,
          filePath: r.file_path,
          fileName: r.file_name,
          fileSize: r.file_size,
          modifiedAt: r.modified_at,
          sha256: r.sha256,
          civitaiModelId: r.civitai_model_id,
          civitaiVersionId: r.civitai_version_id,
          civitaiName: r.civitai_name || undefined,
          previewUrl: r.preview_url,
          modelType: r.model_type,
          nsfw: !!r.nsfw,
          isMatched: !!r.civitai_version_id,
          isMissing: !fs.existsSync(r.file_path),
          hasUpdate: !!r.has_update,
          updateVersionId: r.update_version_id,
          updateVersionName: r.update_version_name,
          updateDownloadUrl: r.update_download_url,
          ignoredVersionId: r.ignored_version_id,
          isDuplicate: !!r.is_duplicate,
          updateCheckedAt: r.update_checked_at,
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(models));
      } else if (url === '/api/pull-missing-model' && req.method === 'POST') {
        const body = await getBody();
        const result = await pullMissingModel(body.model || body, body.targetRoot);
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if ((url === '/api/search-models' || url === '/api/search-civitai' || url === '/api/civitai/search') && req.method === 'POST') {
        const body = await getBody();
        const params = {
          query: body.query || body.q || body.search || '',
          types: body.types || (body.type ? [body.type] : undefined),
          baseModels: body.baseModels || body.base_models || (body.baseModel ? [body.baseModel] : undefined),
          limit: body.limit || body.pageSize || 20,
          page: body.page || 1,
          nsfw: body.nsfw,
          sort: body.sort,
        };
        const result = await civitaiClient.fetchModels(params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (url === '/api/enums' && req.method === 'GET') {
        const enums = await civitaiClient.fetchEnums();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(enums));
      } else if ((url === '/api/add-download' || url === '/api/download-model') && req.method === 'POST') {
        const body = await getBody();
        const fileName = body.fileName || body.file_name || body.modelName || body.model_name || 'model.safetensors';
        const modelType = body.modelType || body.model_type || 'Checkpoint';
        const baseModel = body.baseModel || body.base_model || 'SDXL 1.0';
        const creator = body.creator || body.creator_name || body.author || '';
        const modelVersionId = body.modelVersionId || body.model_version_id || body.versionId || body.version_id;

        let downloadUrl = body.downloadUrl || body.download_url;
        if (!downloadUrl && modelVersionId) {
          downloadUrl = civitaiClient.getDownloadUrl(modelVersionId);
        }
        const effectiveRoot = body.targetRoot || body.target_root || currentConfig.default_download_folder || currentConfig.comfyui_root || (currentConfig.comfyui_folders && currentConfig.comfyui_folders[0]);
        const computed = folderRouter.computePath({
          fileName,
          modelType,
          baseModel,
          creator,
          targetRoot: effectiveRoot,
        });
        const task = downloadManager.addTask({
          ...body,
          fileName,
          modelType,
          baseModel,
          creator,
          modelVersionId,
          downloadUrl,
          targetFolder: computed.folderName,
          targetRoot: effectiveRoot,
          computedPath: computed.fullPath,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(task));
      } else if (url === '/api/downloads' && req.method === 'GET') {
        const tasks = downloadManager.getTasks();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tasks));
      } else if (url === '/api/pause-download' && req.method === 'POST') {
        const body = await getBody();
        await downloadManager.pauseTask(body.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (url === '/api/resume-download' && req.method === 'POST') {
        const body = await getBody();
        await downloadManager.resumeTask(body.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (url === '/api/cancel-download' && req.method === 'POST') {
        const body = await getBody();
        await downloadManager.cancelTask(body.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (url === '/api/delete-download' && req.method === 'POST') {
        const body = await getBody();
        const success = await downloadManager.deleteTask(body.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } else if (/^\/api\/clear(-|_)finished(-|_)downloads$/.test(url) && req.method === 'POST') {
        const cleared = await downloadManager.clearFinishedTasks();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, cleared }));
      } else if (url === '/api/delete-local-model' && req.method === 'POST') {
        const body = await getBody();
        const model = await dbManager.get('SELECT * FROM local_models WHERE id = ?', [body.id]);
        const deleteFromDisk = body.deleteFromDisk !== false;
        if (!model) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Model not found' }));
        } else {
          try {
            if (deleteFromDisk && fs.existsSync(model.file_path)) {
              fs.unlinkSync(model.file_path);
            }
            await dbManager.run('DELETE FROM local_models WHERE id = ?', [body.id]);
            await libraryScanner.flagDuplicates();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (delErr: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: delErr.message }));
          }
        }
      } else if (url === '/api/open-folder' && req.method === 'POST') {
        const body = await getBody();
        if (body.filePath && typeof body.filePath === 'string') {
          try {
            shell.showItemInFolder(path.resolve(body.filePath));
          } catch (e) {
            logger.warn('Failed to show item in folder via HTTP:', e);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (url === '/api/browse-folder' && req.method === 'POST') {
        const body = await getBody();
        try {
          const result = await dialog.showOpenDialog({
            title: 'Select Folder',
            properties: ['openDirectory', 'createDirectory'],
            defaultPath: body?.defaultPath && String(body.defaultPath).trim() ? String(body.defaultPath).trim() : undefined,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify(
              result.canceled || !result.filePaths || result.filePaths.length === 0
                ? { canceled: true }
                : { canceled: false, path: result.filePaths[0] }
            )
          );
        } catch (e: any) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ canceled: true, error: e?.message || 'Failed to open folder dialog' }));
        }
      } else if (url === '/api/list-directory' && (req.method === 'POST' || req.method === 'GET')) {
        const body = req.method === 'POST' ? await getBody() : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(listDirectoryEntries(body?.dirPath)));
      } else if (url === '/api/cancel-scan' && req.method === 'POST') {
        libraryScanner.cancelScan();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (url === '/api/get-scan-status' && req.method === 'GET') {
        const status = libraryScanner.getScanStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
      } else if (url === '/api/ignore-model-update' && req.method === 'POST') {
        const body = await getBody();
        const success = await versionManager.ignoreUpdate(body.modelId, body.versionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } else if (url === '/api/unignore-model-update' && req.method === 'POST') {
        const body = await getBody();
        const success = await versionManager.unignoreUpdate(body.modelId, body.versionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } else if (url === '/api/get-ignored-updates' && req.method === 'GET') {
        const ignored = await versionManager.getIgnoredUpdates();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(ignored));
      } else if (url === '/api/ignore-duplicate-set' && req.method === 'POST') {
        const body = await getBody();
        const success = await libraryScanner.ignoreDuplicateSet(body.sha256, body.count || 2);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } else if (url === '/api/unignore-duplicate-set' && req.method === 'POST') {
        const body = await getBody();
        const success = await libraryScanner.unignoreDuplicateSet(body.sha256);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } else if (url === '/api/set-model-nsfw' && req.method === 'POST') {
        const body = await getBody();
        if (body.modelId) {
          await dbManager.run('UPDATE local_models SET nsfw = ? WHERE id = ?', [body.nsfw ? 1 : 0, body.modelId]);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if (url === '/api/get-ignored-duplicates' && req.method === 'GET') {
        const ignored = await libraryScanner.getIgnoredDuplicates();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(ignored));
      } else if (url === '/api/match-unidentified-models' && req.method === 'POST') {
        const result = await libraryScanner.matchUnidentifiedModels();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (url === '/api/export-backup-zip' && req.method === 'GET') {
        const zipBuffer = await backupService.createBackupZip();
        const filename = `cmm-backup-${new Date().toISOString().slice(0, 10)}.zip`;
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': zipBuffer.length,
        });
        res.end(zipBuffer);
        return;
      } else if (url === '/api/import-backup-zip' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const fullBuffer = Buffer.concat(chunks);
            const result = await backupService.restoreBackup(fullBuffer);
            await libraryScanner.flagDuplicates();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      } else if (url.startsWith('/api/cached-image') && req.method === 'GET') {
        const parsedUrl = new URL(url, `http://${req.headers.host || 'localhost:5174'}`);
        const targetUrl = parsedUrl.searchParams.get('url');
        const cacheType = (parsedUrl.searchParams.get('type') || 'library') as 'library' | 'browse';

        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }

        const image = await imageCacheService.getImage(targetUrl, cacheType);
        if (image) {
          res.writeHead(200, {
            'Content-Type': image.contentType,
            'Cache-Control': cacheType === 'library' ? 'public, max-age=31536000, immutable' : 'public, max-age=86400',
            'Content-Length': image.buffer.length,
          });
          res.end(image.buffer);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Image not found or failed to download' }));
        }
        return;
      } else if (url === '/api/clear-library' && req.method === 'POST') {
        await dbManager.run('DELETE FROM local_models;');
        imageCacheService.clearPermanentLibraryCache();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else if ((url === '/api/workflows' || url === '/api/workflow/parse' || url === '/api/parse-workflow' || url === '/api/inspect-workflow') && req.method === 'POST') {
        const body = await getBody();

        // 1. Direct raw JSON workflow payload in POST body
        const isDirectWorkflow =
          body.workflow !== undefined ||
          body.prompt !== undefined ||
          body.nodes !== undefined ||
          body.graph !== undefined ||
          (typeof body === 'object' && !body.folderPaths && !body.folderPath && !body.path && Object.keys(body).length > 0 && !Array.isArray(body));

        if (isDirectWorkflow && !body.folderPaths && !body.folderPath && !body.path) {
          const rawData = body.workflow !== undefined ? body.workflow : (body.prompt !== undefined ? body.prompt : (body.graph !== undefined ? body.graph : body));
          const workflowName = body.name || body.fileName || body.file_name || 'direct_workflow.json';
          const result = await workflowScanner.parseWorkflow(rawData, workflowName);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
          return;
        }

        // 2. Folder paths fallback for disk scanning
        const customPaths = body.folderPaths || body.folderPath || body.path;
        const targetPaths = resolveWorkflowScanPaths(currentConfig, customPaths);
        const workflows = await workflowScanner.scanWorkflows(targetPaths);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(workflows));
      } else if ((url === '/api/comfyui/status' || url === '/api/comfyui-status') && (req.method === 'GET' || req.method === 'POST')) {
        let targetUrl: string | undefined;
        if (req.method === 'POST') {
          const body = await getBody();
          targetUrl = body.serverUrl || body.url;
        }
        const status = await checkComfyUIStatus(targetUrl);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
      } else if ((url === '/api/comfyui/save-workflow' || url === '/api/save-comfyui-workflow') && req.method === 'POST') {
        const body = await getBody();
        const result = await saveComfyUIWorkflow(body.fileName, body.data, body.fileType);
        res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if ((url === '/api/comfyui/prompt' || url === '/api/execute-comfyui-prompt') && req.method === 'POST') {
        const body = await getBody();
        const result = await executeComfyUIPrompt(body.prompt || body, body.serverUrl);
        res.writeHead(result.success ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (url === '/api/webhooks/test' && req.method === 'POST') {
        const body = await getBody();
        const result = await webhookService.testWebhook(body.url, body.event);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if ((url === '/api/hf/check' || url === '/api/check-huggingface' || url === '/api/huggingface/check') && req.method === 'POST') {
        const body = await getBody();
        const repoId = body.repoId || body.repo_id || body.repository || body.repo || '';
        const result = await huggingfaceClient.checkModelRepo(repoId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (url === '/api/hf/validate-token' && req.method === 'POST') {
        const body = await getBody();
        const result = await huggingfaceClient.validateToken(body.token);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (url === '/api/hf/whoami' && req.method === 'GET') {
        const result = await huggingfaceClient.getCliWhoami();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (url === '/api/app-update' && req.method === 'GET') {
        const result = await checkDevelopmentGitUpdate();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else if (url === '/api/restart-app' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        setTimeout(() => performLiveRestart(), 500);
      } else if (url === '/api/shutdown-app' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        setTimeout(() => performFullShutdown(), 500);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${apiPort} is already in use by an active instance. Reusing existing bridge connection.`);
    } else {
      logger.error('HTTP Server bridge error:', err);
    }
  });

  server.listen(apiPort, '127.0.0.1', () => {
    logger.info(`HTTP Native Server Bridge securely listening on http://127.0.0.1:${apiPort} (Localhost only)`);
  });
}

function registerIpcHandlers() {
  ipcMain.handle('get-config', () => getSanitizedConfig(currentConfig, true));

  // Clear library cache from SQLite
  ipcMain.handle('clear-library', async () => {
    try {
      await dbManager.run('DELETE FROM local_models;');
      imageCacheService.clearPermanentLibraryCache();
      logger.info('Library cache cleared from database.');
      return { success: true };
    } catch (e: any) {
      logger.error('Failed to clear library database:', e);
      return { success: false, error: e?.message || 'Unknown error' };
    }
  });

  ipcMain.handle('save-config', async (_event, newConfig: Partial<AppConfig>) => {
    // Sanitize folder inputs before persisting
    if (newConfig.comfyui_root !== undefined) {
      const s = newConfig.comfyui_root ? sanitizeFolderPath(String(newConfig.comfyui_root)) : '';
      if (newConfig.comfyui_root && !s) throw new Error('Invalid comfyui_root path');
      newConfig.comfyui_root = s || '';
    }
    if (newConfig.comfyui_folders !== undefined) {
      newConfig.comfyui_folders = sanitizeFolderList(newConfig.comfyui_folders as any);
    }
    if (newConfig.comfyui_install_dir !== undefined) {
      const s = newConfig.comfyui_install_dir ? sanitizeFolderPath(String(newConfig.comfyui_install_dir)) : '';
      if (newConfig.comfyui_install_dir && !s) throw new Error('Invalid comfyui_install_dir path');
      newConfig.comfyui_install_dir = s || '';
    }
    if (newConfig.comfyui_custom_nodes_dir !== undefined) {
      const s = newConfig.comfyui_custom_nodes_dir ? sanitizeFolderPath(String(newConfig.comfyui_custom_nodes_dir)) : '';
      if (newConfig.comfyui_custom_nodes_dir && !s) throw new Error('Invalid comfyui_custom_nodes_dir path');
      newConfig.comfyui_custom_nodes_dir = s || '';
    }

    const configToMerge = { ...newConfig };
    if (configToMerge.civitai_api_key !== undefined && String(configToMerge.civitai_api_key).startsWith('•')) {
      delete configToMerge.civitai_api_key;
    }
    if (configToMerge.huggingface_token !== undefined && String(configToMerge.huggingface_token).startsWith('•')) {
      delete configToMerge.huggingface_token;
    }
    currentConfig = { ...currentConfig, ...configToMerge };

    if (newConfig.civitai_api_key !== undefined) {
      const keyVal = String(newConfig.civitai_api_key).trim();
      if (!keyVal.startsWith('•')) {
        if (keyVal === '') {
          currentConfig.civitai_api_key = '';
          await dbManager.run('DELETE FROM app_config WHERE key = ?;', ['civitai_api_key']);
          civitaiClient.setApiKey('');
          downloadManager.setApiKey('');
        } else {
          currentConfig.civitai_api_key = keyVal;
          const encrypted = encryptKey(keyVal);
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['civitai_api_key', JSON.stringify(encrypted)]
          );
          civitaiClient.setApiKey(keyVal);
          downloadManager.setApiKey(keyVal);
        }
      }
    }

    if (newConfig.comfyui_root !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['comfyui_root', JSON.stringify(newConfig.comfyui_root)]
      );
    }

    if (newConfig.comfyui_folders !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['comfyui_folders', JSON.stringify(newConfig.comfyui_folders)]
      );
    }

    if (newConfig.comfyui_install_dir !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['comfyui_install_dir', JSON.stringify(newConfig.comfyui_install_dir)]
      );
    }

    if (newConfig.comfyui_custom_nodes_dir !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['comfyui_custom_nodes_dir', JSON.stringify(newConfig.comfyui_custom_nodes_dir)]
      );
    }

    if (newConfig.mirror_url !== undefined) {
      const baseApiUrl = (newConfig.mirror_url && newConfig.mirror_url.trim()) ? newConfig.mirror_url.trim() : 'https://civitai.com/api/v1';
      civitaiClient.setBaseUrl(baseApiUrl);
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['mirror_url', JSON.stringify(newConfig.mirror_url)]
      );
    }

    if (newConfig.huggingface_token !== undefined) {
      const tokenVal = String(newConfig.huggingface_token).trim();
      if (!tokenVal.startsWith('•')) {
        if (tokenVal === '') {
          currentConfig.huggingface_token = '';
          await dbManager.run('DELETE FROM app_config WHERE key = ?;', ['huggingface_token']);
          huggingfaceClient.setToken('');
          downloadManager.setHuggingFaceToken('');
        } else {
          currentConfig.huggingface_token = tokenVal;
          const encryptedHf = encryptKey(tokenVal);
          await dbManager.run(
            'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
            ['huggingface_token', JSON.stringify(encryptedHf)]
          );
          huggingfaceClient.setToken(tokenVal);
          downloadManager.setHuggingFaceToken(tokenVal);
        }
      }
    }

    if (newConfig.webhooks !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['webhooks', JSON.stringify(newConfig.webhooks)]
      );
      webhookService.updateConfig(newConfig.webhooks);
    }

    if (newConfig.folder_mappings) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['folder_mappings', JSON.stringify(newConfig.folder_mappings)]
      );
    }

    if (newConfig.advanced_mappings) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['advanced_mappings', JSON.stringify(newConfig.advanced_mappings)]
      );
    }

    if (newConfig.organize_by !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['organize_by', JSON.stringify(newConfig.organize_by)]
      );
    }

    if (newConfig.conflict_strategy !== undefined) {
      downloadManager.setConflictStrategy(newConfig.conflict_strategy);
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['conflict_strategy', JSON.stringify(newConfig.conflict_strategy)]
      );
    }

    if (newConfig.nsfw_max_visible_level !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['nsfw_max_visible_level', JSON.stringify(newConfig.nsfw_max_visible_level)]
      );
    }

    if (newConfig.nsfw_blur_enabled !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['nsfw_blur_enabled', JSON.stringify(newConfig.nsfw_blur_enabled)]
      );
    }

    if (newConfig.strict_hash_verification !== undefined) {
      downloadManager.setStrictHashVerification(newConfig.strict_hash_verification);
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['strict_hash_verification', JSON.stringify(newConfig.strict_hash_verification)]
      );
    }

    if (newConfig.max_concurrent_downloads !== undefined) {
      downloadManager.setMaxConcurrent(newConfig.max_concurrent_downloads);
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['max_concurrent_downloads', JSON.stringify(newConfig.max_concurrent_downloads)]
      );
    }

    if (newConfig.default_download_folder !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['default_download_folder', JSON.stringify(newConfig.default_download_folder)]
      );
    }

    if (newConfig.local_api_enabled !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['local_api_enabled', JSON.stringify(newConfig.local_api_enabled)]
      );
    }

    if (newConfig.local_api_port !== undefined) {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['local_api_port', JSON.stringify(newConfig.local_api_port)]
      );
    }

    if (newConfig.comfyui_server_url !== undefined && typeof newConfig.comfyui_server_url === 'string') {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        ['comfyui_server_url', JSON.stringify(newConfig.comfyui_server_url.trim())]
      );
    }

    folderRouter.updateConfig({
      rootPath: currentConfig.comfyui_root,
      folderPaths: currentConfig.comfyui_folders,
      folderMappings: currentConfig.folder_mappings,
      separateByBaseModel: currentConfig.organize_by.base_model,
      separateByCreator: currentConfig.organize_by.creator,
      advancedMappings: currentConfig.advanced_mappings,
    });

    // Ensure WAL is checkpointed so the write is visible to the next process/restart
    try {
      await dbManager.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      logger.info(`[Config] Saved folders: ${JSON.stringify(currentConfig.comfyui_folders)} install_dir=${currentConfig.comfyui_install_dir}`);
    } catch {}

    return currentConfig;
  });

  ipcMain.handle('scaffold-model-folders', async (_event: unknown, targetDir?: string) => {
    return scaffoldConfiguredModelFolders(currentConfig, targetDir);
  });

  // CivitAI API Handlers
  ipcMain.handle('search-models', async (_event: unknown, params: any) => {
    return await civitaiClient.fetchModels(params);
  });

  ipcMain.handle('get-model', async (_event: unknown, id: number) => {
    return await civitaiClient.fetchModel(id);
  });

  ipcMain.handle('get-model-version', async (_event: unknown, id: number) => {
    return await civitaiClient.fetchModelVersion(id);
  });

  ipcMain.handle('get-enums', async () => {
    return await civitaiClient.fetchEnums();
  });

  // Workflow Handlers
  ipcMain.handle('scan-workflows', async (_event: unknown, folderPaths?: string | string[]) => {
    const targetPaths = resolveWorkflowScanPaths(currentConfig, folderPaths);
    return await workflowScanner.scanWorkflows(targetPaths);
  });

  ipcMain.handle('parse-workflow', async (_event: unknown, workflowData: any, workflowName?: string) => {
    return await workflowScanner.parseWorkflow(workflowData, workflowName);
  });

  ipcMain.handle('check-comfyui-status', async (_event: unknown, serverUrl?: string) => {
    return await checkComfyUIStatus(serverUrl);
  });

  ipcMain.handle('save-comfyui-workflow', async (_event: unknown, fileName: string, data: any, fileType?: string) => {
    return await saveComfyUIWorkflow(fileName, data, fileType);
  });

  ipcMain.handle('execute-comfyui-prompt', async (_event: unknown, promptData: any, serverUrl?: string) => {
    return await executeComfyUIPrompt(promptData, serverUrl);
  });

  // ComfyUI Installation & Custom Node Inspection
  ipcMain.handle('inspect-comfyui-install', async (_event: unknown, targetPath?: string) => {
    return inspectComfyUIInstall(targetPath);
  });

  ipcMain.handle('auto-detect-comfyui', async () => {
    return autoDetectComfyUIInstall();
  });

  // Node Resolution & GitHub Fallback Handlers
  ipcMain.handle('resolve-missing-node', async (_event: unknown, nodeType: string, customNodesDir?: string, searchGitHub = false, forceRefresh = false) => {
    const targetNodesDir = resolveCustomNodesDir(currentConfig, customNodesDir);
    return await nodeResolverService.resolveMissingNode(
      nodeType,
      targetNodesDir,
      currentConfig.comfyui_install_dir,
      { searchGitHub: !!searchGitHub, forceRefresh: !!forceRefresh }
    );
  });

  ipcMain.handle('search-github-nodes', async (_event: unknown, query: string, limit = 3) => {
    return await nodeResolverService.searchGitHubNodes(query, limit);
  });

  ipcMain.handle('clone-custom-node', async (_event: unknown, gitUrl: string, customFolderName?: string, customNodesDir?: string) => {
    const targetNodesDir = resolveCustomNodesDir(currentConfig, customNodesDir);
    return await nodeResolverService.cloneCustomNode(
      gitUrl,
      targetNodesDir,
      currentConfig.comfyui_install_dir,
      customFolderName
    );
  });

  ipcMain.handle('install-node-dependencies', async (_event: unknown, nodeFolderPath: string) => {
    return await nodeResolverService.installNodeDependencies(nodeFolderPath, currentConfig.comfyui_install_dir);
  });

  ipcMain.handle('get-installed-custom-nodes', async () => {
    const targetNodesDir = resolveCustomNodesDir(currentConfig);
    return await nodeResolverService.inspectLocalCustomNodes(targetNodesDir);
  });

  ipcMain.handle('mark-node-installed', async (_event: unknown, nodeType: string, folderName: string, customNodesDir?: string) => {
    const targetNodesDir = resolveCustomNodesDir(currentConfig, customNodesDir);
    return await nodeResolverService.markNodeInstalled(nodeType, folderName, targetNodesDir);
  });

  // Webhook Handlers
  ipcMain.handle('test-webhook', async (_event: unknown, url: string, event: 'on_download_complete' | 'on_update_available') => {
    return await webhookService.testWebhook(url, event);
  });

  // Hugging Face Handlers
  ipcMain.handle('hf-check-model', async (_event: unknown, repoId: string) => {
    return await huggingfaceClient.checkModelRepo(repoId);
  });

  ipcMain.handle('hf-validate-token', async (_event: unknown, token?: string) => {
    return await huggingfaceClient.validateToken(token);
  });

  ipcMain.handle('hf-whoami', async () => {
    return await huggingfaceClient.getCliWhoami();
  });

  ipcMain.handle('hf-search-models', async (_event: unknown, query: string, limit?: number) => {
    return await huggingfaceClient.searchModels(query, limit);
  });

  ipcMain.handle('inspect-gguf', async (_event: unknown, filePath: string) => {
    return ggufParser.inspectGGUF(filePath);
  });

  // Scanner Handlers
  ipcMain.handle('scan-library', async (_event: unknown, rootPath: string | string[]) => {
    libraryScanner
      .scanDirectory(rootPath, (progress: any) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan-progress', progress);
        }
      })
      .catch((err) => {
        logger.error('Background folder scan error:', err);
      });
    return { success: true, status: 'scanning' };
  });

  ipcMain.handle('cancel-scan', () => {
    libraryScanner.cancelScan();
    return true;
  });

  ipcMain.handle('get-scan-status', () => {
    return libraryScanner.getScanStatus();
  });

  ipcMain.handle('match-unidentified-models', async () => {
    return await libraryScanner.matchUnidentifiedModels();
  });

  ipcMain.handle('get-local-models', async () => {
    // Flags persist across scans/loads, but self-clear once the flagged update
    // version is actually installed locally.
    await dbManager.run(
      `UPDATE local_models SET has_update = 0, update_version_id = NULL, update_version_name = NULL, update_download_url = NULL
       WHERE has_update = 1 AND update_version_id IS NOT NULL AND civitai_version_id = update_version_id;`
    );
    const rows = await dbManager.all('SELECT * FROM local_models ORDER BY file_name ASC;');
    return rows.map((r: any) => ({
      id: r.id,
      filePath: r.file_path,
      fileName: r.file_name,
      fileSize: r.file_size,
      modifiedAt: r.modified_at,
      sha256: r.sha256,
      civitaiModelId: r.civitai_model_id,
      civitaiVersionId: r.civitai_version_id,
      civitaiName: r.civitai_name || undefined,
      previewUrl: r.preview_url,
      modelType: r.model_type,
      nsfw: !!r.nsfw,
      isMatched: !!r.civitai_version_id,
      isMissing: !fs.existsSync(r.file_path),
      hasUpdate: !!r.has_update,
      updateVersionId: r.update_version_id,
      updateVersionName: r.update_version_name,
      updateDownloadUrl: r.update_download_url,
      ignoredVersionId: r.ignored_version_id,
      isDuplicate: !!r.is_duplicate,
      updateCheckedAt: r.update_checked_at,
    }));
  });

  ipcMain.handle('pull-missing-model', async (_event: unknown, modelData: any, targetRoot?: string) => {
    return await pullMissingModel(modelData, targetRoot);
  });

  // Download Handlers
  ipcMain.handle('add-download', async (_event: unknown, taskParams: any) => {
    let downloadUrl = taskParams.downloadUrl;
    // Prefer the caller-supplied URL and only build one from the version id when none was provided.
    if (!downloadUrl && taskParams.modelVersionId) {
      downloadUrl = civitaiClient.getDownloadUrl(taskParams.modelVersionId);
    }

    const effectiveRoot = taskParams.targetRoot || currentConfig.default_download_folder || currentConfig.comfyui_root || (currentConfig.comfyui_folders && currentConfig.comfyui_folders[0]);
    const computed = folderRouter.computePath({
      fileName: taskParams.fileName,
      modelType: taskParams.modelType,
      baseModel: taskParams.baseModel,
      creator: taskParams.creator,
      targetRoot: effectiveRoot,
    });

    const task = downloadManager.addTask({
      ...taskParams,
      downloadUrl,
      targetFolder: computed.folderName,
      targetRoot: effectiveRoot,
      computedPath: computed.fullPath,
    });

    return task;
  });

  ipcMain.handle('pause-download', async (_event: unknown, id: string) => {
    await downloadManager.pauseTask(id);
    return true;
  });

  ipcMain.handle('resume-download', async (_event: unknown, id: string) => {
    await downloadManager.resumeTask(id);
    return true;
  });

  ipcMain.handle('cancel-download', async (_event: unknown, id: string) => {
    await downloadManager.cancelTask(id);
    return true;
  });

  ipcMain.handle('force-complete-download', async (_event: unknown, id: string) => {
    return await downloadManager.forceCompleteTask(id);
  });

  ipcMain.handle('get-downloads', () => {
    return downloadManager.getTasks();
  });

  ipcMain.handle('delete-download', async (_event: unknown, id: string) => {
    const success = await downloadManager.deleteTask(id);
    return { success };
  });

  ipcMain.handle('clear-finished-downloads', async () => {
    const cleared = await downloadManager.clearFinishedTasks();
    return { success: true, cleared };
  });

  // Fetch version history for a given model ID
  ipcMain.handle('fetch-versions', async (_event: unknown, modelId: number) => {
    try {
      const versions = await versionManager.getVersionHistory(modelId);
      return versions;
    } catch (e) {
      logger.error('Failed to fetch versions', e);
      return [];
    }
  });

  // Versioning & Backup
  ipcMain.handle('check-update', async (_event: unknown, localModel: any) => {
    return await versionManager.checkForUpdates(localModel);
  });

  ipcMain.handle('check-all-updates', async (_event: unknown, opts?: { force?: boolean }) => {
    return await versionManager.batchCheckAllUpdates(
      (prog) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-check-progress', prog);
        }
      },
      { force: opts?.force === true }
    );
  });

  ipcMain.handle('ignore-model-update', async (_event: unknown, modelId: number, versionId: number) => {
    return await versionManager.ignoreUpdate(modelId, versionId);
  });

  ipcMain.handle('unignore-model-update', async (_event: unknown, modelId: number, versionId: number) => {
    return await versionManager.unignoreUpdate(modelId, versionId);
  });

  ipcMain.handle('get-ignored-updates', async () => {
    return await versionManager.getIgnoredUpdates();
  });

  ipcMain.handle('export-backup', async (_event: unknown, targetFilePath?: string) => {
    try {
      let dest = targetFilePath;
      if (!dest) {
        const { dialog } = require('electron');
        const defaultName = `cmm-backup-${new Date().toISOString().slice(0, 10)}.zip`;
        const result = await dialog.showSaveDialog({
          title: 'Save Complete CMM Backup Archive (.zip)',
          defaultPath: defaultName,
          filters: [
            { name: 'ZIP Archive (*.zip)', extensions: ['zip'] },
            { name: 'All Files (*.*)', extensions: ['*'] },
          ],
        });
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        dest = result.filePath;
      }
      if (!dest) {
        return { success: false, canceled: true };
      }
      await backupService.exportBackup(dest);
      return { success: true, filePath: dest };
    } catch (e: any) {
      logger.error('Failed to export backup:', e);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('import-backup', async (_event: unknown, sourceFilePath?: string | Buffer) => {
    try {
      let src = sourceFilePath;
      if (!src) {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog({
          title: 'Select CMM Backup Archive to Restore',
          properties: ['openFile'],
          filters: [
            { name: 'CMM Backup (*.zip, *.json)', extensions: ['zip', 'json'] },
            { name: 'All Files (*.*)', extensions: ['*'] },
          ],
        });
        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return { success: false, canceled: true };
        }
        src = result.filePaths[0];
      }
      if (!src) {
        return { success: false, canceled: true };
      }
      const restoreResult = await backupService.restoreBackup(src);
      await libraryScanner.flagDuplicates();
      return restoreResult;
    } catch (e: any) {
      logger.error('Failed to import backup:', e);
      return { success: false, error: e.message };
    }
  });
  ipcMain.handle('delete-local-model', async (_event: unknown, id: string, deleteFromDisk: boolean = true) => {
    const model = await dbManager.get('SELECT * FROM local_models WHERE id = ?', [id]);
    if (!model) {
      return { success: false, error: 'Model not found' };
    }
    try {
      if (deleteFromDisk && fs.existsSync(model.file_path)) {
        fs.unlinkSync(model.file_path);
      }
      await dbManager.run('DELETE FROM local_models WHERE id = ?', [id]);
      await libraryScanner.flagDuplicates();
      return { success: true };
    } catch (delErr: any) {
      logger.error(`Failed to delete local model ${id}:`, delErr);
      return { success: false, error: delErr.message };
    }
  });

  ipcMain.handle('open-folder', async (_event: unknown, filePath: string) => {
    if (filePath && typeof filePath === 'string') {
      try {
        shell.showItemInFolder(path.resolve(filePath));
        return true;
      } catch (e) {
        logger.warn('Failed to show item in folder via IPC:', e);
      }
    }
    return false;
  });

  ipcMain.handle('browse-folder', async (_event: unknown, defaultPath?: string) => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Folder',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: defaultPath && defaultPath.trim() ? defaultPath.trim() : undefined,
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return { canceled: true };
      }
      return { canceled: false, path: result.filePaths[0] };
    } catch (e: any) {
      logger.warn('browse-folder failed:', e);
      return { canceled: true, error: e?.message || 'Failed to open folder dialog' };
    }
  });

  ipcMain.handle('list-directory', async (_event: unknown, dirPath?: string) => {
    return listDirectoryEntries(dirPath);
  });

  ipcMain.handle('ignore-duplicate-set', async (_event: unknown, sha256: string, count: number = 2) => {
    return await libraryScanner.ignoreDuplicateSet(sha256, count);
  });

  ipcMain.handle('unignore-duplicate-set', async (_event: unknown, sha256: string) => {
    return await libraryScanner.unignoreDuplicateSet(sha256);
  });

  ipcMain.handle('get-ignored-duplicates', async () => {
    return await libraryScanner.getIgnoredDuplicates();
  });

  ipcMain.handle('set-model-nsfw', async (_event: unknown, modelId: string, nsfw: boolean) => {
    if (modelId) {
      await dbManager.run('UPDATE local_models SET nsfw = ? WHERE id = ?', [nsfw ? 1 : 0, modelId]);
      return true;
    }
    return false;
  });

  // External Link & System Info
  ipcMain.handle('open-external', async (_event: unknown, url: string) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('check-app-update', async () => {
    return await checkDevelopmentGitUpdate();
  });

  ipcMain.handle('get-system-info', () => {
    const isDevBuild = BUILD_CONFIG.IS_DEV_BUILD && process.env.CMM_RELEASE_BUILD !== 'true';
    return {
      version: APP_VERSION || app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      isDevBuild,
      releaseChannel: isDevBuild ? 'development' : 'stable',
    };
  });

  // App control
  ipcMain.handle('restart-app', async () => {
    return await performLiveRestart();
  });
  ipcMain.handle('shutdown-app', () => {
    performFullShutdown();
    return true;
  });
}

async function performLiveRestart() {
  logger.info('Performing live backend restart & frontend refresh...');
  try {
    // 1. Re-load and apply all configuration from SQLite
    await loadConfigFromDb();
    await purgeStaleNodeResolutionCache();

    // 2. Re-initialize and sync backend services
    if (currentConfig.civitai_api_key) {
      civitaiClient.setApiKey(currentConfig.civitai_api_key);
      downloadManager.setApiKey(currentConfig.civitai_api_key);
    }
    downloadManager.setConflictStrategy(currentConfig.conflict_strategy);
    downloadManager.setStrictHashVerification(currentConfig.strict_hash_verification !== false);
    downloadManager.setMaxConcurrent(currentConfig.max_concurrent_downloads || 2);

    folderRouter.updateConfig({
      rootPath: currentConfig.comfyui_root || (currentConfig.comfyui_folders && currentConfig.comfyui_folders[0]) || '',
      folderPaths: currentConfig.comfyui_folders,
      folderMappings: currentConfig.folder_mappings,
      separateByBaseModel: currentConfig.organize_by.base_model,
      separateByCreator: currentConfig.organize_by.creator,
      advancedMappings: currentConfig.advanced_mappings,
    });

    // 3. Refresh Electron frontend window live without terminating the OS window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reloadIgnoringCache();
    }
    logger.info('Live restart completed successfully.');
    return true;
  } catch (err) {
    logger.error('Error during live restart:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reloadIgnoringCache();
    }
    return false;
  }
}

function performFullShutdown() {
  logger.info('Performing full application shutdown and cleanup...');

  // 1. Read PID file (.cmm.pid) if exists
  const pidFilePath = path.join(process.cwd(), '.cmm.pid');
  const pidsToKill = new Set<number>();

  if (fs.existsSync(pidFilePath)) {
    try {
      const content = fs.readFileSync(pidFilePath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const pid = parseInt(line.trim(), 10);
        if (!isNaN(pid) && pid > 0 && pid !== process.pid) {
          pidsToKill.add(pid);
        }
      });
      fs.unlinkSync(pidFilePath);
    } catch (e) {}
  }

  // 2. Kill spawned background processes (like Vite dev server) with safety verification
  if (process.platform === 'win32') {
    for (const pid of pidsToKill) {
      try {
        child_process.execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } catch (e) {}
    }
    // Clean up only node/electron processes listening on 5173 or 5174, never browsers
    try {
      child_process.execSync(
        `powershell -NoProfile -Command "$prot = @('firefox','chrome','brave','opera','msedge','safari'); Get-NetTCPConnection -LocalPort 5173,5174 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; if ($p -and $p.Id -ne ${process.pid} -and ($p.ProcessName -eq 'node' -or $p.ProcessName -eq 'electron') -and -not ($prot -contains $p.ProcessName.ToLower())) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }"`,
        { stdio: 'ignore' }
      );
    } catch (e) {}
  } else {
    for (const pid of pidsToKill) {
      try {
        const comm = child_process.execSync(`ps -p ${pid} -o comm= 2>/dev/null`, { encoding: 'utf8' }).trim().toLowerCase();
        const isBrowser = /firefox|chrome|chromium|brave|opera|edge|safari|zen|tor|waterfox|librewolf/.test(comm);
        if (!isBrowser && (comm.includes('node') || comm.includes('electron') || comm.includes('vite'))) {
          process.kill(pid, 'SIGTERM');
        }
      } catch (e) {}
    }
  }

  app.quit();
  setTimeout(() => {
    process.exit(0);
  }, 300);
}

// Timer to send download progress updates to renderer UI
setInterval(() => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-progress', downloadManager.getTasks());
  }
}, 500);

// Forward backend main-process logs to renderer Diagnostic Console
logger.onLog((logPayload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-log', logPayload);
  }
});

// Single Instance Lock: Ensure only one instance of the app runs at a time.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.info('Another instance of Renegade Core Model Manager is already running. Focusing existing window and exiting.');
  app.quit();
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    logger.info('Second instance detected. Restoring and focusing existing window.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Ensure download queue deletions/persists are flushed before the process exits.
  // Without this, a fire-and-forget DELETE that hasn't committed yet resurrects via hydrateFromDb() on next launch.
  app.on('before-quit', async (e) => {
    try {
      await downloadManager.flushAndStopPersistence();
    } catch {}
  });

  // Security: Harden all created webContents and <webview> instances
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (_waEvent, webPreferences) => {
      delete (webPreferences as any).preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
    });
  });

  app.whenReady().then(async () => {
    await dbManager.init();
    await downloadManager.initPersistence();
    await loadConfigFromDb();
    await purgeStaleNodeResolutionCache();
    registerIpcHandlers();
    startHttpBridgeServer();

    const isHeadless = process.env.HEADLESS === 'true' || app.commandLine.hasSwitch('headless');
    if (!isHeadless) {
      await createWindow();
    } else {
      logger.info('Running in headless background mode (no Electron desktop window created).');
    }

    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        logger.warn('Auto-updater check failed:', err);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}
