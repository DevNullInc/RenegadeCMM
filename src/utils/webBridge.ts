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
import { APP_VERSION, BUILD_CONFIG } from '../version';

// Always target the native HTTP bridge (same process that serves the Electron UI) so the
// browser/headless frontend hits the exact same endpoints and config as the desktop app.
// The relative '/api' path would resolve against the Vite dev-server origin, which does not
// implement the workflow/nodes endpoints (they live on the native bridge).
let customPortOverride: number | null = null;

/**
 * Dynamically resolves the active HTTP Native Bridge port.
 * 1. Checks window.__CMM_API_PORT__ (injected via preload or launcher).
 * 2. Checks URL query parameters (?apiPort=..., ?api_port=..., ?port=...).
 * 3. Checks localStorage ('cmm_api_port') saved from previous custom runs.
 * 4. Falls back to default port 5174.
 */
export function getApiPort(): number {
  if (customPortOverride && customPortOverride > 0 && customPortOverride <= 65535) {
    return customPortOverride;
  }

  if (typeof window !== 'undefined') {
    // 1. Electron bridge or global injection
    if ((window as any).__CMM_API_PORT__) {
      const p = parseInt(String((window as any).__CMM_API_PORT__), 10);
      if (p > 0 && p <= 65535) {
        customPortOverride = p;
        return p;
      }
    }

    // 2. URL Query Params: ?apiPort=8090, ?api_port=8090, ?port=8090
    try {
      const params = new URLSearchParams(window.location.search);
      const qPort = params.get('apiPort') || params.get('api_port') || params.get('bridgePort') || params.get('port');
      if (qPort) {
        const p = parseInt(qPort, 10);
        if (p > 0 && p <= 65535) {
          localStorage.setItem('cmm_api_port', String(p));
          customPortOverride = p;
          return p;
        }
      }
    } catch {}

    // 3. Stored port in localStorage
    try {
      const stored = localStorage.getItem('cmm_api_port');
      if (stored) {
        const p = parseInt(stored, 10);
        if (p > 0 && p <= 65535) {
          customPortOverride = p;
          return p;
        }
      }
    } catch {}
  }

  return 5174;
}

/**
 * Locks the active API bridge to a user-selected or launcher-configured port.
 */
export function setApiPort(port: number): void {
  if (port > 0 && port <= 65535) {
    customPortOverride = port;
    if (typeof window !== 'undefined') {
      (window as any).__CMM_API_PORT__ = port;
      try {
        localStorage.setItem('cmm_api_port', String(port));
      } catch {}
    }
  }
}

/**
 * Returns the dynamically resolved REST API base URL.
 */
export function getApiBase(): string {
  const port = getApiPort();
  return `http://127.0.0.1:${port}/api`;
}

/**
 * Auto-discovers the running CMM backend if the default port fails.
 */
export async function autoDiscoverApiPort(): Promise<number> {
  const current = getApiPort();
  const candidates = [current, 5174, 5175, 5180, 8080, 8081];
  const unique = Array.from(new Set(candidates.filter((p) => p > 0 && p <= 65535)));

  for (const p of unique) {
    try {
      const res = await fetch(`http://127.0.0.1:${p}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(600),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && (data.name === 'RenegadeCMM' || data.status === 'online' || data.status === 'disabled')) {
          setApiPort(p);
          return p;
        }
      }
    } catch {}
  }
  return current;
};

const scanProgressListeners: Array<(progress: any) => void> = [];
const downloadProgressListeners: Array<(tasks: any[]) => void> = [];

// Real-time scan and download status polling in web browser mode
if (typeof window !== 'undefined') {
  setInterval(async () => {
    if (scanProgressListeners.length > 0) {
      try {
        const res = await fetch(`${getApiBase()}/get-scan-status`);
        if (res.ok) {
          const progress = await res.json();
          if (progress) {
            scanProgressListeners.forEach((cb) => cb(progress));
          }
        }
      } catch (e) { }
    }
  }, 400);

  setInterval(async () => {
    if (downloadProgressListeners.length > 0) {
      try {
        const res = await fetch(`${getApiBase()}/downloads`);
        if (res.ok) {
          const tasks = await res.json();
          downloadProgressListeners.forEach((cb) => cb(tasks));
        }
      } catch (e) { }
    }
  }, 750);
}

export function setupWebBridgeIfNeeded() {
  if (typeof window !== 'undefined' && !window.civitaiAPI) {
    console.info(`[RenegadeCMM] Electron IPC not found. Initializing HTTP Native Server Bridge on port ${getApiPort()}.`);
    autoDiscoverApiPort().catch(() => {});

    window.civitaiAPI = {
      getConfig: async () => {
        try {
          const res = await fetch(`${getApiBase()}/config`);
          return await res.json();
        } catch (e) {
          console.warn('HTTP Bridge not connected:', e);
          return null;
        }
      },

      getApiPort: async () => getApiPort(),
      setApiPort: async (port: number) => setApiPort(port),

      saveConfig: async (config: any) => {
        const res = await fetch(`${getApiBase()}/save-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        return await res.json();
      },

      setApiKey: async (key: string) => {
        await fetch(`${getApiBase()}/save-config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ civitai_api_key: key }),
        });
      },

      inspectComfyUIInstall: async (customPath?: string) => {
        try {
          const res = await fetch(`${getApiBase()}/check-comfyui-install`, {
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
          const res = await fetch(`${getApiBase()}/auto-detect-comfyui`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          return await res.json();
        } catch {
          return { found: false, message: 'Could not communicate with local backend bridge.' };
        }
      },

      searchModels: async (params: any) => {
        const res = await fetch(`${getApiBase()}/search-models`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        return await res.json();
      },

      getModel: async (id: number) => {
        const res = await fetch(`${getApiBase()}/model/${id}`);
        return await res.json();
      },

      getModelVersion: async (id: number) => {
        const res = await fetch(`${getApiBase()}/model-version/${id}`);
        return await res.json();
      },

      getEnums: async () => {
        const res = await fetch(`${getApiBase()}/enums`);
        return await res.json();
      },

      scanLibrary: async (rootPath: string | string[]) => {
        try {
          const res = await fetch(`${getApiBase()}/scan-library`, {
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
          const res = await fetch(`${getApiBase()}/cancel-scan`, {
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
          const res = await fetch(`${getApiBase()}/get-scan-status`);
          if (!res.ok) return null;
          return await res.json();
        } catch (e) {
          return null;
        }
      },

      getLocalModels: async () => {
        try {
          const res = await fetch(`${getApiBase()}/local-models`);
          if (!res.ok) return [];
          return await res.json();
        } catch (e) {
          console.error('getLocalModels failed:', e);
          return [];
        }
      },

      matchUnidentifiedModels: async () => {
        try {
          const res = await fetch(`${getApiBase()}/match-unidentified-models`, {
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
          const res = await fetch(`${getApiBase()}/pull-missing-model`, {
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
          const res = await fetch(`${getApiBase()}/scaffold-model-folders`, {
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
          const res = await fetch(`${getApiBase()}/clear-library`, {
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

      saveModelMetadata: async (params: any) => {
        try {
          const res = await fetch(`${getApiBase()}/models/save-metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
          });
          return await res.json();
        } catch (e: any) {
          console.error('saveModelMetadata failed:', e);
          return { success: false, error: e.message || 'Failed to save metadata' };
        }
      },

      fetchModelMetadataByUrl: async (urlOrId: string) => {
        try {
          const res = await fetch(`${getApiBase()}/models/fetch-metadata-by-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlOrId }),
          });
          return await res.json();
        } catch (e: any) {
          console.error('fetchModelMetadataByUrl failed:', e);
          return { success: false, error: e.message || 'Failed to fetch metadata' };
        }
      },

      onScanProgress: (callback: (progress: any) => void) => {
        scanProgressListeners.push(callback);
        return () => {
          const idx = scanProgressListeners.indexOf(callback);
          if (idx !== -1) scanProgressListeners.splice(idx, 1);
        };
      },

      addDownload: async (task: any) => {
        const res = await fetch(`${getApiBase()}/add-download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(task),
        });
        return await res.json();
      },

      pauseDownload: async (id: string) => {
        const res = await fetch(`${getApiBase()}/pause-download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        return await res.json();
      },

      resumeDownload: async (id: string) => {
        const res = await fetch(`${getApiBase()}/resume-download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        return await res.json();
      },

      cancelDownload: async (id: string) => {
        const res = await fetch(`${getApiBase()}/cancel-download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        return await res.json();
      },

      deleteDownload: async (id: string) => {
        try {
          const res = await fetch(`${getApiBase()}/delete-download`, {
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
          const res = await fetch(`${getApiBase()}/clear-finished-downloads`, {
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
          const res = await fetch(`${getApiBase()}/force-complete-download`, {
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
        const res = await fetch(`${getApiBase()}/downloads`);
        return await res.json();
      },

      onDownloadProgress: (callback: (tasks: any[]) => void) => {
        downloadProgressListeners.push(callback);
        return () => {
          const idx = downloadProgressListeners.indexOf(callback);
          if (idx !== -1) downloadProgressListeners.splice(idx, 1);
        };
      },

      checkUpdate: async (localModel: any) => {
        const res = await fetch(`${getApiBase()}/check-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localModel),
        });
        return await res.json();
      },

      checkAllUpdates: async (opts?: { force?: boolean }) => {
        try {
          const res = await fetch(`${getApiBase()}/check-all-updates`, {
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
          const res = await fetch(`${getApiBase()}/ignore-model-update`, {
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
          const res = await fetch(`${getApiBase()}/unignore-model-update`, {
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
          const res = await fetch(`${getApiBase()}/get-ignored-updates`);
          if (!res.ok) return [];
          return await res.json();
        } catch (e) {
          return [];
        }
      },

      ignoreDuplicateSet: async (sha256: string, count: number = 2) => {
        try {
          const res = await fetch(`${getApiBase()}/ignore-duplicate-set`, {
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
          const res = await fetch(`${getApiBase()}/unignore-duplicate-set`, {
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
          const res = await fetch(`${getApiBase()}/get-ignored-duplicates`);
          if (!res.ok) return [];
          return await res.json();
        } catch (e) {
          return [];
        }
      },

      onUpdateCheckProgress: (_callback: (progress: any) => void) => { },

      exportBackup: async (_filePath?: string) => {
        try {
          const res = await fetch(`${getApiBase()}/export-backup-zip`);
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
          const res = await fetch(`${getApiBase()}/import-backup-zip`, {
            method: 'POST',
            body: bodyData,
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      deleteLocalModel: async (id: string, deleteFromDisk = false) => {
        const res = await fetch(`${getApiBase()}/delete-local-model`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, deleteFromDisk }),
        });
        return await res.json();
      },

      setModelNsfw: async (modelId: string, nsfw: boolean) => {
        try {
          const res = await fetch(`${getApiBase()}/set-model-nsfw`, {
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
        const res = await fetch(`${getApiBase()}/open-folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath }),
        });
        return await res.json();
      },

      browseFolder: async (defaultPath?: string) => {
        try {
          const res = await fetch(`${getApiBase()}/browse-folder`, {
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
          const res = await fetch(`${getApiBase()}/list-directory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dirPath }),
          });
          return await res.json();
        } catch (e) {
          return { path: '', parent: '', isRoot: true, roots: [], entries: [] };
        }
      },

      checkFolderAccess: async (folderPath: string) => {
        try {
          const res = await fetch(`${getApiBase()}/check-folder-access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath }),
          });
          return await res.json();
        } catch (e: any) {
          return { exists: false, writable: false, error: e?.message || 'Check failed' };
        }
      },

      scanWorkflows: async (folderPaths?: string | string[]) => {
        try {
          const res = await fetch(`${getApiBase()}/workflows`, {
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
          const res = await fetch(`${getApiBase()}/workflow/parse`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflow: workflowData, name: workflowName }),
          });
          return await res.json();
        } catch (e: any) {
          throw new Error(`Failed to parse workflow: ${e.message}`);
        }
      },

      parseDroppedWorkflowFile: async (filePath: string) => {
        try {
          const res = await fetch(`${getApiBase()}/workflow/parse-file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath }),
          });
          return await res.json();
        } catch (e: any) {
          throw new Error(`Failed to parse dropped workflow file: ${e.message}`);
        }
      },

      archiveWorkflow: async (params: { targetName: string; workflowData: any; overwrite?: boolean }) => {
        try {
          const res = await fetch(`${getApiBase()}/workflow/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message || 'Failed to archive workflow', code: 'CORRUPT_METADATA' };
        }
      },

      checkComfyUIStatus: async (serverUrl?: string) => {
        try {
          const res = await fetch(`${getApiBase()}/comfyui/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverUrl }),
          });
          return await res.json();
        } catch (e: any) {
          return { online: false, serverUrl: serverUrl || 'http://127.0.0.1:8188', error: e.message };
        }
      },

      checkSwarmStatus: async (serverUrl?: string) => {
        try {
          const res = await fetch(`${getApiBase()}/swarm/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverUrl }),
          });
          return await res.json();
        } catch (e: any) {
          // Direct fallback fetch attempt in browser if API bridge fails
          try {
            const fallbackUrl = (serverUrl && serverUrl.trim()) ? serverUrl.trim().replace(/\/+$/, '') : 'http://127.0.0.1:5180';
            const direct = await fetch(`${fallbackUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
            if (direct.ok) {
              const data = await direct.json();
              return {
                online: true,
                serverUrl: fallbackUrl,
                version: data.version || 'Active',
                peers: data.peers ?? data.swarm?.peers ?? 0,
                seeding: data.seeding ?? data.swarm?.seeding ?? 0,
                status: data.status || 'ok',
              };
            }
          } catch { }
          return { online: false, serverUrl: serverUrl || 'http://127.0.0.1:5180', error: e.message };
        }
      },

      focusOrOpenSwarm: async (serverUrl?: string) => {
        const target = serverUrl || 'http://127.0.0.1:5180';
        try {
          const res = await fetch(`${getApiBase()}/swarm/focus`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serverUrl: target }),
          });
          if (res.ok) return await res.json();
        } catch { }
        // In browser web mode, fallback to window.open
        window.open(target, '_blank', 'noopener,noreferrer');
        return { success: true, method: 'browser', url: target };
      },

      getSwarmAuthStatus: async () => {
        try {
          const res = await fetch(`${getApiBase()}/swarm/auth-status`);
          if (res.ok) return await res.json();
        } catch { }
        return { tokenFound: false, primaryExpectedPath: 'Browser Mode (IPC Not Available)' };
      },

      onSwarmSisterWakeup: (_callback: () => void) => () => { },

      saveWorkflowToComfyUI: async (fileName: string, data: any, fileType?: string) => {
        try {
          const res = await fetch(`${getApiBase()}/comfyui/save-workflow`, {
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
          const res = await fetch(`${getApiBase()}/comfyui/prompt`, {
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
          const res = await fetch(`${getApiBase()}/webhooks/test`, {
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
          const res = await fetch(`${getApiBase()}/nodes/resolve`, {
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
          const res = await fetch(`${getApiBase()}/nodes/search-github`, {
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
          const res = await fetch(`${getApiBase()}/nodes/clone`, {
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
          const res = await fetch(`${getApiBase()}/nodes/install-deps`, {
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
          const res = await fetch(`${getApiBase()}/nodes/installed`);
          return await res.json();
        } catch (e) {
          return [];
        }
      },

      markCustomNodeInstalled: async (nodeType: string, folderName: string, customNodesDir?: string) => {
        try {
          const res = await fetch(`${getApiBase()}/nodes/mark-installed`, {
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
          const res = await fetch(`${getApiBase()}/hf/check`, {
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
          const res = await fetch(`${getApiBase()}/hf/validate-token`, {
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
          const res = await fetch(`${getApiBase()}/hf/whoami`);
          return await res.json();
        } catch (e: any) {
          return { available: false, loggedIn: false, output: e.message };
        }
      },

      hfSearchModels: async (query: string, limit?: number) => {
        try {
          const res = await fetch(`${getApiBase()}/hf/search`, {
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
          const res = await fetch(`${getApiBase()}/inspect-gguf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath }),
          });
          return await res.json();
        } catch (e: any) {
          return { valid: false, error: e.message };
        }
      },

      saveModelTriggerWords: async (filePath: string, triggerWords: string[]) => {
        try {
          const res = await fetch(`${getApiBase()}/models/trigger-words`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath, triggerWords }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, filePath, companionInfoPath: '', triggerWords, error: e.message };
        }
      },

      openExternal: async (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
      },

      getConverterEnvironment: async (customPythonPath?: string) => {
        try {
          const queryParams = customPythonPath ? `?pythonPath=${encodeURIComponent(customPythonPath)}` : '';
          const res = await fetch(`${getApiBase()}/converter/python-status${queryParams}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e: any) {
          return {
            available: false,
            source: 'none',
            hasTorch: false,
            hasSafetensors: false,
            readyForConversion: false,
            error: e.message || 'Failed to query Python status',
          };
        }
      },

      convertModelToSafetensors: async (filePath: string, options?: any) => {
        try {
          const res = await fetch(`${getApiBase()}/converter/convert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: filePath, ...options }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, sourcePath: filePath, error: e.message || 'Conversion request failed' };
        }
      },
      scanPickleModel: async (filePath: string) => {
        try {
          const res = await fetch(`${getApiBase()}/converter/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath }),
          });
          return await res.json();
        } catch (e: any) {
          return {
            filePath,
            isSafe: false,
            isYolo: false,
            hasPythonCode: false,
            requiresPythonRuntime: false,
            dangerousGlobals: [],
            safeGlobals: [],
            yoloLayers: [],
            totalOpcodes: 0,
            recommendation: 'not_pickle',
            details: e.message || 'Scan request failed',
          };
        }
      },

      getHardwareProfile: async (forceRefresh?: boolean) => {
        try {
          const res = await fetch(`${getApiBase()}/system/hardware${forceRefresh ? '?refresh=true' : ''}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          return json.data || json;
        } catch (e: any) {
          return {
            cpu: { model: 'Unknown CPU', cores: 1, speedMhz: 0, arch: 'unknown' },
            memory: { totalBytes: 0, freeBytes: 0, usedBytes: 0, totalFormatted: '0 B', freeFormatted: '0 B', usedPercent: 0 },
            gpus: [],
            platform: 'web',
            timestamp: Date.now(),
            error: e.message || 'Failed to query hardware telemetry',
          };
        }
      },

      assessConversionSafety: async (modelSizeBytes: number) => {
        try {
          const res = await fetch(`${getApiBase()}/converter/assess-safety`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelSizeBytes }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          return json.data || json;
        } catch (e: any) {
          return {
            isSafe: true,
            riskLevel: 'warning',
            modelSizeBytes,
            modelSizeFormatted: 'Unknown',
            estimatedRamRequiredBytes: Math.round(modelSizeBytes * 1.5),
            estimatedRamRequiredFormatted: 'Unknown',
            freeRamBytes: 0,
            freeRamFormatted: 'Unknown',
            totalRamBytes: 0,
            message: 'Could not fetch live telemetry; conversion will proceed.',
          };
        }
      },

      scanStorageOptimizer: async () => {
        try {
          const res = await fetch(`${getApiBase()}/optimizer/scan`);
          const json = await res.json();
          return json.data || json;
        } catch (e: any) {
          return { clusters: [], summary: { totalDuplicates: 0, potentialSavingsBytes: 0, alreadySavedBytes: 0 } };
        }
      },

      executeHardlinkOptimizer: async (masterPath: string, duplicatePath: string) => {
        try {
          const res = await fetch(`${getApiBase()}/optimizer/hardlink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterPath, duplicatePath }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      packageCompanionFiles: async (filePath: string) => {
        try {
          const res = await fetch(`${getApiBase()}/optimizer/package-model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      packageAllCompanionFiles: async () => {
        try {
          const res = await fetch(`${getApiBase()}/optimizer/package-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      inspectModelPrecision: async (filePath: string) => {
        try {
          const res = await fetch(`${getApiBase()}/optimizer/precision-inspect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath }),
          });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      scanOrphanModels: async (workflowDirs?: string | string[]) => {
        try {
          const res = await fetch(`${getApiBase()}/optimizer/orphan-scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowDirectories: workflowDirs }),
          });
          const json = await res.json();
          return json.data || json;
        } catch (e: any) {
          return { orphanCount: 0, totalWorkflowsScanned: 0, orphanModels: [] };
        }
      },

      checkAppUpdate: async () => {
        try {
          const res = await fetch(`${getApiBase()}/app-update`);
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

      onAppLog: (_callback: (log: { level: string; message: string }) => void) => () => { },


      // License Management & Cryptographic Verification
      getLicenseStatus: async () => {
        try {
          const res = await fetch(`${getApiBase()}/license/status`);
          return await res.json();
        } catch (e: any) {
          return { isValid: false, status: 'unregistered', error: e.message };
        }
      },

      getUserPublicKey: async () => {
        try {
          const res = await fetch(`${getApiBase()}/license/user-key`);
          const json = await res.json();
          return json.publicKey || '';
        } catch (e: any) {
          return '';
        }
      },

      activateLicense: async (licenseKey: string) => {
        try {
          const res = await fetch(`${getApiBase()}/license/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseKey }),
          });
          return await res.json();
        } catch (e: any) {
          return { isValid: false, status: 'malformed', error: e.message };
        }
      },

      deactivateLicense: async () => {
        try {
          const res = await fetch(`${getApiBase()}/license/deactivate`, { method: 'POST' });
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      verifyLicense: async (licenseKey: string) => {
        try {
          const res = await fetch(`${getApiBase()}/license/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseKey }),
          });
          return await res.json();
        } catch (e: any) {
          return { isValid: false, status: 'malformed', error: e.message };
        }
      },

      signLicenseChallenge: async (challenge: string) => {
        try {
          const res = await fetch(`${getApiBase()}/license/sign-challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challenge }),
          });
          const json = await res.json();
          return json.signature || '';
        } catch (e: any) {
          return '';
        }
      },

      restartApp: async () => {
        try {
          await fetch(`${getApiBase()}/restart-app`, { method: 'POST' });
        } catch (e) {
          // Connection will drop on restart — expected
        }
        return true;
      },

      shutdownApp: async () => {
        try {
          await fetch(`${getApiBase()}/shutdown-app`, { method: 'POST' });
        } catch (e) {
          // Connection will drop on shutdown — expected
        }
        return true;
      },

      analyzeLibrarySorting: async (options?: { models?: any[]; modelIds?: string[] }) => {
        try {
          const res = await fetch(`${getApiBase()}/library/analyze-sorting`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options || {}),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e: any) {
          return { totalModels: 0, misplacedCount: 0, correctCount: 0, items: [] };
        }
      },

      executeLibrarySorting: async (planItems: Array<{ modelId: string; sourcePath: string; targetPath: string }>) => {
        try {
          const res = await fetch(`${getApiBase()}/library/execute-sorting`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: planItems }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e: any) {
          return { success: false, movedCount: 0, failedCount: planItems.length, errors: [{ error: e.message }] };
        }
      },

      onLibrarySortProgress: (_callback: (progress: { current: number; total: number; file: string }) => void) => {
        return () => {};
      },

      ignoreSortModel: async (modelId: string, filePath?: string, fileName?: string) => {
        try {
          const res = await fetch(`${getApiBase()}/library/ignore-sort-model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId, filePath, fileName }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      unignoreSortModel: async (modelId: string) => {
        try {
          const res = await fetch(`${getApiBase()}/library/unignore-sort-model`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      getIgnoredSortModels: async () => {
        try {
          const res = await fetch(`${getApiBase()}/library/ignored-sort-models`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e: any) {
          return [];
        }
      },

      clearIgnoredSortModels: async () => {
        try {
          const res = await fetch(`${getApiBase()}/library/clear-ignored-sort-models`, { method: 'POST' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.json();
        } catch (e: any) {
          return { success: false, error: e.message };
        }
      },

      onProtocolAction: (_callback: (actionPayload: any) => void) => { },
    };
  }
}
