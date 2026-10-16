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
import os from 'os';
import { sanitizePathString } from './securityValidator';

export interface ComfyUIStructure {
  hasMainPy: boolean;
  hasCustomNodes: boolean;
  hasModelsDir: boolean;
  hasInputDir: boolean;
  hasOutputDir: boolean;
  hasComfyCore: boolean;
  hasExtraModelPaths: boolean;
  detectedModelsDir: string;
  modelsDirExists: boolean;
  detectedModelSubdirs: string[];
  confidenceScore: number;
}

export interface ComfyUIInstallInfo {
  valid: boolean;
  inferred: boolean;
  installDir: string;
  customNodesDir: string;
  customNodesExist: boolean;
  installedNodes: string[];
  nodeCount: number;
  cmmNodeInstalled: boolean;
  cmmNodeFolderName?: string;
  structure?: ComfyUIStructure;
  autoModelsDir?: string;
}

export interface ComfyUIStatusResult {
  online: boolean;
  serverUrl: string;
  version?: string;
  devices?: string[];
  os?: string;
  error?: string;
}

export function getSubdirectories(dirPath: string): string[] {
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

export function checkCmmCompanionNode(
  nodes: string[],
  customNodesDir: string
): { installed: boolean; folderName?: string } {
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

/**
 * Resolves the genuine root directory of a ComfyUI installation, handling:
 * - Direct paths: /path/to/ComfyUI (with main.py)
 * - Portable wrappers: /path/to/ComfyUI_windows_portable/ComfyUI
 * - Package wrappers: /path/to/Packages/ComfyUI-Instance/ComfyUI
 * - Accidentally selected subdirectories (custom_nodes/ or models/)
 */
export function findComfyUIRoot(rawPath: string): string {
  if (!rawPath || !rawPath.trim()) return '';
  const sanitized = sanitizePathString(rawPath);
  if (!sanitized) return '';
  const norm = sanitized;
  if (!fs.existsSync(norm)) return norm;

  // 1. Direct ComfyUI root check
  if (
    fs.existsSync(path.join(norm, 'main.py')) ||
    (fs.existsSync(path.join(norm, 'custom_nodes')) && fs.existsSync(path.join(norm, 'models')))
  ) {
    return norm;
  }

  // 2. Standard wrapper checks: e.g. ComfyUI, comfyui inside wrapper directory
  for (const sub of ['ComfyUI', 'comfyui']) {
    const subComfy = path.join(norm, sub);
    if (
      fs.existsSync(subComfy) &&
      (fs.existsSync(path.join(subComfy, 'main.py')) ||
        (fs.existsSync(path.join(subComfy, 'custom_nodes')) && fs.existsSync(path.join(subComfy, 'models'))))
    ) {
      return subComfy;
    }
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

  // 4. One-level deep directory scan for any subdirectory containing main.py & custom_nodes
  try {
    const entries = fs.readdirSync(norm, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const candidate = path.join(norm, entry.name);
        if (
          fs.existsSync(path.join(candidate, 'main.py')) &&
          fs.existsSync(path.join(candidate, 'custom_nodes'))
        ) {
          return candidate;
        }
      }
    }
  } catch {}

  return norm;
}

export function analyzeComfyUIStructure(dirPath: string): ComfyUIStructure {
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
      detectedModelSubdirs: [],
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
      'text_encoders',
      'LLM',
      'gguf',
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

export function inspectComfyUIInstall(installPath?: string, config?: any): ComfyUIInstallInfo {
  const rawPath = (installPath || config?.comfyui_install_dir || '').trim();

  // If no explicit path specified, infer from primary model folder
  if (!rawPath) {
    const primaryModelFolder = config?.comfyui_root || (config?.comfyui_folders && config?.comfyui_folders[0]) || '';
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

export async function autoDetectComfyUIInstall(config?: any): Promise<{
  found: boolean;
  path?: string;
  info?: ComfyUIInstallInfo;
  message?: string;
}> {
  const candidates: string[] = [];

  // 1. From existing config
  if (config?.comfyui_install_dir) {
    candidates.push(config.comfyui_install_dir);
  }

  // 2. From model folders
  const allFolders = [config?.comfyui_root, ...(config?.comfyui_folders || [])].filter(Boolean);
  for (const folder of allFolders) {
    const parent = path.dirname(folder);
    candidates.push(parent);
    const grandparent = path.dirname(parent);
    candidates.push(grandparent);
  }

  // 3. From ComfyUI Desktop installations.json
  const homeDir = os.homedir();
  const desktopConfigDirs = [
    path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), 'Comfy Desktop'),
    path.join(homeDir, 'Library', 'Application Support', 'Comfy Desktop'),
    path.join(homeDir, '.config', 'Comfy Desktop'),
  ];
  for (const dir of desktopConfigDirs) {
    const installJson = path.join(dir, 'installations.json');
    if (fs.existsSync(installJson)) {
      try {
        const raw = fs.readFileSync(installJson, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Prioritize by lastLaunchedAt descending so currently active or most recently used instance is tested first
          const sorted = [...parsed].sort((a, b) => (Number(b.lastLaunchedAt) || 0) - (Number(a.lastLaunchedAt) || 0));
          for (const item of sorted) {
            if (item?.installPath) {
              candidates.push(item.installPath);
              candidates.push(path.join(item.installPath, 'ComfyUI'));
            }
          }
        }
      } catch {}
    }
  }

  // 4. From common drives and folders
  if (process.platform === 'win32') {
    const drives = Array.from({ length: 26 }, (_, i) => `${String.fromCharCode(65 + i)}:\\`).filter((d) => {
      try {
        return fs.existsSync(d);
      } catch {
        return false;
      }
    });

    for (const d of drives) {
      candidates.push(
        path.join(d, 'ComfyUI'),
        path.join(d, 'comfyui'),
        path.join(d, 'ComfyUI_windows_portable'),
        path.join(d, 'ComfyUI_windows_portable', 'ComfyUI'),
        path.join(d, 'Comfy-Desktop'),
        path.join(d, 'Comfy-Desktop', 'ComfyUI'),
        path.join(d, 'AI', 'ComfyUI'),
        path.join(d, 'AI', 'comfyui'),
        path.join(d, 'AI', 'ComfyUI_windows_portable', 'ComfyUI'),
        path.join(d, 'Data', 'Packages'),
        path.join(d, 'stable-diffusion', 'ComfyUI'),
        path.join(d, 'sd', 'ComfyUI')
      );

      // Probe Packages directory if present (e.g. F:\Data\Packages\*)
      const pkgDir = path.join(d, 'Data', 'Packages');
      if (fs.existsSync(pkgDir)) {
        try {
          const pkgs = fs.readdirSync(pkgDir, { withFileTypes: true });
          for (const p of pkgs) {
            if (p.isDirectory() && p.name.toLowerCase().includes('comfy')) {
              candidates.push(path.join(pkgDir, p.name));
              candidates.push(path.join(pkgDir, p.name, 'ComfyUI'));
            }
          }
        } catch {}
      }
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
  let bestMatch: { installPath: string; info: ComfyUIInstallInfo; score: number } | null = null;

  for (const candidate of uniqueCandidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const info = inspectComfyUIInstall(candidate, config);
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
      message: `Found valid ComfyUI installation at ${bestMatch.installPath} (${bestMatch.score}% match)`,
    };
  }

  return {
    found: false,
    message: 'Could not automatically find a valid ComfyUI directory. Please browse or manually type your ComfyUI root directory.',
  };
}

export async function checkComfyUIStatus(targetUrl?: string): Promise<ComfyUIStatusResult> {
  let url = targetUrl && targetUrl.trim() ? targetUrl.trim() : 'http://127.0.0.1:8188';
  url = url.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  try {
    const res = await fetch(`${url}/system_stats`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2000),
    });

    if (res.ok) {
      const data: any = await res.json();
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
  } catch {
    try {
      const fallback = await fetch(`${url}/prompt`, {
        method: 'GET',
        signal: AbortSignal.timeout(1200),
      });
      if (fallback.ok) {
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
