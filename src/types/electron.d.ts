/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

export interface CivitaiAPI {
  // Settings & Config
  getConfig: () => Promise<any>;
  saveConfig: (config: any) => Promise<any>;
  setApiKey: (key: string) => Promise<any>;
  inspectComfyUIInstall: (customPath?: string) => Promise<any>;
  autoDetectComfyUI: () => Promise<any>;

  // CivitAI API
  searchModels: (params: any) => Promise<any>;
  getModel: (id: number) => Promise<any>;
  getModelVersion: (id: number) => Promise<any>;
  getEnums: () => Promise<any>;

  // Scanner & Library
  scanLibrary: (rootPath: string) => Promise<any>;
  cancelScan: () => Promise<any>;
  getScanStatus: () => Promise<any>;
  getLocalModels: () => Promise<any>;
  matchUnidentifiedModels: () => Promise<any>;
  pullMissingModel: (modelData: any, targetRoot?: string) => Promise<any>;
  scaffoldModelFolders: (targetDir?: string) => Promise<any>;
  clearLibrary: () => Promise<any>;
  onScanProgress: (callback: (progress: any) => void) => void;

  // Download Queue
  addDownload: (task: any) => Promise<any>;
  pauseDownload: (id: string) => Promise<any>;
  resumeDownload: (id: string) => Promise<any>;
  cancelDownload: (id: string) => Promise<any>;
  forceCompleteDownload: (id: string) => Promise<any>;
  deleteDownload: (id: string) => Promise<any>;
  clearFinishedDownloads: () => Promise<any>;
  getDownloads: () => Promise<any>;
  onDownloadProgress: (callback: (tasks: any[]) => void) => void;

  // Versioning & Backup
  checkUpdate: (localModel: any) => Promise<any>;
  checkAllUpdates: (opts?: { force?: boolean }) => Promise<any>;
  ignoreModelUpdate: (modelId: number, versionId: number) => Promise<any>;
  unignoreModelUpdate: (modelId: number, versionId: number) => Promise<any>;
  getIgnoredUpdates: () => Promise<any>;
  onUpdateCheckProgress: (callback: (progress: any) => void) => void;
  exportBackup: (filePath?: string) => Promise<any>;
  importBackup: (fileOrBuffer?: any) => Promise<any>;

  // Delete local model & Duplicates
  deleteLocalModel: (id: string, deleteFromDisk?: boolean) => Promise<any>;
  ignoreDuplicateSet: (sha256: string, count?: number) => Promise<any>;
  unignoreDuplicateSet: (sha256: string) => Promise<any>;
  getIgnoredDuplicates: () => Promise<any>;
  setModelNsfw: (modelId: string, nsfw: boolean) => Promise<any>;
  openFolder: (filePath: string) => Promise<any>;
  browseFolder: (defaultPath?: string) => Promise<any>;
  listDirectory: (dirPath?: string) => Promise<any>;

  // Workflows & Webhooks
  scanWorkflows: (folderPaths?: string | string[]) => Promise<any>;
  parseWorkflow: (workflowData: any, workflowName?: string) => Promise<any>;
  checkComfyUIStatus: (serverUrl?: string) => Promise<any>;
  saveWorkflowToComfyUI: (fileName: string, data: any, fileType?: string) => Promise<any>;
  executeComfyUIPrompt: (promptData: any, serverUrl?: string) => Promise<any>;
  testWebhook: (url: string, event: string) => Promise<any>;

  // Node Resolution & GitHub Fallback
  resolveMissingNode: (
    nodeType: string,
    customNodesDir?: string,
    searchGitHub?: boolean,
    forceRefresh?: boolean
  ) => Promise<any>;
  searchGitHubNodes: (query: string, limit?: number) => Promise<any>;
  cloneCustomNode: (gitUrl: string, customFolderName?: string, customNodesDir?: string) => Promise<any>;
  installNodeDependencies: (nodeFolderPath: string) => Promise<any>;
  getInstalledCustomNodes: () => Promise<any>;
  markCustomNodeInstalled: (nodeType: string, folderName: string, customNodesDir?: string) => Promise<any>;

  // Hugging Face
  hfCheckModel: (repoId: string) => Promise<any>;
  hfValidateToken: (token?: string) => Promise<any>;
  hfWhoami: () => Promise<any>;

  // External Link & System Info
  openExternal: (url: string) => Promise<any>;
  getSystemInfo: () => Promise<any>;
  checkAppUpdate: () => Promise<any>;
  onAppLog: (callback: (log: { level: string; message: string }) => void) => (() => void) | void;

  // App Control
  restartApp: () => Promise<any>;
  shutdownApp: () => Promise<any>;

  _isMock?: boolean;
}

declare global {
  interface Window {
    civitaiAPI: CivitaiAPI;
  }
}
