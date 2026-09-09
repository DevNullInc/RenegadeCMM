/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Settings & Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  setApiKey: (key: string) => ipcRenderer.invoke('set-api-key', key),
  inspectComfyUIInstall: (customPath?: string) => ipcRenderer.invoke('inspect-comfyui-install', customPath),
  autoDetectComfyUI: () => ipcRenderer.invoke('auto-detect-comfyui'),

  // CivitAI API
  searchModels: (params: any) => ipcRenderer.invoke('search-models', params),
  getModel: (id: number) => ipcRenderer.invoke('get-model', id),
  getModelVersion: (id: number) => ipcRenderer.invoke('get-model-version', id),
  getEnums: () => ipcRenderer.invoke('get-enums'),

  // Scanner & Library
  scanLibrary: (rootPath: string) => ipcRenderer.invoke('scan-library', rootPath),
  cancelScan: () => ipcRenderer.invoke('cancel-scan'),
  getScanStatus: () => ipcRenderer.invoke('get-scan-status'),
  getLocalModels: () => ipcRenderer.invoke('get-local-models'),
  matchUnidentifiedModels: () => ipcRenderer.invoke('match-unidentified-models'),
  pullMissingModel: (modelData: any, targetRoot?: string) =>
    ipcRenderer.invoke('pull-missing-model', modelData, targetRoot),
  scaffoldModelFolders: (targetDir?: string) =>
    ipcRenderer.invoke('scaffold-model-folders', targetDir),
  clearLibrary: () => ipcRenderer.invoke('clear-library'),
  onScanProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('scan-progress', (_event: unknown, progress: any) => callback(progress));
  },

  // Download Queue
  addDownload: (task: any) => ipcRenderer.invoke('add-download', task),
  pauseDownload: (id: string) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id: string) => ipcRenderer.invoke('resume-download', id),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  forceCompleteDownload: (id: string) => ipcRenderer.invoke('force-complete-download', id),
  deleteDownload: (id: string) => ipcRenderer.invoke('delete-download', id),
  clearFinishedDownloads: () => ipcRenderer.invoke('clear-finished-downloads'),
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  onDownloadProgress: (callback: (tasks: any[]) => void) => {
    ipcRenderer.on('download-progress', (_event: unknown, tasks: any) => callback(tasks));
  },

  // Versioning & Backup
  checkUpdate: (localModel: any) => ipcRenderer.invoke('check-update', localModel),
  checkAllUpdates: (opts?: { force?: boolean }) => ipcRenderer.invoke('check-all-updates', opts),
  ignoreModelUpdate: (modelId: number, versionId: number) =>
    ipcRenderer.invoke('ignore-model-update', modelId, versionId),
  unignoreModelUpdate: (modelId: number, versionId: number) =>
    ipcRenderer.invoke('unignore-model-update', modelId, versionId),
  getIgnoredUpdates: () => ipcRenderer.invoke('get-ignored-updates'),
  onUpdateCheckProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('update-check-progress', (_event: unknown, progress: any) => callback(progress));
  },
  exportBackup: (filePath?: string) => ipcRenderer.invoke('export-backup', filePath),
  importBackup: (fileOrBuffer?: any) => ipcRenderer.invoke('import-backup', fileOrBuffer),
  // Delete local model
  deleteLocalModel: (id: string, deleteFromDisk?: boolean) =>
    ipcRenderer.invoke('delete-local-model', id, deleteFromDisk),
  ignoreDuplicateSet: (sha256: string, count?: number) =>
    ipcRenderer.invoke('ignore-duplicate-set', sha256, count),
  unignoreDuplicateSet: (sha256: string) =>
    ipcRenderer.invoke('unignore-duplicate-set', sha256),
  getIgnoredDuplicates: () => ipcRenderer.invoke('get-ignored-duplicates'),
  setModelNsfw: (modelId: string, nsfw: boolean) =>
    ipcRenderer.invoke('set-model-nsfw', modelId, nsfw),
  openFolder: (filePath: string) => ipcRenderer.invoke('open-folder', filePath),
  browseFolder: (defaultPath?: string) => ipcRenderer.invoke('browse-folder', defaultPath),
  listDirectory: (dirPath?: string) => ipcRenderer.invoke('list-directory', dirPath),
  // Workflows & Webhooks
  scanWorkflows: (folderPaths?: string | string[]) => ipcRenderer.invoke('scan-workflows', folderPaths),
  parseWorkflow: (workflowData: any, workflowName?: string) =>
    ipcRenderer.invoke('parse-workflow', workflowData, workflowName),
  checkComfyUIStatus: (serverUrl?: string) =>
    ipcRenderer.invoke('check-comfyui-status', serverUrl),
  saveWorkflowToComfyUI: (fileName: string, data: any, fileType?: string) =>
    ipcRenderer.invoke('save-comfyui-workflow', fileName, data, fileType),
  executeComfyUIPrompt: (promptData: any, serverUrl?: string) =>
    ipcRenderer.invoke('execute-comfyui-prompt', promptData, serverUrl),
  testWebhook: (url: string, event: string) => ipcRenderer.invoke('test-webhook', url, event),

  // Node Resolution & GitHub Fallback
  resolveMissingNode: (nodeType: string, customNodesDir?: string, searchGitHub?: boolean, forceRefresh?: boolean) =>
    ipcRenderer.invoke('resolve-missing-node', nodeType, customNodesDir, searchGitHub, forceRefresh),
  searchGitHubNodes: (query: string, limit?: number) =>
    ipcRenderer.invoke('search-github-nodes', query, limit),
  cloneCustomNode: (gitUrl: string, customFolderName?: string, customNodesDir?: string) =>
    ipcRenderer.invoke('clone-custom-node', gitUrl, customFolderName, customNodesDir),
  installNodeDependencies: (nodeFolderPath: string) =>
    ipcRenderer.invoke('install-node-dependencies', nodeFolderPath),
  getInstalledCustomNodes: () =>
    ipcRenderer.invoke('get-installed-custom-nodes'),
  markCustomNodeInstalled: (nodeType: string, folderName: string, customNodesDir?: string) =>
    ipcRenderer.invoke('mark-node-installed', nodeType, folderName, customNodesDir),

  // Hugging Face & GGUF
  hfCheckModel: (repoId: string) => ipcRenderer.invoke('hf-check-model', repoId),
  hfValidateToken: (token?: string) => ipcRenderer.invoke('hf-validate-token', token),
  hfWhoami: () => ipcRenderer.invoke('hf-whoami'),
  hfSearchModels: (query: string, limit?: number) => ipcRenderer.invoke('hf-search-models', query, limit),
  inspectGGUF: (filePath: string) => ipcRenderer.invoke('inspect-gguf', filePath),

  // External Link & System Info
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
  onAppLog: (callback: (log: { level: string; message: string }) => void) => {
    ipcRenderer.on('app-log', (_event: unknown, log: any) => callback(log));
  },
  // App control
  restartApp: () => ipcRenderer.invoke('restart-app'),
  shutdownApp: () => ipcRenderer.invoke('shutdown-app'),
};

contextBridge.exposeInMainWorld('civitaiAPI', api);

