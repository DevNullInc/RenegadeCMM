/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { APP_VERSION, BUILD_CONFIG } from '../version';

// Always target the native HTTP bridge (same process that serves the Electron UI) so the
// browser/headless frontend hits the exact same endpoints and config as the desktop app.
// The relative '/api' path would resolve against the Vite dev-server origin, which does not
// implement the workflow/nodes endpoints (they live on the native bridge).
const API_BASE = 'http://127.0.0.1:5174/api';

const scanProgressListeners: Array<(progress: any) => void> = [];
const downloadProgressListeners: Array<(tasks: any[]) => void> = [];

// Real-time scan and download status polling in web browser mode
if (typeof window !== 'undefined') {
  setInterval(async () => {
    if (scanProgressListeners.length > 0) {
      try {
        const res = await fetch(`${API_BASE}/get-scan-status`);
        if (res.ok) {
          const progress = await res.json();
          if (progress) {
            scanProgressListeners.forEach((cb) => cb(progress));
          }
        }
      } catch (e) {}
    }
  }, 400);

  setInterval(async () => {
    if (downloadProgressListeners.length > 0) {
      try {
        const res = await fetch(`${API_BASE}/downloads`);
        if (res.ok) {
          const tasks = await res.json();
          downloadProgressListeners.forEach((cb) => cb(tasks));
        }
      } catch (e) {}
    }
  }, 750);
}

export function setupWebBridgeIfNeeded() {
  if (typeof window !== 'undefined' && !window.civitaiAPI) {
    console.info('[RenegadeCMM] Electron IPC not found. Initializing HTTP Native Server Bridge on port 5174.');

    window.civitaiAPI = {
      getConfig: async () => {
        try {
          const res = await fetch(`${API_BASE}/config`);
          return await res.json();
        } catch (e) {
          console.warn('HTTP Bridge not connected:', e);
          return null;
        }
      },

      saveConfig: async (config: any) => {
        const res = await fetch(`${API_BASE}/save-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        return await res.json();
      },

      setApiKey: async (key: string) => {
        await fetch(`${API_BASE}/save-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ civitai_api_key: key }),
        });
      },

      inspectComfyUIInstall: async (customPath?: string) => {
        try {
          const res = await fetch(`${API_BASE}/check-comfyui-install`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ installPath: customPath }),
          });
          return await res.json();
        } catch {
          return { valid: false, customNodesExist: false, installedNodes: [], nodeCount: 0, cmmNodeInstalled: false };
        }
      },

      autoDetectComfyUI: async () => {
        try {
          const res = await fetch(`${API_BASE}/auto-detect-comfyui`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          return await res.json();
        } catch {
          return { found: false, message: 'Could not communicate with local backend bridge.' };
        }
      },

      searchModels: async (params: any) => {
        const res = await fetch(`${API_BASE}/search-models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        return await res.json();
      },

      getModel: async (id: number) => {
        const res = await fetch(`${API_BASE}/model/${id}`);
        return await res.json();
      },

      getModelVersion: async (id: number) => {
        const res = await fetch(`${API_BASE}/model-version/${id}`);
        return await res.json();
      },

      getEnums: async () => {
        const res = await fetch(`${API_BASE}/enums`);
        return await res.json();
      },

      scanLibrary: async (rootPath: string | string[]) => {
        try {
          const res = await fetch(`${API_BASE}/scan-library`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rootPath }),
          });
          if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(errTxt || `Server error: ${res.status}`);
          }
          return await res.json();
        } catch (e: any) {
          console.error('scanLibrary failed:', e);
          throw e;
        }
      },

      cancelScan: async () => {
        try {
          const res = await fetch(`${API_BASE}/cancel-scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          return await res.json();
        } catch (e) {
          return { success: false };
        }
      },

      getScanStatus: async () => {
        try {
          const res = await fetch(`${API_BASE}/get-scan-status`);
          if (!res.ok) return null;
          return await res.json();
        } catch (e) {
          return null;
        }
      },

      getLocalModels: async () => {
        try {
          const res = await fetch(`${API_BASE}/local-models`);
          if (!res.ok) return [];
          return await res.json();
        } catch (e) {
          console.error('getLocalModels failed:', e);
          return [];
        }
      },

      matchUnidentifiedModels: async () => {
        try {
          const res = await fetch(`${API_BASE}/match-unidentified-models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) return { totalChecked: 0, newlyMatched: 0 };
          return await res.json();
        } catch (e) {
          console.error('matchUnidentifiedModels failed:', e);
          return { totalChecked: 0, newlyMatched: 0 };
        }
      },

      pullMissingModel: async (modelData: any, targetRoot?: string) => {
        try {
          const res = await fetch(`${API_BASE}/pull-missing-model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelData, targetRoot }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message || 'Failed to pull missing model' };
        }
      },

      scaffoldModelFolders: async (targetDir?: string) => {
        try {
          const res = await fetch(`${API_BASE}/scaffold-model-folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetDir }),
          });
          if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(errTxt || `Server error: ${res.status}`);
          }
          const data = await res.json();
          return data.results || [];
        } catch (e: any) {
          console.error('scaffoldModelFolders failed:', e);
          return [];
        }
      },

      clearLibrary: async () => {
        try {
          const res = await fetch(`${API_BASE}/clear-library`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(errTxt || `Server error: ${res.status}`);
          }
          return await res.json();
        } catch (e: any) {
          console.error('clearLibrary failed:', e);
          throw e;
        }
      },

      onScanProgress: (callback: (progress: any) => void) => {
        scanProgressListeners.push(callback);
      },

      addDownload: async (task: any) => {
        const res = await fetch(`${API_BASE}/add-download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task),
        });
        return await res.json();
      },

      pauseDownload: async (id: string) => {
        const res = await fetch(`${API_BASE}/pause-download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        return await res.json();
      },

      resumeDownload: async (id: string) => {
        const res = await fetch(`${API_BASE}/resume-download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        return await res.json();
      },

      cancelDownload: async (id: string) => {
        const res = await fetch(`${API_BASE}/cancel-download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        return await res.json();
      },

      deleteDownload: async (id: string) => {
        try {
          const res = await fetch(`${API_BASE}/delete-download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          return await res.json();
        } catch (e) {
          return { success: false };
        }
      },

      clearFinishedDownloads: async () => {
        try {
          const res = await fetch(`${API_BASE}/clear-finished-downloads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          return await res.json();
        } catch (e) {
          return { success: false, cleared: 0 };
        }
      },

      forceCompleteDownload: async (id: string) => {
        try {
          const res = await fetch(`${API_BASE}/force-complete-download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          const data = await res.json();
          return data.success;
        } catch (e) {
          console.error('forceCompleteDownload failed:', e);
          return false;
        }
      },

      getDownloads: async () => {
        const res = await fetch(`${API_BASE}/downloads`);
        return await res.json();
      },

      onDownloadProgress: (callback: (tasks: any[]) => void) => {
        downloadProgressListeners.push(callback);
      },

      checkUpdate: async (localModel: any) => {
        const res = await fetch(`${API_BASE}/check-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localModel),
        });
        return await res.json();
      },

      checkAllUpdates: async (opts?: { force?: boolean }) => {
        try {
          const res = await fetch(`${API_BASE}/check-all-updates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force: opts?.force === true }),
          });
          return await res.json();
        } catch (e) {
          console.error('checkAllUpdates failed:', e);
          return { totalChecked: 0, updatesFound: 0, modelsWithUpdates: [] };
        }
      },

      ignoreModelUpdate: async (modelId: number, versionId: number) => {
        try {
          const res = await fetch(`${API_BASE}/ignore-model-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId, versionId }),
          });
          return await res.json();
        } catch (e) {
          return false;
        }
      },

      unignoreModelUpdate: async (modelId: number, versionId: number) => {
        try {
          const res = await fetch(`${API_BASE}/unignore-model-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId, versionId }),
          });
          return await res.json();
        } catch (e) {
          return false;
        }
      },

      getIgnoredUpdates: async () => {
        try {
          const res = await fetch(`${API_BASE}/get-ignored-updates`);
          if (!res.ok) return [];
          return await res.json();
        } catch (e) {
          return [];
        }
      },

      ignoreDuplicateSet: async (sha256: string, count: number = 2) => {
        try {
          const res = await fetch(`${API_BASE}/ignore-duplicate-set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sha256, count }),
          });
          return await res.json();
        } catch (e) {
          return false;
        }
      },

      unignoreDuplicateSet: async (sha256: string) => {
        try {
          const res = await fetch(`${API_BASE}/unignore-duplicate-set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sha256 }),
          });
          return await res.json();
        } catch (e) {
          return false;
        }
      },

      getIgnoredDuplicates: async () => {
        try {
          const res = await fetch(`${API_BASE}/get-ignored-duplicates`);
          if (!res.ok) return [];
          return await res.json();
        } catch (e) {
          return [];
        }
      },

      onUpdateCheckProgress: (_callback: (progress: any) => void) => {},

      exportBackup: async (_filePath?: string) => {
        try {
          const res = await fetch(`${API_BASE}/export-backup-zip`);
          if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
          const blob = await res.blob();
          const filename = `cmm-backup-${new Date().toISOString().slice(0, 10)}.zip`;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          return { success: true, filename };
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      importBackup: async (fileOrBuffer?: any) => {
        try {
          let bodyData: any = fileOrBuffer;
          if (!bodyData) {
            return { success: false, error: 'No backup data provided' };
          }
          const res = await fetch(`${API_BASE}/import-backup-zip`, {
            method: 'POST',
            body: bodyData,
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      deleteLocalModel: async (id: string, deleteFromDisk = false) => {
        const res = await fetch(`${API_BASE}/delete-local-model`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, deleteFromDisk }),
        });
        return await res.json();
      },

      setModelNsfw: async (modelId: string, nsfw: boolean) => {
        try {
          const res = await fetch(`${API_BASE}/set-model-nsfw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId, nsfw }),
          });
          return await res.json();
        } catch (e) {
          return { success: false };
        }
      },

      openFolder: async (filePath: string) => {
        const res = await fetch(`${API_BASE}/open-folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        });
        return await res.json();
      },

      browseFolder: async (defaultPath?: string) => {
        try {
          const res = await fetch(`${API_BASE}/browse-folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ defaultPath }),
          });
          return await res.json();
        } catch (e) {
          return { canceled: true };
        }
      },

      listDirectory: async (dirPath?: string) => {
        try {
          const res = await fetch(`${API_BASE}/list-directory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dirPath }),
          });
          return await res.json();
        } catch (e) {
          return { path: '', parent: '', isRoot: true, roots: [], entries: [] };
        }
      },

      scanWorkflows: async (folderPaths?: string | string[]) => {
        try {
          const res = await fetch(`${API_BASE}/workflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPaths }),
          });
          return await res.json();
        } catch (e) {
          console.error('scanWorkflows failed:', e);
          return [];
        }
      },

      parseWorkflow: async (workflowData: any, workflowName = 'direct_workflow.json') => {
        try {
          const res = await fetch(`${API_BASE}/workflow/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflow: workflowData, name: workflowName }),
          });
          return await res.json();
        } catch (e: any) {
          throw new Error(`Failed to parse workflow: ${e.message}`);
        }
      },

      checkComfyUIStatus: async (serverUrl?: string) => {
        try {
          const res = await fetch(`${API_BASE}/comfyui/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverUrl }),
          });
          return await res.json();
        } catch (e: any) {
          return { online: false, serverUrl: serverUrl || 'http://127.0.0.1:8188', error: e.message };
        }
      },

      saveWorkflowToComfyUI: async (fileName: string, data: any, fileType?: string) => {
        try {
          const res = await fetch(`${API_BASE}/comfyui/save-workflow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName, data, fileType }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      executeComfyUIPrompt: async (promptData: any, serverUrl?: string) => {
        try {
          const res = await fetch(`${API_BASE}/comfyui/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: promptData, serverUrl }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      testWebhook: async (url: string, event: string) => {
        try {
          const res = await fetch(`${API_BASE}/webhooks/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, event }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      resolveMissingNode: async (nodeType: string, customNodesDir?: string, searchGitHub?: boolean, forceRefresh?: boolean) => {
        try {
          const res = await fetch(`${API_BASE}/nodes/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeType, customNodesDir, searchGitHub, forceRefresh }),
          });
          return await res.json();
        } catch (e) {
          return { nodeType, isInstalled: false, githubCandidates: [] };
        }
      },

      searchGitHubNodes: async (query: string, limit = 3) => {
        try {
          const res = await fetch(`${API_BASE}/nodes/search-github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit }),
          });
          const data = await res.json();
          return data.candidates || [];
        } catch (e) {
          return [];
        }
      },

      cloneCustomNode: async (gitUrl: string, customFolderName?: string, customNodesDir?: string) => {
        try {
          const res = await fetch(`${API_BASE}/nodes/clone`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gitUrl, folderName: customFolderName, customNodesDir }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      installNodeDependencies: async (nodeFolderPath: string) => {
        try {
          const res = await fetch(`${API_BASE}/nodes/install-deps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: nodeFolderPath }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, output: '', error: e.message };
        }
      },

      getInstalledCustomNodes: async () => {
        try {
          const res = await fetch(`${API_BASE}/nodes/installed`);
          return await res.json();
        } catch (e) {
          return [];
        }
      },

      markCustomNodeInstalled: async (nodeType: string, folderName: string, customNodesDir?: string) => {
        try {
          const res = await fetch(`${API_BASE}/nodes/mark-installed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeType, folderName, customNodesDir }),
          });
          return await res.json();
        } catch (e) {
          return { nodeType, isInstalled: false, githubCandidates: [] };
        }
      },

      hfCheckModel: async (repoId: string) => {
        try {
          const res = await fetch(`${API_BASE}/hf/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoId }),
          });
          return await res.json();
        } catch (e: any) {
          return { exists: false, error: e.message };
        }
      },

      hfValidateToken: async (token?: string) => {
        try {
          const res = await fetch(`${API_BASE}/hf/validate-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          return await res.json();
        } catch (e: any) {
          return { valid: false, error: e.message };
        }
      },

      hfWhoami: async () => {
        try {
          const res = await fetch(`${API_BASE}/hf/whoami`);
          return await res.json();
        } catch (e: any) {
          return { available: false, loggedIn: false, output: e.message };
        }
      },

      hfSearchModels: async (query: string, limit?: number) => {
        try {
          const res = await fetch(`${API_BASE}/hf/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, limit }),
          });
          return await res.json();
        } catch (e: any) {
          return [];
        }
      },

      inspectGGUF: async (filePath: string) => {
        try {
          const res = await fetch(`${API_BASE}/inspect-gguf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath }),
          });
          return await res.json();
        } catch (e: any) {
          return { valid: false, error: e.message };
        }
      },

      openExternal: async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
      },

      checkAppUpdate: async () => {
        try {
          const res = await fetch(`${API_BASE}/app-update`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e: any) {
          return {
            isUpdateAvailable: false,
            isDevelopmentVersion: true,
            githubUrl: 'https://github.com/DevNullInc/RenegadeCMM',
            isPackaged: false,
            error: e.message,
          };
        }
      },

      getSystemInfo: async () => {
        return {
          version: APP_VERSION,
          platform: navigator.platform || 'web',
          userAgent: navigator.userAgent,
          isDevBuild: BUILD_CONFIG.IS_DEV_BUILD,
          releaseChannel: BUILD_CONFIG.RELEASE_CHANNEL,
        };
      },

      onAppLog: (_callback: (log: { level: string; message: string }) => void) => () => {},

      restartApp: async () => {
        try {
          await fetch(`${API_BASE}/restart-app`, { method: 'POST' });
        } catch (e) {
          // Connection will drop on restart — expected
        }
        return true;
      },

      shutdownApp: async () => {
        try {
          await fetch(`${API_BASE}/shutdown-app`, { method: 'POST' });
        } catch (e) {
          // Connection will drop on shutdown — expected
        }
        return true;
      },
    };
  }
}
