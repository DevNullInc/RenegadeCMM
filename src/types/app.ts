/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import type { ModelType } from './civitai';
export type { ModelType } from './civitai';

export type ConflictStrategy = 'skip' | 'replace' | 'rename' | 'prompt';

export interface FilenamePatternRule {
  pattern: string;
  folder: string;
  case_sensitive?: boolean;
}

export const DEFAULT_FOLDER_MAP: Record<string, string> = {
  Checkpoint: 'checkpoints',
  LORA: 'loras',
  LoCon: 'loras',
  DoRA: 'loras',
  TextualInversion: 'embeddings',
  Hypernetwork: 'hypernetworks',
  VAE: 'vae',
  Controlnet: 'controlnet',
  Upscaler: 'upscale_models',
  MotionModule: 'model_patches',
  AestheticGradient: 'model_patches',
  Poses: 'workflows',
  Wildcards: 'wildcards',
  Workflows: 'workflows',
  Detection: 'detection',
  Other: 'checkpoints',
};

/**
 * ComfyUI official standard model subdirectories under `models/`.
 * (Note: Workflows directory is excluded as workflows are stored separately).
 */
export const COMFYUI_STANDARD_MODEL_SUBFOLDERS: string[] = [
  'checkpoints',
  'loras',
  'vae',
  'embeddings',
  'controlnet',
  'upscale_models',
  'clip',
  'clip_vision',
  'text_encoders',
  'unet',
  'diffusion_models',
  'hypernetworks',
  'gligen',
  'style_models',
  'model_patches',
  'configs',
  'vae_approx',
  'ipadapter',
  'insightface',
  'photomaker',
  'pulid',
  'reactor',
  'gguf',
  'wildcards',
  'ultralytics',
  'yolo',
  'sams',
];

export const DEFAULT_FILENAME_PATTERNS: FilenamePatternRule[] = [
  { pattern: 'ip-adapter', folder: 'ipadapter', case_sensitive: false },
  { pattern: 'photomaker', folder: 'photomaker', case_sensitive: false },
  { pattern: 'pulid', folder: 'pulid', case_sensitive: false },
  { pattern: 'instantid', folder: 'insightface', case_sensitive: false },
  { pattern: 'reactor', folder: 'reactor', case_sensitive: false },
  { pattern: 'rmbg', folder: 'RMBG', case_sensitive: false },
  { pattern: 'sam\\d', folder: 'sam3', case_sensitive: false },
  { pattern: 'yolo', folder: 'yolo', case_sensitive: false },
  { pattern: 'ultralytics', folder: 'ultralytics', case_sensitive: false },
  { pattern: '\\.gguf$', folder: 'gguf', case_sensitive: false },
  { pattern: 'llm|qwen|llama', folder: 'LLM', case_sensitive: false },
  { pattern: 'unet', folder: 'unet', case_sensitive: false },
  { pattern: 'diffusion', folder: 'diffusion_models', case_sensitive: false },
  { pattern: 'esrgan|swinir|real-esrgan', folder: 'upscale_models', case_sensitive: false },
  { pattern: 'clip_vision', folder: 'clip_vision', case_sensitive: false },
  { pattern: 't5|clip.*encoder|text.*encoder', folder: 'text_encoders', case_sensitive: false },
];

export interface FolderConfig {
  rootPath: string;
  folderPaths?: string[];
  folderMappings: Record<string, string>;
  separateByBaseModel: boolean;
  separateByCreator: boolean;
  advancedMappings: {
    filename_patterns: FilenamePatternRule[];
  };
}

export interface WebhookConfig {
  on_download_complete?: string;
  on_update_available?: string;
}

export interface AppConfig {
  comfyui_root: string;
  comfyui_folders: string[]; // Multi-folder list support
  comfyui_install_dir?: string; // Root ComfyUI application directory (where main.py and custom_nodes reside)
  comfyui_custom_nodes_dir?: string; // Optional custom_nodes path override
  civitai_api_key?: string;
  has_civitai_api_key?: boolean;
  mirror_url?: string;
  huggingface_token?: string;
  has_huggingface_token?: boolean;
  webhooks?: WebhookConfig;
  folder_mappings: Record<string, string>;
  advanced_mappings: {
    filename_patterns: FilenamePatternRule[];
  };
  organize_by: {
    base_model: boolean;
    creator: boolean;
  };
  conflict_strategy: ConflictStrategy;
  nsfw_max_visible_level: number;
  nsfw_blur_enabled: boolean;
  strict_hash_verification?: boolean;
  max_concurrent_downloads?: number;
  default_download_folder?: string;
  local_api_enabled?: boolean;
  local_api_port?: number;
  comfyui_server_url?: string;
}

export interface WorkflowModelReference {
  nodeId: string;
  nodeType: string;
  inputName: string;
  modelName: string;
  isInstalled: boolean;
  localPath?: string;
}

export interface GitHubNodeRepo {
  id: number;
  name: string;
  fullName: string;
  author: string;
  htmlUrl: string;
  cloneUrl: string;
  description: string;
  stars: number;
  language: string;
  topics: string[];
  updatedAt: string;
}

export interface NodeResolutionResult {
  nodeType: string;
  isInstalled: boolean;
  installedFolder?: string;
  installedPath?: string;
  managerMatch?: {
    title: string;
    author: string;
    gitUrl: string;
    description: string;
  };
  githubCandidates: GitHubNodeRepo[];
  queryUsed?: string;
}

export interface NodeCloneResult {
  success: boolean;
  folderName: string;
  targetPath: string;
  hasRequirements: boolean;
  hasInstallScript: boolean;
  detectedPythonPath?: string;
  error?: string;
}

export interface CustomNodePackage {
  folderName: string;
  fullPath: string;
  hasRequirements: boolean;
  hasInstallScript: boolean;
  nodeClasses: string[];
  gitRemoteUrl?: string;
}

export interface ComfyUIStructureInfo {
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
  inferred?: boolean;
  installDir?: string;
  customNodesDir?: string;
  customNodesExist?: boolean;
  installedNodes?: string[];
  nodeCount?: number;
  cmmNodeInstalled?: boolean;
  cmmNodeFolderName?: string;
  structure?: ComfyUIStructureInfo;
  autoModelsDir?: string;
}

export interface AutoDetectComfyUIResult {
  found: boolean;
  path?: string;
  info?: ComfyUIInstallInfo;
  message?: string;
  candidatesChecked?: number;
}

export interface CanvasNodeInput {
  name: string;
  type: string;
  link?: number | null;
}

export interface CanvasNodeOutput {
  name: string;
  type: string;
  links?: number[] | null;
}

export interface CanvasNode {
  id: number | string;
  type: string;
  pos?: [number, number];
  size?: [number, number] | { 0: number; 1: number };
  inputs?: CanvasNodeInput[];
  outputs?: CanvasNodeOutput[];
  widgets_values?: any[];
  title?: string;
  color?: string;
  bgcolor?: string;
}

export interface CanvasLink {
  id: number;
  origin_id: number | string;
  origin_slot: number;
  target_id: number | string;
  target_slot: number;
  type: string;
}

export interface CanvasGraph {
  nodes?: CanvasNode[];
  links?: (number[] | CanvasLink)[];
  groups?: any[];
}

export interface WorkflowInfo {
  filePath: string;
  fileName: string;
  fileType: 'json' | 'png';
  modelCount: number;
  models: WorkflowModelReference[];
  nodeTypes?: string[];
  rawGraph?: any;
  canvasGraph?: CanvasGraph;
}

export interface DownloadTask {
  id: string;
  modelVersionId: number;
  modelId: number;
  modelName: string;
  versionName: string;
  modelType: ModelType;
  baseModel: string;
  creator?: string;
  targetFolder: string;
  targetRoot?: string;
  fileName: string;
  downloadUrl: string;
  sizeKB: number;
  sha256?: string;
  status: 'pending' | 'downloading' | 'verifying' | 'completed' | 'failed' | 'paused';
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBps: number;
  error?: string;
  computedPath: string;
  requiresAuth?: boolean;
  isHashMismatch?: boolean;
  deleteOldVersionFile?: string;
  deleteOldModelId?: string;
  completedAt?: string;
  note?: string;
}

export interface LocalModel {
  id: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  modifiedAt: number;
  sha256?: string;
  civitaiModelId?: number;
  civitaiVersionId?: number;
  civitaiName?: string;
  civitaiType?: ModelType;
  civitaiBaseModel?: string;
  civitaiCreator?: string;
  previewUrl?: string;
  modelType?: ModelType;
  nsfw?: boolean;
  isMatched: boolean;
  hasUpdate?: boolean;
  updateVersionId?: number;
  updateVersionName?: string;
  updateDownloadUrl?: string;
  ignoredVersionId?: number;
  updateCheckedAt?: number;
  isDuplicate?: boolean;
  isMissing?: boolean;
}

export interface ScanProgress {
  scannedFiles: number;
  totalFiles: number;
  currentFile?: string;
  status: 'idle' | 'scanning' | 'hashing' | 'lookup' | 'completed' | 'failed';
  error?: string;
}

export interface AppUpdateCheckResult {
  isUpdateAvailable: boolean;
  isDevelopmentVersion: boolean;
  isReleaseMode?: boolean;
  currentVersion?: string;
  latestReleaseTag?: string;
  currentCommit?: string;
  remoteCommit?: string;
  remoteCommitMessage?: string;
  remoteCommitDate?: string;
  remoteCommitAuthor?: string;
  githubUrl: string;
  isPackaged: boolean;
  error?: string;
}

export interface ComfyUIStatus {
  online: boolean;
  serverUrl: string;
  version?: string;
  devices?: string[];
  os?: string;
  error?: string;
}

export interface SaveWorkflowResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  error?: string;
}
