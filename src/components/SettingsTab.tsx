/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Folder,
  Key,
  Save,
  Plus,
  Trash2,
  DownloadCloud,
  UploadCloud,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  FolderPlus,
  Star,
  RefreshCw,
  Power,
  FileJson,
  Archive,
  Copy,
  Check,
  Upload,
  Download,
  Code,
  HardDrive,
  Server,
  Lock,
  Terminal,
  Layers,
  Sparkles,
  GitBranch,
  Loader2,
  ExternalLink,
  Package,
  Wifi,
  Radio,
} from 'lucide-react';
import {
  AppConfig,
  ConflictStrategy,
  FilenamePatternRule,
  ComfyUIInstallInfo,
  ComfyUIStatus,
  DEFAULT_FOLDER_MAP,
  DEFAULT_FILENAME_PATTERNS,
} from '../types/app';

import { NodeResolutionCard } from './NodeResolutionCard';
import { FolderBrowserModal } from './FolderBrowserModal';

export const SettingsTab: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>({
    comfyui_root: '',
    comfyui_folders: [],
    comfyui_install_dir: '',
    comfyui_custom_nodes_dir: '',
    civitai_api_key: '',
    has_civitai_api_key: false,
    mirror_url: '',
    huggingface_token: '',
    has_huggingface_token: false,
    webhooks: {
      on_download_complete: '',
      on_update_available: '',
    },
    folder_mappings: { ...DEFAULT_FOLDER_MAP },
    advanced_mappings: { filename_patterns: [...DEFAULT_FILENAME_PATTERNS] },
    organize_by: { base_model: false, creator: false },
    conflict_strategy: 'rename',
    nsfw_max_visible_level: 5,
    nsfw_blur_enabled: true,
    strict_hash_verification: true,
    max_concurrent_downloads: 2,
    default_download_folder: '',
    local_api_enabled: true,
    local_api_port: 5174,
    comfyui_server_url: 'http://127.0.0.1:8188',
  });

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [comfyStatus, setComfyStatus] = useState<ComfyUIStatus | null>(null);
  const [isCheckingComfyStatus, setIsCheckingComfyStatus] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedJsonText, setPastedJsonText] = useState('');
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [appAction, setAppAction] = useState<'restarting' | 'shutting-down' | null>(null);
  const [newFolderInput, setNewFolderInput] = useState('');
  const [newPattern, setNewPattern] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [testingHf, setTestingHf] = useState(false);
  const [hfStatus, setHfStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<'dl' | 'up' | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{ type: string; success?: boolean; message?: string } | null>(null);
  const [installInfo, setInstallInfo] = useState<ComfyUIInstallInfo | null>(null);
  const [inspectingInstall, setInspectingInstall] = useState(false);
  const [isCloningCmmNode, setIsCloningCmmNode] = useState(false);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [autoDetectFeedback, setAutoDetectFeedback] = useState<{ success: boolean; message: string; path?: string } | null>(null);
  const [scaffoldFeedback, setScaffoldFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [isScaffolding, setIsScaffolding] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const appendDebug = (msg: string) => {
    const ts = new Date().toLocaleTimeString();
    const line = `[${ts}] ${msg}`;
    setDebugLog((prev) => [...prev.slice(-49), line]);
    // also mirror to browser console for DevTools
    console.log(`[Settings Debug] ${msg}`);
  };
  const [folderBrowser, setFolderBrowser] = useState<{ target: 'install' | 'addFolder'; start: string } | null>(null);

  const handleAutoDetectComfyUI = async () => {
    setIsAutoDetecting(true);
    setAutoDetectFeedback(null);

    try {
      if (window.civitaiAPI?.autoDetectComfyUI) {
        const res: any = await window.civitaiAPI.autoDetectComfyUI();
        if (res?.found && res.path) {
          handleComfyUIInstallDirChange(res.path);
          setAutoDetectFeedback({
            success: true,
            path: res.path,
            message: `Successfully detected ComfyUI at: ${res.path} (${res.info?.nodeCount ?? 0} custom node(s) found). Models folder auto-populated.`,
          });
          setTimeout(() => setAutoDetectFeedback(null), 8000);
          return;
        }
      }

      // Fallback: Check existing primary folder
      const primary = config.comfyui_folders[0] || config.comfyui_root || '';
      if (primary) {
        const detectedPath = primary.replace(/[\\/]models[\\/]?$/i, '');
        if (detectedPath && detectedPath !== primary) {
          handleComfyUIInstallDirChange(detectedPath);
          setAutoDetectFeedback({
            success: true,
            path: detectedPath,
            message: `Deduced ComfyUI root directory from configured models path: ${detectedPath}`,
          });
          setTimeout(() => setAutoDetectFeedback(null), 8000);
          return;
        }
      }

      setAutoDetectFeedback({
        success: false,
        message: 'Could not automatically find a valid ComfyUI directory. Please browse or manually type your ComfyUI root directory above.',
      });
      setTimeout(() => setAutoDetectFeedback(null), 8000);
    } catch (err: any) {
      setAutoDetectFeedback({
        success: false,
        message: `Auto-detection encountered an error: ${err.message || 'Detection failed'}`,
      });
      setTimeout(() => setAutoDetectFeedback(null), 8000);
    } finally {
      setIsAutoDetecting(false);
    }
  };

  const deriveModelsFolder = (installDir: string): string => {
    if (!installDir) return '';
    const trimmed = installDir.trim();
    const sep = trimmed.includes('\\') ? '\\' : '/';
    const clean = trimmed.replace(/[\\/]+$/, '');
    return `${clean}${sep}models`;
  };

  const adoptDerivedModelsFolder = (installDir: string) => {
    const trimmed = installDir.trim();
    setConfig((prev) => {
      const base = { ...prev, comfyui_install_dir: installDir };
      if (!trimmed) return base;
      const derivedModels = deriveModelsFolder(trimmed);
      if (!derivedModels) return base;
      const existing = prev.comfyui_folders || [];
      if (existing.length > 0 && existing[0].toLowerCase() === derivedModels.toLowerCase()) {
        return base;
      }
      const otherFolders = existing.filter((f) => f.toLowerCase() !== derivedModels.toLowerCase());
      const updatedFolders = [derivedModels, ...otherFolders];
      return {
        ...base,
        comfyui_folders: updatedFolders,
        comfyui_root: updatedFolders[0] || '',
      };
    });
  };

  const handleComfyUIInstallDirChange = (val: string, commitFolders = true) => {
    setConfig((prev) => ({ ...prev, comfyui_install_dir: val }));
    if (commitFolders) adoptDerivedModelsFolder(val);
    checkInstallDir(val);
  };

  const handleInstallDirBlur = () => {
    // Only adopt the derived "\models" folder once the field is left, so partially typed text
    // is never treated as a real model root (and never scaffolded on disk).
    if (config.comfyui_install_dir && config.comfyui_install_dir.trim()) {
      adoptDerivedModelsFolder(config.comfyui_install_dir);
    }
  };

  const openFolderBrowser = (target: 'install' | 'addFolder') => {
    const start =
      target === 'install'
        ? (config.comfyui_install_dir || config.comfyui_folders[0] || '')
        : (newFolderInput || config.comfyui_folders[0] || '');
    setFolderBrowser({ target, start });
  };

  const handleFolderBrowserSelect = (path: string) => {
    if (!path) {
      setFolderBrowser(null);
      return;
    }
    if (folderBrowser?.target === 'install') {
      handleComfyUIInstallDirChange(path, true);
    } else {
      // Browse should auto-add — no extra click needed
      const sanitized = sanitizeFolderPath(path);
      if (!sanitized) {
        setImportError(`Invalid folder path: ${path}`);
        setTimeout(() => setImportError(null), 5000);
        setFolderBrowser(null);
        return;
      }
      setConfig((prev) => {
        if (prev.comfyui_folders.some((f) => f.toLowerCase() === sanitized.toLowerCase())) return prev;
        const updatedFolders = [...prev.comfyui_folders, sanitized];
        return { ...prev, comfyui_folders: updatedFolders, comfyui_root: updatedFolders[0] || '' };
      });
      setNewFolderInput('');
      if (window.civitaiAPI?.scaffoldModelFolders) {
        window.civitaiAPI.scaffoldModelFolders(sanitized).then((results: any) => {
          let count = 0;
          if (Array.isArray(results)) for (const r of results) count += r.created?.length || 0;
          if (count > 0) {
            setScaffoldFeedback({ success: true, message: `Created ${count} missing ComfyUI model subfolder${count !== 1 ? 's' : ''} in ${sanitized}` });
            setTimeout(() => setScaffoldFeedback(null), 7000);
          }
        }).catch(() => {});
      }
    }
    setFolderBrowser(null);
  };

  const checkInstallDir = async (customPath?: string) => {
    if (window.civitaiAPI?.inspectComfyUIInstall) {
      setInspectingInstall(true);
      try {
        const res = await window.civitaiAPI.inspectComfyUIInstall(customPath);
        setInstallInfo(res);
        if (res?.autoModelsDir) {
          setConfig((prev) => {
            if (!prev.comfyui_folders || prev.comfyui_folders.length === 0) {
              return {
                ...prev,
                comfyui_folders: [res.autoModelsDir!],
                comfyui_root: res.autoModelsDir!,
              };
            }
            return prev;
          });
        }
      } catch {
        setInstallInfo(null);
      } finally {
        setInspectingInstall(false);
      }
    }
  };

  const handleInstallCmmNode = async () => {
    // 1. Check if ComfyUI install directory is configured
    if (!config.comfyui_install_dir?.trim() && !installInfo?.customNodesDir) {
      setImportError(
        'ComfyUI installation directory is not set! Please specify and set your ComfyUI root directory above before installing the companion node.'
      );
      setTimeout(() => setImportError(null), 8000);
      return;
    }

    // 2. Check if custom_nodes exists
    if (!installInfo?.customNodesExist) {
      setImportError(
        'No valid custom_nodes/ directory found in the specified ComfyUI path. Please ensure your ComfyUI directory is set correctly first.'
      );
      setTimeout(() => setImportError(null), 8000);
      return;
    }

    if (!window.civitaiAPI?.cloneCustomNode) {
      setImportError('Custom node cloning is not supported in this environment.');
      setTimeout(() => setImportError(null), 8000);
      return;
    }

    const targetCustomNodesDir =
      installInfo?.customNodesDir ||
      (config.comfyui_install_dir ? `${config.comfyui_install_dir}/custom_nodes` : '');

    setIsCloningCmmNode(true);
    setImportFeedback(null);
    setImportError(null);

    try {
      const gitUrl = 'https://github.com/DevNullInc/ComfyUI-Model-Manager.git';
      const res: any = await window.civitaiAPI.cloneCustomNode(
        gitUrl,
        'ComfyUI-Model-Manager',
        targetCustomNodesDir
      );

      if (res?.success) {
        if (res.hasRequirements && window.civitaiAPI.installNodeDependencies && res.targetPath) {
          try {
            await window.civitaiAPI.installNodeDependencies(res.targetPath);
          } catch (depErr) {
            console.warn('Dependency installation warning:', depErr);
          }
        }
        setImportFeedback(
          'ComfyUI-Model-Manager companion node successfully cloned into custom_nodes! Please restart ComfyUI to load the node.'
        );
        setTimeout(() => setImportFeedback(null), 8000);
        await checkInstallDir(config.comfyui_install_dir);
      } else {
        setImportError(
          `Failed to clone ComfyUI-Model-Manager: ${res?.error || 'Unknown error'}. 1-Click install is currently untested—please submit a bug report at https://github.com/DevNullInc/ComfyUI-Model-Manager/issues or git clone manually into custom_nodes/.`
        );
        setTimeout(() => setImportError(null), 10000);
      }
    } catch (err: any) {
      setImportError(
        `Error cloning companion node: ${err.message || 'Clone failed'}. 1-Click install is currently untested—please submit a bug report at https://github.com/DevNullInc/ComfyUI-Model-Manager/issues or git clone manually.`
      );
      setTimeout(() => setImportError(null), 10000);
    } finally {
      setIsCloningCmmNode(false);
    }
  };

  const normalizeFolderPath = (p: string): string => {
    if (!p) return '';
    return p.trim().replace(/\\{2,}/g, '\\');
  };

  /** Only absolute folder paths. Rejects relative, URLs, shell metachars and traversal. */
  const isValidFolderPath = (raw: string): boolean => {
    const p = raw.trim();
    if (!p || p.length < 3 || p.length > 500) return false;
    // colon handled separately (allowed only as C:\) so exclude it here
    if (/[\0<>"|?*\x00-\x1F]/.test(p)) return false;
    // shell injection chars must not appear anywhere in a folder path
    if (/[`$;|&]/.test(p)) return false;
    // no .. segments
    const segs = p.split(/[\\/]+/);
    if (segs.includes('..') || segs.includes('.')) return false;
    // Windows absolute C:\ or C:/ or UNC \\server\share or Unix /
    const isWinAbs = /^[a-zA-Z]:[\\/]/.test(p);
    const isUnc = /^\\\\[^\\]+\\[^\\]+/.test(p);
    const isUnixAbs = /^\//.test(p);
    if (!isWinAbs && !isUnc && !isUnixAbs) return false;
    // colon only at drive letter position
    if (p.slice(2).includes(':')) return false;
    return true;
  };

  const sanitizeFolderPath = (raw: string): string | null => {
    const n = normalizeFolderPath(raw);
    if (!n) return null;
    if (!isValidFolderPath(n)) return null;
    // strip trailing slash except root
    if (n.length > 3 && /[\\/]$/.test(n)) return n.replace(/[\\/]+$/, '');
    return n;
  };

  useEffect(() => {
    const loadConfig = async () => {
      if (window.civitaiAPI) {
        const loaded = await window.civitaiAPI.getConfig();
        if (loaded) {
          const rawFolders = loaded.comfyui_folders && loaded.comfyui_folders.length > 0
            ? loaded.comfyui_folders
            : (loaded.comfyui_root ? [loaded.comfyui_root] : []);

          const folders = rawFolders.map((p: string) => sanitizeFolderPath(p) ?? '').filter(Boolean) as string[];

          setConfig({
            comfyui_root: normalizeFolderPath(loaded.comfyui_root || folders[0] || ''),
            comfyui_folders: folders,
            civitai_api_key: loaded.civitai_api_key || (loaded.has_civitai_api_key ? '••••••••' : ''),
            has_civitai_api_key: loaded.has_civitai_api_key ?? (!!loaded.civitai_api_key && loaded.civitai_api_key.trim().length > 0),
            mirror_url: loaded.mirror_url || '',
            huggingface_token: loaded.huggingface_token || (loaded.has_huggingface_token ? '••••••••' : ''),
            has_huggingface_token: loaded.has_huggingface_token ?? (!!loaded.huggingface_token && loaded.huggingface_token.trim().length > 0),
            webhooks: {
              on_download_complete: loaded.webhooks?.on_download_complete || '',
              on_update_available: loaded.webhooks?.on_update_available || '',
            },
            folder_mappings: { ...DEFAULT_FOLDER_MAP, ...(loaded.folder_mappings || {}) },
            advanced_mappings: {
              filename_patterns:
                loaded.advanced_mappings?.filename_patterns || [...DEFAULT_FILENAME_PATTERNS],
            },
            organize_by: {
              base_model: !!loaded.organize_by?.base_model,
              creator: !!loaded.organize_by?.creator,
            },
            conflict_strategy: loaded.conflict_strategy || 'rename',
            nsfw_max_visible_level:
              typeof loaded.nsfw_max_visible_level === 'number'
                ? loaded.nsfw_max_visible_level
                : 5,
            nsfw_blur_enabled: loaded.nsfw_blur_enabled !== false,
            strict_hash_verification: loaded.strict_hash_verification !== false,
            max_concurrent_downloads:
              typeof loaded.max_concurrent_downloads === 'number'
                ? loaded.max_concurrent_downloads
                : 2,
            default_download_folder: loaded.default_download_folder || '',
            comfyui_install_dir: loaded.comfyui_install_dir || '',
            comfyui_custom_nodes_dir: loaded.comfyui_custom_nodes_dir || '',
            local_api_enabled: loaded.local_api_enabled !== false,
            local_api_port: loaded.local_api_port || 5174,
            comfyui_server_url: loaded.comfyui_server_url || 'http://127.0.0.1:8188',
          });
          checkInstallDir(loaded.comfyui_install_dir);
          checkComfyConnection(loaded.comfyui_server_url || 'http://127.0.0.1:8188');
        }
      }
    };
    loadConfig();
  }, []);

  const checkComfyConnection = async (targetUrl?: string) => {
    const url = targetUrl || config.comfyui_server_url || 'http://127.0.0.1:8188';
    setIsCheckingComfyStatus(true);
    try {
      if (window.civitaiAPI?.checkComfyUIStatus) {
        const res = await window.civitaiAPI.checkComfyUIStatus(url);
        setComfyStatus(res);
      }
    } catch (err: any) {
      setComfyStatus({ online: false, serverUrl: url, error: err?.message || 'Failed to connect' });
    } finally {
      setIsCheckingComfyStatus(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!window.civitaiAPI) {
        alert('Electron IPC connection unavailable. Please launch the desktop application via npm run electron:dev.');
        setSaving(false);
        return;
      }
      // If install_dir was just typed (onChange with commitFolders=false), folders may
      // still be stale — ensure the derived <install>\models folder is present without
      // dropping user-added extra model dirs (including ones that also end with \Models).
      let foldersForSave = (config.comfyui_folders || [])
        .map((p) => sanitizeFolderPath(p) ?? '')
        .filter(Boolean) as string[];
      const installTrimmed = (config.comfyui_install_dir || '').trim();
      if (installTrimmed) {
        const derived = deriveModelsFolder(installTrimmed);
        if (derived && !foldersForSave.some((f) => f.toLowerCase() === derived.toLowerCase())) {
          foldersForSave = [derived, ...foldersForSave];
        }
      }
      const primaryRoot = foldersForSave[0] || normalizeFolderPath(config.comfyui_root || '');
      const payload: AppConfig = {
        ...config,
        comfyui_folders: foldersForSave,
        comfyui_root: primaryRoot,
      };
      appendDebug(`SAVE payload folders=${JSON.stringify(payload.comfyui_folders)} install_dir=${payload.comfyui_install_dir} root=${payload.comfyui_root}`);
      await window.civitaiAPI.saveConfig(payload);
      setConfig(payload);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      // Verify what actually persisted (catch cache/DB divergence)
      try {
        const verify = await window.civitaiAPI.getConfig();
        appendDebug(`VERIFY getConfig folders=${JSON.stringify(verify?.comfyui_folders)} install_dir=${verify?.comfyui_install_dir} root=${verify?.comfyui_root}`);
        const mismatch =
          (verify?.comfyui_install_dir || '') !== (payload.comfyui_install_dir || '') ||
          JSON.stringify(verify?.comfyui_folders || []) !== JSON.stringify(payload.comfyui_folders || []);
        if (mismatch) {
          const msg = `MISMATCH — expected ${JSON.stringify(payload.comfyui_folders)} got ${JSON.stringify(verify?.comfyui_folders)}`;
          appendDebug(msg);
          console.warn('[Settings] Persisted config mismatch — expected', payload, 'got', verify);
        } else {
          appendDebug('VERIFY OK — DB matches payload');
        }
      } catch (e: any) {
        appendDebug(`VERIFY error: ${e?.message || e}`);
      }
    } catch (err: any) {
      console.error('Failed to save configuration:', err);
      alert(`Failed to save settings: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm('Are you sure you want to restart the application? This will reload backend services and refresh the interface.')) return;
    setAppAction('restarting');
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.restartApp === 'function') {
        await window.civitaiAPI.restartApp();
      } else {
        window.location.reload();
      }
    } catch (e) {
      setAppAction(null);
      alert('Failed to restart app. You may need to restart manually.');
    }
  };

  const handleShutdown = async () => {
    if (!confirm('Are you sure you want to shut down the application?')) return;
    setAppAction('shutting-down');
    try {
      await window.civitaiAPI.shutdownApp();
    } catch (e) {
      setAppAction(null);
      alert('Failed to shut down app.');
    }
  };

  const handleScaffoldFolders = async (targetDir?: string) => {
    if (!window.civitaiAPI?.scaffoldModelFolders || (!targetDir && config.comfyui_folders.length === 0)) return;
    setIsScaffolding(true);
    setScaffoldFeedback(null);

    try {
      const results = await window.civitaiAPI.scaffoldModelFolders(targetDir);
      let createdTotal = 0;
      if (Array.isArray(results)) {
        for (const r of results) {
          createdTotal += r.created?.length || 0;
        }
      }

      if (createdTotal > 0) {
        setScaffoldFeedback({
          success: true,
          message: `Successfully scaffolded ${createdTotal} missing ComfyUI model subfolder${createdTotal !== 1 ? 's' : ''} (checkpoints, loras, vae, controlnet, etc.)!`,
        });
      } else {
        setScaffoldFeedback({
          success: true,
          message: 'All standard ComfyUI model subfolders already exist in your configured directories.',
        });
      }
      setTimeout(() => setScaffoldFeedback(null), 7000);
    } catch (err: any) {
      setScaffoldFeedback({
        success: false,
        message: `Error scaffolding model subfolders: ${err?.message || 'Failed'}`,
      });
      setTimeout(() => setScaffoldFeedback(null), 7000);
    } finally {
      setIsScaffolding(false);
    }
  };

  const addFolder = () => {
    const sanitized = sanitizeFolderPath(newFolderInput);
    if (!sanitized) {
      if (newFolderInput.trim()) {
        setImportError(`Invalid folder path: ${newFolderInput.trim()}`);
        setTimeout(() => setImportError(null), 5000);
      }
      return;
    }
    if (config.comfyui_folders.some((f) => f.toLowerCase() === sanitized.toLowerCase())) return;

    setConfig((prev) => {
      if (prev.comfyui_folders.some((f) => f.toLowerCase() === sanitized.toLowerCase())) return prev;
      const updatedFolders = [...prev.comfyui_folders, sanitized];
      return { ...prev, comfyui_folders: updatedFolders, comfyui_root: updatedFolders[0] || '' };
    });
    setNewFolderInput('');

    // Auto-build missing standard ComfyUI model subdirectories in newly added folder
    if (window.civitaiAPI?.scaffoldModelFolders) {
      window.civitaiAPI.scaffoldModelFolders(sanitized).then((results: any) => {
        let count = 0;
        if (Array.isArray(results)) {
          for (const r of results) count += r.created?.length || 0;
        }
        if (count > 0) {
          setScaffoldFeedback({
            success: true,
            message: `Created ${count} missing ComfyUI model subfolder${count !== 1 ? 's' : ''} in ${sanitized}`,
          });
          setTimeout(() => setScaffoldFeedback(null), 7000);
        }
      }).catch(() => {});
    }
  };

  const removeFolder = (index: number) => {
    setConfig((prev) => {
      const updatedFolders = prev.comfyui_folders.filter((_, i) => i !== index);
      return {
        ...prev,
        comfyui_folders: updatedFolders,
        comfyui_root: updatedFolders[0] || '',
      };
    });
  };

  const addPatternRule = () => {
    if (!newPattern.trim() || !newFolder.trim()) return;
    const updatedPatterns = [
      ...config.advanced_mappings.filename_patterns,
      { pattern: newPattern.trim(), folder: newFolder.trim(), case_sensitive: false },
    ];
    setConfig({
      ...config,
      advanced_mappings: { filename_patterns: updatedPatterns },
    });
    setNewPattern('');
    setNewFolder('');
  };

  const removePatternRule = (index: number) => {
    const updated = config.advanced_mappings.filename_patterns.filter((_, i) => i !== index);
    setConfig({
      ...config,
      advanced_mappings: { filename_patterns: updated },
    });
  };

  const handleCreateBackupZip = async () => {
    setIsExportingBackup(true);
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.exportBackup === 'function') {
        const res = await window.civitaiAPI.exportBackup();
        if (res?.canceled) {
          return;
        }
        if (res?.success) {
          setImportFeedback(`Complete system backup archive (.zip) saved successfully!`);
          setTimeout(() => setImportFeedback(null), 5000);
        } else if (res?.error) {
          alert(`Backup failed: ${res.error}`);
        }
      } else {
        alert('Backup service is unavailable.');
      }
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleTriggerRestore = async () => {
    // In Electron with native dialog:
    if (window.civitaiAPI && !window.civitaiAPI._isMock && typeof window.civitaiAPI.importBackup === 'function') {
      setIsImportingBackup(true);
      try {
        const res: any = await window.civitaiAPI.importBackup();
        if (res?.canceled) return;
        if (res?.success) {
          const stats = res.stats || {};
          const missingNotice = stats.missingModelsCount > 0 ? ` • ${stats.missingModelsCount} missing from disk (available for 1-click download in Library)` : '';
          setImportFeedback(
            `Successfully restored backup! (${stats.modelsRestored || 0} models${missingNotice}, ${stats.downloadsRestored || 0} downloads, ${stats.configKeysRestored || 0} config keys)`
          );
          setTimeout(() => setImportFeedback(null), 8000);
          const loaded = await window.civitaiAPI.getConfig();
          if (loaded) setConfig(loaded);
        } else {
          alert(`Restore failed: ${res?.error || 'Unknown error'}`);
        }
      } catch (err: any) {
        alert(`Restore error: ${err.message}`);
      } finally {
        setIsImportingBackup(false);
      }
    } else {
      // In Web mode, open file browser for .zip / .json file
      fileInputRef.current?.click();
    }
  };

  const handleRestoreFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingBackup(true);
    try {
      setImportError(null);
      const isZip = file.name.endsWith('.zip') || file.type.includes('zip');

      if (isZip) {
        const arrayBuffer = await file.arrayBuffer();
        const res: any = await window.civitaiAPI.importBackup(arrayBuffer);
        if (res?.success) {
          const stats = res.stats || {};
          const missingNotice = stats.missingModelsCount > 0 ? ` • ${stats.missingModelsCount} missing from disk (available for 1-click download in Library)` : '';
          setImportFeedback(
            `Successfully restored backup! (${stats.modelsRestored || 0} models${missingNotice}, ${stats.downloadsRestored || 0} downloads, ${stats.configKeysRestored || 0} config keys)`
          );
          setTimeout(() => setImportFeedback(null), 8000);
          const loaded = await window.civitaiAPI.getConfig();
          if (loaded) setConfig(loaded);
        } else {
          throw new Error(res?.error || 'Failed to restore backup archive');
        }
      } else {
        // Plain text JSON fallback
        const text = await file.text();
        const parsed = JSON.parse(text);
        await processImportedConfig(parsed);
      }
    } catch (err: any) {
      console.error('Import parse error:', err);
      setImportError(`Import failed: ${err.message || 'Invalid backup format'}`);
      setTimeout(() => setImportError(null), 6000);
    } finally {
      setIsImportingBackup(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCopyJson = async () => {
    try {
      const exportData = {
        _format: 'renegadecmm-settings',
        version: '1.4.2',
        exportedAt: new Date().toISOString(),
        settings: config,
      };
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2500);
    } catch (e) {
      alert('Could not copy to clipboard.');
    }
  };

  const processImportedConfig = async (rawObj: any) => {
    const imported: Partial<AppConfig> = rawObj?.settings || rawObj;
    if (typeof imported !== 'object' || imported === null) {
      throw new Error('Invalid JSON structure. Expected an object with settings.');
    }

    const merged: AppConfig = {
      comfyui_root: imported.comfyui_root || (imported.comfyui_folders?.[0] || ''),
      comfyui_folders: Array.isArray(imported.comfyui_folders)
        ? imported.comfyui_folders
        : imported.comfyui_root
        ? [imported.comfyui_root]
        : [],
      comfyui_install_dir: imported.comfyui_install_dir || '',
      comfyui_custom_nodes_dir: imported.comfyui_custom_nodes_dir || '',
      civitai_api_key: imported.civitai_api_key || '',
      mirror_url: imported.mirror_url || '',
      huggingface_token: imported.huggingface_token || '',
      webhooks: {
        on_download_complete: imported.webhooks?.on_download_complete || '',
        on_update_available: imported.webhooks?.on_update_available || '',
      },
      folder_mappings: { ...DEFAULT_FOLDER_MAP, ...(imported.folder_mappings || {}) },
      advanced_mappings: {
        filename_patterns: Array.isArray(imported.advanced_mappings?.filename_patterns)
          ? imported.advanced_mappings.filename_patterns
          : [...DEFAULT_FILENAME_PATTERNS],
      },
      organize_by: {
        base_model: !!imported.organize_by?.base_model,
        creator: !!imported.organize_by?.creator,
      },
      conflict_strategy: imported.conflict_strategy || 'rename',
      nsfw_max_visible_level:
        typeof imported.nsfw_max_visible_level === 'number'
          ? imported.nsfw_max_visible_level
          : 5,
      nsfw_blur_enabled: imported.nsfw_blur_enabled !== false,
      strict_hash_verification: imported.strict_hash_verification !== false,
      max_concurrent_downloads:
        typeof imported.max_concurrent_downloads === 'number'
          ? imported.max_concurrent_downloads
          : 2,
      default_download_folder: imported.default_download_folder || '',
      local_api_enabled: imported.local_api_enabled !== false,
      local_api_port: imported.local_api_port || 5174,
    };

    setConfig(merged);

    if (window.civitaiAPI) {
      await window.civitaiAPI.saveConfig(merged);
    }

    setImportFeedback(
      `Successfully loaded settings (${merged.comfyui_folders.length} folder(s), ${merged.advanced_mappings.filename_patterns.length} pattern rules)!`
    );
    setTimeout(() => setImportFeedback(null), 5000);
  };

  const handlePasteImportSubmit = async () => {
    try {
      setImportError(null);
      const parsed = JSON.parse(pastedJsonText.trim());
      await processImportedConfig(parsed);
      setShowPasteModal(false);
      setPastedJsonText('');
    } catch (err: any) {
      alert(`Invalid JSON: ${err.message}`);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 pb-16">
      {/* Hidden File Input for Backup (.zip or .json) import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleRestoreFileSelected}
        accept=".zip,.json,application/zip,application/x-zip-compressed,application/json"
        className="hidden"
      />

      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight">Application Settings</h1>
          <p className="text-sm text-slate-400 mt-1">
            Configure multi-folder model directories, CivitAI API credentials, and auto-sorting rules.
          </p>
        </div>

        {/* Primary Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-sm transition-all shadow-xl shadow-purple-600/30 glow-purple cursor-pointer active:scale-95 shrink-0"
        >
          <Save size={18} />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {/* Success / Feedback Banners */}
      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2.5 text-sm font-semibold glow-emerald animate-fadeIn">
          <CheckCircle size={20} />
          <span>Configuration saved successfully!</span>
        </div>
      )}

      {importFeedback && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2.5 text-sm font-semibold glow-emerald animate-fadeIn">
          <CheckCircle size={20} />
          <span>{importFeedback}</span>
        </div>
      )}

      {importError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-2.5 text-sm font-semibold glow-rose animate-fadeIn">
          <AlertCircle size={20} />
          <span>{importError}</span>
        </div>
      )}

      {appAction && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-semibold animate-pulse ${
          appAction === 'restarting'
            ? 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-300'
            : 'bg-red-500/10 border border-red-500/30 text-red-300'
        }`}>
          {appAction === 'restarting' ? (
            <RefreshCw size={20} className="animate-spin" />
          ) : (
            <Power size={20} />
          )}
          <span>{appAction === 'restarting' ? 'Restarting backend services and refreshing interface...' : 'Shutting down application...'}</span>
        </div>
      )}

      {/* 1. ComfyUI Installation & Core Program Structure */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-slate-100 font-bold text-base">
            <Layers className="text-cyan-400" size={20} />
            <h2>ComfyUI Local Installation & Core Structure</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* CMM Companion Custom Node Status Badge */}
            {installInfo?.customNodesExist ? (
              installInfo.cmmNodeInstalled ? (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                  title={`ComfyUI-Model-Manager node is installed in custom_nodes/${installInfo.cmmNodeFolderName || 'ComfyUI-Model-Manager'}`}
                >
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <span>CMM Node Installed</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleInstallCmmNode}
                  disabled={isCloningCmmNode}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-linear-to-r from-purple-600/30 to-cyan-600/30 hover:from-purple-600/50 hover:to-cyan-600/50 text-cyan-200 border border-cyan-500/40 shadow-md hover:shadow-cyan-500/20 transition-all cursor-pointer group disabled:opacity-50 active:scale-95"
                  title="Click to automatically Git clone ComfyUI-Model-Manager into your custom_nodes/ folder. (Currently Untested — please submit a bug report on GitHub if you encounter any issues!)"
                >
                  {isCloningCmmNode ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-cyan-300" />
                      <span>Installing Node...</span>
                    </>
                  ) : (
                    <>
                      <Download size={13} className="text-cyan-400 group-hover:translate-y-0.5 transition-transform" />
                      <span>CMM Node: 1-Click Install <span className="text-[10px] text-amber-300 font-normal">(Untested)</span></span>
                    </>
                  )}
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={handleInstallCmmNode}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800/90 hover:bg-slate-800 text-amber-300/90 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/60 shadow-sm transition-all cursor-pointer"
                title="ComfyUI installation directory must be configured before installing companion node. (Currently Untested — report issues on GitHub)"
              >
                <AlertCircle size={13} className="text-amber-400" />
                <span>CMM Node: Directory Not Set <span className="text-[10px] text-amber-300/70 font-normal">(Untested)</span></span>
              </button>
            )}

            {installInfo && (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                  installInfo.valid && installInfo.customNodesExist
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : installInfo.valid
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {installInfo.valid && installInfo.customNodesExist
                  ? `${installInfo.nodeCount} Custom Node${installInfo.nodeCount !== 1 ? 's' : ''} Found`
                  : installInfo.valid
                  ? 'Directory Detected'
                  : 'Not Set'}
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Specify the root directory of your local ComfyUI installation (where <code className="text-cyan-300 font-mono text-[11px]">main.py</code> and the <code className="text-cyan-300 font-mono text-[11px]">custom_nodes/</code> directory reside). Setting this will automatically configure your primary <code className="text-purple-300 font-mono text-[11px]">models/</code> storage path below and enable companion node features.
        </p>

        <div className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="e.g. C:\AI\comfyui or /home/user/ComfyUI or D:\ComfyUI_windows_portable\ComfyUI"
                value={config.comfyui_install_dir || ''}
                onChange={(e) => handleComfyUIInstallDirChange(e.target.value, false)}
                onBlur={handleInstallDirBlur}
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => openFolderBrowser('install')}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-cyan-300 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer shrink-0 active:scale-95"
              title="Browse for the ComfyUI installation folder"
            >
              <Folder size={15} />
              <span>Browse</span>
            </button>
            <button
              type="button"
              onClick={handleAutoDetectComfyUI}
              disabled={isAutoDetecting}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-cyan-300 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer shrink-0 active:scale-95"
              title="Automatically search and detect ComfyUI installation on your system"
            >
              {isAutoDetecting ? (
                <>
                  <Loader2 size={15} className="animate-spin text-cyan-300" />
                  <span>Detecting...</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  <span>Auto-Detect</span>
                </>
              )}
            </button>
            {!installInfo?.cmmNodeInstalled && (
              <button
                type="button"
                onClick={handleInstallCmmNode}
                disabled={isCloningCmmNode}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-linear-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 border border-cyan-500/40 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-950/40 cursor-pointer shrink-0 disabled:opacity-50 active:scale-95"
                title="Git clone https://github.com/DevNullInc/ComfyUI-Model-Manager into custom_nodes/ (Currently Untested — please submit a bug report on GitHub if you encounter any issues!)"
              >
                {isCloningCmmNode ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Cloning...</span>
                  </>
                ) : (
                  <>
                    <GitBranch size={15} />
                    <span>Clone CMM Node <span className="text-[10px] text-amber-300 font-normal">(Untested)</span></span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* ComfyUI Server Endpoint & Live Canvas Bridge */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Radio size={14} className="text-cyan-400" />
                <span>ComfyUI Server Endpoint (Live Canvas & Workflow Bridge)</span>
              </label>
              {comfyStatus && (
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      comfyStatus.online
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        comfyStatus.online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                      }`}
                    />
                    <span>
                      {comfyStatus.online
                        ? `Connected (${comfyStatus.version || 'Online'})`
                        : 'Offline / Unreachable'}
                    </span>
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="http://127.0.0.1:8188"
                value={config.comfyui_server_url || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, comfyui_server_url: e.target.value }))}
                className="flex-1 bg-slate-950/80 border border-slate-700/80 rounded-xl px-4 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
              <button
                type="button"
                onClick={() => checkComfyConnection()}
                disabled={isCheckingComfyStatus}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-cyan-300 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer shrink-0 active:scale-95"
                title="Probe ComfyUI server status at this URL"
              >
                {isCheckingComfyStatus ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Wifi size={13} />
                    <span>Test Connection</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Default is <code className="font-mono text-cyan-300">http://127.0.0.1:8188</code>. Used to embed the live ComfyUI workspace and push workflows directly into the active graph.
            </p>
          </div>

          {/* Auto-Detect Feedback Toast/Banner */}
          {autoDetectFeedback && (
            <div
              className={`p-3 rounded-2xl text-xs flex items-center justify-between gap-2 border transition-all animate-fadeIn ${
                autoDetectFeedback.success
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {autoDetectFeedback.success ? (
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle size={16} className="shrink-0 text-amber-400" />
                )}
                <span>{autoDetectFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setAutoDetectFeedback(null)}
                className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Prompt to configure directory if empty */}
          {!config.comfyui_install_dir && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-amber-400" />
              <span>
                <strong>ComfyUI directory not set:</strong> Please enter your ComfyUI root path above (or click <strong>Auto-Detect</strong>). CMM will automatically configure your <code className="font-mono text-cyan-200">models/</code> directory and check your installation structure.
              </span>
            </div>
          )}

          {/* ComfyUI Structure Validation Breakdown */}
          {config.comfyui_install_dir && installInfo && (
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200">ComfyUI Core Program Structure:</span>
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      installInfo.valid
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {installInfo.valid
                      ? `Valid ComfyUI Installation (${installInfo.structure?.confidenceScore || 100}% Structure Match)`
                      : 'Incomplete ComfyUI Structure'}
                  </span>
                </div>
                {installInfo.inferred && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                    Resolved Subdirectory
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {/* 1. custom_nodes/ */}
                <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                  installInfo.structure?.hasCustomNodes
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                }`}>
                  {installInfo.structure?.hasCustomNodes ? (
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-[11px] truncate">custom_nodes/</div>
                    <div className="text-[10px] text-slate-400">
                      {installInfo.structure?.hasCustomNodes
                        ? `${installInfo.nodeCount} extension${installInfo.nodeCount !== 1 ? 's' : ''}`
                        : 'Directory missing'}
                    </div>
                  </div>
                </div>

                {/* 2. models/ */}
                <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                  installInfo.structure?.hasModelsDir
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                }`}>
                  {installInfo.structure?.hasModelsDir ? (
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-[11px] truncate">models/</div>
                    <div className="text-[10px] text-slate-400">
                      {installInfo.structure?.hasModelsDir
                        ? `${installInfo.structure.detectedModelSubdirs?.length || 0} subfolders detected`
                        : 'Directory missing'}
                    </div>
                  </div>
                </div>

                {/* 3. main.py */}
                <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                  installInfo.structure?.hasMainPy
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                }`}>
                  {installInfo.structure?.hasMainPy ? (
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-[11px] truncate">main.py</div>
                    <div className="text-[10px] text-slate-400">
                      {installInfo.structure?.hasMainPy ? 'Core entrypoint found' : 'Entrypoint missing'}
                    </div>
                  </div>
                </div>

                {/* 4. input/ */}
                <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                  installInfo.structure?.hasInputDir
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}>
                  {installInfo.structure?.hasInputDir ? (
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-[11px] truncate">input/</div>
                    <div className="text-[10px] text-slate-400">
                      {installInfo.structure?.hasInputDir ? 'Workflow uploads' : 'Not created yet'}
                    </div>
                  </div>
                </div>

                {/* 5. output/ */}
                <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                  installInfo.structure?.hasOutputDir
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}>
                  {installInfo.structure?.hasOutputDir ? (
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-[11px] truncate">output/</div>
                    <div className="text-[10px] text-slate-400">
                      {installInfo.structure?.hasOutputDir ? 'Generations folder' : 'Not created yet'}
                    </div>
                  </div>
                </div>

                {/* 6. extra_model_paths.yaml */}
                <div className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                  installInfo.structure?.hasExtraModelPaths
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}>
                  {installInfo.structure?.hasExtraModelPaths ? (
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-[11px] truncate">extra_model_paths</div>
                    <div className="text-[10px] text-slate-400">
                      {installInfo.structure?.hasExtraModelPaths ? 'External paths active' : 'Optional config'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Real-time Custom Nodes Detection Feedback */}
          {installInfo && installInfo.customNodesExist && (
            <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5 text-cyan-300">
                  <CheckCircle size={15} className="text-emerald-400" />
                  <span>Detected custom_nodes directory: <code className="font-mono text-[11px] text-cyan-100">{installInfo.customNodesDir}</code></span>
                </span>
              </div>

              {/* CMM Companion Custom Node Highlight Box */}
              {installInfo.cmmNodeInstalled ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-600/40 text-xs text-emerald-200 gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    <span>
                      <strong className="text-emerald-300">CMM Companion Node:</strong> Installed in <code className="font-mono text-emerald-100 bg-slate-900/80 px-1.5 py-0.5 rounded border border-emerald-800/60">{installInfo.cmmNodeFolderName || 'ComfyUI-Model-Manager'}</code>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <a
                      href="https://github.com/DevNullInc/ComfyUI-Model-Manager"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2"
                    >
                      <span>GitHub</span>
                      <ExternalLink size={12} />
                    </a>
                    <a
                      href="https://github.com/DevNullInc/ComfyUI-Model-Manager/issues"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-amber-300 hover:text-amber-200 font-semibold underline underline-offset-2"
                      title="Node is currently untested in live ComfyUI graphs. Click to report any bugs or feedback."
                    >
                      <span>Report Node Bug</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-xl bg-cyan-950/40 border border-cyan-700/50 text-xs text-cyan-200 gap-3">
                  <div className="flex items-start sm:items-center gap-2">
                    <Sparkles size={16} className="text-cyan-400 shrink-0 mt-0.5 sm:mt-0" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-cyan-100">Official Companion Custom Node</span>
                        <a
                          href="https://github.com/DevNullInc/ComfyUI-Model-Manager/issues"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 hover:text-amber-200 hover:bg-amber-500/30 font-bold border border-amber-500/40 transition-all cursor-pointer shadow-sm"
                          title="The companion node is completed but currently untested in live ComfyUI. Click to report bugs or track issues on GitHub."
                        >
                          <span>Currently Untested</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Clone <code className="text-cyan-300 font-mono text-[10px]">ComfyUI-Model-Manager</code> into your <code className="text-cyan-200 font-mono text-[10px]">custom_nodes/</code> to enable in-graph model downloading, workflow inspection, and live API bridge features. The node is currently untested in live ComfyUI graphs—please{' '}
                        <a
                          href="https://github.com/DevNullInc/ComfyUI-Model-Manager/issues"
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-300 hover:text-amber-200 underline font-semibold inline-flex items-center gap-0.5"
                        >
                          report bugs on GitHub
                          <ExternalLink size={10} />
                        </a>{' '}
                        if you encounter any issues.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleInstallCmmNode}
                      disabled={isCloningCmmNode}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-linear-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-950/50 cursor-pointer shrink-0 disabled:opacity-50 active:scale-95"
                      title="1-Click Git clone into custom_nodes/. (Currently Untested — please report issues on GitHub if you encounter problems!)"
                    >
                      {isCloningCmmNode ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Cloning Node...</span>
                        </>
                      ) : (
                        <>
                          <Download size={14} />
                          <span>1-Click Install Node (Untested)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {installInfo.installedNodes && installInfo.installedNodes.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-[11px] text-slate-400 font-medium">Installed Custom Nodes ({installInfo.installedNodes.length}):</div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1 pr-1 custom-scrollbar">
                    {installInfo.installedNodes.map((nodeName, nIdx) => {
                      const isCmm =
                        nodeName.toLowerCase() === 'comfyui-model-manager' ||
                        nodeName.toLowerCase() === 'comfyui_model_manager' ||
                        nodeName.toLowerCase() === 'comfyui-civitai-manager' ||
                        nodeName.toLowerCase() === 'comfyui-civitai-manager-node' ||
                        nodeName === installInfo.cmmNodeFolderName;
                      return (
                        <span
                          key={nIdx}
                          className={`px-2 py-0.5 rounded-lg border text-[11px] font-mono ${
                            isCmm
                              ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300 font-bold shadow-sm'
                              : 'bg-slate-900/90 border-slate-700/80 text-slate-300'
                          }`}
                        >
                          {nodeName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {installInfo && !installInfo.customNodesExist && config.comfyui_install_dir && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>No <code className="font-mono">custom_nodes/</code> folder found in the specified path. Ensure this points to the root directory containing ComfyUI's <code className="font-mono">main.py</code>.</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. ComfyUI Model Folders (Auto-Linked to Base Installation) */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
            <Folder className="text-purple-400" size={20} />
            <h2>ComfyUI Model Folders</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={config.comfyui_folders.length > 0 ? () => handleScaffoldFolders() : undefined}
              disabled={isScaffolding || config.comfyui_folders.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                config.comfyui_folders.length === 0
                  ? 'bg-slate-900/60 border border-slate-800/80 text-slate-500 cursor-not-allowed opacity-50'
                  : 'bg-slate-800 hover:bg-purple-900/30 border border-slate-700 hover:border-purple-500/50 text-purple-300 hover:text-purple-200 cursor-pointer active:scale-95'
              }`}
              title={
                config.comfyui_folders.length === 0
                  ? 'Please select or configure a main model folder first'
                  : 'Automatically build any missing standard ComfyUI model subfolders (checkpoints, loras, vae, controlnet, etc.) in your configured model directories'
              }
            >
              {isScaffolding ? (
                <Loader2 size={13} className="animate-spin text-purple-400" />
              ) : (
                <Sparkles size={13} className={config.comfyui_folders.length === 0 ? 'text-slate-600' : 'text-purple-400'} />
              )}
              <span className={config.comfyui_folders.length === 0 ? 'line-through text-slate-500' : ''}>
                Build Missing Subfolders
              </span>
            </button>
            <span className="text-xs text-slate-400">
              {config.comfyui_folders.length} folder{config.comfyui_folders.length !== 1 ? 's' : ''} configured
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Primary model directory is automatically populated from your ComfyUI base path above (<code className="text-purple-300 font-mono text-[11px]">/models</code>). You can also add secondary model directories (e.g. external SSDs, shared drives, or extra symlinked folders). If any standard model subfolders are missing, CMM automatically builds them based on ComfyUI's model directory layout.
        </p>

        {/* Scaffolding Feedback Toast */}
        {scaffoldFeedback && (
          <div
            className={`p-3 rounded-2xl text-xs flex items-center justify-between gap-2 border transition-all animate-fadeIn ${
              scaffoldFeedback.success
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {scaffoldFeedback.success ? (
                <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle size={16} className="shrink-0 text-rose-400" />
              )}
              <span>{scaffoldFeedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setScaffoldFeedback(null)}
              className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Add Folder Input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. D:\ComfyUI\models or /home/user/ComfyUI/models or E:\ExtraModels"
            value={newFolderInput}
            onChange={(e) => setNewFolderInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addFolder(); }}
            className="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono"
          />
          <button
            type="button"
            onClick={() => openFolderBrowser('addFolder')}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer shrink-0 active:scale-95"
            title="Browse for a model folder"
          >
            <Folder size={14} />
            <span>Browse</span>
          </button>
          <button
            onClick={addFolder}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
          >
            <FolderPlus size={16} />
            <span>Add Folder</span>
          </button>
        </div>

        {/* Folder List */}
        <div className="space-y-2 pt-1">
          {config.comfyui_folders.length === 0 ? (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>No model folders configured! Please set your ComfyUI directory above or add a folder path.</span>
            </div>
          ) : (
            config.comfyui_folders.map((folderPath, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-slate-900/70 p-3.5 rounded-2xl border border-slate-800 text-xs font-mono text-slate-200"
              >
                <div className="flex items-center gap-2.5 truncate flex-1 mr-3">
                  {idx === 0 ? (
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
                      <span>Primary</span>
                      {config.comfyui_install_dir && folderPath.toLowerCase().startsWith(config.comfyui_install_dir.toLowerCase()) && (
                        <span className="text-[9px] text-purple-200/80 font-normal">(Auto-Linked)</span>
                      )}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-bold uppercase tracking-wider shrink-0">
                      Secondary
                    </span>
                  )}
                  <span className="truncate">{folderPath}</span>
                </div>
                <button
                  onClick={() => removeFolder(idx)}
                  className="text-slate-500 hover:text-red-400 p-1.5 transition-colors cursor-pointer rounded-lg hover:bg-slate-800"
                  title="Remove folder"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Default Download Destination (if multiple folders) */}
        {config.comfyui_folders.length > 1 && (
          <div className="pt-4 border-t border-slate-800/80 space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <HardDrive size={14} className="text-purple-400" />
                <span>Default Download Destination</span>
              </label>
              {config.default_download_folder && (
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, default_download_folder: '' })}
                  className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 hover:underline cursor-pointer"
                >
                  Reset (Always Ask)
                </button>
              )}
            </div>
            <select
              value={config.default_download_folder || ''}
              onChange={(e) => setConfig({ ...config, default_download_folder: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500 font-mono cursor-pointer"
            >
              <option value="">Always ask when downloading (Prompt if multiple folders)</option>
              {config.comfyui_folders.map((folderPath, i) => (
                <option key={folderPath} value={folderPath}>
                  Folder #{i + 1} ({i === 0 ? 'Primary' : 'Secondary'}): {folderPath}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500">
              {config.default_download_folder
                ? `Downloads will automatically route into this folder without prompting.`
                : `A prompt will allow you to choose which ComfyUI folder to save models into whenever you start a download.`}
            </p>
          </div>
        )}
      </div>

      {/* 3. Complete System Backup & Restore (.ZIP) Card */}
      <div className="glass-panel p-6 rounded-3xl border border-purple-500/40 space-y-4 shadow-xl glow-purple relative overflow-hidden bg-slate-950/70">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
              <Archive size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-100">Complete System Backup & Restore (.ZIP)</h2>
                <span className="text-[10px] font-bold text-purple-300 bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded-md">
                  Database + Config + History
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Generates a complete <code className="text-purple-300 font-mono text-[11px]">.zip</code> archive containing your entire model catalog database, configuration, download history, and ignore lists. Use it to backup or migrate your entire CMM library to another machine.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {/* Create Backup Button */}
            <button
              onClick={handleCreateBackupZip}
              disabled={isExportingBackup}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-950/40 cursor-pointer disabled:opacity-50"
            >
              <Download size={15} />
              <span>{isExportingBackup ? 'Creating Backup...' : 'Create Backup (.ZIP)'}</span>
            </button>

            {/* Restore Backup Button */}
            <button
              onClick={handleTriggerRestore}
              disabled={isImportingBackup}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <Upload size={15} className="text-purple-400" />
              <span>{isImportingBackup ? 'Restoring...' : 'Restore Backup (.ZIP)'}</span>
            </button>

            {/* Quick Config Copy */}
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-slate-900/70 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              title="Copy current settings JSON to clipboard"
            >
              {copiedJson ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-slate-400" />}
              <span>{copiedJson ? 'Copied' : 'Copy Config'}</span>
            </button>

            {/* Quick Config Paste */}
            <button
              onClick={() => setShowPasteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-slate-900/70 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              title="Paste raw settings JSON"
            >
              <Code size={14} className="text-indigo-400" />
              <span>Paste Config</span>
            </button>
          </div>
        </div>
      </div>

      {/* CivitAI API & Credentials */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
          <Key className="text-indigo-400" size={20} />
          <h2>CivitAI API & Dual-Source Mirrors</h2>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                CivitAI API Key (Optional — for NSFW/Private Models & Higher Rate Limits)
              </label>
              <div className="flex items-center gap-2">
                {(config.has_civitai_api_key || (config.civitai_api_key && config.civitai_api_key.trim().length > 0)) && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium">
                    <Lock size={12} /> Encrypted & Active
                  </span>
                )}
                {(config.has_civitai_api_key || (config.civitai_api_key && config.civitai_api_key.trim().length > 0)) && (
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, civitai_api_key: '', has_civitai_api_key: false })}
                    className="text-[11px] px-2 py-0.5 text-rose-400 hover:bg-rose-500/15 border border-rose-500/30 rounded-lg transition-all cursor-pointer"
                  >
                    Clear Key
                  </button>
                )}
              </div>
            </div>
            <input
              type="password"
              placeholder={config.has_civitai_api_key ? '•••••••• (Enter new key to replace)' : 'Enter your CivitAI API Key...'}
              value={config.civitai_api_key || ''}
              onChange={(e) => setConfig({ ...config, civitai_api_key: e.target.value, has_civitai_api_key: e.target.value.length > 0 })}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Get an API key from{' '}
              <button
                type="button"
                onClick={() => {
                  if (window.civitaiAPI && typeof window.civitaiAPI.openExternal === 'function') {
                    window.civitaiAPI.openExternal('https://civitai.com/');
                  } else {
                    window.open('https://civitai.com/', '_blank', 'noopener,noreferrer');
                  }
                }}
                className="text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
              >
                CivitAI
              </button>
              : Account Settings → API Keys.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                API Base URL / Mirror (Dual-Source Support)
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, mirror_url: 'https://civitai.com/api/v1' })}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    !config.mirror_url || config.mirror_url === 'https://civitai.com/api/v1'
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 font-bold'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  CivitAI Official
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, mirror_url: 'https://civitai.red/api/v1' })}
                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
                    config.mirror_url === 'https://civitai.red/api/v1'
                      ? 'bg-rose-600/30 border-rose-500 text-rose-300 font-bold'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  CivitAI Red
                </button>
              </div>
            </div>
            <input
              type="text"
              placeholder="https://civitai.com/api/v1"
              value={config.mirror_url || ''}
              onChange={(e) => setConfig({ ...config, mirror_url: e.target.value })}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Supports civitai.com, civitai.red, or custom proxy endpoints.
            </p>
          </div>
        </div>
      </div>

      {/* Hugging Face Hub Credentials & CLI */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
            <span className="text-xl">🤗</span>
            <h2>Hugging Face Hub Integration</h2>
          </div>
          <button
            type="button"
            disabled={testingHf}
            onClick={async () => {
              setTestingHf(true);
              setHfStatus(null);
              try {
                if (window.civitaiAPI) {
                  const res = await window.civitaiAPI.hfValidateToken(config.huggingface_token);
                  if (res.valid) {
                    setHfStatus({ success: true, message: `Connected as ${res.username || 'user'}!` });
                  } else {
                    setHfStatus({ success: false, message: res.error || 'Invalid HF token' });
                  }
                }
              } catch (e: any) {
                setHfStatus({ success: false, message: e.message });
              } finally {
                setTestingHf(false);
              }
            }}
            className="px-3 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            {testingHf ? 'Testing...' : 'Test Connection'}
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                Hugging Face User Access Token (Optional — for gated models like FLUX.1, SD3, Llama)
              </label>
              <div className="flex items-center gap-2">
                {(config.has_huggingface_token || (config.huggingface_token && config.huggingface_token.trim().length > 0)) && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium">
                    <Lock size={12} /> Encrypted & Active
                  </span>
                )}
                {(config.has_huggingface_token || (config.huggingface_token && config.huggingface_token.trim().length > 0)) && (
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, huggingface_token: '', has_huggingface_token: false })}
                    className="text-[11px] px-2 py-0.5 text-rose-400 hover:bg-rose-500/15 border border-rose-500/30 rounded-lg transition-all cursor-pointer"
                  >
                    Clear Token
                  </button>
                )}
              </div>
            </div>
            <input
              type="password"
              placeholder={config.has_huggingface_token ? '•••••••• (Enter new token to replace)' : 'hf_...'}
              value={config.huggingface_token || ''}
              onChange={(e) => setConfig({ ...config, huggingface_token: e.target.value, has_huggingface_token: e.target.value.length > 0 })}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-yellow-500 font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Get an access token at{' '}
              <button
                type="button"
                onClick={() => {
                  if (window.civitaiAPI && typeof window.civitaiAPI.openExternal === 'function') {
                    window.civitaiAPI.openExternal('https://huggingface.co/settings/tokens');
                  } else {
                    window.open('https://huggingface.co/settings/tokens', '_blank', 'noopener,noreferrer');
                  }
                }}
                className="text-yellow-400 hover:text-yellow-300 hover:underline cursor-pointer"
              >
                huggingface.co/settings/tokens
              </button>
              . Required for gated models.
            </p>
          </div>

          {hfStatus && (
            <div className={`text-xs px-3 py-2 rounded-xl border ${
              hfStatus.success
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
            }`}>
              {hfStatus.message}
            </div>
          )}
        </div>
      </div>

      {/* Webhook Integration */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
          <DownloadCloud className="text-cyan-400" size={20} />
          <h2>Webhook Event Integration</h2>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                On Download Complete Webhook URL
              </label>
              <button
                type="button"
                disabled={testingWebhook === 'dl'}
                onClick={async () => {
                  const url = config.webhooks?.on_download_complete;
                  if (!url) {
                    setWebhookStatus({ type: 'dl', success: false, message: 'Please enter a webhook URL first.' });
                    return;
                  }
                  setTestingWebhook('dl');
                  setWebhookStatus(null);
                  try {
                    if (window.civitaiAPI) {
                      const res = await window.civitaiAPI.testWebhook(url, 'on_download_complete');
                      setWebhookStatus({
                        type: 'dl',
                        success: res.success,
                        message: res.success ? `Delivered successfully (HTTP ${res.status})!` : `Failed: ${res.error || res.status}`,
                      });
                    }
                  } catch (e: any) {
                    setWebhookStatus({ type: 'dl', success: false, message: e.message });
                  } finally {
                    setTestingWebhook(null);
                  }
                }}
                className="text-[10px] px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg font-semibold cursor-pointer"
              >
                {testingWebhook === 'dl' ? 'Testing...' : 'Test Webhook'}
              </button>
            </div>
            <input
              type="text"
              placeholder="http://localhost:8080/cmm/webhook"
              value={config.webhooks?.on_download_complete || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  webhooks: {
                    ...(config.webhooks || {}),
                    on_download_complete: e.target.value,
                  },
                })
              }
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
            {webhookStatus && webhookStatus.type === 'dl' && (
              <p className={`text-[11px] mt-1 ${webhookStatus.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {webhookStatus.message}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-300">
                On Update Available Webhook URL
              </label>
              <button
                type="button"
                disabled={testingWebhook === 'up'}
                onClick={async () => {
                  const url = config.webhooks?.on_update_available;
                  if (!url) {
                    setWebhookStatus({ type: 'up', success: false, message: 'Please enter a webhook URL first.' });
                    return;
                  }
                  setTestingWebhook('up');
                  setWebhookStatus(null);
                  try {
                    if (window.civitaiAPI) {
                      const res = await window.civitaiAPI.testWebhook(url, 'on_update_available');
                      setWebhookStatus({
                        type: 'up',
                        success: res.success,
                        message: res.success ? `Delivered successfully (HTTP ${res.status})!` : `Failed: ${res.error || res.status}`,
                      });
                    }
                  } catch (e: any) {
                    setWebhookStatus({ type: 'up', success: false, message: e.message });
                  } finally {
                    setTestingWebhook(null);
                  }
                }}
                className="text-[10px] px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg font-semibold cursor-pointer"
              >
                {testingWebhook === 'up' ? 'Testing...' : 'Test Webhook'}
              </button>
            </div>
            <input
              type="text"
              placeholder="http://localhost:8080/cmm/update"
              value={config.webhooks?.on_update_available || ''}
              onChange={(e) =>
                setConfig({
                  ...config,
                  webhooks: {
                    ...(config.webhooks || {}),
                    on_update_available: e.target.value,
                  },
                })
              }
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
            />
            {webhookStatus && webhookStatus.type === 'up' && (
              <p className={`text-[11px] mt-1 ${webhookStatus.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {webhookStatus.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Localhost HTTP API Bridge (Custom Nodes & Integrations) */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-slate-100 font-bold text-base">
            <Server className="text-emerald-400" size={20} />
            <h2>Localhost HTTP API Bridge</h2>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
              config.local_api_enabled !== false
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {config.local_api_enabled !== false ? 'API Active' : 'API Disabled'}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Enables local ComfyUI custom nodes, automation scripts, and workflow tools to query model statuses, parse raw workflow JSONs, and trigger automated downloads via <code className="text-emerald-300 font-mono text-[11px]">http://127.0.0.1:{config.local_api_port || 5174}</code>.
        </p>

        <div className="space-y-4 pt-1">
          {/* Main Enable/Disable Switch */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="space-y-0.5">
              <label className="text-xs font-bold text-slate-200 block cursor-pointer">
                Enable Localhost HTTP API Bridge
              </label>
              <p className="text-[11px] text-slate-400">
                When enabled, local applications and custom nodes on this computer can communicate with CMM.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.local_api_enabled !== false}
              onClick={() =>
                setConfig({
                  ...config,
                  local_api_enabled: config.local_api_enabled === false,
                })
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.local_api_enabled !== false ? 'bg-emerald-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  config.local_api_enabled !== false ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Port and Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                API Bridge Port (Default: 5174)
              </label>
              <input
                type="number"
                min="1024"
                max="65535"
                placeholder="5174"
                value={config.local_api_port || 5174}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    local_api_port: parseInt(e.target.value, 10) || 5174,
                  })
                }
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Port for the HTTP Bridge. Can also be overridden at launch via <code className="text-slate-400 font-mono">--api-port</code>.
              </p>
            </div>

            {/* Security Isolation Notice */}
            <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-800/40 text-emerald-300 text-xs flex items-start gap-2.5">
              <Lock size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-bold block mb-0.5">Strict Localhost Isolation</span>
                Sockets outside <code className="text-emerald-200 font-mono">127.0.0.1</code> and non-local browser origins are blocked for filesystem security.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content & NSFW Filtering */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
          <ShieldCheck className="text-emerald-400" size={20} />
          <h2>Content & NSFW Preferences</h2>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-300">
                NSFW Max Visible Level (1 = Soft, 5 = All)
              </label>
              <span className="text-xs font-bold text-purple-400">{config.nsfw_max_visible_level}</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              value={config.nsfw_max_visible_level}
              onChange={(e) =>
                setConfig({ ...config, nsfw_max_visible_level: parseInt(e.target.value, 10) })
              }
              className="w-full accent-purple-500 cursor-pointer"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={config.nsfw_blur_enabled}
              onChange={(e) => setConfig({ ...config, nsfw_blur_enabled: e.target.checked })}
              className="rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 w-4 h-4"
            />
            <span>Enable NSFW Blur on model preview cards</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={config.strict_hash_verification !== false}
              onChange={(e) => setConfig({ ...config, strict_hash_verification: e.target.checked })}
              className="rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 w-4 h-4"
            />
            <span>Strict SHA256 Hash Verification (If unchecked, warns but saves files with invalid CivitAI hashes)</span>
          </label>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Max Concurrent Downloads (Queue Amount)
              </label>
              <span className="text-xs font-bold text-indigo-400 font-mono">
                {config.max_concurrent_downloads ?? 2} simultaneous { (config.max_concurrent_downloads ?? 2) === 1 ? 'download' : 'downloads' }
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={config.max_concurrent_downloads ?? 2}
              onChange={(e) =>
                setConfig({ ...config, max_concurrent_downloads: parseInt(e.target.value, 10) })
              }
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Set how many models can download simultaneously (1 to 10). Lower values prevent bandwidth saturation on slower internet connections.
            </p>
          </div>
        </div>
      </div>

      {/* Auto-Sorting & Subfolder Routing Options */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
          <Folder className="text-blue-400" size={20} />
          <h2>Automated Subfolder Sorting</h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Duplicate File Strategy
            </label>
            <select
              value={config.conflict_strategy}
              onChange={(e) =>
                setConfig({ ...config, conflict_strategy: e.target.value as ConflictStrategy })
              }
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
            >
              <option value="rename">Rename automatically (e.g., model_1.safetensors)</option>
              <option value="overwrite">Overwrite existing file</option>
              <option value="skip">Skip download if file exists</option>
            </select>
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={config.organize_by.base_model}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    organize_by: { ...config.organize_by, base_model: e.target.checked },
                  })
                }
                className="rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 w-4 h-4"
              />
              <span>Separate models into Base Model subfolders</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={config.organize_by.creator}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    organize_by: { ...config.organize_by, creator: e.target.checked },
                  })
                }
                className="rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 w-4 h-4"
              />
              <span>Separate models into Creator subfolders</span>
            </label>
          </div>
        </div>
      </div>

      {/* Regex Pattern Rules */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4 shadow-xl">
        <h2 className="text-base font-bold text-slate-100">Advanced Filename Pattern Routing</h2>
        <p className="text-xs text-slate-400">
          Models matching these regex patterns automatically route directly to specialized ComfyUI subfolders.
        </p>

        {/* Add Pattern */}
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Regex pattern (e.g. ip-adapter|photomaker|\.gguf$)"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            className="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Target folder (e.g. ipadapter)"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            className="w-48 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
          />
          <button
            onClick={addPatternRule}
            className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-colors shadow-md cursor-pointer"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Pattern List */}
        <div className="max-h-60 overflow-y-auto space-y-2 pt-2">
          {config.advanced_mappings.filename_patterns.map((rule, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between bg-slate-900/70 p-3 rounded-xl border border-slate-800 text-xs"
            >
              <div className="flex items-center gap-3 font-mono">
                <span className="text-purple-300 font-semibold">{rule.pattern}</span>
                <span className="text-slate-600">→</span>
                <span className="text-emerald-400 font-bold">{rule.folder}/</span>
              </div>
              <button
                onClick={() => removePatternRule(idx)}
                className="text-slate-500 hover:text-red-400 p-1 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Application Lifecycle Control */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-5 shadow-xl">
        <h2 className="text-base font-bold text-slate-100 flex items-center gap-2.5">
          <Power size={20} className="text-purple-400" />
          <span>Application Control</span>
        </h2>
        <p className="text-xs text-slate-400">
          Restart the app to refresh system caches or shut down all background listeners.
        </p>
        <div className="flex gap-4">
          <button
            onClick={handleRestart}
            disabled={!!appAction}
            className="flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            <RefreshCw size={16} className={appAction === 'restarting' ? 'animate-spin' : ''} />
            <span>{appAction === 'restarting' ? 'Restarting...' : 'Restart App'}</span>
          </button>
          <button
            onClick={handleShutdown}
            disabled={!!appAction}
            className="flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-red-600/20 cursor-pointer"
          >
            <Power size={16} />
            <span>{appAction === 'shutting-down' ? 'Shutting Down...' : 'Shut Down'}</span>
          </button>
        </div>
      </div>

      {/* Paste JSON Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn" onClick={() => setShowPasteModal(false)}>
          <div className="glass-panel bg-slate-950 border border-purple-500/40 p-6 rounded-3xl max-w-xl w-full space-y-4 shadow-2xl glow-purple" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-100">
                <Code size={18} className="text-purple-400" />
                <span>Paste Settings JSON</span>
              </div>
              <button
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Paste the exported JSON payload below to immediately apply and persist your configuration.
            </p>

            <textarea
              rows={10}
              placeholder='{ "settings": { "comfyui_folders": [...] } }'
              value={pastedJsonText}
              onChange={(e) => setPastedJsonText(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-purple-500"
            />

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePasteImportSubmit}
                disabled={!pastedJsonText.trim()}
                className="px-5 py-2 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-purple-600/30 cursor-pointer"
              >
                Apply & Save JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {folderBrowser && (
        <FolderBrowserModal
          open
          title={folderBrowser.target === 'install' ? 'Select ComfyUI Installation Folder' : 'Select Model Folder'}
          initialPath={folderBrowser.start}
          onSelect={handleFolderBrowserSelect}
          onCancel={() => setFolderBrowser(null)}
        />
      )}

      {/* Debug Console */}
      <div className="glass-panel p-4 rounded-3xl border border-slate-800 space-y-3 shadow-xl">
        <button
          type="button"
          onClick={() => setShowDebugLog((v) => !v)}
          className="flex items-center gap-2 text-xs font-bold text-slate-200 hover:text-white cursor-pointer"
        >
          <Terminal size={14} className="text-cyan-400" />
          <span>Debug Console {debugLog.length > 0 ? `(${debugLog.length})` : ''}</span>
          <span className="text-[10px] text-slate-500">{showDebugLog ? '▼ hide' : '▶ show'}</span>
        </button>
        {showDebugLog && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDebugLog([])}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const cfg = await (window as any).civitaiAPI?.getConfig?.();
                    appendDebug(`MANUAL getConfig folders=${JSON.stringify(cfg?.comfyui_folders)} install_dir=${cfg?.comfyui_install_dir}`);
                  } catch (e: any) {
                    appendDebug(`MANUAL getConfig error: ${e?.message || e}`);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-cyan-900/30 hover:bg-cyan-800/40 border border-cyan-700/30 text-[11px] text-cyan-300 cursor-pointer"
              >
                Refresh from DB
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[11px] leading-5 whitespace-pre-wrap break-all select-text cursor-text">
              {debugLog.length === 0 ? (
                <span className="text-slate-500 select-text">No debug entries yet. Save settings to see payload ↔ DB verify.</span>
              ) : (
                debugLog.map((l, i) => (
                  <div
                    key={i}
                    className={`select-text ${
                      l.includes('MISMATCH') ? 'text-amber-300' : l.includes('VERIFY OK') ? 'text-emerald-300' : 'text-slate-300'
                    }`}
                  >
                    {l}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
