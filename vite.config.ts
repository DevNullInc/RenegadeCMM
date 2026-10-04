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
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import { dbManager } from './src/db/db';
import { civitaiClient } from './src/services/civitaiClient';
import { folderRouter } from './src/services/folderRouter';
import { downloadManager } from './src/services/downloadManager';
import { libraryScanner } from './src/services/libraryScanner';
import { storageOptimizer } from './src/services/storageOptimizer';
import { precisionInspector } from './src/services/precisionInspector';
import { orphanFinder } from './src/services/orphanFinder';
import { modelConverter } from './src/services/modelConverter';
import { hardwareScanner } from './src/services/hardwareScanner';
import { swarmBridge } from './src/services/swarmBridge';
import { licenseService } from './src/services/licenseService';
import { encryptKey, decryptKey } from './src/utils/secureStorage';

let currentConfig: any = {
  comfyui_root: '',
  comfyui_folders: [],
  comfyui_install_dir: '',
  civitai_api_key: '',
  folder_mappings: {},
  advanced_mappings: { filename_patterns: [] },
  organize_by: { base_model: false, creator: false },
  conflict_strategy: 'rename',
  nsfw_max_visible_level: 5,
  nsfw_blur_enabled: true,
  swarm_server_url: 'http://127.0.0.1:5180',
};

async function loadConfig() {
  try {
    await dbManager.init();
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
        } catch { }
      }
      currentConfig.comfyui_folders = Array.isArray(f) ? f : [];
    }
    if (cfgObj.comfyui_install_dir) currentConfig.comfyui_install_dir = cfgObj.comfyui_install_dir;
    if ((!currentConfig.comfyui_folders || currentConfig.comfyui_folders.length === 0) && currentConfig.comfyui_root) {
      currentConfig.comfyui_folders = [currentConfig.comfyui_root];
    }
    if (currentConfig.comfyui_folders && currentConfig.comfyui_folders.length > 0 && !currentConfig.comfyui_root) {
      currentConfig.comfyui_root = currentConfig.comfyui_folders[0];
    }
  } catch (err) {
    console.error('Error loading config in Vite plugin:', err);
  }
}

function apiServerPlugin(): Plugin {
  return {
    name: 'api-server-plugin',
    async configureServer(server) {
      await loadConfig();
      // Do NOT init downloadManager persistence in Vite dev server — Electron main
      // owns the downloads SQLite table. Double-persistence from two processes
      // sharing the same DB file causes deletes in one process to be re-inserted
      // by the other's periodic persistAll, which resurrects rows after Delete/Cancel.

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api')) {
          return next();
        }

        res.setHeader('Content-Type', 'application/json');

        const port = server.config.server.port || parseInt(process.env.VITE_PORT || process.env.PORT || '5173', 10);
        const parsedUrl = new URL(req.url, `http://localhost:${port}`);
        const pathname = parsedUrl.pathname;

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
          if ((pathname === '/api/health' || pathname === '/api/status') && req.method === 'GET') {
            res.end(JSON.stringify({
              status: 'online',
              uptime: process.uptime(),
              pid: process.pid,
              name: 'RenegadeCMM',
              host: '127.0.0.1',
            }));
          } else if (pathname === '/api/config' && req.method === 'GET') {
            await loadConfig();
            res.end(JSON.stringify(currentConfig));
          } else if (pathname === '/api/save-config' && req.method === 'POST') {
            const body = await getBody();
            currentConfig = { ...currentConfig, ...body };

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
            if (body.civitai_api_key !== undefined) {
              const encrypted = encryptKey(body.civitai_api_key);
              await dbManager.run(
                'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
                ['civitai_api_key', JSON.stringify(encrypted)]
              );
              civitaiClient.setApiKey(body.civitai_api_key);
            }

            res.end(JSON.stringify(currentConfig));
          } else if (pathname === '/api/scan-library' && req.method === 'POST') {
            const body = await getBody();
            const models = await libraryScanner.scanDirectory(body.rootPath);
            res.end(JSON.stringify(models));
          } else if (pathname === '/api/local-models' && req.method === 'GET') {
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
              isMatched: !!r.civitai_version_id,
              isDuplicate: !!r.is_duplicate,
            }));
            res.end(JSON.stringify(models));
          } else if (pathname === '/api/search-models' && req.method === 'POST') {
            const body = await getBody();
            const result = await civitaiClient.fetchModels(body);
            res.end(JSON.stringify(result));
          } else if (pathname === '/api/enums' && req.method === 'GET') {
            const enums = await civitaiClient.fetchEnums();
            res.end(JSON.stringify(enums));
          } else if (pathname === '/api/add-download' && req.method === 'POST') {
            // Vite dev preview: downloads are owned by Electron main (port 5174).
            // Proxying avoids double-persistence resurrection from two processes sharing the same DB.
            res.statusCode = 503;
            const apiPort = parseInt(process.env.API_PORT || process.env.BRIDGE_PORT || process.env.CMM_PORT || '5174', 10);
            res.end(JSON.stringify({ error: `Use Electron IPC / http://127.0.0.1:${apiPort} for downloads in dev` }));
          } else if (pathname === '/api/downloads' && req.method === 'GET') {
            // Return empty in Vite dev — real queue lives in Electron main
            res.end(JSON.stringify([]));
          } else if (pathname === '/api/pause-download' && req.method === 'POST') {
            res.end(JSON.stringify({ success: true }));
          } else if (pathname === '/api/resume-download' && req.method === 'POST') {
            res.end(JSON.stringify({ success: true }));
          } else if (pathname === '/api/cancel-download' && req.method === 'POST') {
            res.end(JSON.stringify({ success: true }));
          } else if (pathname === '/api/delete-download' && req.method === 'POST') {
            res.end(JSON.stringify({ success: true }));
          } else if (pathname === '/api/local-image' && req.method === 'GET') {
            const rawPath = parsedUrl.searchParams.get('path');
            if (!rawPath) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing path parameter' }));
              return;
            }
            try {
              const resolved = path.resolve(rawPath);
              const ext = path.extname(resolved).toLowerCase();
              const allowedExts: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
                '.avif': 'image/avif',
                '.gif': 'image/gif',
              };
              if (!allowedExts[ext] || !fs.existsSync(resolved)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Image not found or unsupported format' }));
                return;
              }
              res.setHeader('Content-Type', allowedExts[ext]);
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.end(fs.readFileSync(resolved));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e?.message || 'Failed to read local image' }));
            }
          } else if (pathname === '/api/optimizer/scan' && (req.method === 'GET' || req.method === 'POST')) {
            try {
              const result = await storageOptimizer.scanDuplicates();
              res.end(JSON.stringify({ success: true, data: result }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Optimizer scan failed' }));
            }
          } else if (pathname === '/api/optimizer/hardlink' && req.method === 'POST') {
            try {
              const body = await getBody();
              const { masterPath, duplicatePath } = body || {};
              if (!masterPath || !duplicatePath) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: 'masterPath and duplicatePath are required' }));
                return;
              }
              await storageOptimizer.executeHardlink(masterPath, duplicatePath);
              res.end(JSON.stringify({ success: true }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Hardlink execution failed' }));
            }
          } else if (pathname === '/api/optimizer/package-model' && req.method === 'POST') {
            try {
              const body = await getBody();
              const { filePath } = body || {};
              if (!filePath) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: 'filePath is required' }));
                return;
              }
              const result = await storageOptimizer.packageCompanionFilesForModel(filePath);
              res.end(JSON.stringify({ success: true, data: result }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Companion packaging failed' }));
            }
          } else if (pathname === '/api/optimizer/package-all' && req.method === 'POST') {
            try {
              const result = await storageOptimizer.packageAllMissingCompanions();
              res.end(JSON.stringify({ success: true, data: result }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Bulk companion packaging failed' }));
            }
          } else if (pathname === '/api/optimizer/precision-inspect' && req.method === 'POST') {
            try {
              const body = await getBody();
              const { filePath } = body || {};
              if (!filePath) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: 'filePath is required' }));
                return;
              }
              const result = await precisionInspector.inspectModel(filePath);
              res.end(JSON.stringify({ success: true, data: result }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Precision inspection failed' }));
            }
          } else if (pathname === '/api/optimizer/orphan-scan' && (req.method === 'GET' || req.method === 'POST')) {
            try {
              const body = req.method === 'POST' ? await getBody() : {};
              const customPaths = body?.workflowDirectories || body?.folderPaths || body?.path || currentConfig.comfyui_folders;
              const result = await orphanFinder.findOrphanModels(customPaths);
              res.end(JSON.stringify({ success: true, data: result }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Orphan model scan failed' }));
            }
          } else if ((pathname === '/api/converter/python-status' || pathname === '/api/converter/status') && req.method === 'GET') {
            try {
              const customPython = parsedUrl.searchParams.get('pythonPath') || currentConfig.custom_python_path;
              const installDir = parsedUrl.searchParams.get('comfyuiInstallDir') || currentConfig.comfyui_install_dir;
              const result = await modelConverter.getPythonEnvironment(customPython, installDir);
              res.end(JSON.stringify({ success: true, data: result }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Failed to check python environment' }));
            }
          } else if (pathname === '/api/converter/convert' && req.method === 'POST') {
            try {
              const body = await getBody();
              const { sourcePath, deleteOriginal, targetPath } = body || {};
              if (!sourcePath) {
                res.statusCode = 400;
                res.end(JSON.stringify({ success: false, error: 'sourcePath is required' }));
                return;
              }
              const result = await modelConverter.convertPickleToSafetensors(sourcePath, {
                deleteOriginal: deleteOriginal !== undefined ? deleteOriginal : currentConfig.delete_original_after_conversion,
                targetPath,
                customPythonPath: currentConfig.custom_python_path,
                comfyuiInstallDir: currentConfig.comfyui_install_dir,
              });
              if (!result.success) res.statusCode = 400;
              res.end(JSON.stringify(result));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Conversion execution failed' }));
            }
          } else if ((pathname === '/api/system/hardware' || pathname === '/api/hardware/profile') && req.method === 'GET') {
            try {
              const profile = await hardwareScanner.getHardwareProfile();
              res.end(JSON.stringify({ success: true, data: profile }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Failed to scan system hardware' }));
            }
          } else if ((pathname === '/api/converter/assess-safety' || pathname === '/api/hardware/assess-safety') && req.method === 'POST') {
            try {
              const body = await getBody();
              const modelSizeBytes = typeof body?.modelSizeBytes === 'number' ? body.modelSizeBytes : 0;
              const assessment = await hardwareScanner.assessConversionSafety(modelSizeBytes);
              res.end(JSON.stringify({ success: true, data: assessment }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message || 'Failed to assess conversion memory safety' }));
            }
          } else if ((pathname === '/api/swarm/status' || pathname === '/api/swarm-status') && (req.method === 'GET' || req.method === 'POST')) {
            try {
              const body = req.method === 'POST' ? await getBody() : {};
              const target = body?.serverUrl || body?.url || currentConfig.swarm_server_url;
              const status = await swarmBridge.checkSwarmStatus(target);
              res.end(JSON.stringify(status));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ online: false, error: e?.message || 'Swarm check failed' }));
            }
          } else if (pathname === '/api/license/status' && req.method === 'GET') {
            try {
              const status = await licenseService.validateLicense();
              res.end(JSON.stringify(status));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ isValid: false, status: 'unregistered', error: e?.message }));
            }
          } else if (pathname === '/api/license/user-key' && req.method === 'GET') {
            try {
              const pubKey = await licenseService.getUserPublicKey();
              res.end(JSON.stringify({ userPublicKey: pubKey }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e?.message }));
            }
          } else if (pathname === '/api/license/activate' && req.method === 'POST') {
            try {
              const body = await getBody();
              const token = body?.licenseToken || body?.token || '';
              const result = await licenseService.activateLicense(token);
              res.end(JSON.stringify(result));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ isValid: false, status: 'malformed', error: e?.message }));
            }
          } else if (pathname === '/api/license/deactivate' && req.method === 'POST') {
            try {
              const result = await licenseService.deactivateLicense();
              res.end(JSON.stringify(result));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: e?.message }));
            }
          } else if (pathname === '/api/license/verify' && req.method === 'POST') {
            try {
              const body = await getBody();
              const token = body?.licenseToken || body?.token || '';
              const result = await licenseService.verifyLicense(token);
              res.end(JSON.stringify(result));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ isValid: false, status: 'malformed', error: e?.message }));
            }
          } else if (pathname === '/api/license/sign-challenge' && req.method === 'POST') {
            try {
              const body = await getBody();
              const challenge = body?.challenge || '';
              const signature = await licenseService.signChallenge(challenge);
              res.end(JSON.stringify({ signature }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e?.message }));
            }
          } else if (pathname === '/api/clear-finished-downloads' && req.method === 'POST') {
            res.end(JSON.stringify({ success: true, cleared: 0 }));
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Endpoint not found' }));
          }
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), apiServerPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: parseInt(process.env.VITE_PORT || process.env.PORT || '5173', 10),
  },
  build: {
    emptyOutDir: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('@xyflow')) {
              return 'vendor-xyflow';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
          }
        },
      },
    },
  },
});
