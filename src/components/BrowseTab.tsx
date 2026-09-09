/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Eye,
  EyeOff,
  Star,
  HardDrive,
  User,
  ExternalLink,
  X,
  CheckCircle2,
  Sparkles,
  Layers,
  Calendar,
  RefreshCw,
  Terminal,
  Code2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  Box,
  Heart,
} from 'lucide-react';
import { FallbackImage } from './FallbackImage';
import { CivitAIModel, CivitAIModelVersion, ModelType, SearchParams } from '../types/civitai';
import { LocalModel } from '../types/app';

export interface DebugInfo {
  timestamp: string;
  durationMs?: number;
  status: 'idle' | 'loading' | 'success' | 'error';
  requestParams: Record<string, any>;
  apiUrl: string;
  resultCount?: number;
  error?: string;
}

const DEFAULT_BASE_MODELS = [
  'All',
  'SD 1.5',
  'SDXL 1.0',
  'SD 3.5',
  'Pony',
  'Illustrious',
  'NoobAI',
  'Flux.1 D',
  'Flux.1 S',
  'Wan Video',
  'CogVideoX',
  'Hunyuan Video',
  'Qwen',
];

export function mapCivitaiNsfwLevel(nsfwLevel?: number | boolean): number {
  if (typeof nsfwLevel === 'boolean') return nsfwLevel ? 4 : 1;
  if (typeof nsfwLevel !== 'number') return 1;
  // CivitAI bitflags: 1=PG, 2=PG13, 4=R, 8=X, 16=XXX, 32=Blocked
  if (nsfwLevel >= 16) return 5; // XXX
  if (nsfwLevel >= 8) return 4;  // X
  if (nsfwLevel >= 4) return 3;  // R
  if (nsfwLevel >= 2) return 2;  // PG13
  return 1; // PG
}

export function isModelNsfwOrMature(model: CivitAIModel): boolean {
  if (model.nsfw === true) return true;
  if (typeof model.nsfwLevel === 'number' && model.nsfwLevel >= 4) return true;
  const firstVersion = model.modelVersions?.[0];
  const firstImg = firstVersion?.images?.[0];
  if (
    firstImg?.nsfw === true ||
    firstImg?.nsfw === 'Mature' ||
    firstImg?.nsfw === 'X' ||
    firstImg?.nsfw === 'Explicit'
  ) {
    return true;
  }
  if (typeof firstImg?.nsfwLevel === 'number' && firstImg.nsfwLevel >= 4) {
    return true;
  }
  return false;
}

interface BrowseTabProps {
  onQueueDownload: (
    model: CivitAIModel,
    version: CivitAIModelVersion,
    options?: { deleteOldVersionFile?: string; deleteOldModelId?: string }
  ) => void;
  initialQuery?: string;
  initialModelId?: number;
}

export const BrowseTab: React.FC<BrowseTabProps> = ({ onQueueDownload, initialQuery, initialModelId }) => {
  const [models, setModels] = useState<CivitAIModel[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Local Library State & Ignored Updates
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [ignoredUpdates, setIgnoredUpdates] = useState<{ modelId: number; versionId: number }[]>([]);
  const [deleteOldOnUpdate, setDeleteOldOnUpdate] = useState<boolean>(false);

  useEffect(() => {
    if (initialQuery !== undefined && initialQuery !== '') {
      setQuery(initialQuery);
      setCurrentPage(1);
      setPageCursors({});
      fetchModels(1, '', initialQuery);
    }
  }, [initialQuery]);

  // Navigated from a library update badge: open the exact CivitAI model page directly.
  useEffect(() => {
    if (typeof initialModelId !== 'number' || Number.isNaN(initialModelId)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const modelId = initialModelId;
        const model = await window.civitaiAPI.getModel(modelId);
        if (cancelled) return;
        if (!model) {
          setError(
            `Model #${modelId} could not be fetched from CivitAI. It may have been removed.`
          );
          return;
        }
        setModels([model]);
        setMetadata({ totalItems: 1, currentPage: 1, pageSize: 1, totalPages: 1 });
        setCurrentPage(1);
        setPageCursors({});
      } catch (e: any) {
        if (!cancelled) setError(`Failed to load model #${initialModelId}: ${e?.message || e}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialModelId]);

  // Debug Diagnostics
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    timestamp: new Date().toLocaleTimeString(),
    status: 'idle',
    requestParams: {},
    apiUrl: 'https://civitai.com/api/v1/models',
  });

  // Settings & Filters — revert to defaults on app launch. They persist automatically
  // across tab switches (tabs stay mounted), but are intentionally NOT restored from
  // localStorage so a fresh start always shows the stock filters.
  const [maxNsfwLevel, setMaxNsfwLevel] = useState<number>(5);
  const [query, setQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedBaseModel, setSelectedBaseModel] = useState<string>('All');
  const [sort, setSort] = useState<'Most Downloaded' | 'Highest Rated' | 'Newest' | 'Most Liked'>('Most Downloaded');
  const [period, setPeriod] = useState<'AllTime' | 'Year' | 'Month' | 'Week' | 'Day'>('AllTime');
  const [nsfwBlur, setNsfwBlur] = useState<boolean>(true);
  const [includeNsfw, setIncludeNsfw] = useState<boolean>(false);

  // Dynamic Base Models with localStorage Cache & Loading State
  const [baseModels, setBaseModels] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem('civitai_cached_base_models');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {}
    return DEFAULT_BASE_MODELS;
  });
  const [loadingBases, setLoadingBases] = useState<boolean>(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageCursors, setPageCursors] = useState<{ [page: number]: string }>({});
  const [metadata, setMetadata] = useState<{
    totalItems?: number;
    currentPage?: number;
    pageSize?: number;
    totalPages?: number;
    nextPage?: string;
    prevPage?: string;
    nextCursor?: string;
  }>({});

  // Detail Modal
  const [activeModel, setActiveModel] = useState<CivitAIModel | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<CivitAIModelVersion | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  // Dual-Source Search: CivitAI vs Hugging Face
  const [searchSource, setSearchSource] = useState<'civitai' | 'huggingface'>('civitai');
  const [hfModels, setHfModels] = useState<any[]>([]);
  const [hfLoading, setHfLoading] = useState<boolean>(false);
  const [hfError, setHfError] = useState<string | null>(null);
  const [activeHfModel, setActiveHfModel] = useState<any | null>(null);
  const [activeHfFiles, setActiveHfFiles] = useState<{ safetensorsFiles: string[]; ggufFiles: string[]; siblings: any[] } | null>(null);
  const [loadingHfFiles, setLoadingHfFiles] = useState<boolean>(false);
  const [hfDownloadSuccess, setHfDownloadSuccess] = useState<string | null>(null);

  const fetchHfModels = async (searchQuery?: string) => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.hfSearchModels !== 'function') return;
    setHfLoading(true);
    setHfError(null);
    try {
      const q = searchQuery !== undefined ? searchQuery : query;
      const results = await window.civitaiAPI.hfSearchModels(q.trim() || 'flux', 48);
      setHfModels(results || []);
    } catch (err: any) {
      setHfError(err?.message || 'Failed to search Hugging Face Hub');
    } finally {
      setHfLoading(false);
    }
  };

  const openHfModelDetails = async (hfModel: any) => {
    setActiveHfModel(hfModel);
    setActiveHfFiles(null);
    setLoadingHfFiles(true);
    setHfDownloadSuccess(null);
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.hfCheckModel === 'function') {
        const res = await window.civitaiAPI.hfCheckModel(hfModel.id);
        if (res && res.exists) {
          setActiveHfFiles({
            safetensorsFiles: res.safetensorsFiles || [],
            ggufFiles: res.ggufFiles || [],
            siblings: res.info?.siblings || [],
          });
        } else {
          setHfError(res?.error || 'Could not fetch repository files.');
        }
      }
    } catch (e: any) {
      console.error('Failed to fetch HF repo siblings:', e);
    } finally {
      setLoadingHfFiles(false);
    }
  };

  const downloadHfFile = async (repo: any, filename: string, size?: number) => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.addDownload !== 'function') return;
    try {
      const config = await window.civitaiAPI.getConfig();
      const rawFolders = (config?.comfyui_folders && config.comfyui_folders.length > 0)
        ? config.comfyui_folders
        : (config?.comfyui_root ? [config.comfyui_root] : []);
      const folders = rawFolders.filter(Boolean);
      const targetRoot = config?.default_download_folder || folders[0] || '';

      const isGguf = filename.toLowerCase().endsWith('.gguf');
      const cleanFileName = filename.split('/').pop() || filename;

      await window.civitaiAPI.addDownload({
        source: 'huggingface',
        hfRepoId: repo.id,
        modelVersionId: 0,
        modelId: 0,
        modelName: repo.modelName || repo.id,
        versionName: 'main',
        modelType: isGguf ? 'GGUF' : 'Checkpoint',
        baseModel: '',
        creator: repo.author || '',
        fileName: cleanFileName,
        downloadUrl: `https://huggingface.co/${repo.id}/resolve/main/${filename}`,
        sizeKB: size ? Math.round(size / 1024) : 0,
        targetRoot,
      });

      setHfDownloadSuccess(`Queued download for ${cleanFileName}`);
      setTimeout(() => setHfDownloadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Failed to add HF download:', err);
    }
  };

  const modelTypes: string[] = [
    'All',
    'Checkpoint',
    'LORA',
    'LoCon',
    'DoRA',
    'TextualInversion',
    'Hypernetwork',
    'VAE',
    'Controlnet',
    'Upscaler',
    'MotionModule',
    'Wildcards',
    'Workflows',
    'Detection',
  ];

  const PAGE_SIZE = 48;

  const fetchModels = async (pageToFetch?: number, cursorOverride?: string, queryOverride?: string) => {
    const pageNum = pageToFetch ?? currentPage;
    const effectiveQuery = queryOverride !== undefined ? queryOverride : query;
    const initialCursor = cursorOverride !== undefined ? cursorOverride : (pageNum > 1 ? pageCursors[pageNum] : undefined);

    setLoading(true);
    setError(null);
    const startTime = performance.now();

    try {
      const collected: CivitAIModel[] = [];
      let currentCursor = initialCursor;
      let finalNextCursor: string | undefined = undefined;
      let lastMeta: any = { currentPage: pageNum, pageSize: PAGE_SIZE };
      let iterations = 0;
      const maxIterations = 8; // Auto-accumulate up to 8 batches (up to 800 CivitAI items) to fill 48 clean items

      while (collected.length < PAGE_SIZE && iterations < maxIterations) {
        iterations++;
        const requestLimit = (!includeNsfw || maxNsfwLevel < 5) ? 100 : PAGE_SIZE;

        const params: SearchParams = {
          query: effectiveQuery.trim() || undefined,
          types: selectedType !== 'All' ? [selectedType as ModelType] : undefined,
          baseModels: selectedBaseModel !== 'All' ? [selectedBaseModel] : undefined,
          sort,
          period,
          nsfw: includeNsfw,
          limit: requestLimit,
          page: pageNum,
          cursor: currentCursor,
        };

        let result: any = { items: [] };
        if (window.civitaiAPI) {
          result = await window.civitaiAPI.searchModels(params);
        }

        const items: CivitAIModel[] = result?.items || [];
        lastMeta = result?.metadata || lastMeta;

        // Filter items according to NSFW preferences
        const passing = items.filter((model) => {
          const isNsfw = isModelNsfwOrMature(model);
          const level = mapCivitaiNsfwLevel(model.nsfwLevel ?? (model.nsfw ? 4 : 1));

          if (!includeNsfw) {
            if (isNsfw || level > 2) return false;
          } else {
            if (level > maxNsfwLevel) return false;
          }
          return true;
        });

        collected.push(...passing);

        // Find next cursor from metadata or nextPage
        let nextCur = lastMeta.nextCursor;
        if (!nextCur && lastMeta.nextPage) {
          try {
            const parsedUrl = new URL(lastMeta.nextPage);
            const c = parsedUrl.searchParams.get('cursor');
            if (c) nextCur = c;
          } catch (e) {}
        }

        finalNextCursor = nextCur;
        currentCursor = nextCur;

        // If no more items returned or no next cursor, end of catalog reached
        if (!nextCur || items.length === 0) {
          break;
        }

        // If we filled our 48 items, stop
        if (collected.length >= PAGE_SIZE) {
          break;
        }
      }

      const finalItems = collected.slice(0, PAGE_SIZE);
      const durationMs = Math.round(performance.now() - startTime);

      setModels(finalItems);
      setMetadata({
        ...lastMeta,
        currentPage: pageNum,
        pageSize: PAGE_SIZE,
        nextCursor: finalNextCursor,
      });

      if (finalNextCursor) {
        setPageCursors((prev) => ({
          ...prev,
          [pageNum + 1]: finalNextCursor,
        }));
      }

      setDebugInfo({
        timestamp: new Date().toLocaleTimeString(),
        durationMs,
        status: 'success',
        requestParams: { query: effectiveQuery, selectedType, selectedBaseModel, sort, period, includeNsfw, pageNum },
        apiUrl: `https://civitai.com/api/v1/models?limit=${PAGE_SIZE}&page=${pageNum}`,
        resultCount: finalItems.length,
      });
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - startTime);
      const errMsg = err?.message || 'Failed to fetch models from CivitAI';
      setError(errMsg);
      setModels([]);
      setDebugInfo({
        timestamp: new Date().toLocaleTimeString(),
        durationMs,
        status: 'error',
        requestParams: {},
        apiUrl: 'https://civitai.com/api/v1/models',
        resultCount: 0,
        error: errMsg,
      });
      setShowDebug(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadBaseModels = async () => {
      setLoadingBases(true);
      try {
        if (window.civitaiAPI) {
          const enums = await window.civitaiAPI.getEnums();
          if (enums && Array.isArray(enums.baseModels) && enums.baseModels.length > 0) {
            const cleanBases: string[] = Array.from(new Set(enums.baseModels.filter(Boolean)));
            cleanBases.sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
            const populated = ['All', ...cleanBases];
            setBaseModels(populated);
            localStorage.setItem('civitai_cached_base_models', JSON.stringify(populated));
          }
        }
      } catch (err) {
        console.warn('Failed to load CivitAI base model enums:', err);
      } finally {
        setLoadingBases(false);
      }
    };

    loadBaseModels();
  }, []);

  // Load configuration for NSFW visibility levels
  useEffect(() => {
    if (window.civitaiAPI) {
      window.civitaiAPI
        .getConfig()
        .then((cfg) => {
          if (typeof cfg?.nsfw_max_visible_level === 'number') {
            setMaxNsfwLevel(cfg.nsfw_max_visible_level);
          }
          if (typeof cfg?.nsfw_blur_enabled === 'boolean') {
            setNsfwBlur(cfg.nsfw_blur_enabled);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Fetch models on initial mount or when filters change (resets to page 1)
  useEffect(() => {
    setCurrentPage(1);
    setPageCursors({});
    fetchModels(1, '');
  }, [selectedType, selectedBaseModel, sort, period, includeNsfw, maxNsfwLevel]);

  // Models are already filtered and stacked to exactly 48 items in fetchModels
  const displayedModels = models;

  // Fetch local library models and ignored updates list
  const fetchLocalLibraryStatus = async () => {
    try {
      if (window.civitaiAPI) {
        const [models, ignored] = await Promise.all([
          window.civitaiAPI.getLocalModels(),
          typeof window.civitaiAPI.getIgnoredUpdates === 'function' ? window.civitaiAPI.getIgnoredUpdates() : [],
        ]);
        if (models) setLocalModels(models);
        if (ignored) setIgnoredUpdates(ignored);
      }
    } catch (e) {
      console.error('Failed to load local models in BrowseTab:', e);
    }
  };

  useEffect(() => {
    fetchLocalLibraryStatus();
  }, []);

  // Map of civitaiModelId -> Set of installed civitaiVersionIds
  const installedMap = React.useMemo(() => {
    const map = new Map<number, Set<number>>();
    localModels.forEach((m) => {
      if (m.civitaiModelId) {
        if (!map.has(m.civitaiModelId)) {
          map.set(m.civitaiModelId, new Set<number>());
        }
        if (m.civitaiVersionId) {
          map.get(m.civitaiModelId)!.add(m.civitaiVersionId);
        }
      }
    });
    return map;
  }, [localModels]);

  // Set of `${modelId}_${versionId}` marked as ignored
  const ignoredSet = React.useMemo(() => {
    const set = new Set<string>();
    ignoredUpdates.forEach((item) => {
      set.add(`${item.modelId}_${item.versionId}`);
    });
    return set;
  }, [ignoredUpdates]);

  // Helper to determine status for a model in the browse grid
  const getModelInstallStatus = (model: CivitAIModel) => {
    const installedVersions = installedMap.get(model.id);
    if (!installedVersions || installedVersions.size === 0) {
      return { isInstalled: false, hasUpdate: false, installedVersions: new Set<number>() };
    }

    let hasUninstalledNewer = false;
    let latestUnignoredVersion: CivitAIModelVersion | undefined;

    if (model.modelVersions && model.modelVersions.length > 0) {
      // Newest upload date among ALL installed versions of this model. When the model is
      // installed for multiple consumers, the date check defaults to the LATEST installed
      // date, so a file uploaded between two installs is never flagged as an update as long
      // as the newest upload is already installed.
      let newestInstalledDate = 0;
      for (const iv of model.modelVersions) {
        if (installedVersions.has(iv.id)) {
          const d = new Date(iv.publishedAt || iv.createdAt || 0).getTime();
          if (Number.isFinite(d) && d > newestInstalledDate) newestInstalledDate = d;
        }
      }

      // Sort by upload/publish date (newest first) so the "latest" is a date decision and
      // older uploads that happen to sit at index 0 are never reported as an update.
      const byDate = [...model.modelVersions].sort((a, b) => {
        const da = new Date(a.publishedAt || a.createdAt || 0).getTime();
        const db = new Date(b.publishedAt || b.createdAt || 0).getTime();
        return db - da;
      });
      for (const ver of byDate) {
        const isInstalled = installedVersions.has(ver.id);
        const isIgnored = ignoredSet.has(`${model.id}_${ver.id}`);
        const vDate = new Date(ver.publishedAt || ver.createdAt || 0).getTime();
        if (
          !isInstalled &&
          !isIgnored &&
          Number.isFinite(vDate) &&
          vDate > newestInstalledDate
        ) {
          hasUninstalledNewer = true;
          latestUnignoredVersion = ver;
          break;
        }
      }
    }

    return {
      isInstalled: true,
      hasUpdate: hasUninstalledNewer,
      updateVersion: latestUnignoredVersion,
      installedVersions,
    };
  };

  const handleIgnoreVersion = async (modelId: number, versionId: number) => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.ignoreModelUpdate !== 'function') return;
    try {
      await window.civitaiAPI.ignoreModelUpdate(modelId, versionId);
      await fetchLocalLibraryStatus();
    } catch (e) {
      console.error('Failed to ignore update:', e);
    }
  };

  const handleUnignoreVersion = async (modelId: number, versionId: number) => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.unignoreModelUpdate !== 'function') return;
    try {
      await window.civitaiAPI.unignoreModelUpdate(modelId, versionId);
      await fetchLocalLibraryStatus();
    } catch (e) {
      console.error('Failed to unignore update:', e);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchSource === 'huggingface') {
      fetchHfModels(query);
    } else {
      setCurrentPage(1);
      setPageCursors({});
      fetchModels(1, '');
    }
  };

  const handleClearFilters = () => {
    setQuery('');
    setSelectedType('All');
    setSelectedBaseModel('All');
    setCurrentPage(1);
    setPageCursors({});
    if (searchSource === 'huggingface') {
      fetchHfModels('');
    } else {
      fetchModels(1, '', '');
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    setCurrentPage(newPage);
    const targetCursor = newPage === 1 ? '' : (pageCursors[newPage] || undefined);
    fetchModels(newPage, targetCursor);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openModelDetails = (model: CivitAIModel) => {
    setActiveModel(model);
    setDeleteOldOnUpdate(false);
    if (model.modelVersions && model.modelVersions.length > 0) {
      setSelectedVersion(model.modelVersions[0]);
    } else {
      setSelectedVersion(null);
    }
  };

  const triggerDownload = (version: CivitAIModelVersion) => {
    if (!activeModel) return;
    const oldInstalledModel = (deleteOldOnUpdate && activeModel)
      ? localModels.find((m) => m.civitaiModelId === activeModel.id)
      : undefined;

    onQueueDownload(activeModel, version, {
      deleteOldVersionFile: oldInstalledModel?.filePath,
      deleteOldModelId: oldInstalledModel?.id,
    });
    setDownloadSuccess(`Queued download for ${activeModel.name} (${version.name})`);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const formatCount = (count?: number): string => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2">
            <span>Discover AI Models</span>
            <Sparkles size={24} className="text-purple-400 animate-pulse" />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Search across CivitAI and Hugging Face with direct ComfyUI folder auto-sorting.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Dual-Source Toggle */}
          <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-700/60 shadow-inner">
            <button
              type="button"
              onClick={() => {
                setSearchSource('civitai');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                searchSource === 'civitai'
                  ? 'bg-linear-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>CivitAI</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchSource('huggingface');
                if (hfModels.length === 0) {
                  fetchHfModels(query || 'flux');
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                searchSource === 'huggingface'
                  ? 'bg-linear-to-r from-amber-500 to-yellow-600 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>🤗 Hugging Face</span>
            </button>
          </div>

          <div className="relative flex-1 md:w-80">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${searchSource === 'huggingface' ? 'text-amber-400' : 'text-purple-400'}`} size={18} />
            <input
              type="text"
              placeholder={searchSource === 'huggingface' ? 'Search Hugging Face models (e.g. flux, wan, sdxl)...' : 'Search checkpoints, LoRAs, ControlNets...'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`w-full bg-slate-900/90 border rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all shadow-inner ${
                searchSource === 'huggingface'
                  ? 'border-amber-500/40 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20'
                  : 'border-slate-700/60 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20'
              }`}
            />
          </div>
          <button
            type="submit"
            className={`px-5 py-2.5 font-semibold text-sm rounded-xl transition-all shadow-lg flex items-center gap-2 cursor-pointer ${
              searchSource === 'huggingface'
                ? 'bg-linear-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-bold shadow-amber-600/20'
                : 'bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/25'
            }`}
          >
            <span>Search</span>
          </button>
        </form>
      </div>

      {/* Filter Toolbar (CivitAI) or Hub Banner (Hugging Face) */}
      {searchSource === 'civitai' ? (
        <div className="glass-panel p-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between text-sm shadow-xl">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Model Type */}
            <div className="flex items-center gap-2 bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-800 shadow-sm">
              <Filter size={15} className="text-purple-400" />
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Type:</span>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="bg-transparent text-slate-100 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                {modelTypes.map((t) => (
                  <option key={t} value={t} className="bg-slate-900 text-slate-100">
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Base Model */}
            <div className="flex items-center gap-2 bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-800 shadow-sm">
              <HardDrive size={15} className="text-indigo-400" />
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Base:</span>
              {loadingBases && (
                <span title="Refreshing CivitAI base models...">
                  <RefreshCw size={12} className="animate-spin text-indigo-400" />
                </span>
              )}
              <select
                value={selectedBaseModel}
                onChange={(e) => setSelectedBaseModel(e.target.value)}
                className="bg-transparent text-slate-100 text-xs font-semibold focus:outline-none cursor-pointer max-w-[150px] truncate"
              >
                {baseModels.map((b) => (
                  <option key={b} value={b} className="bg-slate-900 text-slate-100">
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2 bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-800 shadow-sm">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Sort:</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="bg-transparent text-slate-100 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="Most Downloaded" className="bg-slate-900">Most Downloaded</option>
                <option value="Highest Rated" className="bg-slate-900">Highest Rated</option>
                <option value="Newest" className="bg-slate-900">Newest</option>
                <option value="Most Liked" className="bg-slate-900">Most Liked</option>
              </select>
            </div>

            {/* Clear Filters */}
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-800/60 transition-colors text-xs font-semibold cursor-pointer"
              title="Reset all filters and query"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Period */}
            <div className="flex items-center gap-2 bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-800 shadow-sm">
              <Calendar size={15} className="text-indigo-400" />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as any)}
                className="bg-transparent text-slate-100 text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="AllTime" className="bg-slate-900">All Time</option>
                <option value="Year" className="bg-slate-900">Year</option>
                <option value="Month" className="bg-slate-900">Month</option>
                <option value="Week" className="bg-slate-900">Week</option>
                <option value="Day" className="bg-slate-900">Day</option>
              </select>
            </div>

            {/* NSFW Toggle */}
            <button
              onClick={() => setIncludeNsfw(!includeNsfw)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all font-semibold ${
                includeNsfw
                  ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{includeNsfw ? 'NSFW Allowed' : 'Safe Only'}</span>
            </button>

            {includeNsfw && (
              <button
                onClick={() => setNsfwBlur(!nsfwBlur)}
                className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 hover:bg-amber-500/20 transition-all font-semibold"
              >
                {nsfwBlur ? <EyeOff size={14} className="text-amber-400" /> : <Eye size={14} className="text-slate-400" />}
                <span>{nsfwBlur ? 'Blur NSFW' : 'Show Unblurred'}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="glass-panel p-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between text-sm shadow-xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
            <span className="text-base">🤗</span>
            <span>Browsing <strong>Hugging Face Hub</strong> model repositories. Gated models automatically use your configured token.</span>
          </div>
          <button
            onClick={() => fetchHfModels(query)}
            disabled={hfLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <RefreshCw size={12} className={hfLoading ? 'animate-spin text-amber-400' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      )}

      {/* Model Cards Grid: Hugging Face vs CivitAI */}
      {searchSource === 'huggingface' ? (
        hfLoading ? (
          <div className="flex flex-col items-center justify-center py-28 space-y-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 glow-amber"></div>
            <span className="text-xs text-slate-400 font-medium">Querying Hugging Face repositories...</span>
          </div>
        ) : hfError ? (
          <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
            <span>{hfError}</span>
          </div>
        ) : hfModels.length === 0 ? (
          <div className="text-center py-28 text-slate-500 text-sm glass-panel rounded-2xl">
            No Hugging Face models found matching "{query}". Try searching for popular models like "flux", "wan", "sdxl", or "qwen".
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {hfModels.map((hf) => {
              const parts = (hf.id || '').split('/');
              const author = parts.length > 1 ? parts[0] : (hf.author || 'community');
              const repoTitle = parts.length > 1 ? parts[1] : hf.id;
              const safetensorsCount = (hf.siblings || []).filter((s: any) => s.rfilename?.toLowerCase().endsWith('.safetensors')).length;
              const ggufCount = (hf.siblings || []).filter((s: any) => s.rfilename?.toLowerCase().endsWith('.gguf')).length;

              return (
                <div
                  key={hf.id}
                  onClick={() => openHfModelDetails(hf)}
                  className="glass-card rounded-2xl overflow-hidden cursor-pointer flex flex-col group border border-slate-800/80 hover:border-amber-500/50 relative p-5 justify-between transition-all hover:scale-[1.01]"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                        <Box size={20} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {hf.gated && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-amber-500/20 border border-amber-500/40 text-amber-300">
                            Gated
                          </span>
                        )}
                        {hf.pipelineTag && (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300">
                            {hf.pipelineTag}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-100 text-sm line-clamp-1 group-hover:text-amber-300 transition-colors">
                        {repoTitle}
                      </h3>
                      <p className="text-slate-400 text-xs flex items-center gap-1 mt-1 font-medium">
                        <User size={12} className="text-amber-400" />
                        <span className="line-clamp-1">{author}</span>
                      </p>
                    </div>

                    {/* Weight formats available */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {safetensorsCount > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-900 border border-slate-800 text-slate-300">
                          {safetensorsCount} .safetensors
                        </span>
                      )}
                      {ggufCount > 0 && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                          {ggufCount} .gguf
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 mt-4 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-semibold text-slate-300">
                      <Download size={13} className="text-amber-400" />
                      {formatCount(hf.downloads)}
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Heart size={12} className="text-rose-400" />
                      {formatCount(hf.likes)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        loading ? (
          <div className="flex flex-col items-center justify-center py-28 space-y-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 glow-purple"></div>
            <span className="text-xs text-slate-400 font-medium">Fetching model catalog...</span>
          </div>
        ) : error ? (
          <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
            <span>{error}</span>
          </div>
        ) : displayedModels.length === 0 ? (
          <div className="text-center py-28 text-slate-500 text-sm glass-panel rounded-2xl">
            No models found matching your search parameters. Try adjusting filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {displayedModels.map((model) => {
              const firstVersion = model.modelVersions?.[0];
              const candidateImages: string[] = [];
              model.modelVersions?.forEach((v) => {
                v.images?.forEach((img) => {
                  if (img?.url && !candidateImages.includes(img.url)) {
                    candidateImages.push(img.url);
                  }
                });
              });
              const isNsfw = isModelNsfwOrMature(model);
              const installStatus = getModelInstallStatus(model);

              return (
                <div
                  key={model.id}
                  onClick={() => openModelDetails(model)}
                  className="glass-card rounded-2xl overflow-hidden cursor-pointer flex flex-col group border border-slate-800/80 hover:border-purple-500/40 relative"
                >
                  {/* Image Preview Container */}
                  <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                    <FallbackImage
                      src={candidateImages[0]}
                      candidateUrls={candidateImages}
                      alt={model.name}
                      isBlurred={isNsfw && nsfwBlur}
                      cacheType="browse"
                      className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                    />

                    {/* Top-Left: Type & NSFW Badges */}
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-950/85 border border-purple-500/40 text-purple-300 backdrop-blur-md shadow-md">
                        {model.type}
                      </span>
                      {isNsfw && (
                        <span className="px-2 py-0.5 rounded-lg text-[9px] font-extrabold bg-red-950/90 border border-red-500/40 text-red-400 backdrop-blur-md shadow-md">
                          NSFW
                        </span>
                      )}
                    </div>

                    {/* Top-Right: Star / Rating */}
                    {model.stats?.rating !== undefined && model.stats.rating > 0 && (
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-950/85 border border-slate-700/60 text-amber-300 text-[10px] font-bold backdrop-blur-md shadow-md z-10">
                        <Star size={11} className="fill-amber-400 text-amber-400" />
                        <span>{model.stats.rating.toFixed(1)}</span>
                      </div>
                    )}

                    {/* Bottom-Right: Local Installation Indicator */}
                    {installStatus.isInstalled && (
                      <div className="absolute bottom-2.5 right-2.5 z-10">
                        {installStatus.hasUpdate ? (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-amber-500/90 text-slate-950 border border-amber-400 flex items-center gap-1 shadow-lg animate-pulse backdrop-blur-md">
                            <Sparkles size={11} />
                            <span>Update Available</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 flex items-center gap-1 shadow-md backdrop-blur-md">
                            <CheckCircle2 size={11} />
                            <span>Installed</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-4 flex flex-col justify-between flex-1 space-y-3">
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm line-clamp-1 group-hover:text-purple-300 transition-colors">
                        {model.name}
                      </h3>
                      {model.creator && (
                        <p className="text-slate-400 text-xs flex items-center gap-1 mt-1 font-medium">
                          <User size={12} className="text-purple-400" />
                          <span className="line-clamp-1">{model.creator.username}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80">
                      <span className="flex items-center gap-1 text-slate-300 font-semibold">
                        <Download size={13} className="text-purple-400" />
                        {formatCount(model.stats?.downloadCount)}
                      </span>
                      {firstVersion?.baseModel && (
                        <span className="bg-slate-900 border border-slate-800 px-2.5 py-0.5 rounded-md text-[10px] text-slate-300 font-medium">
                          {firstVersion.baseModel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Pagination Controls (CivitAI only) */}
      {searchSource === 'civitai' && !loading && !error && displayedModels.length > 0 && (
        <div className="glass-panel p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-xs font-semibold shadow-xl border border-slate-800">
          {/* Left: Info / Total Count */}
          <div className="text-slate-400 font-medium flex items-center gap-2">
            <span>
              Page <strong className="text-purple-300 font-bold">{currentPage}</strong>
              {metadata.totalPages ? ` of ${metadata.totalPages}` : ''}
            </span>
            <span className="text-slate-600">•</span>
            <span>
              Showing <strong className="text-slate-200">{displayedModels.length}</strong> models
              {metadata.totalItems ? ` (${metadata.totalItems.toLocaleString()} total)` : ''}
            </span>
          </div>

          {/* Right: Navigation Controls */}
          <div className="flex items-center gap-2">
            {/* First Page */}
            {currentPage > 2 && (
              <button
                onClick={() => handlePageChange(1)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-all flex items-center gap-1 cursor-pointer"
                title="First Page"
              >
                <ChevronsLeft size={16} />
              </button>
            )}

            {/* Previous Page */}
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className={`px-3.5 py-2 rounded-xl border flex items-center gap-1.5 transition-all ${
                currentPage <= 1
                  ? 'bg-slate-950/40 border-slate-900 text-slate-600 cursor-not-allowed'
                  : 'bg-slate-900 border-slate-800 text-slate-200 hover:text-white hover:bg-slate-800 hover:border-purple-500/40 cursor-pointer shadow-sm'
              }`}
            >
              <ChevronLeft size={15} />
              <span>Previous</span>
            </button>

            {/* Page Indicator Pill */}
            <div className="px-3.5 py-2 bg-linear-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30 text-purple-200 font-bold rounded-xl shadow-inner flex items-center gap-1">
              <span>Page</span>
              <span className="text-white font-extrabold">{currentPage}</span>
              {metadata.totalPages ? (
                <span className="text-slate-400">/ {metadata.totalPages}</span>
              ) : null}
            </div>

            {/* Next Page */}
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={!metadata.nextPage && !metadata.nextCursor && !pageCursors[currentPage + 1] && displayedModels.length < PAGE_SIZE}
              className={`px-4 py-2 rounded-xl border flex items-center gap-1.5 transition-all ${
                !metadata.nextPage && !metadata.nextCursor && !pageCursors[currentPage + 1] && displayedModels.length < PAGE_SIZE
                  ? 'bg-slate-950/40 border-slate-900 text-slate-600 cursor-not-allowed'
                  : 'bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold border-transparent shadow-lg shadow-purple-600/25 cursor-pointer glow-purple'
              }`}
            >
              <span>Next</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Model Detail Modal */}
      {activeModel && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4" onClick={() => setActiveModel(null)}>
          <div
            className="glass-panel w-full max-w-3xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-700/60 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
              <div>
                <h2 className="text-xl font-bold text-slate-100">{activeModel.name}</h2>
                <p className="text-xs text-slate-400 flex items-center gap-3 mt-1 font-medium">
                  <span>Type: <strong className="text-purple-400">{activeModel.type}</strong></span>
                  {activeModel.creator && <span>Creator: <strong className="text-slate-300">{activeModel.creator.username}</strong></span>}
                </p>
              </div>
              <button
                onClick={() => setActiveModel(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-300">
              {downloadSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2.5 text-xs font-semibold glow-emerald">
                  <CheckCircle2 size={18} />
                  <span>{downloadSuccess}</span>
                </div>
              )}

              {/* Version Selector & Update Controls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Select Target Version
                  </label>
                  {selectedVersion && (
                    <div className="flex items-center gap-2">
                      {installedMap.get(activeModel.id)?.has(selectedVersion.id) ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg">
                          <CheckCircle2 size={12} />
                          <span>Installed</span>
                        </span>
                      ) : ignoredSet.has(`${activeModel.id}_${selectedVersion.id}`) ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-0.5 rounded-lg">
                          <EyeOff size={12} />
                          <span>Update Ignored</span>
                        </span>
                      ) : (installedMap.get(activeModel.id)?.size || 0) > 0 ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 rounded-lg">
                          <Sparkles size={12} />
                          <span>Newer Version</span>
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>

                <select
                  value={selectedVersion?.id || ''}
                  onChange={(e) => {
                    const ver = activeModel.modelVersions.find((v) => v.id === parseInt(e.target.value, 10));
                    if (ver) setSelectedVersion(ver);
                  }}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-3 text-sm text-slate-100 focus:border-purple-500 focus:outline-none font-medium cursor-pointer"
                >
                  {(() => {
                    // Newest upload date among installed versions for this model, used so an
                    // "Update" tag only appears on versions genuinely newer than what is installed.
                    const activeInstalled = installedMap.get(activeModel.id);
                    let newestInstalledDate = 0;
                    if (activeInstalled && activeInstalled.size > 0) {
                      for (const v of activeModel.modelVersions) {
                        if (activeInstalled.has(v.id)) {
                          const d = new Date(v.publishedAt || v.createdAt || 0).getTime();
                          if (Number.isFinite(d) && d > newestInstalledDate) newestInstalledDate = d;
                        }
                      }
                    }
                    return activeModel.modelVersions.map((v) => {
                      const isInstalled = activeInstalled?.has(v.id);
                      const isIgnored = ignoredSet.has(`${activeModel.id}_${v.id}`);
                      const vDate = new Date(v.publishedAt || v.createdAt || 0).getTime();
                      const isNewer = Number.isFinite(vDate) && vDate > newestInstalledDate;
                      let tag = '';
                      if (isInstalled) tag = ' ✓ [Installed]';
                      else if (isIgnored) tag = ' ⊘ [Ignored Update]';
                      else if ((activeInstalled?.size || 0) > 0 && isNewer) tag = ' ✦ [Update]';

                      return (
                        <option key={v.id} value={v.id} className="bg-slate-900">
                          {v.name} ({v.baseModel}){tag} {v.publishedAt ? `- ${new Date(v.publishedAt).toLocaleDateString()}` : ''}
                        </option>
                      );
                    });
                  })()}
                </select>

                {/* Selective Update Ignore / Notice Card */}
                {selectedVersion && !installedMap.get(activeModel.id)?.has(selectedVersion.id) && (installedMap.get(activeModel.id)?.size || 0) > 0 && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl animate-fadeIn">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                        <Sparkles size={14} className="text-amber-400" />
                        <span>
                          {ignoredSet.has(`${activeModel.id}_${selectedVersion.id}`)
                            ? 'Update Ignored for this Version'
                            : 'Different Version Available'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {ignoredSet.has(`${activeModel.id}_${selectedVersion.id}`)
                          ? 'This version is marked as ignored and will not trigger "Update Available" badges.'
                          : 'Ignore this version if it is built for a base model or format you do not use.'}
                      </p>
                    </div>

                    <div>
                      {ignoredSet.has(`${activeModel.id}_${selectedVersion.id}`) ? (
                        <button
                          type="button"
                          onClick={() => handleUnignoreVersion(activeModel.id, selectedVersion.id)}
                          className="px-3.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold transition-all cursor-pointer"
                        >
                          Unignore Version
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleIgnoreVersion(activeModel.id, selectedVersion.id)}
                          className="px-3.5 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs text-amber-300 font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                          title="Ignore this version from triggering update notices"
                        >
                          <EyeOff size={13} />
                          <span>Ignore This Update</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Checkbox to delete old version file on completion */}
                {selectedVersion && !installedMap.get(activeModel.id)?.has(selectedVersion.id) && (installedMap.get(activeModel.id)?.size || 0) > 0 && (
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl animate-fadeIn">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={deleteOldOnUpdate}
                        onChange={(e) => setDeleteOldOnUpdate(e.target.checked)}
                        className="mt-0.5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                      />
                      <div className="space-y-0.5 flex-1">
                        <span className="font-semibold text-slate-200">
                          Delete previous version ({localModels.find((m) => m.civitaiModelId === activeModel.id)?.fileName || 'existing file'}) upon completion
                        </span>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          The old file will only be deleted after the update is 100% downloaded and verified. If the download fails or is cancelled, your existing version remains intact.
                        </p>
                      </div>
                    </label>
                  </div>
                )}
              </div>

              {/* Version Specs Grid */}
              {selectedVersion && (
                <div className="space-y-5">
                  {(() => {
                    const pf = selectedVersion.files?.find((f) => f.primary) ?? selectedVersion.files?.[0];
                    return (
                  <div className="grid grid-cols-2 gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-400 block font-medium">Base Architecture:</span>
                      <span className="font-bold text-slate-100 text-sm mt-0.5 block">{selectedVersion.baseModel}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Primary File:</span>
                      <span className="font-semibold text-slate-200 truncate block mt-0.5">
                        {pf?.name || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Download Size:</span>
                      <span className="font-semibold text-slate-200 mt-0.5 block">
                        {pf?.sizeKB
                          ? `${(pf.sizeKB / 1024 / 1024).toFixed(2)} GB`
                          : 'Unknown'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">SHA256 Checksum:</span>
                      <span className="font-mono text-[10px] text-purple-300 truncate block mt-0.5">
                        {pf?.hashes?.SHA256 || 'Not available'}
                      </span>
                    </div>
                  </div>
                    );
                  })()}

                  {/* Gallery */}
                  {selectedVersion.images && selectedVersion.images.length > 0 && (
                    <div>
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                        Sample Gallery
                      </span>
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {selectedVersion.images.slice(0, 5).map((img, idx) => (
                          <FallbackImage
                            key={idx}
                            src={img.url}
                            candidateUrls={selectedVersion.images ? selectedVersion.images.slice(idx).map((i) => i.url) : []}
                            alt="Preview sample"
                            cacheType="browse"
                            className="w-32 h-32 object-cover rounded-xl border border-slate-800 bg-slate-950 shrink-0"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="p-5 border-t border-slate-800/80 flex items-center justify-between bg-slate-900/50">
              <a
                href={`https://civitai.com/models/${activeModel.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium"
              >
                <span>View on CivitAI.com</span>
                <ExternalLink size={13} />
              </a>

              {selectedVersion && (
                <button
                  onClick={() => triggerDownload(selectedVersion)}
                  className="flex items-center gap-2.5 px-6 py-3 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-sm transition-all shadow-xl shadow-purple-600/30 glow-purple cursor-pointer"
                >
                  <Download size={18} />
                  <span>
                    {installedMap.get(activeModel.id)?.has(selectedVersion.id)
                      ? 'Re-download Version'
                      : (installedMap.get(activeModel.id)?.size || 0) > 0
                      ? 'Update to This Version'
                      : 'Download to ComfyUI'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hugging Face Model Detail Modal */}
      {activeHfModel && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4" onClick={() => setActiveHfModel(null)}>
          <div
            className="glass-panel w-full max-w-3xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] border border-amber-500/40 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🤗</span>
                <div>
                  <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                    <span>{activeHfModel.modelName || activeHfModel.id}</span>
                    {activeHfModel.gated && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        Gated Repo
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium flex items-center gap-3">
                    <span>Author: <strong className="text-amber-300">{activeHfModel.author || 'Hugging Face'}</strong></span>
                    {activeHfModel.pipelineTag && (
                      <span>Pipeline: <strong className="text-purple-300">{activeHfModel.pipelineTag}</strong></span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.open(`https://huggingface.co/${activeHfModel.id}`, '_blank', 'noopener,noreferrer')}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Open on Hugging Face"
                >
                  <ExternalLink size={18} />
                </button>
                <button
                  onClick={() => setActiveHfModel(null)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content: Files list */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-sm text-slate-300">
              {hfDownloadSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-2.5 text-xs font-semibold glow-emerald">
                  <CheckCircle2 size={18} />
                  <span>{hfDownloadSuccess}</span>
                </div>
              )}

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Repository Model Weights & Checkpoints (.safetensors, .gguf)
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Select a model file below to download directly into your ComfyUI models folder. Gated repositories will automatically use your encrypted Hugging Face token.
                </p>

                {loadingHfFiles ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <RefreshCw size={24} className="animate-spin text-amber-400" />
                    <span className="text-xs">Inspecting Hugging Face repository files...</span>
                  </div>
                ) : !activeHfFiles || (activeHfFiles.safetensorsFiles.length === 0 && activeHfFiles.ggufFiles.length === 0) ? (
                  <div className="p-6 text-center text-slate-500 text-xs bg-slate-900/50 rounded-2xl border border-slate-800">
                    No primary .safetensors or .gguf weight files found at repository root.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {[...activeHfFiles.safetensorsFiles, ...activeHfFiles.ggufFiles].map((filename) => {
                      const sibling = activeHfFiles.siblings.find((s: any) => s.rfilename === filename);
                      const sizeBytes = sibling?.size || sibling?.lfs?.size;
                      const sizeStr = sizeBytes
                        ? sizeBytes >= 1073741824
                          ? `${(sizeBytes / 1073741824).toFixed(2)} GB`
                          : `${(sizeBytes / 1048576).toFixed(1)} MB`
                        : undefined;
                      const isGguf = filename.toLowerCase().endsWith('.gguf');
                      const quantMatch = filename.match(/(Q[0-9]_[A-Z0-9_]+|BF16|F16|F32|IQ[0-9]_[A-Z0-9_]+)/i);

                      return (
                        <div
                          key={filename}
                          className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                              isGguf
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {isGguf ? 'GGUF' : 'SAFETENSORS'}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-200 truncate">{filename}</p>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                                {sizeStr && <span>{sizeStr}</span>}
                                {quantMatch && (
                                  <span className="text-purple-400 font-semibold">• {quantMatch[1].toUpperCase()}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => downloadHfFile(activeHfModel, filename, sizeBytes)}
                            className="px-3.5 py-1.5 rounded-xl bg-linear-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-all shrink-0 cursor-pointer"
                          >
                            <Download size={13} />
                            <span>Download</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Debug & Diagnostics Inspector */}
      <div className="glass-panel rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden mt-12 transition-all">
        {/* Header / Summary Bar */}
        <div
          onClick={() => setShowDebug(!showDebug)}
          className="p-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-slate-800/40 transition-colors bg-slate-950/40"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              debugInfo.status === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : debugInfo.status === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
            }`}>
              <Terminal size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-200">API Diagnostics & Query Inspector</span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                  debugInfo.status === 'error'
                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                    : debugInfo.status === 'success'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : debugInfo.status === 'loading'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {debugInfo.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-xl">
                {debugInfo.apiUrl}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {debugInfo.durationMs !== undefined && (
              <span className="text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                {debugInfo.durationMs}ms
              </span>
            )}
            {debugInfo.resultCount !== undefined && (
              <span className="text-xs font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg">
                {debugInfo.resultCount} models
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDebug(!showDebug);
              }}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-lg bg-slate-900/80 border border-slate-800 transition-colors"
            >
              {showDebug ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Expanded Diagnostics Details */}
        {showDebug && (
          <div className="p-5 border-t border-slate-800/80 space-y-4 bg-slate-950/80 text-xs animate-fadeIn">
            {/* Error Banner */}
            {debugInfo.error && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="font-bold block text-red-200">API Error Response:</span>
                  <pre className="font-mono text-[11px] mt-1 whitespace-pre-wrap break-all text-red-300 bg-red-950/50 p-2.5 rounded-lg border border-red-500/20">
                    {debugInfo.error}
                  </pre>
                </div>
              </div>
            )}

            {/* Request URL with Copy */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px]">Constructed Request URL</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(debugInfo.apiUrl);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                >
                  {copiedUrl ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  <span>{copiedUrl ? 'Copied URL' : 'Copy URL'}</span>
                </button>
              </div>
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 break-all select-all">
                {debugInfo.apiUrl}
              </div>
            </div>

            {/* Active Parameters Inspector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px] block mb-1.5">
                  Parsed Query Parameters
                </span>
                <pre className="p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[11px] text-indigo-300 overflow-x-auto">
                  {JSON.stringify(debugInfo.requestParams, null, 2)}
                </pre>
              </div>

              <div>
                <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px] block mb-1.5">
                  Request Metadata
                </span>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Last Executed:</span>
                    <span className="text-slate-300">{debugInfo.timestamp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Roundtrip Latency:</span>
                    <span className="text-slate-300">{debugInfo.durationMs ?? 0} ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">HTTP Status:</span>
                    <span className={debugInfo.status === 'success' ? 'text-emerald-400 font-bold' : debugInfo.status === 'error' ? 'text-red-400 font-bold' : 'text-slate-300'}>
                      {debugInfo.status === 'success' ? '200 OK' : debugInfo.status === 'error' ? 'Failed' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Returned Count:</span>
                    <span className="text-purple-300 font-bold">{debugInfo.resultCount ?? 0} models</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
