import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { dbManager } from './src/db/db';
import { civitaiClient } from './src/services/civitaiClient';
import { folderRouter } from './src/services/folderRouter';
import { downloadManager } from './src/services/downloadManager';
import { libraryScanner } from './src/services/libraryScanner';
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
        } catch {}
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
          if (req.url === '/api/config' && req.method === 'GET') {
            await loadConfig();
            res.end(JSON.stringify(currentConfig));
          } else if (req.url === '/api/save-config' && req.method === 'POST') {
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
          } else if (req.url === '/api/scan-library' && req.method === 'POST') {
            const body = await getBody();
            const models = await libraryScanner.scanDirectory(body.rootPath);
            res.end(JSON.stringify(models));
          } else if (req.url === '/api/local-models' && req.method === 'GET') {
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
          } else if (req.url === '/api/search-models' && req.method === 'POST') {
            const body = await getBody();
            const result = await civitaiClient.fetchModels(body);
            res.end(JSON.stringify(result));
          } else if (req.url === '/api/enums' && req.method === 'GET') {
            const enums = await civitaiClient.fetchEnums();
            res.end(JSON.stringify(enums));
          } else if (req.url === '/api/add-download' && req.method === 'POST') {
            // Vite dev preview: downloads are owned by Electron main (port 5174).
            // Proxying avoids double-persistence resurrection from two processes sharing the same DB.
            res.statusCode = 503;
            res.end(JSON.stringify({ error: 'Use Electron IPC / http://127.0.0.1:5174 for downloads in dev' }));
          } else if (req.url === '/api/downloads' && req.method === 'GET') {
            // Return empty in Vite dev — real queue lives in Electron main
            res.end(JSON.stringify([]));
          } else if (req.url === '/api/pause-download' && req.method === 'POST') {
            res.end(JSON.stringify({ success: true }));
          } else if (req.url === '/api/resume-download' && req.method === 'POST') {
            res.end(JSON.stringify({ success: true }));
          } else if (req.url === '/api/cancel-download' && req.method === 'POST') {
            res.end(JSON.stringify({ success: true }));
          } else if (req.url === '/api/delete-download' && req.method === 'POST') {
            res.end(JSON.stringify({ success: true }));
          } else if ('/api/clear-finished-downloads' === req.url && req.method === 'POST') {
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
    port: 5173,
  },
  build: {
    emptyOutDir: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-litegraph': ['litegraph.js'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
