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
  saveModelMetadata: (params: any) => Promise<{ success: boolean; error?: string }>;
  fetchModelMetadataByUrl: (urlOrId: string) => Promise<{ success: boolean; data?: any; error?: string }>;
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
  checkFolderAccess: (folderPath: string) => Promise<{ exists: boolean; writable: boolean; error?: string }>;

  // Workflows & Webhooks
  scanWorkflows: (folderPaths?: string | string[]) => Promise<any>;
  parseWorkflow: (workflowData: any, workflowName?: string) => Promise<any>;
  parseDroppedWorkflowFile: (filePath: string) => Promise<any>;
  archiveWorkflow: (params: { targetName: string; workflowData: any; overwrite?: boolean }) => Promise<{
    success: boolean;
    filePath?: string;
    fileName?: string;
    error?: string;
    code?: string;
  }>;
  checkComfyUIStatus: (serverUrl?: string) => Promise<any>;
  checkSwarmStatus: (serverUrl?: string) => Promise<any>;
  focusOrOpenSwarm: (serverUrl?: string) => Promise<any>;
  getSwarmAuthStatus: () => Promise<any>;
  onSwarmSisterWakeup?: (callback: () => void) => (() => void) | void;
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

  // Hugging Face & GGUF
  hfCheckModel: (repoId: string) => Promise<any>;
  hfValidateToken: (token?: string) => Promise<any>;
  hfWhoami: () => Promise<any>;
  hfSearchModels: (query: string, limit?: number) => Promise<any>;
  inspectGGUF: (filePath: string) => Promise<any>;

  // Storage Optimizer & Swarm Packaging
  scanStorageOptimizer: () => Promise<any>;
  executeHardlinkOptimizer: (masterPath: string, duplicatePath: string) => Promise<any>;
  packageCompanionFiles: (filePath: string) => Promise<any>;
  packageAllCompanionFiles: () => Promise<any>;
  saveModelTriggerWords: (filePath: string, triggerWords: string[]) => Promise<{
    success: boolean;
    filePath: string;
    companionInfoPath: string;
    triggerWords: string[];
    error?: string;
  }>;
  inspectModelPrecision: (filePath: string) => Promise<any>;
  scanOrphanModels: (workflowDirs?: string | string[]) => Promise<any>;

  // Library Sorter / Auto-Organize
  analyzeLibrarySorting: (options?: { models?: any[]; modelIds?: string[] }) => Promise<any>;
  executeLibrarySorting: (planItems: Array<{ modelId: string; sourcePath: string; targetPath: string }>) => Promise<any>;
  onLibrarySortProgress?: (callback: (progress: { current: number; total: number; file: string }) => void) => (() => void) | void;
  ignoreSortModel: (modelId: string, filePath?: string, fileName?: string) => Promise<any>;
  unignoreSortModel: (modelId: string) => Promise<any>;
  getIgnoredSortModels: () => Promise<any>;
  clearIgnoredSortModels: () => Promise<any>;

  // Model Converter (Pickle to SafeTensors) & Hardware Safety
  getConverterEnvironment: (customPythonPath?: string) => Promise<any>;
  convertModelToSafetensors: (filePath: string, options?: any) => Promise<any>;
  scanPickleModel: (filePath: string) => Promise<any>;
  getHardwareProfile: (forceRefresh?: boolean) => Promise<any>;
  assessConversionSafety: (modelSizeBytes: number) => Promise<any>;

  // External Link & System Info
  openExternal: (url: string) => Promise<any>;
  getSystemInfo: () => Promise<any>;
  checkAppUpdate: () => Promise<any>;
  onAppLog: (callback: (log: { level: string; message: string }) => void) => (() => void) | void;

  // License Management & Cryptographic Verification
  getLicenseStatus: () => Promise<any>;
  getUserPublicKey: () => Promise<string>;
  activateLicense: (licenseKey: string) => Promise<any>;
  deactivateLicense: () => Promise<any>;
  verifyLicense: (licenseKey: string) => Promise<any>;
  signLicenseChallenge: (challenge: string) => Promise<string>;

  // App Control
  getApiPort: () => Promise<number>;
  setApiPort?: (port: number) => Promise<void>;
  restartApp: () => Promise<any>;
  shutdownApp: () => Promise<any>;
  onProtocolAction: (callback: (actionPayload: any) => void) => void;

  _isMock?: boolean;
}

declare global {
  interface Window {
    civitaiAPI: CivitaiAPI;
    __CMM_API_PORT__?: number;
    __CMM_API_BASE__?: string;
  }
}
