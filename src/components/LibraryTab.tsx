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
import React, { useState, useEffect } from 'react';
import {
  FolderSearch,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Copy,
  ArrowUpCircle,
  HardDrive,
  FileText,
  Search,
  Sparkles,
  Trash2,
  BookmarkMinus,
  X,
  Eye,
  EyeOff,
  ShieldCheck,
  ChevronUp,
  ChevronDown,
  Folder,
  FolderOpen,
  Check,
  CheckCircle2,
  AlertTriangle,
  Square,
  ArrowUpDown,
  SearchCheck,
  ExternalLink,
  Flame,
  Download,
  Loader2,
  Cpu,
  Activity,
  Package,
  Tag,
  Hash,
  Info,
  Plus,
  Layers,
  Link2,
  Globe,
  Save,
  Edit3,
  ArrowRight,
} from 'lucide-react';
import { FallbackImage } from './FallbackImage';
import { useScan } from '../context/ScanContext';
import {
  LocalModel,
  ModelType,
  HardwareProfile,
  ConversionSafetyAssessment,
  MisplacedModel,
  LibrarySortPlan,
  ExecuteLibrarySortResult,
} from '../types/app';

interface LibraryTabProps {
  onCheckUpdate: (model: LocalModel) => void;
}

export const LibraryTab: React.FC<LibraryTabProps> = ({ onCheckUpdate }) => {
  const { isScanning, scanProgress, lastCompletedAt, startScan, cancelScan } = useScan();
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [matchingUnidentified, setMatchingUnidentified] = useState(false);
  const [updateSummary, setUpdateSummary] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  // Library Sorter / Auto-Organize State
  const [sortPlan, setSortPlan] = useState<LibrarySortPlan | null>(null);
  const [isAnalyzingSort, setIsAnalyzingSort] = useState<boolean>(false);
  const [isSorting, setIsSorting] = useState<boolean>(false);
  const [sortProgress, setSortProgress] = useState<{ current: number; total: number; file: string } | null>(null);
  const [selectedSortModelIds, setSelectedSortModelIds] = useState<Set<string>>(new Set());
  const [isSortModalOpen, setIsSortModalOpen] = useState<boolean>(false);
  const [sortFeedback, setSortFeedback] = useState<{ message: string; isError?: boolean } | null>(null);
  const [sortCategoryFilter, setSortCategoryFilter] = useState<string>('all');
  const [ignoredSortModels, setIgnoredSortModels] = useState<Array<{ model_id: string; file_path?: string; file_name?: string; created_at?: string }>>([]);
  const [showIgnoredSortList, setShowIgnoredSortList] = useState<boolean>(false);

  // Missing Model Pulling State
  const [pullingModelId, setPullingModelId] = useState<string | null>(null);
  const [pullingAllMissing, setPullingAllMissing] = useState<boolean>(false);
  const [pullFeedback, setPullFeedback] = useState<{ id?: string; message: string; isError?: boolean } | null>(null);

  // SafeTensors Conversion State
  const [convertingModelId, setConvertingModelId] = useState<string | null>(null);
  const [modelToConvert, setModelToConvert] = useState<LocalModel | null>(null);
  const [deleteOriginalOnConvert, setDeleteOriginalOnConvert] = useState<boolean>(false);
  const [convertFeedback, setConvertFeedback] = useState<{ id?: string; message: string; isError?: boolean } | null>(null);
  const [hardwareAssessment, setHardwareAssessment] = useState<ConversionSafetyAssessment | null>(null);
  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null);
  const [isCheckingHardware, setIsCheckingHardware] = useState<boolean>(false);

  // Swarm Companion Packaging State
  const [packagingModelId, setPackagingModelId] = useState<string | null>(null);
  const [packageFeedback, setPackageFeedback] = useState<{ id?: string; message: string; isError?: boolean } | null>(null);

  // Model Detail & LoRA Trigger Word Modal State
  const [selectedModelDetail, setSelectedModelDetail] = useState<LocalModel | null>(null);
  const [selectedTriggerTags, setSelectedTriggerTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [isSavingTags, setIsSavingTags] = useState<boolean>(false);
  const [tagSaveSuccess, setTagSaveSuccess] = useState<boolean>(false);
  const [copiedTriggerWord, setCopiedTriggerWord] = useState<string | null>(null);
  const [copiedAllTriggers, setCopiedAllTriggers] = useState<boolean>(false);
  const [copiedFilePath, setCopiedFilePath] = useState<boolean>(false);
  const [copiedSha256, setCopiedSha256] = useState<boolean>(false);

  // Model Specifics & Link Modal State
  const [modelToLinkSpecifics, setModelToLinkSpecifics] = useState<LocalModel | null>(null);
  const [linkInputUrl, setLinkInputUrl] = useState<string>('');
  const [isFetchingLinkMetadata, setIsFetchingLinkMetadata] = useState<boolean>(false);
  const [isSavingSpecifics, setIsSavingSpecifics] = useState<boolean>(false);
  const [specificsFeedback, setSpecificsFeedback] = useState<{ message: string; isError?: boolean } | null>(null);
  const [specificsName, setSpecificsName] = useState<string>('');
  const [specificsCreator, setSpecificsCreator] = useState<string>('');
  const [specificsBaseModel, setSpecificsBaseModel] = useState<string>('');
  const [specificsModelType, setSpecificsModelType] = useState<string>('');
  const [specificsCustomLink, setSpecificsCustomLink] = useState<string>('');
  const [specificsDescription, setSpecificsDescription] = useState<string>('');
  const [specificsTrainedWords, setSpecificsTrainedWords] = useState<string[]>([]);
  const [specificsNewTag, setSpecificsNewTag] = useState<string>('');
  const [specificsPreviewUrl, setSpecificsPreviewUrl] = useState<string>('');
  const [specificsNsfw, setSpecificsNsfw] = useState<boolean>(false);

  // Delete Options Modal State
  const [modelToDelete, setModelToDelete] = useState<LocalModel | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Duplicate Resolution State
  const [expandedDuplicateHash, setExpandedDuplicateHash] = useState<string | null>(null);
  const [selectedKeepers, setSelectedKeepers] = useState<{ [hash: string]: string }>({});
  const [resolvingHash, setResolvingHash] = useState<string | null>(null);
  const [resolutionFeedback, setResolutionFeedback] = useState<string | null>(null);
  const [ignoredDuplicates, setIgnoredDuplicates] = useState<{ sha256: string; knownCount: number }[]>([]);

  // Filters with LocalStorage Persistence
  const [filter, setFilter] = useState<'all' | 'missing' | 'matched' | 'updates' | 'unidentified' | 'duplicates' | 'pickle'>(
    () => (localStorage.getItem('civitai_lib_filter') as any) || 'all'
  );
  const [typeFilter, setTypeFilter] = useState<'all' | ModelType>(
    () => (localStorage.getItem('civitai_lib_type_filter') as any) || 'all'
  );
  const [nsfwFilter, setNsfwFilter] = useState<'all' | 'sfw' | 'nsfw'>(
    () => (localStorage.getItem('civitai_lib_nsfw_filter') as any) || 'all'
  );
  const [blurNsfw, setBlurNsfw] = useState<boolean>(
    () => localStorage.getItem('civitai_lib_blur_nsfw') !== 'false'
  );
  const [searchQuery, setSearchQuery] = useState<string>(
    () => localStorage.getItem('civitai_lib_search') || ''
  );
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'size' | 'date'>(
    () => (localStorage.getItem('civitai_lib_sort_by') as any) || 'name'
  );
  const [sortAsc, setSortAsc] = useState<boolean>(
    () => localStorage.getItem('civitai_lib_sort_asc') !== 'false'
  );

  useEffect(() => {
    localStorage.setItem('civitai_lib_filter', filter);
  }, [filter]);

  useEffect(() => {
    localStorage.setItem('civitai_lib_type_filter', typeFilter);
  }, [typeFilter]);

  useEffect(() => {
    localStorage.setItem('civitai_lib_nsfw_filter', nsfwFilter);
  }, [nsfwFilter]);

  useEffect(() => {
    localStorage.setItem('civitai_lib_blur_nsfw', String(blurNsfw));
  }, [blurNsfw]);

  useEffect(() => {
    localStorage.setItem('civitai_lib_search', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    localStorage.setItem('civitai_lib_sort_by', sortBy);
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem('civitai_lib_sort_asc', String(sortAsc));
  }, [sortAsc]);

  const loadIgnoredDuplicates = async () => {
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.getIgnoredDuplicates === 'function') {
        const ignored = await window.civitaiAPI.getIgnoredDuplicates();
        if (ignored) setIgnoredDuplicates(ignored);
      }
    } catch (e) {
      console.error('Failed to load ignored duplicates:', e);
    }
  };

  const handleAnalyzeSort = async (modelsList?: LocalModel[]) => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.analyzeLibrarySorting !== 'function') return;
    setIsAnalyzingSort(true);
    try {
      const activeList = modelsList && modelsList.length > 0 ? modelsList : localModels;
      const plan: LibrarySortPlan = await window.civitaiAPI.analyzeLibrarySorting(
        activeList && activeList.length > 0 ? { models: activeList } : undefined
      );
      setSortPlan(plan);
      if (plan && plan.items) {
        setSelectedSortModelIds(new Set(plan.items.map((i) => i.id)));
      }
    } catch (err) {
      console.error('Failed to analyze library sorting:', err);
    } finally {
      setIsAnalyzingSort(false);
    }
  };

  const loadIgnoredSortModels = async () => {
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.getIgnoredSortModels === 'function') {
        const list = await window.civitaiAPI.getIgnoredSortModels();
        if (Array.isArray(list)) {
          const normalized = list.map((r: any) => ({
            model_id: String(r.modelId || r.model_id || ''),
            file_path: r.filePath || r.file_path || '',
            file_name: r.fileName || r.file_name || '',
            created_at: r.createdAt || r.created_at || '',
          }));
          setIgnoredSortModels(normalized);
        }
      }
    } catch (e) {
      console.error('Failed to load ignored sort models:', e);
    }
  };

  const handleIgnoreSortItem = async (item: { id: string; currentPath: string; fileName: string }) => {
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.ignoreSortModel === 'function') {
        await window.civitaiAPI.ignoreSortModel(item.id, item.currentPath, item.fileName);
        setSortPlan((prev) => {
          if (!prev) return prev;
          const newItems = prev.items.filter((i) => i.id !== item.id);
          return {
            ...prev,
            misplacedCount: Math.max(0, prev.misplacedCount - 1),
            items: newItems,
          };
        });
        setSelectedSortModelIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        await loadIgnoredSortModels();
      }
    } catch (e) {
      console.error('Failed to ignore sort item:', e);
    }
  };

  const handleUnignoreSortItem = async (modelId: string) => {
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.unignoreSortModel === 'function') {
        await window.civitaiAPI.unignoreSortModel(modelId);
        setIgnoredSortModels((prev) => prev.filter((item) => item.model_id !== modelId));
        await loadIgnoredSortModels();
        await handleAnalyzeSort();
      }
    } catch (e) {
      console.error('Failed to unignore sort item:', e);
    }
  };

  const handleClearIgnoredSort = async () => {
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.clearIgnoredSortModels === 'function') {
        await window.civitaiAPI.clearIgnoredSortModels();
        setIgnoredSortModels([]);
        await handleAnalyzeSort();
      }
    } catch (e) {
      console.error('Failed to clear ignored sort models:', e);
    }
  };

  const handleOpenSortModal = async () => {
    setIsSortModalOpen(true);
    setShowIgnoredSortList(false);
    setSortFeedback(null);
    setSortCategoryFilter('all');
    await Promise.all([handleAnalyzeSort(), loadIgnoredSortModels()]);
  };

  const handleExecuteSort = async () => {
    if (!sortPlan || selectedSortModelIds.size === 0) return;
    const itemsToMove = sortPlan.items.filter((i) => selectedSortModelIds.has(i.id));
    if (itemsToMove.length === 0) return;

    setIsSorting(true);
    setSortProgress({ current: 0, total: itemsToMove.length, file: 'Starting relocation...' });
    setSortFeedback(null);

    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.executeLibrarySorting === 'function') {
        const planPayload = itemsToMove.map((i) => ({
          modelId: i.id,
          sourcePath: i.currentPath,
          targetPath: i.targetPath,
        }));

        const res: ExecuteLibrarySortResult = await window.civitaiAPI.executeLibrarySorting(planPayload);
        if (res && res.movedCount > 0) {
          setSortFeedback({
            message: `Successfully relocated ${res.movedCount} model(s) and their companion files to standard ComfyUI folders!`,
            isError: false,
          });
          await loadLocalModels();
          await handleAnalyzeSort();
        } else if (res && res.errors && res.errors.length > 0) {
          setSortFeedback({
            message: `Sort finished with issues: ${res.errors.map((e) => e.error).join(', ')}`,
            isError: true,
          });
        }
      }
    } catch (err: any) {
      setSortFeedback({
        message: `Sort failed: ${err?.message || err}`,
        isError: true,
      });
    } finally {
      setIsSorting(false);
      setSortProgress(null);
    }
  };

  const loadLocalModels = async () => {
    setLoading(true);
    try {
      if (window.civitaiAPI) {
        const models = await window.civitaiAPI.getLocalModels();
        setLocalModels(models || []);
        if (models && models.length > 0) {
          handleAnalyzeSort(models);
        }
      }
    } catch (err) {
      console.error('Failed to load local models:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocalModels();
    loadIgnoredDuplicates();
  }, [lastCompletedAt]);

  useEffect(() => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.onLibrarySortProgress !== 'function') return;
    const unsub = window.civitaiAPI.onLibrarySortProgress((prog) => {
      setSortProgress(prog);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Auto-refresh the library when a download completes, so a model downloaded through
  // the app shows up immediately — no manual re-scan required.
  useEffect(() => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.onDownloadProgress !== 'function') return;
    const seenCompleted = new Set<string>();
    let debounceTimer: NodeJS.Timeout | null = null;
    const unsub = window.civitaiAPI.onDownloadProgress((tasks: any[]) => {
      const completed = (Array.isArray(tasks) ? tasks : []).filter(
        (t) => t && t.status === 'completed' && t.computedPath
      );
      const hasNew = completed.some((t) => !seenCompleted.has(t.id));
      for (const t of completed) seenCompleted.add(t.id);
      if (hasNew) {
        // Brief delay so the completed file is fully flushed before it is indexed.
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadLocalModels(), 1500);
      }
    });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (typeof unsub === 'function') unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleIgnoreDuplicateSet = async (sha256: string, count: number) => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.ignoreDuplicateSet !== 'function') return;
    try {
      await window.civitaiAPI.ignoreDuplicateSet(sha256, count);
      setResolutionFeedback(`Marked SHA256 as intentionally duplicated (${count} copies). Excluded from duplicate warnings.`);
      setExpandedDuplicateHash(null);
      setTimeout(() => setResolutionFeedback(null), 5000);
      await loadLocalModels();
      await loadIgnoredDuplicates();
    } catch (e: any) {
      alert(`Failed to ignore duplicate set: ${e?.message || e}`);
    }
  };

  const handleUnignoreDuplicateSet = async (sha256: string) => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.unignoreDuplicateSet !== 'function') return;
    try {
      await window.civitaiAPI.unignoreDuplicateSet(sha256);
      setResolutionFeedback(`Restored duplicate warnings for SHA256: ${sha256.substring(0, 12)}...`);
      setTimeout(() => setResolutionFeedback(null), 5000);
      await loadLocalModels();
      await loadIgnoredDuplicates();
    } catch (e: any) {
      alert(`Failed to unignore duplicate set: ${e?.message || e}`);
    }
  };

  const handleOpenFolder = async (filePath: string) => {
    try {
      if (window.civitaiAPI && window.civitaiAPI.openFolder) {
        await window.civitaiAPI.openFolder(filePath);
      }
    } catch (e) {
      console.warn('Could not open folder:', e);
    }
  };

  const isModelNsfw = (model: LocalModel): boolean => {
    if (model.nsfw === true || (model.nsfw as any) === 1) return true;
    if (model.nsfw === false || (model.nsfw as any) === 0) return false;
    const textToTest = `${model.fileName} ${model.filePath} ${model.civitaiName || ''}`;
    return /nsfw|xxx|hentai|porn|erotic|lewd|nude|uncensored|adult|breast|boob|cleavage|pussy|vagina|penis|dick|cock|dildo|sensual|fetish|bdsm|milf|anal|sex|naked|topless|bottomless|ecchi|r18|bikini|lingerie|thong|waifu/i.test(
      textToTest
    );
  };

  const handleToggleModelNsfw = async (model: LocalModel) => {
    const currentNsfw = isModelNsfw(model);
    const nextNsfw = !currentNsfw;

    // Optimistically update local UI state
    setLocalModels((prev) =>
      prev.map((m) => (m.id === model.id ? { ...m, nsfw: nextNsfw } : m))
    );

    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.setModelNsfw === 'function') {
        await window.civitaiAPI.setModelNsfw(model.id, nextNsfw);
      }
    } catch (err) {
      console.error('Failed to update model NSFW status:', err);
    }
  };

  const isPickleModel = (model: LocalModel): boolean => {
    const fn = (model.fileName || '').toLowerCase();
    const fp = (model.filePath || '').toLowerCase();
    return (
      fn.endsWith('.ckpt') ||
      fn.endsWith('.pt') ||
      fn.endsWith('.bin') ||
      fp.endsWith('.ckpt') ||
      fp.endsWith('.pt') ||
      fp.endsWith('.bin')
    );
  };

  const isModelDeemedSafe = (model: LocalModel): boolean => {
    if (!model.pickleScanStatus) return false;
    if (model.pickleScanStatus === 'safe_yolo_pt' || model.pickleScanStatus === 'safe') {
      if (model.pickleScannedSha256 && model.sha256 && model.pickleScannedSha256 !== model.sha256) {
        return false;
      }
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!modelToConvert) {
      setHardwareAssessment(null);
      setHardwareProfile(null);
      return;
    }

    let active = true;
    setIsCheckingHardware(true);

    const evaluate = async () => {
      try {
        if (window.civitaiAPI && typeof window.civitaiAPI.assessConversionSafety === 'function') {
          const [safety, profile] = await Promise.all([
            window.civitaiAPI.assessConversionSafety(modelToConvert.fileSize),
            typeof window.civitaiAPI.getHardwareProfile === 'function'
              ? window.civitaiAPI.getHardwareProfile()
              : Promise.resolve(null),
          ]);
          if (active) {
            setHardwareAssessment(safety?.data || safety);
            setHardwareProfile(profile?.data || profile);
          }
        } else {
          const res = await fetch('/api/converter/assess-safety', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelSizeBytes: modelToConvert.fileSize }),
          });
          const json = await res.json();
          if (active) {
            setHardwareAssessment(json?.data || json);
          }
        }
      } catch (err) {
        console.error('Failed to assess hardware conversion safety:', err);
      } finally {
        if (active) setIsCheckingHardware(false);
      }
    };

    evaluate();

    return () => {
      active = false;
    };
  }, [modelToConvert]);

  const handleExecuteConversion = async (model: LocalModel, deleteOriginal: boolean = false) => {
    setConvertingModelId(model.id);
    setModelToConvert(null);
    setConvertFeedback({
      id: model.id,
      message: `Converting ${model.fileName} to SafeTensors format...`,
    });

    try {
      let res: any;
      if (window.civitaiAPI && typeof window.civitaiAPI.convertModelToSafetensors === 'function') {
        res = await window.civitaiAPI.convertModelToSafetensors(model.filePath, { deleteOriginal });
      } else {
        const response = await fetch('/api/converter/convert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourcePath: model.filePath, deleteOriginal }),
        });
        res = await response.json();
      }

      if (res && res.success) {
        const destName = res.targetPath ? res.targetPath.split(/[/\\]/).pop() : 'SafeTensors';
        const durSec = ((res.durationMs || 0) / 1000).toFixed(1);
        setConvertFeedback({
          id: model.id,
          message: `Successfully converted to ${destName}! (${durSec}s)`,
        });
        await loadLocalModels();
        setTimeout(() => setConvertFeedback(null), 8000);
      } else if (res && res.isYolo) {
        setConvertFeedback({
          id: model.id,
          message: `Safe YOLO Detector Model: Preserved as .pt (Ultralytics / YOLO models require Python layer definitions and must remain as .pt to function).`,
        });
        await loadLocalModels();
        setTimeout(() => setConvertFeedback(null), 10000);
      } else {
        setConvertFeedback({
          id: model.id,
          isError: true,
          message: `Conversion failed: ${res?.error || 'Unknown conversion error'}`,
        });
      }
    } catch (err: any) {
      setConvertFeedback({
        id: model.id,
        isError: true,
        message: `Conversion error: ${err.message || err}`,
      });
    } finally {
      setConvertingModelId(null);
    }
  };

  const handlePackageSingleModel = async (model: LocalModel) => {
    setPackagingModelId(model.id);
    setPackageFeedback({
      id: model.id,
      message: `Generating companion triplet (.sha256, .info, preview) for ${model.fileName}...`,
    });

    try {
      let res: any;
      if (window.civitaiAPI && typeof window.civitaiAPI.packageCompanionFiles === 'function') {
        res = await window.civitaiAPI.packageCompanionFiles(model.filePath);
      } else {
        const response = await fetch('/api/storage/package-companion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: model.filePath }),
        });
        res = await response.json();
      }

      if (res && res.success) {
        const generated = [];
        if (res.hashCreated) generated.push('.sha256');
        if (res.infoCreated) generated.push('.info');
        if (res.imageCreated) generated.push('preview');
        const summary = generated.length > 0 ? `Created: ${generated.join(', ')}` : 'All companion files are complete';
        setPackageFeedback({
          id: model.id,
          message: `Swarm Seeding Ready! ${summary}`,
        });
        await loadLocalModels();
        setTimeout(() => setPackageFeedback(null), 7000);
      } else {
        setPackageFeedback({
          id: model.id,
          isError: true,
          message: `Packaging failed: ${res?.error || 'Unknown error'}`,
        });
      }
    } catch (err: any) {
      setPackageFeedback({
        id: model.id,
        isError: true,
        message: `Packaging error: ${err.message || err}`,
      });
    } finally {
      setPackagingModelId(null);
    }
  };

  const isHuggingFaceModel = (model: LocalModel): boolean => {
    const fn = (model.fileName || '').toLowerCase();
    const fp = (model.filePath || '').toLowerCase();
    return (
      fn.endsWith('.gguf') ||
      fp.endsWith('.gguf') ||
      fn.startsWith('models--') ||
      fp.includes('models--') ||
      fp.includes('/gguf/') ||
      fp.includes('\\gguf\\') ||
      model.modelType === ('GGUF' as any)
    );
  };

  const getHuggingFaceQuery = (model: LocalModel): string => {
    // If it's a models--Author--Repo path or filename:
    const targetStr = model.fileName.startsWith('models--') ? model.fileName : model.filePath;
    const match = targetStr.match(/models--([^/\\]+)/);
    if (match && match[1]) {
      return match[1].replace(/--/g, '/');
    }
    if (model.fileName.startsWith('models--')) {
      return model.fileName.replace(/^models--/, '').replace(/--/g, '/');
    }

    // For .gguf files, strip extension and clean up
    return model.fileName.replace(/\.gguf$/i, '').trim();
  };

  const getModelExternalUrl = (
    model: LocalModel
  ): { url: string; label: string; isHf: boolean; isNsfw: boolean } => {
    if (model.customLink) {
      const isHf = model.customLink.includes('huggingface.co');
      return {
        url: model.customLink,
        label: isHf ? `Open on Hugging Face (${model.customLink})` : `Open Model Specifics Link (${model.customLink})`,
        isHf,
        isNsfw: isModelNsfw(model),
      };
    }

    if (model.source === 'huggingface' || model.hfRepoId || isHuggingFaceModel(model)) {
      if (model.hfRepoId) {
        return {
          url: `https://huggingface.co/${model.hfRepoId}`,
          label: `Open repository on Hugging Face (${model.hfRepoId})`,
          isHf: true,
          isNsfw: false,
        };
      }
      const q = getHuggingFaceQuery(model);
      return {
        url: `https://huggingface.co/search/full-text?q=${encodeURIComponent(q)}`,
        label: `Search on Hugging Face (${q})`,
        isHf: true,
        isNsfw: false,
      };
    }

    const nsfw = isModelNsfw(model);
    const domain = nsfw ? 'https://civitai.red' : 'https://civitai.com';
    let url = '';

    if (model.civitaiModelId) {
      url = `${domain}/models/${model.civitaiModelId}${model.civitaiVersionId ? `?modelVersionId=${model.civitaiVersionId}` : ''
        }`;
    } else {
      // Clean query string from filename
      const cleanName = model.fileName
        .replace(/\.(safetensors|pt|ckpt|bin)$/i, '')
        .replace(/^models--/, '')
        .replace(/_/g, ' ')
        .trim();
      url = `${domain}/models?query=${encodeURIComponent(cleanName)}`;
    }

    return {
      url,
      label: nsfw
        ? model.civitaiModelId
          ? 'Open model on CivitAI.red (NSFW)'
          : 'Search model on CivitAI.red (NSFW)'
        : model.civitaiModelId
          ? 'Open model on CivitAI.com (SFW)'
          : 'Search model on CivitAI.com',
      isHf: false,
      isNsfw: nsfw,
    };
  };

  const handleOpenModelLink = (model: LocalModel) => {
    const { url } = getModelExternalUrl(model);
    if (!url) return;

    if (window.civitaiAPI && typeof window.civitaiAPI.openExternal === 'function') {
      window.civitaiAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyText = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (e) {
      console.error('Failed to copy text:', e);
      return false;
    }
  };

  const handleCopyFilePath = async (filePath: string) => {
    const success = await handleCopyText(filePath);
    if (success) {
      setCopiedFilePath(true);
      setTimeout(() => setCopiedFilePath(false), 2000);
    }
  };

  const handleCopySha256 = async (hash: string) => {
    const success = await handleCopyText(hash);
    if (success) {
      setCopiedSha256(true);
      setTimeout(() => setCopiedSha256(false), 2000);
    }
  };

  const handleToggleTagSelection = (tag: string) => {
    setSelectedTriggerTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSelectAllTags = (tags: string[]) => {
    if (selectedTriggerTags.length === tags.length) {
      setSelectedTriggerTags([]);
    } else {
      setSelectedTriggerTags([...tags]);
    }
  };

  const handleCopyTriggerWord = async (word: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const success = await handleCopyText(word);
    if (success) {
      setCopiedTriggerWord(word);
      setTimeout(() => setCopiedTriggerWord(null), 2000);
    }
  };

  const handleCopyTriggerTags = async (allTags: string[]) => {
    const tagsToCopy = selectedTriggerTags.length > 0 ? selectedTriggerTags : allTags;
    if (!tagsToCopy || tagsToCopy.length === 0) return;

    const text = tagsToCopy.join(', ');
    const success = await handleCopyText(text);
    if (success) {
      setCopiedAllTriggers(true);
      setTimeout(() => setCopiedAllTriggers(false), 2000);
    }
  };

  const handlePersistTriggerWords = async (updatedWords: string[]) => {
    if (!selectedModelDetail) return;

    setIsSavingTags(true);
    try {
      let res: any;
      if (window.civitaiAPI && typeof window.civitaiAPI.saveModelTriggerWords === 'function') {
        res = await window.civitaiAPI.saveModelTriggerWords(selectedModelDetail.filePath, updatedWords);
      } else {
        const response = await fetch('/api/models/trigger-words', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: selectedModelDetail.filePath, triggerWords: updatedWords }),
        });
        res = await response.json();
      }

      if (res && res.success) {
        setSelectedModelDetail((prev) =>
          prev ? { ...prev, trainedWords: updatedWords, companionInfoPath: res.companionInfoPath || prev.companionInfoPath } : null
        );
        setLocalModels((prev) =>
          prev.map((m) =>
            m.id === selectedModelDetail.id || m.filePath === selectedModelDetail.filePath
              ? { ...m, trainedWords: updatedWords, companionInfoPath: res.companionInfoPath || m.companionInfoPath }
              : m
          )
        );
        setTagSaveSuccess(true);
        setTimeout(() => setTagSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save trigger words to companion file:', err);
    } finally {
      setIsSavingTags(false);
    }
  };

  const handleAddTriggerWords = async (rawInput: string) => {
    if (!selectedModelDetail || !rawInput.trim()) return;

    const tokens = rawInput
      .split(/[,;\r\n]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    if (tokens.length === 0) return;

    const existing = selectedModelDetail.trainedWords || [];
    const seen = new Set(existing.map((w) => w.toLowerCase()));
    const newAdditions: string[] = [];

    for (const token of tokens) {
      if (!seen.has(token.toLowerCase())) {
        seen.add(token.toLowerCase());
        newAdditions.push(token);
      }
    }

    if (newAdditions.length === 0) {
      setNewTagInput('');
      return;
    }

    const updatedWords = [...existing, ...newAdditions];
    await handlePersistTriggerWords(updatedWords);
    setNewTagInput('');
  };

  const handleRemoveTriggerWord = async (tagToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedModelDetail) return;

    const existing = selectedModelDetail.trainedWords || [];
    const updatedWords = existing.filter((w) => w.toLowerCase() !== tagToRemove.toLowerCase());
    setSelectedTriggerTags((prev) => prev.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase()));
    await handlePersistTriggerWords(updatedWords);
  };

  const openLinkSpecificsModal = (model: LocalModel) => {
    setModelToLinkSpecifics(model);
    setSpecificsFeedback(null);
    setSpecificsName(model.civitaiName || model.fileName.replace(/\.(safetensors|pt|ckpt|bin|gguf)$/i, ''));
    setSpecificsCreator(model.civitaiCreator || (model.hfRepoId ? model.hfRepoId.split('/')[0] : ''));
    setSpecificsBaseModel(model.civitaiBaseModel || '');
    setSpecificsModelType(model.modelType || model.civitaiType || 'Checkpoint');
    const existingLink = model.customLink || (model.hfRepoId ? `https://huggingface.co/${model.hfRepoId}` : model.civitaiModelId ? `https://civitai.com/models/${model.civitaiModelId}` : '');
    setSpecificsCustomLink(existingLink);
    setLinkInputUrl(existingLink);
    setSpecificsDescription(model.description || '');
    setSpecificsTrainedWords(model.trainedWords ? [...model.trainedWords] : []);
    setSpecificsNewTag('');
    setSpecificsPreviewUrl(model.previewUrl || '');
    setSpecificsNsfw(isModelNsfw(model));
  };

  const handleAutoFetchLink = async () => {
    if (!linkInputUrl.trim()) return;
    setIsFetchingLinkMetadata(true);
    setSpecificsFeedback(null);
    try {
      let meta: any;
      if (window.civitaiAPI && typeof window.civitaiAPI.fetchModelMetadataByUrl === 'function') {
        meta = await window.civitaiAPI.fetchModelMetadataByUrl(linkInputUrl.trim());
      } else {
        const response = await fetch('/api/models/fetch-metadata-by-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: linkInputUrl.trim() }),
        });
        meta = await response.json();
      }

      if (meta && !meta.error) {
        if (meta.name) setSpecificsName(meta.name);
        if (meta.creatorName) setSpecificsCreator(meta.creatorName);
        if (meta.baseModel) setSpecificsBaseModel(meta.baseModel);
        if (meta.modelType) setSpecificsModelType(meta.modelType);
        if (meta.description) setSpecificsDescription(meta.description);
        if (meta.previewUrl) setSpecificsPreviewUrl(meta.previewUrl);
        if (meta.trainedWords && Array.isArray(meta.trainedWords) && meta.trainedWords.length > 0) {
          setSpecificsTrainedWords(meta.trainedWords);
        }
        if (typeof meta.nsfw === 'boolean') setSpecificsNsfw(meta.nsfw);
        setSpecificsCustomLink(linkInputUrl.trim());
        setSpecificsFeedback({ message: `Successfully fetched metadata from ${meta.source || 'online resource'}!`, isError: false });
      } else {
        setSpecificsFeedback({ message: meta?.error || 'Could not auto-fetch metadata from the given URL. You can still fill in the details manually.', isError: true });
      }
    } catch (err: any) {
      setSpecificsFeedback({ message: `Auto-fetch failed: ${err?.message || err}`, isError: true });
    } finally {
      setIsFetchingLinkMetadata(false);
    }
  };

  const handleAddSpecificsTriggerWords = (rawInput: string) => {
    if (!rawInput.trim()) return;
    const tokens = rawInput
      .split(/[,;\r\n]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tokens.length === 0) return;

    const seen = new Set(specificsTrainedWords.map((w) => w.toLowerCase()));
    const newAdditions: string[] = [];
    for (const token of tokens) {
      if (!seen.has(token.toLowerCase())) {
        seen.add(token.toLowerCase());
        newAdditions.push(token);
      }
    }
    if (newAdditions.length > 0) {
      setSpecificsTrainedWords((prev) => [...prev, ...newAdditions]);
    }
    setSpecificsNewTag('');
  };

  const handleRemoveSpecificsTriggerWord = (tagToRemove: string) => {
    setSpecificsTrainedWords((prev) => prev.filter((t) => t.toLowerCase() !== tagToRemove.toLowerCase()));
  };

  const handleSaveSpecifics = async () => {
    if (!modelToLinkSpecifics) return;
    setIsSavingSpecifics(true);
    setSpecificsFeedback(null);
    try {
      const payload = {
        filePath: modelToLinkSpecifics.filePath,
        name: specificsName.trim() || undefined,
        creatorName: specificsCreator.trim() || undefined,
        baseModel: specificsBaseModel.trim() || undefined,
        modelType: specificsModelType.trim() || undefined,
        customLink: specificsCustomLink.trim() || undefined,
        description: specificsDescription.trim() || undefined,
        trainedWords: specificsTrainedWords,
        previewUrl: specificsPreviewUrl.trim() || undefined,
        nsfw: specificsNsfw,
      };

      let res: any;
      if (window.civitaiAPI && typeof window.civitaiAPI.saveModelMetadata === 'function') {
        res = await window.civitaiAPI.saveModelMetadata(payload);
      } else {
        const response = await fetch('/api/models/save-metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        res = await response.json();
      }

      if (res && res.success) {
        setLocalModels((prev) =>
          prev.map((m) =>
            m.id === modelToLinkSpecifics.id || m.filePath === modelToLinkSpecifics.filePath
              ? {
                  ...m,
                  civitaiName: specificsName.trim() || m.civitaiName,
                  civitaiCreator: specificsCreator.trim() || m.civitaiCreator,
                  civitaiBaseModel: specificsBaseModel.trim() || m.civitaiBaseModel,
                  modelType: (specificsModelType.trim() as ModelType) || m.modelType,
                  customLink: specificsCustomLink.trim() || m.customLink,
                  description: specificsDescription.trim() || m.description,
                  trainedWords: specificsTrainedWords,
                  previewUrl: specificsPreviewUrl.trim() || m.previewUrl,
                  nsfw: specificsNsfw,
                  isMatched: true,
                  companionInfoPath: res.companionInfoPath || m.companionInfoPath,
                }
              : m
          )
        );

        if (selectedModelDetail && (selectedModelDetail.id === modelToLinkSpecifics.id || selectedModelDetail.filePath === modelToLinkSpecifics.filePath)) {
          setSelectedModelDetail((prev) =>
            prev
              ? {
                  ...prev,
                  civitaiName: specificsName.trim() || prev.civitaiName,
                  civitaiCreator: specificsCreator.trim() || prev.civitaiCreator,
                  civitaiBaseModel: specificsBaseModel.trim() || prev.civitaiBaseModel,
                  modelType: (specificsModelType.trim() as ModelType) || prev.modelType,
                  customLink: specificsCustomLink.trim() || prev.customLink,
                  description: specificsDescription.trim() || prev.description,
                  trainedWords: specificsTrainedWords,
                  previewUrl: specificsPreviewUrl.trim() || prev.previewUrl,
                  nsfw: specificsNsfw,
                  isMatched: true,
                  companionInfoPath: res.companionInfoPath || prev.companionInfoPath,
                }
              : null
          );
        }

        setModelToLinkSpecifics(null);
      } else {
        setSpecificsFeedback({ message: res?.error || 'Failed to save model specifics.', isError: true });
      }
    } catch (err: any) {
      setSpecificsFeedback({ message: `Save error: ${err?.message || err}`, isError: true });
    } finally {
      setIsSavingSpecifics(false);
    }
  };

  const getFolderPath = (filePath: string): string => {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    if (lastSlash === -1) return filePath;
    return filePath.substring(0, lastSlash);
  };

  const handleResolveDuplicates = async (hash: string, keeperId: string, duplicateCopies: LocalModel[]) => {
    const copiesToDelete = duplicateCopies.filter((c) => c.id !== keeperId);
    if (copiesToDelete.length === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${copiesToDelete.length} duplicate file(s) from your disk? This cannot be undone.`)) {
      return;
    }

    setResolvingHash(hash);
    let deletedCount = 0;
    for (const copy of copiesToDelete) {
      try {
        if (window.civitaiAPI) {
          const res = await window.civitaiAPI.deleteLocalModel(copy.id);
          if (res?.success) deletedCount++;
        }
      } catch (err) {
        console.error('Error deleting duplicate copy:', copy.filePath, err);
      }
    }

    const keeper = duplicateCopies.find((c) => c.id === keeperId);
    setResolutionFeedback(`Successfully removed ${deletedCount} duplicate file(s). Kept: ${keeper?.fileName}`);
    setTimeout(() => setResolutionFeedback(null), 5000);
    setResolvingHash(null);
    setExpandedDuplicateHash(null);
    await loadLocalModels();
  };

  const handleClearLibrary = async () => {
    if (isScanning) {
      alert('Cannot clear library while scanning is in progress. Please stop the scan first.');
      return;
    }
    if (localModels.length === 0) {
      alert('The library database is already empty.');
      return;
    }
    const confirmed = window.confirm(
      `Are you sure you want to clear your current library?\n\n` +
      `This will clear all ${localModels.length} cached model records and CivitAI metadata from the local database.\n\n` +
      `Note: Your actual model files on disk will NOT be deleted.`
    );
    if (!confirmed) {
      return;
    }

    setClearing(true);
    try {
      if (window.civitaiAPI && window.civitaiAPI.clearLibrary) {
        await window.civitaiAPI.clearLibrary();
      }
      setLocalModels([]);
      setResolutionFeedback('Library database cleared successfully. Click "Scan ComfyUI Folders" to perform a fresh scan.');
      setTimeout(() => setResolutionFeedback(null), 6000);
    } catch (err: any) {
      console.error('Failed to clear library:', err);
      alert(`Failed to clear library: ${err?.message || err}`);
    } finally {
      setClearing(false);
    }
  };

  const handleMatchUnidentified = async () => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.matchUnidentifiedModels !== 'function') return;
    setMatchingUnidentified(true);
    setUpdateSummary(null);
    try {
      const result = await window.civitaiAPI.matchUnidentifiedModels();
      await loadLocalModels();
      if (result && result.newlyMatched !== undefined) {
        if (result.newlyMatched > 0) {
          const details: string[] = [];
          if (result.civitaiMatched) details.push(`${result.civitaiMatched} CivitAI`);
          if (result.hfMatched) details.push(`${result.hfMatched} Hugging Face`);
          const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
          setUpdateSummary(`Successfully identified ${result.newlyMatched} of ${result.totalChecked} models${detailStr}!`);
        } else {
          setUpdateSummary(`Checked ${result.totalChecked} unidentified models (no matches found on CivitAI or Hugging Face).`);
        }
      }
      setTimeout(() => setUpdateSummary(null), 8000);
    } catch (e: any) {
      console.error('Failed to match models:', e);
      alert(`Model identification failed: ${e?.message || e}`);
    } finally {
      setMatchingUnidentified(false);
    }
  };

  const handleCheckAllUpdates = async () => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.checkAllUpdates !== 'function') return;
    setCheckingUpdates(true);
    setUpdateSummary(null);
    try {
      const result = await window.civitaiAPI.checkAllUpdates({ force: true });
      await loadLocalModels();
      if (result?.updatesFound > 0) {
        setUpdateSummary(`Found ${result.updatesFound} update(s) out of ${result.totalChecked} checked models!`);
        setFilter('updates');
      } else {
        setUpdateSummary(`All ${result?.totalChecked || 0} matched models are up to date!`);
      }
      setTimeout(() => setUpdateSummary(null), 8000);
    } catch (e: any) {
      console.error('Failed to check for updates:', e);
      alert(`Update check failed: ${e?.message || e}`);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handlePullMissingModel = async (model: LocalModel) => {
    setPullingModelId(model.id);
    setPullFeedback(null);
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.pullMissingModel === 'function') {
        const res: any = await window.civitaiAPI.pullMissingModel(model);
        if (res?.success) {
          setPullFeedback({
            id: model.id,
            message: `Download queued for ${model.civitaiName || model.fileName}! Check the Downloads tab.`,
            isError: false,
          });
          setTimeout(() => setPullFeedback(null), 8000);
          loadLocalModels();
        } else {
          setPullFeedback({
            id: model.id,
            message: res?.error || 'Failed to pull model from CivitAI.',
            isError: true,
          });
          setTimeout(() => setPullFeedback(null), 10000);
        }
      } else {
        alert('Missing model download API is unavailable.');
      }
    } catch (e: any) {
      setPullFeedback({
        id: model.id,
        message: `Error pulling model: ${e.message || e}`,
        isError: true,
      });
      setTimeout(() => setPullFeedback(null), 10000);
    } finally {
      setPullingModelId(null);
    }
  };

  const handlePullAllMissingModels = async () => {
    const missingEligible = localModels.filter(
      (m) => m.isMissing && (m.civitaiVersionId || m.sha256)
    );
    if (missingEligible.length === 0) {
      alert('No missing models with CivitAI Version IDs or SHA256 hashes found to pull.');
      return;
    }

    if (!confirm(`Queue downloads for ${missingEligible.length} missing model(s) from CivitAI?`)) {
      return;
    }

    setPullingAllMissing(true);
    let queued = 0;
    let failed = 0;

    for (const model of missingEligible) {
      try {
        if (window.civitaiAPI && typeof window.civitaiAPI.pullMissingModel === 'function') {
          const res: any = await window.civitaiAPI.pullMissingModel(model);
          if (res?.success) queued++;
          else failed++;
        }
      } catch {
        failed++;
      }
    }

    setPullingAllMissing(false);
    setUpdateSummary(`Queued ${queued} missing model(s) for download! (${failed} could not be matched on CivitAI).`);
    setTimeout(() => setUpdateSummary(null), 8000);
    loadLocalModels();
  };

  const duplicateGroups = React.useMemo(() => {
    const groups = new Map<string, LocalModel[]>();
    localModels.forEach((m) => {
      if (m.sha256 && m.isDuplicate) {
        if (!groups.has(m.sha256)) {
          groups.set(m.sha256, []);
        }
        groups.get(m.sha256)!.push(m);
      }
    });
    return groups;
  }, [localModels]);

  const filteredModels = React.useMemo(() => {
    const seenDuplicateHashes = new Set<string>();

    return localModels
      .filter((model) => {
        const matchesSearch =
          (model.fileName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (model.filePath || '').toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return false;

        // Type filter
        if (typeFilter !== 'all' && model.modelType !== typeFilter) return false;

        // NSFW filter
        const isNsfw = isModelNsfw(model);
        if (nsfwFilter === 'sfw' && isNsfw) return false;
        if (nsfwFilter === 'nsfw' && !isNsfw) return false;

        // Top-level filter
        if (filter === 'missing') {
          if (!model.isMissing) return false;
        } else if (filter === 'matched') {
          if (!model.isMatched) return false;
        } else if (filter === 'updates') {
          if (!model.hasUpdate) return false;
        } else if (filter === 'unidentified') {
          if (model.isMatched) return false;
        } else if (filter === 'duplicates') {
          if (!model.isDuplicate || !model.sha256) return false;
        } else if (filter === 'pickle') {
          if (!isPickleModel(model)) return false;
        }

        // Deduplicate identical files across library views so multi-copy models appear as one master card
        if (model.sha256) {
          if (seenDuplicateHashes.has(model.sha256)) return false;
          seenDuplicateHashes.add(model.sha256);
        }

        return true;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'name') {
          comparison = (a.fileName || '').localeCompare(b.fileName || '');
        } else if (sortBy === 'type') {
          const typeA = (a.modelType || 'Other').toLowerCase();
          const typeB = (b.modelType || 'Other').toLowerCase();
          comparison = typeA.localeCompare(typeB);
          if (comparison === 0) {
            comparison = (a.fileName || '').localeCompare(b.fileName || '');
          }
        } else if (sortBy === 'size') {
          comparison = (a.fileSize || 0) - (b.fileSize || 0);
        } else if (sortBy === 'date') {
          comparison = (a.modifiedAt || 0) - (b.modifiedAt || 0);
        }
        return sortAsc ? comparison : -comparison;
      });
  }, [localModels, searchQuery, typeFilter, nsfwFilter, filter, sortBy, sortAsc]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight">Local Model Library</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage scanned ComfyUI model files ({localModels.length} models found), check for version updates, and clean up duplicate files.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isScanning ? (
            <button
              onClick={cancelScan}
              title="Stop Scanning ComfyUI Folders"
              className="flex items-center gap-2.5 px-6 py-3 bg-linear-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold rounded-2xl text-sm transition-all shadow-xl shadow-rose-600/40 glow-rose cursor-pointer active:scale-95 animate-pulse"
            >
              <Square size={16} className="fill-white" />
              <span>Stop Scanning</span>
            </button>
          ) : (
            <button
              onClick={startScan}
              title="Scan ComfyUI Folders"
              className="flex items-center gap-2.5 px-6 py-3 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-sm transition-all shadow-xl shadow-purple-600/30 glow-purple cursor-pointer active:scale-95"
            >
              <FolderSearch size={20} />
              <span>Scan ComfyUI Folders</span>
            </button>
          )}

          {/* Identify Models Button (Two-pronged CivitAI + Hugging Face) */}
          <button
            onClick={handleMatchUnidentified}
            disabled={isScanning || matchingUnidentified || checkingUpdates || localModels.length === 0}
            title="Two-pronged identification: Query CivitAI (primary) and Hugging Face (fallback for LLMs, text encoders, GGUF) to fetch names, preview images, and metadata"
            className={`flex items-center gap-2 px-5 py-3 border font-bold rounded-2xl text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 active:scale-95 ${localModels.some((m) => !m.isMatched)
                ? 'bg-linear-to-r from-indigo-900/60 to-purple-900/60 hover:from-indigo-900/80 hover:to-purple-900/80 border-indigo-500/40 text-indigo-200 glow-purple'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/80 hover:border-indigo-500/50 text-slate-200 hover:text-indigo-300'
              }`}
          >
            <SearchCheck size={18} className={matchingUnidentified ? 'text-indigo-400 animate-spin' : 'text-indigo-400'} />
            <span>
              {matchingUnidentified
                ? 'Identifying...'
                : `Identify Models${localModels.filter((m) => !m.isMatched).length > 0 ? ` (${localModels.filter((m) => !m.isMatched).length})` : ''}`}
            </span>
          </button>

          {/* Check for Updates Button */}
          <button
            onClick={handleCheckAllUpdates}
            disabled={isScanning || checkingUpdates || localModels.length === 0}
            title="Query CivitAI to detect newer releases of matched local models"
            className="flex items-center gap-2 px-5 py-3 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-purple-500/50 text-slate-200 hover:text-purple-300 font-bold rounded-2xl text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <Sparkles size={18} className={checkingUpdates ? 'text-amber-400 animate-spin' : 'text-amber-400'} />
            <span>{checkingUpdates ? 'Checking Updates...' : 'Check for Updates'}</span>
          </button>

          {/* Auto-Sort Library Button */}
          <button
            onClick={handleOpenSortModal}
            disabled={isScanning || isAnalyzingSort || localModels.length === 0}
            title="Auto-organize your model library: scans your folders and relocates ControlNets, diffusion models (Anima/Flux/Wan), LLMs, and LoRAs into their proper ComfyUI directories"
            className={`flex items-center gap-2 px-5 py-3 border font-bold rounded-2xl text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 active:scale-95 ${
              sortPlan && sortPlan.misplacedCount > 0
                ? 'bg-linear-to-r from-amber-600/30 via-purple-600/30 to-indigo-600/30 hover:from-amber-600/50 hover:to-purple-600/50 border-amber-500/50 text-amber-200 glow-amber'
                : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/80 hover:border-indigo-500/50 text-slate-200 hover:text-indigo-300'
            }`}
          >
            <ArrowUpDown size={18} className={isAnalyzingSort ? 'text-amber-400 animate-spin' : 'text-amber-400'} />
            <span>
              {isAnalyzingSort
                ? 'Analyzing Structure...'
                : sortPlan && sortPlan.misplacedCount > 0
                ? `Auto-Sort Library (${sortPlan.misplacedCount} Misplaced)`
                : 'Auto-Sort Library'}
            </span>
          </button>

          {/* Clear Library Button */}
          <button
            onClick={handleClearLibrary}
            disabled={isScanning || clearing}
            title="Clear cached model records from database without deleting physical files from disk"
            className="flex items-center gap-2 px-4.5 py-3 bg-slate-900/90 hover:bg-rose-950/40 border border-slate-700/80 hover:border-rose-500/50 text-slate-300 hover:text-rose-300 font-bold rounded-2xl text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <Trash2 size={16} className="text-rose-400" />
            <span>{clearing ? 'Clearing...' : 'Clear Library'}</span>
          </button>
        </div>
      </div>

      {/* Update Summary Banner */}
      {updateSummary && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center justify-between gap-3 text-sm font-semibold glow-amber animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <Sparkles size={20} className="text-amber-400" />
            <span>{updateSummary}</span>
          </div>
          <button
            onClick={() => setUpdateSummary(null)}
            className="text-amber-400/60 hover:text-amber-300 text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Hero Scan Progress Bar Banner */}
      {scanProgress && scanProgress.status !== 'idle' && (
        <div className="p-6 rounded-3xl glass-panel border border-purple-500/40 space-y-3 shadow-2xl glow-purple animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-300">
                <RefreshCw className={isScanning ? 'animate-spin' : ''} size={22} />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-100 text-sm capitalize">
                  {scanProgress.status === 'scanning' && '1. Scanning Directory Structure'}
                  {scanProgress.status === 'hashing' && '2. Computing SHA256 Model Hashes'}
                  {scanProgress.status === 'lookup' && '3. CivitAI Database Matching'}
                  {scanProgress.status === 'completed' && 'Scan Complete!'}
                  {scanProgress.status === 'failed' && 'Scan Failed'}
                </h3>
                <p className="text-xs text-slate-400 font-mono line-clamp-1 mt-0.5">
                  {scanProgress.currentFile || 'Processing files...'}
                </p>
              </div>
            </div>

            <div className="text-right flex items-center gap-4">
              <div>
                <span className="text-base font-extrabold text-purple-300 font-mono">
                  {scanProgress.totalFiles > 0
                    ? `${Math.round((scanProgress.scannedFiles / scanProgress.totalFiles) * 100)}%`
                    : '0%'}
                </span>
                <span className="text-xs text-slate-400 block font-mono">
                  {scanProgress.scannedFiles} / {scanProgress.totalFiles} files
                </span>
              </div>
              {isScanning && (
                <button
                  onClick={cancelScan}
                  className="px-3 py-1.5 bg-rose-600/30 hover:bg-rose-600/60 border border-rose-500/40 text-rose-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Square size={12} className="fill-rose-300" />
                  <span>Stop</span>
                </button>
              )}
            </div>
          </div>

          <div className="w-full bg-slate-950 rounded-full h-3.5 overflow-hidden border border-slate-800/80 shadow-inner">
            <div
              className="bg-linear-to-r from-purple-600 via-indigo-500 to-purple-500 h-full transition-all duration-300 rounded-full glow-purple"
              style={{
                width: `${scanProgress.totalFiles > 0
                    ? Math.min(100, Math.round((scanProgress.scannedFiles / scanProgress.totalFiles) * 100))
                    : scanProgress.status === 'completed' ? 100 : 5
                  }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Misplaced Models Detected Auto-Sort Banner */}
      {sortPlan && sortPlan.misplacedCount > 0 && !isSortModalOpen && (
        <div className="p-4 rounded-2xl bg-linear-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 border border-amber-500/40 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-medium animate-fadeIn glow-amber shadow-lg">
          <div className="flex items-center gap-2.5">
            <Sparkles size={20} className="text-amber-400 shrink-0" />
            <div>
              <strong className="text-amber-100 font-bold">
                {sortPlan.misplacedCount} model(s) are in the wrong folder
              </strong>{' '}
              (e.g. ControlNets, Anima diffusion models, or LLMs stored in checkpoints). Auto-Sort can relocate them into their standardized directories.
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              onClick={handleOpenSortModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-linear-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer shrink-0 active:scale-95 glow-amber"
            >
              <ArrowUpDown size={13} className="text-slate-950 font-bold" />
              <span>Review &amp; Auto-Sort ({sortPlan.misplacedCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* Missing Models Detected from Library Import Banner */}
      {localModels.some((m) => m.isMissing) && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-medium animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={20} className="text-rose-400 shrink-0" />
            <div>
              <strong className="text-rose-100 font-bold">
                {localModels.filter((m) => m.isMissing).length} model(s) in your library are missing from disk
              </strong>{' '}
              (e.g., from a restored backup). You can pull and redownload matched models directly from CivitAI.
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => setFilter('missing')}
              className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              View Missing ({localModels.filter((m) => m.isMissing).length})
            </button>
            <button
              onClick={handlePullAllMissingModels}
              disabled={pullingAllMissing || isScanning}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer shrink-0 disabled:opacity-50 active:scale-95"
            >
              {pullingAllMissing ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download size={13} />
                  <span>Download All Missing ({localModels.filter((m) => m.isMissing && (m.civitaiVersionId || m.sha256)).length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="glass-panel p-4 rounded-2xl flex flex-wrap gap-4 items-center justify-between text-sm shadow-xl">
        <div className="flex flex-wrap gap-2">
          {(['all', 'missing', 'matched', 'updates', 'unidentified', 'duplicates', 'pickle'] as const).map((t) => {
            let count = 0;
            if (t === 'missing') count = localModels.filter((m) => m.isMissing).length;
            else if (t === 'matched') count = localModels.filter((m) => m.isMatched).length;
            else if (t === 'updates') count = localModels.filter((m) => m.hasUpdate).length;
            else if (t === 'unidentified') count = localModels.filter((m) => !m.isMatched).length;
            else if (t === 'duplicates') count = duplicateGroups.size;
            else if (t === 'pickle') count = localModels.filter(isPickleModel).length;
            else count = localModels.length;

            const isMissingFilter = t === 'missing';
            const isPickleFilter = t === 'pickle';

            let label = t as string;
            if (isMissingFilter) label = 'Missing on Disk';
            else if (isPickleFilter) label = 'Pickle (.ckpt/.pt)';

            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer flex items-center gap-1.5 ${filter === t
                    ? isMissingFilter
                      ? 'bg-linear-to-r from-rose-600 to-amber-600 text-white shadow-md shadow-rose-600/30'
                      : isPickleFilter
                        ? 'bg-linear-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/30'
                        : 'bg-linear-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                    : isMissingFilter && count > 0
                      ? 'bg-rose-950/40 text-rose-300 hover:text-rose-200 border border-rose-500/40 animate-pulse'
                      : isPickleFilter && count > 0
                        ? 'bg-cyan-950/40 text-cyan-300 hover:text-cyan-200 border border-cyan-500/40'
                        : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
              >
                {isMissingFilter && <AlertTriangle size={13} className={count > 0 ? 'text-rose-400' : 'text-slate-500'} />}
                {isPickleFilter && <Sparkles size={13} className={count > 0 ? 'text-cyan-400' : 'text-slate-500'} />}
                <span>{label} ({count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* N/SFW Filter Pill Group */}
          <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setNsfwFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${nsfwFilter === 'all'
                  ? 'bg-slate-800 text-slate-100 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              All Content
            </button>
            <button
              onClick={() => setNsfwFilter('sfw')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${nsfwFilter === 'sfw'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
              title="Show only SFW models"
            >
              <ShieldCheck size={12} className={nsfwFilter === 'sfw' ? 'text-emerald-400' : 'text-slate-400'} />
              <span>SFW</span>
            </button>
            <button
              onClick={() => setNsfwFilter('nsfw')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${nsfwFilter === 'nsfw'
                  ? 'bg-rose-500/20 text-rose-300 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
              title="Show only NSFW models"
            >
              <Flame size={12} className={nsfwFilter === 'nsfw' ? 'text-rose-400' : 'text-slate-400'} />
              <span>NSFW</span>
            </button>
          </div>

          {/* Blur NSFW Toggle Button */}
          <button
            onClick={() => setBlurNsfw(!blurNsfw)}
            title={blurNsfw ? 'NSFW preview thumbnails are blurred. Click to unblur.' : 'NSFW preview thumbnails are visible. Click to blur.'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-sm ${blurNsfw
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                : 'bg-slate-900 border-slate-700/80 text-slate-400 hover:text-slate-200'
              }`}
          >
            {blurNsfw ? <EyeOff size={13} className="text-amber-400" /> : <Eye size={13} className="text-slate-400" />}
            <span>{blurNsfw ? 'Blur NSFW' : 'Show NSFW'}</span>
          </button>

          {/* Model Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="all">All Types</option>
            {['Checkpoint', 'LORA', 'LLM', 'LoCon', 'DoRA', 'TextualInversion', 'Hypernetwork', 'VAE', 'Controlnet', 'Upscaler', 'MotionModule', 'AestheticGradient', 'Poses', 'Wildcards', 'Workflows', 'Detection', 'Other'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {/* Sort By Options (Name, Type, Size, Date) */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-xl p-1">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent px-2.5 py-1 text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="name" className="bg-slate-900">Name</option>
              <option value="type" className="bg-slate-900">Type</option>
              <option value="size" className="bg-slate-900">Size</option>
              <option value="date" className="bg-slate-900">Date Modified</option>
            </select>

            {/* Sort Asc/Desc Direction Toggle */}
            <button
              onClick={() => setSortAsc(!sortAsc)}
              title={sortAsc ? 'Ascending Order (Click for Descending)' : 'Descending Order (Click for Ascending)'}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by filename or path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-900/90 border border-slate-700/60 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 w-full"
          />
        </div>
      </div>

      {/* Resolution Success Banner */}
      {resolutionFeedback && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2.5 glow-emerald animate-fadeIn">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span>{resolutionFeedback}</span>
        </div>
      )}

      {/* Model List */}
      {loading && localModels.length === 0 ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 glow-purple"></div>
        </div>
      ) : filteredModels.length === 0 ? (
        <div className="text-center py-28 text-slate-500 text-sm glass-panel rounded-3xl p-8 border border-slate-800 space-y-3">
          <HardDrive size={40} className="mx-auto text-slate-600 stroke-[1.5]" />
          <h3 className="text-base font-bold text-slate-300">No Models Displayed</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {localModels.length > 0
              ? 'No models matched your active filter or search query. Try clearing your search input.'
              : 'Add your ComfyUI model folder paths in Settings and click "Scan ComfyUI Folders" above.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredModels.map((model) => {
            const duplicateCopies = model.sha256
              ? localModels.filter((m) => m.sha256 === model.sha256)
              : [model];
            const isExpanded = !!model.sha256 && (
              filter === 'duplicates'
                ? expandedDuplicateHash !== `collapsed_${model.sha256}`
                : expandedDuplicateHash === model.sha256
            );
            const currentKeeperId = (model.sha256 && selectedKeepers[model.sha256]) || model.id;
            const isNsfwModel = isModelNsfw(model);
            const shouldBlur = isNsfwModel && blurNsfw;

            return (
              <div
                key={model.id}
                className={`glass-card p-4.5 rounded-2xl flex flex-col justify-between gap-4 border transition-all shadow-md ${isExpanded
                    ? 'border-amber-500/50 bg-slate-900/90 shadow-xl shadow-amber-950/20'
                    : 'border-slate-800/80 hover:border-purple-500/30'
                  }`}
              >
                {/* Main Card Row */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
                  <div
                    className={`flex items-center gap-4 flex-1 min-w-0 transition-all duration-300 ${shouldBlur
                        ? 'filter blur-[7px] hover:blur-none opacity-60 hover:opacity-100 select-none cursor-pointer'
                        : ''
                      }`}
                    title={shouldBlur ? 'NSFW model: Hover to reveal name and path details' : undefined}
                  >
                    {/* Preview thumbnail if available, otherwise HardDrive icon */}
                    {model.previewUrl ? (
                      <div
                        onClick={() => setSelectedModelDetail(model)}
                        className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-purple-500/30 hover:border-purple-400 shadow-md bg-slate-950 relative group cursor-pointer transition-all hover:scale-105 active:scale-95"
                        title="Click to view model details & trigger words"
                      >
                        <FallbackImage
                          src={model.previewUrl}
                          alt={model.civitaiName || model.fileName}
                          isBlurred={shouldBlur}
                          className="w-full h-full object-cover transition-all duration-300"
                          fallbackIcon={
                            <div className="w-full h-full bg-slate-900 flex items-center justify-center text-purple-400">
                              <HardDrive size={20} />
                            </div>
                          }
                          fallbackText=""
                        />
                        {shouldBlur && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                            <span className="text-[9px] font-extrabold text-rose-300 font-mono px-1 py-0.5 bg-rose-950/90 rounded border border-rose-500/50 shadow-sm">
                              18+
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        onClick={() => setSelectedModelDetail(model)}
                        className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 flex items-center justify-center text-purple-400 shrink-0 shadow-inner cursor-pointer transition-all hover:scale-105 active:scale-95"
                        title="Click to view model details & trigger words"
                      >
                        <HardDrive size={20} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap max-w-full">
                        <h3
                          onClick={() => setSelectedModelDetail(model)}
                          className="font-bold text-slate-100 hover:text-purple-300 text-sm truncate max-w-[15rem] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl cursor-pointer transition-colors"
                          title={model.civitaiName ? `${model.civitaiName} (${model.fileName}) — Click to view details & trigger words` : `${model.fileName} — Click to view details & trigger words`}
                        >
                          {model.civitaiName || model.fileName}
                        </h3>
                        {isPickleModel(model) && (
                          isModelDeemedSafe(model) ? (
                            <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm" title="Opcode verified safe YOLO detector model. Preserved in .pt format.">
                              <ShieldCheck size={11} className="text-emerald-400" />
                              <span>Deemed Safe (YOLO .pt)</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                              <Sparkles size={11} className="text-cyan-400" />
                              <span>Pickle ({model.fileName.split('.').pop()?.toUpperCase()})</span>
                            </span>
                          )
                        )}
                        {(model.modelType || model.civitaiType) && (
                          <span className="text-[10px] font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
                            {model.modelType || model.civitaiType}
                          </span>
                        )}
                        {model.isMultiPart && (
                          <span
                            className="text-[10px] font-extrabold text-indigo-300 bg-indigo-500/20 border border-indigo-500/40 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm"
                            title={`Multi-part sharded model (${model.availableParts || (model.shards?.length || 1)} of ${model.totalParts || (model.shards?.length || 1)} shards available)`}
                          >
                            <Layers size={11} className="text-indigo-400" />
                            <span>Multi-Part ({model.availableParts || (model.shards?.length || 1)}/{model.totalParts || (model.shards?.length || 1)} Shards)</span>
                          </span>
                        )}
                        {shouldBlur && (
                          <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                            NSFW (Hover to reveal)
                          </span>
                        )}
                        {duplicateCopies.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!model.sha256) return;
                              if (filter === 'duplicates') {
                                setExpandedDuplicateHash(
                                  expandedDuplicateHash === `collapsed_${model.sha256}`
                                    ? null
                                    : `collapsed_${model.sha256}`
                                );
                              } else {
                                setExpandedDuplicateHash(
                                  expandedDuplicateHash === model.sha256 ? null : model.sha256
                                );
                              }
                            }}
                            className={`flex items-center gap-1.5 text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border transition-all cursor-pointer ${model.isDuplicate
                                ? isExpanded
                                  ? 'text-amber-200 bg-amber-500/30 border-amber-400 glow-amber'
                                  : 'text-amber-400 bg-amber-500/15 border-amber-500/40 hover:bg-amber-500/25 glow-amber'
                                : isExpanded
                                  ? 'text-emerald-200 bg-emerald-500/30 border-emerald-400'
                                  : 'text-slate-300 bg-slate-800/80 border-slate-700/80 hover:border-slate-600'
                              }`}
                            title={
                              model.isDuplicate
                                ? 'Duplicate copies warning (Click to expand copies and choose keeper)'
                                : 'Intentionally duplicated set (Click to expand copies)'
                            }
                          >
                            {model.isDuplicate ? (
                              <Copy size={11} />
                            ) : (
                              <ShieldCheck size={11} className="text-emerald-400" />
                            )}
                            <span>
                              {model.isDuplicate
                                ? `Duplicate (${duplicateCopies.length})`
                                : `Multi-Copy (${duplicateCopies.length})`}
                            </span>
                            <ChevronDown
                              size={11}
                              className={`transition-transform duration-200 ${isExpanded ? 'rotate-180 text-amber-300' : ''}`}
                            />
                          </button>
                        )}
                      </div>

                      {/* LoRA & Trigger Words Quick Bar */}
                      {model.trainedWords && model.trainedWords.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedModelDetail(model);
                            }}
                            className="text-[10px] font-bold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors glow-amber"
                            title="Click to view full trigger words and details"
                          >
                            <Sparkles size={11} className="text-amber-400" />
                            <span>{model.trainedWords.length} Trigger{model.trainedWords.length > 1 ? 's' : ''}</span>
                          </button>
                          {model.trainedWords.slice(0, 3).map((tw, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={(e) => handleCopyTriggerWord(tw, e)}
                              className="text-[10px] font-mono bg-slate-900/90 hover:bg-amber-950/40 border border-slate-700/80 hover:border-amber-500/50 text-slate-300 hover:text-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                              title={`Click to copy: "${tw}"`}
                            >
                              {copiedTriggerWord === tw ? (
                                <Check size={10} className="text-emerald-400" />
                              ) : (
                                <Copy size={10} className="text-slate-500 hover:text-amber-400" />
                              )}
                              <span className="truncate max-w-[130px]">{tw}</span>
                            </button>
                          ))}
                          {model.trainedWords.length > 3 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedModelDetail(model);
                              }}
                              className="text-[10px] text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                            >
                              +{model.trainedWords.length - 3} more...
                            </button>
                          )}
                        </div>
                      ) : (model.modelType === 'LORA' || model.modelType === 'LoCon' || model.modelType === 'DoRA' || model.civitaiType === 'LORA') ? (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedModelDetail(model);
                            }}
                            className="text-[10px] font-semibold text-purple-300 hover:text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                            title="Click to inspect LoRA trigger words and info"
                          >
                            <Sparkles size={10} className="text-purple-400" />
                            <span>Inspect LoRA Triggers</span>
                          </button>
                        </div>
                      ) : null}

                      <p className="text-xs text-slate-400 font-mono truncate mt-1 flex items-center gap-1.5">
                        <Folder size={12} className="text-slate-500 shrink-0" />
                        <span className="truncate">{model.filePath}</span>
                      </p>
                    </div>
                  </div>

                  {/* Status Badges & Info */}
                  <div className="flex flex-wrap items-center gap-3 text-xs w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-800/80">
                    <span className="text-slate-300 font-mono font-semibold bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                      {(model.fileSize / 1024 / 1024).toFixed(1)} MB
                    </span>

                    {/* Manual NSFW / SFW Toggle Button */}
                    <button
                      onClick={() => handleToggleModelNsfw(model)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer text-xs shadow-sm ${isModelNsfw(model)
                          ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300 hover:bg-rose-500/25 glow-rose'
                          : 'bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      title={
                        isModelNsfw(model)
                          ? 'Flagged as NSFW. Click to switch to SFW.'
                          : 'Marked as SFW. Click to flag as NSFW.'
                      }
                    >
                      {isModelNsfw(model) ? (
                        <>
                          <Flame size={13} className="text-rose-400" />
                          <span>NSFW</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={13} className="text-slate-400" />
                          <span>SFW</span>
                        </>
                      )}
                    </button>

                    {/* Missing from Disk Indicator & 1-Click Pull Button */}
                    {model.isMissing && (
                      <span
                        className="flex items-center gap-1.5 text-rose-300 bg-rose-500/20 border border-rose-500/40 px-3 py-1.5 rounded-xl font-bold glow-rose animate-pulse"
                        title="This file does not exist at its configured path on disk."
                      >
                        <AlertTriangle size={14} className="text-rose-400" />
                        <span>Missing on Disk</span>
                      </span>
                    )}

                    {model.isMissing && (model.civitaiVersionId || model.sha256) && (
                      <button
                        onClick={() => handlePullMissingModel(model)}
                        disabled={pullingModelId === model.id || isScanning}
                        className="flex items-center gap-1.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold px-3.5 py-1.5 rounded-xl hover:shadow-lg hover:shadow-purple-500/30 transition-all cursor-pointer disabled:opacity-50 active:scale-95 text-xs shadow-md shadow-purple-950/40"
                        title={
                          model.civitaiVersionId
                            ? `Download ${model.civitaiName || model.fileName} from CivitAI into your models directory`
                            : `Lookup CivitAI by SHA256 hash (${model.sha256 ? model.sha256.substring(0, 10) + '...' : ''}) and download model`
                        }
                      >
                        {pullingModelId === model.id ? (
                          <>
                            <Loader2 size={13} className="animate-spin text-purple-200" />
                            <span>Pulling...</span>
                          </>
                        ) : (
                          <>
                            <Download size={13} className="text-purple-200" />
                            <span>{model.isMatched ? 'Download Model' : 'Pull (Hash Match)'}</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Matched / Unidentified Badge (Clickable to Edit/Link Specifics) */}
                    <button
                      type="button"
                      onClick={() => openLinkSpecificsModal(model)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer text-xs shadow-sm ${
                        model.isMatched
                          ? 'text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 hover:border-emerald-500/50'
                          : 'text-slate-300 hover:text-amber-200 bg-slate-800/90 hover:bg-amber-500/20 border border-slate-700/80 hover:border-amber-500/40'
                      }`}
                      title={
                        model.isMatched
                          ? 'Model matched with metadata. Click to view or edit specifics / custom link.'
                          : 'Unidentified model. Click to link specifics from Hugging Face / CivitAI or enter manual info.'
                      }
                    >
                      {model.isMatched ? (
                        <>
                          <CheckCircle size={14} className="text-emerald-400" />
                          <span>Matched</span>
                        </>
                      ) : (
                        <>
                          <HelpCircle size={14} className="text-amber-400" />
                          <span>Unidentified</span>
                        </>
                      )}
                    </button>

                    {model.hasUpdate && (
                      <button
                        onClick={() => onCheckUpdate(model)}
                        className="flex items-center gap-1.5 text-amber-300 bg-amber-500/20 border border-amber-500/40 px-3.5 py-1.5 rounded-xl hover:bg-amber-500/30 transition-all font-bold glow-amber cursor-pointer"
                        title="Newer release available on CivitAI! Click to view update details."
                      >
                        <ArrowUpCircle size={14} />
                        <span>Update: {model.updateVersionName || 'Available'}</span>
                      </button>
                    )}

                    {/* Convert to SafeTensors Action Button / Deemed Safe Badge */}
                    {isPickleModel(model) && !model.isMissing && (
                      isModelDeemedSafe(model) ? (
                        <span
                          className="flex items-center gap-1.5 text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-xl font-bold text-xs select-none shadow-sm shadow-emerald-950/30"
                          title="Opcode verified safe YOLO detector model. Preserved in .pt format to maintain PyTorch bounding box and segmentation detector functionality."
                        >
                          <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
                          <span>Deemed Safe (YOLO .pt)</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => setModelToConvert(model)}
                          disabled={convertingModelId === model.id}
                          className="flex items-center gap-1.5 text-cyan-200 bg-cyan-500/20 border border-cyan-500/40 hover:bg-cyan-500/30 hover:text-white px-3 py-1.5 rounded-xl transition-all font-bold glow-cyan cursor-pointer text-xs shadow-md shadow-cyan-950/40"
                          title="Convert this PyTorch pickle model (.ckpt/.pt/.bin) to SafeTensors format"
                        >
                          {convertingModelId === model.id ? (
                            <>
                              <Loader2 size={13} className="animate-spin text-cyan-300" />
                              <span>Converting...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles size={13} className="text-cyan-400" />
                              <span>Convert to Safetensors</span>
                            </>
                          )}
                        </button>
                      )
                    )}

                    {/* Link / Edit Specifics Button */}
                    <button
                      onClick={() => openLinkSpecificsModal(model)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/15 transition-colors cursor-pointer"
                      title="Link / Edit Model Specifics (CivitAI / Hugging Face / Custom Info)"
                    >
                      <Link2 size={16} />
                    </button>

                    {/* External Link Button (Hugging Face for GGUF/blobs, CivitAI / CivitAI.red for others) */}
                    {(() => {
                      const { label, isHf, isNsfw } = getModelExternalUrl(model);
                      return (
                        <button
                          onClick={() => handleOpenModelLink(model)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isHf
                              ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/15'
                              : isNsfw
                                ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/15'
                                : 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/15'
                            }`}
                          title={label}
                        >
                          <ExternalLink size={16} />
                        </button>
                      );
                    })()}

                    {/* Swarm Companion Packaging Button */}
                    {!model.isMissing && (
                      <button
                        onClick={() => handlePackageSingleModel(model)}
                        disabled={packagingModelId === model.id}
                        className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 transition-colors cursor-pointer"
                        title="Generate missing Swarm companion files (.sha256, .info, preview image) for P2P seeding"
                      >
                        {packagingModelId === model.id ? (
                          <Loader2 size={16} className="animate-spin text-emerald-300" />
                        ) : (
                          <Package size={16} />
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => handleOpenFolder(model.filePath)}
                      className="text-slate-400 hover:text-amber-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                      title="Show in File Explorer"
                    >
                      <FolderOpen size={16} />
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={() => setModelToDelete(model)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Delete or remove model"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Inline Companion Packaging Toast on Model Card */}
                {packageFeedback && packageFeedback.id === model.id && (
                  <div
                    className={`w-full p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border animate-fadeIn ${packageFeedback.isError
                        ? 'bg-rose-950/70 border-rose-500/40 text-rose-200 glow-rose'
                        : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200 glow-emerald'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      {packageFeedback.isError ? (
                        <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                      ) : (
                        <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                      )}
                      <span>{packageFeedback.message}</span>
                    </div>
                    <button
                      onClick={() => setPackageFeedback(null)}
                      className="text-slate-400 hover:text-slate-200 text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Inline Conversion Toast on Model Card */}
                {convertFeedback && convertFeedback.id === model.id && (
                  <div
                    className={`w-full p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border animate-fadeIn ${convertFeedback.isError
                        ? 'bg-rose-950/70 border-rose-500/40 text-rose-200 glow-rose'
                        : 'bg-cyan-950/70 border-cyan-500/40 text-cyan-200 glow-cyan'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      {convertFeedback.isError ? (
                        <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                      ) : (
                        <CheckCircle2 size={15} className="text-cyan-400 shrink-0" />
                      )}
                      <span>{convertFeedback.message}</span>
                    </div>
                    <button
                      onClick={() => setConvertFeedback(null)}
                      className="text-slate-400 hover:text-slate-200 text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Inline Pull / Download Toast on Model Card */}
                {pullFeedback && pullFeedback.id === model.id && (
                  <div
                    className={`w-full p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border animate-fadeIn ${pullFeedback.isError
                        ? 'bg-rose-950/70 border-rose-500/40 text-rose-200 glow-rose'
                        : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200 glow-emerald'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      {pullFeedback.isError ? (
                        <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                      ) : (
                        <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                      )}
                      <span>{pullFeedback.message}</span>
                    </div>
                    <button
                      onClick={() => setPullFeedback(null)}
                      className="text-slate-400 hover:text-slate-200 text-xs px-1 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Inline Expanded Duplicate Resolution Panel */}
                {isExpanded && (
                  <div className="w-full pt-3.5 border-t border-amber-500/20 bg-slate-950/60 p-4 rounded-xl space-y-3.5 shadow-inner animate-fadeIn">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Copy size={15} className="text-amber-400" />
                        <span className="text-xs font-bold text-slate-100">
                          Duplicate Copies on Disk ({duplicateCopies.length} found)
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                          SHA256: {model.sha256?.substring(0, 12)}...
                        </span>
                        {model.sha256 && ignoredDuplicates.some((ig) => ig.sha256.toUpperCase() === model.sha256!.toUpperCase()) && (
                          <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                            <ShieldCheck size={11} /> Intentionally Duplicated
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-amber-300/80 font-medium">
                        Select which copy to keep, or ignore this duplicate set.
                      </span>
                    </div>

                    {/* Copy List */}
                    <div className="space-y-2.5">
                      {duplicateCopies.map((copy) => {
                        const isKeeper = currentKeeperId === copy.id;
                        const folderDir = getFolderPath(copy.filePath);

                        return (
                          <div
                            key={copy.id}
                            onClick={() => model.sha256 && setSelectedKeepers((prev) => ({ ...prev, [model.sha256!]: copy.id }))}
                            className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer ${isKeeper
                                ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-950/20'
                                : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                              }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="shrink-0">
                                {isKeeper ? (
                                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-full border-2 border-slate-600 hover:border-slate-400" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-100 truncate">{copy.fileName}</span>
                                  {isKeeper && (
                                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                                      Keep This File
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5" title={copy.filePath}>
                                  📁 {folderDir}
                                </p>
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                                  <span>Size: <strong className="text-slate-200">{(copy.fileSize / 1024 / 1024).toFixed(1)} MB</strong></span>
                                  <span>•</span>
                                  <span>Modified: <strong className="text-slate-300">{new Date(copy.modifiedAt).toLocaleString()}</strong></span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenFolder(copy.filePath);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 text-[11px] font-medium transition-colors self-end sm:self-center"
                              title="Show in File Explorer"
                            >
                              <FolderOpen size={13} className="text-amber-400" />
                              <span>Show in Folder</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Footer Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-800/80">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] text-slate-400">
                          {duplicateCopies.length > 1
                            ? `Will permanently delete ${duplicateCopies.length - 1} copy(ies) from disk.`
                            : 'No other copies found on disk.'}
                        </span>

                        {/* Ignore / Unignore Duplicate Set Button */}
                        {model.sha256 && (
                          ignoredDuplicates.some((ig) => ig.sha256.toUpperCase() === model.sha256!.toUpperCase()) ? (
                            <button
                              type="button"
                              onClick={() => model.sha256 && handleUnignoreDuplicateSet(model.sha256)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer shadow-sm"
                              title="Restore duplicate warnings for this file set"
                            >
                              <Eye size={13} className="text-slate-400" />
                              <span>Unignore Duplicate Set</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => model.sha256 && handleIgnoreDuplicateSet(model.sha256, duplicateCopies.length)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold transition-all cursor-pointer shadow-sm"
                              title="Mark this SHA256 as intentionally duplicated (e.g. required by specific custom nodes). Excludes from duplicate warnings until a new copy is found."
                            >
                              <EyeOff size={13} className="text-amber-400" />
                              <span>Ignore This Duplicate Set</span>
                            </button>
                          )
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={resolvingHash === model.sha256 || duplicateCopies.length <= 1}
                        onClick={() => model.sha256 && handleResolveDuplicates(model.sha256, currentKeeperId, duplicateCopies)}
                        className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-red-950/30 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        <span>
                          {resolvingHash === model.sha256
                            ? 'Deleting copies...'
                            : `Keep Selected & Delete Other ${duplicateCopies.length - 1} Copy(ies)`}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete / Remove Options Modal */}
      {modelToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn" onClick={() => !isDeleting && setModelToDelete(null)}>
          <div
            className="glass-panel w-full max-w-md rounded-3xl overflow-hidden flex flex-col border border-slate-700/70 shadow-2xl animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-100">Delete Model</h3>
                  <p className="text-xs text-slate-400">Choose how to remove this model</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isDeleting && setModelToDelete(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Target Model Info */}
            <div className="p-5 space-y-4 text-xs text-slate-300">
              <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Target Model</span>
                <p className="font-bold text-slate-100 text-sm truncate">{modelToDelete.fileName}</p>
                <p className="text-[11px] text-slate-400 font-mono truncate">{modelToDelete.filePath}</p>
                <div className="pt-1.5 flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                  <span>Size: <strong className="text-slate-200">{(modelToDelete.fileSize / 1024 / 1024).toFixed(1)} MB</strong></span>
                  <span>Type: <strong className="text-purple-300">{modelToDelete.modelType || 'Other'}</strong></span>
                </div>
              </div>

              {/* Option 1: Remove from Library Only */}
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    if (window.civitaiAPI) {
                      const res = await window.civitaiAPI.deleteLocalModel(modelToDelete.id, false);
                      if (res?.success) {
                        setResolutionFeedback(`Removed ${modelToDelete.fileName} from Library catalog (File preserved on disk).`);
                        setTimeout(() => setResolutionFeedback(null), 5000);
                        setModelToDelete(null);
                        await loadLocalModels();
                      } else {
                        alert(res?.error || 'Failed to remove model');
                      }
                    }
                  } catch (err: any) {
                    alert(err?.message || 'Error removing model');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="w-full text-left p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <BookmarkMinus size={18} className="text-amber-400 shrink-0" />
                  <div className="flex-1">
                    <span className="font-bold text-sm text-amber-200 group-hover:text-amber-100 block">
                      Remove from Library Only
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                      Clears this model from the manager catalog & database cache. The physical file remains on your hard drive and ComfyUI can still use it.
                    </p>
                  </div>
                </div>
              </button>

              {/* Option 2: Delete from Disk & Library */}
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    if (window.civitaiAPI) {
                      const res = await window.civitaiAPI.deleteLocalModel(modelToDelete.id, true);
                      if (res?.success) {
                        setResolutionFeedback(`Permanently deleted ${modelToDelete.fileName} from disk & library.`);
                        setTimeout(() => setResolutionFeedback(null), 5000);
                        setModelToDelete(null);
                        await loadLocalModels();
                      } else {
                        alert(res?.error || 'Failed to delete model from disk');
                      }
                    }
                  } catch (err: any) {
                    alert(err?.message || 'Error deleting model');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="w-full text-left p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 transition-all cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <Trash2 size={18} className="text-rose-400 shrink-0" />
                  <div className="flex-1">
                    <span className="font-bold text-sm text-rose-200 group-hover:text-rose-100 block">
                      Delete from Disk & Library
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-normal">
                      Permanently deletes the physical <code className="text-rose-300 font-mono text-[10px]">.safetensors</code> file from storage and removes its library record. This cannot be undone.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 flex justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setModelToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to SafeTensors Modal */}
      {modelToConvert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
          onClick={() => {
            if (convertingModelId !== modelToConvert.id) setModelToConvert(null);
          }}
        >
          <div
            className="glass-panel bg-slate-950 border border-cyan-500/40 p-0 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl glow-cyan animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Convert Model to SafeTensors</h3>
                  <p className="text-[11px] text-slate-400">Zero-copy, secure tensor serialization with automatic hash updating</p>
                </div>
              </div>
              <button
                type="button"
                disabled={convertingModelId === modelToConvert.id}
                onClick={() => setModelToConvert(null)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs text-slate-300">
              <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Source Model</span>
                <p className="font-bold text-slate-100 text-sm truncate">{modelToConvert.fileName}</p>
                <p className="text-[11px] text-slate-400 font-mono truncate">{modelToConvert.filePath}</p>
                <div className="pt-1 flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                  <span>Size: <strong className="text-slate-200">{(modelToConvert.fileSize / 1024 / 1024).toFixed(1)} MB</strong></span>
                  <span>Target: <strong className="text-cyan-300 font-mono">{modelToConvert.fileName.replace(/\.(ckpt|pt|bin)$/i, '.safetensors')}</strong></span>
                </div>
              </div>

              {/* Benefits Note */}
              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-cyan-200 text-[11px] space-y-1">
                <p className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-cyan-400" />
                  <span>Why convert to SafeTensors?</span>
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1 text-[11px]">
                  <li>Eliminates PyTorch pickle arbitrary code execution vulnerabilities.</li>
                  <li>Faster load times into GPU VRAM via direct memory mapping (mmap).</li>
                  <li>Preserves CivitAI metadata, hash associations, and preview images in library.</li>
                </ul>
              </div>

              {/* Hardware & OOM Safety Assessment Card */}
              <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                    <Cpu size={14} className="text-cyan-400" />
                    <span>Hardware & Memory Safety Assessment</span>
                  </div>
                  {isCheckingHardware ? (
                    <span className="flex items-center gap-1 text-[10px] text-cyan-400">
                      <Loader2 size={11} className="animate-spin" /> Scanning system...
                    </span>
                  ) : hardwareAssessment ? (
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${hardwareAssessment.riskLevel === 'safe'
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                          : hardwareAssessment.riskLevel === 'warning'
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                            : 'bg-rose-500/10 border border-rose-500/30 text-rose-400 animate-pulse'
                        }`}
                    >
                      {hardwareAssessment.riskLevel === 'safe'
                        ? 'Safe for Conversion'
                        : hardwareAssessment.riskLevel === 'warning'
                          ? 'Moderate Memory Risk'
                          : 'High OOM Risk'}
                    </span>
                  ) : null}
                </div>

                {hardwareProfile && (
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
                      <span className="text-slate-500 block">CPU & Cores</span>
                      <span className="text-slate-200 font-medium truncate block" title={hardwareProfile.cpu.model}>
                        {hardwareProfile.cpu.model} ({hardwareProfile.cpu.cores} cores)
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800/60">
                      <span className="text-slate-500 block">Available RAM</span>
                      <span className="text-slate-200 font-medium block">
                        <strong className="text-cyan-300">{hardwareProfile.memory.freeFormatted}</strong> free / {hardwareProfile.memory.totalFormatted} ({hardwareProfile.memory.usedPercent}% used)
                      </span>
                    </div>
                  </div>
                )}

                {hardwareAssessment && (
                  <div
                    className={`p-2.5 rounded-xl border text-[11px] flex items-start gap-2 ${hardwareAssessment.riskLevel === 'safe'
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                        : hardwareAssessment.riskLevel === 'warning'
                          ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                          : 'bg-rose-950/30 border-rose-800/50 text-rose-200'
                      }`}
                  >
                    {hardwareAssessment.riskLevel === 'safe' ? (
                      <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                    ) : hardwareAssessment.riskLevel === 'warning' ? (
                      <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-semibold">{hardwareAssessment.message}</p>
                      {hardwareAssessment.recommendation && (
                        <p className="text-[10px] text-slate-400">{hardwareAssessment.recommendation}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Delete Original Toggle */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 cursor-pointer text-slate-300 hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={deleteOriginalOnConvert}
                  onChange={(e) => setDeleteOriginalOnConvert(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-cyan-400 w-4 h-4 mt-0.5"
                />
                <div className="text-[11px]">
                  <span className="font-bold text-slate-200 block">Delete original file after successful conversion</span>
                  <span className="text-slate-400">Permanently removes the original {modelToConvert.fileName.split('.').pop()?.toUpperCase()} file to reclaim disk space.</span>
                </div>
              </label>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={convertingModelId === modelToConvert.id}
                onClick={() => setModelToConvert(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={convertingModelId === modelToConvert.id}
                onClick={() => handleExecuteConversion(modelToConvert, deleteOriginalOnConvert)}
                className="flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-600/30 cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {convertingModelId === modelToConvert.id ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Converting Model...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Convert Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LoRA & Model Trigger Words / Metadata Inspector Modal */}
      {selectedModelDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setSelectedModelDetail(null)}
        >
          <div
            className="w-full max-w-3xl glass-panel bg-slate-900/95 border border-purple-500/40 rounded-3xl overflow-hidden shadow-2xl glow-purple max-h-[90vh] flex flex-col animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800/80 bg-slate-950/60 flex items-start justify-between gap-4">
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-xs">
                    <Sparkles size={12} className="text-purple-400" />
                    <span>{selectedModelDetail.modelType || selectedModelDetail.civitaiType || 'Model'}</span>
                  </span>
                  {selectedModelDetail.civitaiBaseModel && (
                    <span className="text-[11px] font-bold text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 rounded-lg">
                      {selectedModelDetail.civitaiBaseModel}
                    </span>
                  )}
                  {isPickleModel(selectedModelDetail) && (
                    isModelDeemedSafe(selectedModelDetail) ? (
                      <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-xs" title="Opcode verified safe YOLO detector model. Preserved in .pt format.">
                        <ShieldCheck size={12} className="text-emerald-400" />
                        <span>Deemed Safe (YOLO .pt)</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                        <span>Pickle ({selectedModelDetail.fileName.split('.').pop()?.toUpperCase()})</span>
                      </span>
                    )
                  )}
                  {isModelNsfw(selectedModelDetail) ? (
                    <span className="text-[11px] font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                      <Flame size={12} className="text-rose-400" />
                      <span>NSFW</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                      <ShieldCheck size={12} className="text-emerald-400" />
                      <span>SFW</span>
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-extrabold text-slate-100 tracking-tight truncate" title={selectedModelDetail.civitaiName || selectedModelDetail.fileName}>
                  {selectedModelDetail.civitaiName || selectedModelDetail.fileName}
                </h2>
                {selectedModelDetail.civitaiCreator && (
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <span>By</span>
                    <strong className="text-purple-300">{selectedModelDetail.civitaiCreator}</strong>
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedModelDetail(null)}
                className="p-2 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer shrink-0"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
              {/* Top Row: Preview Thumbnail & Quick Info */}
              <div className="flex flex-col sm:flex-row gap-5 items-start">
                {/* Preview Image */}
                <div className="w-full sm:w-44 h-48 rounded-2xl overflow-hidden shrink-0 border border-purple-500/30 bg-slate-950 relative shadow-lg group">
                  <FallbackImage
                    src={selectedModelDetail.previewUrl}
                    candidateUrls={selectedModelDetail.localPreviewPath ? [`/api/local-image?path=${encodeURIComponent(selectedModelDetail.localPreviewPath)}`] : []}
                    alt={selectedModelDetail.civitaiName || selectedModelDetail.fileName}
                    isBlurred={isModelNsfw(selectedModelDetail) && blurNsfw}
                    className="w-full h-full object-cover"
                    fallbackIcon={
                      <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center text-purple-400 gap-2">
                        <HardDrive size={32} />
                        <span className="text-[10px] text-slate-500 font-mono">No Preview</span>
                      </div>
                    }
                  />
                  {isModelNsfw(selectedModelDetail) && blurNsfw && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                      <span className="text-xs font-bold text-rose-300 font-mono px-2 py-1 bg-rose-950/90 rounded border border-rose-500/50 shadow-sm">
                        18+ NSFW
                      </span>
                    </div>
                  )}
                </div>

                {/* Primary Stats & File Details */}
                <div className="flex-1 space-y-3 w-full">
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">File Size</span>
                      <span className="font-bold text-slate-100 font-mono mt-0.5 block">
                        {(selectedModelDetail.fileSize / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Base Model</span>
                      <span className="font-bold text-indigo-300 font-mono mt-0.5 block truncate">
                        {selectedModelDetail.civitaiBaseModel || 'Standard / Unspecified'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">CivitAI Version ID</span>
                      <span className="font-bold text-slate-200 font-mono mt-0.5 block">
                        {selectedModelDetail.civitaiVersionId ? `#${selectedModelDetail.civitaiVersionId}` : 'Unmatched'}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                      <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">File Format</span>
                      <span className="font-bold text-purple-300 font-mono mt-0.5 block uppercase">
                        {selectedModelDetail.fileName.split('.').pop() || 'Unknown'}
                      </span>
                    </div>
                  </div>

                  {/* File Path with Copy Button */}
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Folder size={11} /> File Path on Disk
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyFilePath(selectedModelDetail.filePath)}
                        className="text-[10px] font-semibold text-purple-300 hover:text-purple-200 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedFilePath ? (
                          <>
                            <Check size={11} className="text-emerald-400" />
                            <span className="text-emerald-400">Copied Path!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>Copy Path</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 font-mono break-all line-clamp-2">
                      {selectedModelDetail.filePath}
                    </p>
                  </div>
                </div>
              </div>

              {/* Multi-Part Shards Breakdown Section if applicable */}
              {selectedModelDetail.isMultiPart && (
                <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <Layers size={14} className="text-indigo-400" />
                      <span>
                        Multi-Part Model Shards ({selectedModelDetail.availableParts || selectedModelDetail.shards?.length || 1} of {selectedModelDetail.totalParts || selectedModelDetail.shards?.length || 1})
                      </span>
                    </h4>
                    <span className="text-[11px] font-mono text-indigo-300/80 bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-500/20">
                      Combined: {(selectedModelDetail.fileSize / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {selectedModelDetail.shards && selectedModelDetail.shards.length > 0 ? (
                      selectedModelDetail.shards.map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono">
                          <span className="text-slate-200 truncate max-w-[280px] sm:max-w-md" title={s.filePath}>
                            {s.fileName}
                          </span>
                          <span className="text-slate-400 shrink-0 ml-2">
                            {(s.fileSize / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400">
                        Primary shard: {selectedModelDetail.fileName}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 🔥 Trained Trigger Words Hub Section */}
              <div className="p-5 rounded-2xl bg-linear-to-br from-amber-500/10 via-purple-950/20 to-slate-950/80 border border-amber-500/30 space-y-4 shadow-xl glow-amber">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
                      <Sparkles size={18} className="text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-100 flex items-center gap-2">
                        <span>Trained Trigger Words</span>
                        {selectedModelDetail.trainedWords && selectedModelDetail.trainedWords.length > 0 && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {selectedModelDetail.trainedWords.length}
                          </span>
                        )}
                        {tagSaveSuccess && (
                          <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-md">
                            <Check size={11} /> Saved to companion .info!
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Activation tags required in your prompt to trigger this LoRA&apos;s weights.
                      </p>
                    </div>
                  </div>

                  {selectedModelDetail.trainedWords && selectedModelDetail.trainedWords.length > 0 && (
                    <div className="flex items-center gap-2">
                      {selectedModelDetail.trainedWords.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleSelectAllTags(selectedModelDetail.trainedWords!)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-slate-100 text-xs font-semibold transition-all cursor-pointer"
                        >
                          {selectedTriggerTags.length === selectedModelDetail.trainedWords.length ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyTriggerTags(selectedModelDetail.trainedWords!)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold transition-all cursor-pointer glow-amber active:scale-95 shadow-sm"
                      >
                        {copiedAllTriggers ? (
                          <>
                            <Check size={14} className="text-emerald-400" />
                            <span className="text-emerald-300">
                              {selectedTriggerTags.length > 0
                                ? `Copied ${selectedTriggerTags.length} Tag${selectedTriggerTags.length > 1 ? 's' : ''}!`
                                : 'Copied All Triggers!'}
                            </span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} className="text-amber-300" />
                            <span>
                              {selectedTriggerTags.length > 0
                                ? `Copy Tags (${selectedTriggerTags.length})`
                                : 'Copy All'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Interactive Tag Cloud */}
                {selectedModelDetail.trainedWords && selectedModelDetail.trainedWords.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selectedModelDetail.trainedWords.map((word, idx) => {
                        const isSelected = selectedTriggerTags.includes(word);
                        return (
                          <div
                            key={idx}
                            onClick={() => handleToggleTagSelection(word)}
                            className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium border transition-all cursor-pointer shadow-sm active:scale-95 select-none ${isSelected
                                ? 'bg-amber-500/30 border-amber-400 text-amber-100 ring-2 ring-amber-500/40 glow-amber font-bold'
                                : 'bg-slate-900/90 hover:bg-amber-500/15 border-slate-700/80 hover:border-amber-500/50 text-slate-200 hover:text-amber-200'
                              }`}
                            title={`Click to ${isSelected ? 'deselect' : 'select'} for Copy Tags`}
                          >
                            <span>{word}</span>

                            {/* Copy single tag button */}
                            <button
                              type="button"
                              onClick={(e) => handleCopyTriggerWord(word, e)}
                              className="p-1 rounded hover:bg-black/30 text-slate-400 hover:text-amber-300 transition-colors ml-0.5"
                              title={`Copy "${word}" individually`}
                            >
                              {copiedTriggerWord === word ? (
                                <Check size={11} className="text-emerald-400" />
                              ) : (
                                <Copy size={11} />
                              )}
                            </button>

                            {/* Remove tag button */}
                            <button
                              type="button"
                              onClick={(e) => handleRemoveTriggerWord(word, e)}
                              className="p-1 rounded hover:bg-rose-900/50 text-slate-500 hover:text-rose-300 transition-colors"
                              title={`Remove "${word}" tag`}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-400/90 italic pt-0.5">
                      Tip: Click tags to select specific triggers and click &quot;Copy Tags&quot;, or click the copy icon on a tag to copy individually.
                    </p>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 space-y-1.5">
                    <p className="flex items-center gap-1.5 text-slate-300 font-semibold">
                      <Info size={14} className="text-amber-400 shrink-0" />
                      <span>No explicit trigger words recorded for this model yet.</span>
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      You can add custom trigger keywords below from the model&apos;s description or README (e.g. &quot;maplestorypixelstyle6135, pixel art, chibi...&quot;). They will be automatically saved to this model&apos;s companion file.
                    </p>
                  </div>
                )}

                {/* ➕ Quick Add Trigger Words Input Bar */}
                <div className="pt-3 border-t border-slate-800/80 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Tag size={12} className="text-amber-400" />
                      <span>Add Trigger Words</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Press <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300 font-mono text-[9px]">Enter</kbd> or type <kbd className="px-1 py-0.5 bg-slate-800 rounded text-slate-300 font-mono text-[9px]">,</kbd> (comma) or paste a comma-separated list
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={newTagInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.includes(',')) {
                            handleAddTriggerWords(val);
                          } else {
                            setNewTagInput(val);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTriggerWords(newTagInput);
                          }
                        }}
                        onPaste={(e) => {
                          const text = e.clipboardData.getData('text');
                          if (text && (text.includes(',') || text.includes('\n') || text.includes(';'))) {
                            e.preventDefault();
                            handleAddTriggerWords(text);
                          }
                        }}
                        placeholder="e.g. tag1, tag2, tag3, tag4..."
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 text-xs text-slate-100 placeholder-slate-500 font-mono outline-none transition-all"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!newTagInput.trim() || isSavingTags}
                      onClick={() => handleAddTriggerWords(newTagInput)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold transition-all cursor-pointer active:scale-95 shrink-0 shadow-md glow-amber"
                    >
                      {isSavingTags ? (
                        <Loader2 size={13} className="animate-spin text-slate-950" />
                      ) : (
                        <Plus size={14} className="text-slate-950" />
                      )}
                      <span>Add Tags</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SHA256 & Swarm Companions Status */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Hash size={13} className="text-purple-400" /> SHA256 Checksum
                  </span>
                  {selectedModelDetail.sha256 && (
                    <button
                      type="button"
                      onClick={() => handleCopySha256(selectedModelDetail.sha256!)}
                      className="text-[10px] font-semibold text-purple-300 hover:text-purple-200 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedSha256 ? (
                        <>
                          <Check size={11} className="text-emerald-400" />
                          <span className="text-emerald-400">Copied SHA256!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy Checksum</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <p className="text-xs font-mono text-slate-400 break-all bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                  {selectedModelDetail.sha256 || 'No SHA256 computed yet (Run Scan to compute hash)'}
                </p>
              </div>

              {/* Tags Section if available */}
              {selectedModelDetail.tags && selectedModelDetail.tags.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                    <Tag size={12} className="text-slate-500" /> Model Tags
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedModelDetail.tags.map((t, idx) => (
                      <span key={idx} className="text-[11px] font-medium bg-slate-800/60 text-slate-300 border border-slate-700/60 px-2.5 py-0.5 rounded-lg">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleOpenFolder(selectedModelDetail.filePath)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  <FolderOpen size={14} className="text-amber-400" />
                  <span>Show in Folder</span>
                </button>

                {(() => {
                  const { label, isHf, isNsfw } = getModelExternalUrl(selectedModelDetail);
                  return (
                    <button
                      type="button"
                      onClick={() => handleOpenModelLink(selectedModelDetail)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                    >
                      <ExternalLink size={14} className={isHf ? 'text-amber-400' : isNsfw ? 'text-rose-400' : 'text-purple-400'} />
                      <span>{label}</span>
                    </button>
                  );
                })()}

                {!selectedModelDetail.isMissing && (
                  <button
                    type="button"
                    onClick={() => handlePackageSingleModel(selectedModelDetail)}
                    disabled={packagingModelId === selectedModelDetail.id}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-emerald-950/40 border border-slate-700 hover:border-emerald-500/40 text-xs font-semibold text-slate-200 hover:text-emerald-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {packagingModelId === selectedModelDetail.id ? (
                      <Loader2 size={14} className="animate-spin text-emerald-400" />
                    ) : (
                      <Package size={14} className="text-emerald-400" />
                    )}
                    <span>Generate Companions</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const m = selectedModelDetail;
                    openLinkSpecificsModal(m);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/40 text-xs font-semibold text-indigo-200 hover:text-white transition-colors cursor-pointer"
                >
                  <Edit3 size={14} className="text-indigo-400" />
                  <span>Edit Specifics / Link</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {selectedModelDetail.hasUpdate && (
                  <button
                    type="button"
                    onClick={() => {
                      const m = selectedModelDetail;
                      setSelectedModelDetail(null);
                      onCheckUpdate(m);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-linear-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-600/30 cursor-pointer glow-amber active:scale-95"
                  >
                    <ArrowUpCircle size={14} />
                    <span>View Update</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedModelDetail(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🔗 Link Model Specifics & Metadata Modal */}
      {modelToLinkSpecifics && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 bg-slate-950/80 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-xl bg-indigo-500/20 text-indigo-300">
                    <Link2 size={16} />
                  </span>
                  <h2 className="text-lg font-extrabold text-slate-100 tracking-tight">
                    Link Model Specifics & Metadata
                  </h2>
                </div>
                <p className="text-xs text-slate-400 truncate" title={modelToLinkSpecifics.filePath}>
                  {modelToLinkSpecifics.fileName} ({modelToLinkSpecifics.filePath})
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModelToLinkSpecifics(null)}
                className="p-2 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer shrink-0"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
              {/* Feedback toast if any */}
              {specificsFeedback && (
                <div
                  className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border animate-fadeIn ${
                    specificsFeedback.isError
                      ? 'bg-rose-950/70 border-rose-500/40 text-rose-200 glow-rose'
                      : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200 glow-emerald'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {specificsFeedback.isError ? (
                      <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    )}
                    <span>{specificsFeedback.message}</span>
                  </div>
                  <button
                    onClick={() => setSpecificsFeedback(null)}
                    className="text-slate-400 hover:text-slate-200 text-xs px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* URL Auto-Fetch Section */}
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 space-y-2.5">
                <label className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                  <Globe size={13} className="text-indigo-400" />
                  <span>Auto-Fetch Metadata by URL (Hugging Face or CivitAI)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={linkInputUrl}
                    onChange={(e) => setLinkInputUrl(e.target.value)}
                    placeholder="e.g. https://huggingface.co/author/repo or https://civitai.com/models/12345"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50 text-xs text-slate-100 placeholder-slate-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleAutoFetchLink}
                    disabled={isFetchingLinkMetadata || !linkInputUrl.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all cursor-pointer shadow-md glow-indigo shrink-0"
                  >
                    {isFetchingLinkMetadata ? (
                      <>
                        <Loader2 size={13} className="animate-spin text-white" />
                        <span>Fetching...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>Auto-Fetch</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Paste a Hugging Face repo link or CivitAI model page URL to automatically pull the title, creator, base model, description, preview image, and trigger words.
                </p>
              </div>

              {/* Form Fields Grid */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Model Name / Title</label>
                    <input
                      type="text"
                      value={specificsName}
                      onChange={(e) => setSpecificsName(e.target.value)}
                      placeholder="e.g. Qwen3-VL-32B-Instruct-FP8"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-indigo-400 text-xs text-slate-100 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Creator / Author</label>
                    <input
                      type="text"
                      value={specificsCreator}
                      onChange={(e) => setSpecificsCreator(e.target.value)}
                      placeholder="e.g. Qwen / bartowski"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-indigo-400 text-xs text-slate-100 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Base Model Architecture</label>
                    <input
                      type="text"
                      value={specificsBaseModel}
                      onChange={(e) => setSpecificsBaseModel(e.target.value)}
                      placeholder="e.g. SDXL 1.0, Flux.1 D, Qwen, Gemma, LLaMA"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-indigo-400 text-xs text-slate-100 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Model Type</label>
                    <select
                      value={specificsModelType}
                      onChange={(e) => setSpecificsModelType(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-indigo-400 text-xs text-slate-100 outline-none cursor-pointer"
                    >
                      <option value="Checkpoint">Checkpoint</option>
                      <option value="LORA">LoRA / LoCon</option>
                      <option value="DoRA">DoRA</option>
                      <option value="TextualInversion">Textual Inversion / Embedding</option>
                      <option value="VAE">VAE</option>
                      <option value="Controlnet">ControlNet</option>
                      <option value="Upscaler">Upscaler</option>
                      <option value="MotionModule">Motion Module</option>
                      <option value="LLM">LLM (GGUF / Safetensors)</option>
                      <option value="UNet">UNet / Diffusion</option>
                      <option value="CLIP">CLIP / Vision</option>
                      <option value="Other">Other / Unknown</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Direct Link / Documentation URL</label>
                  <input
                    type="text"
                    value={specificsCustomLink}
                    onChange={(e) => setSpecificsCustomLink(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-indigo-400 text-xs text-slate-100 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Preview Image URL</label>
                  <input
                    type="text"
                    value={specificsPreviewUrl}
                    onChange={(e) => setSpecificsPreviewUrl(e.target.value)}
                    placeholder="https://... (or leave blank to use auto-discovered image)"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-indigo-400 text-xs text-slate-100 outline-none font-mono"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={specificsNsfw}
                      onChange={(e) => setSpecificsNsfw(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="flex items-center gap-1">
                      <Flame size={13} className={specificsNsfw ? 'text-rose-400' : 'text-slate-500'} />
                      <span>Flag as Adult / NSFW Content (Enforces Blur &amp; Filter)</span>
                    </span>
                  </label>
                </div>

                {/* Trigger Words Section */}
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Tag size={13} className="text-amber-400" />
                      <span>Trigger Words / Activation Tags</span>
                    </label>
                    <span className="text-[10px] text-slate-400">
                      {specificsTrainedWords.length} tag{specificsTrainedWords.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {specificsTrainedWords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                      {specificsTrainedWords.map((t, idx) => (
                        <span
                          key={idx}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-200 border border-amber-500/30 text-xs font-mono"
                        >
                          <span>{t}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSpecificsTriggerWord(t)}
                            className="text-amber-400/60 hover:text-rose-400 cursor-pointer ml-1"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={specificsNewTag}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.includes(',')) {
                          handleAddSpecificsTriggerWords(val);
                        } else {
                          setSpecificsNewTag(val);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSpecificsTriggerWords(specificsNewTag);
                        }
                      }}
                      placeholder="Add tag (comma separated or press Enter)..."
                      className="flex-1 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 focus:border-amber-400 text-xs text-slate-100 placeholder-slate-500 outline-none"
                    />
                    <button
                      type="button"
                      disabled={!specificsNewTag.trim()}
                      onClick={() => handleAddSpecificsTriggerWords(specificsNewTag)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition-all cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Model Description / Usage Notes</label>
                  <textarea
                    rows={3}
                    value={specificsDescription}
                    onChange={(e) => setSpecificsDescription(e.target.value)}
                    placeholder="Additional details, recommended settings, prompt templates, or license information..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/80 focus:border-indigo-400 text-xs text-slate-100 placeholder-slate-500 outline-none resize-none custom-scrollbar"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setModelToLinkSpecifics(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isSavingSpecifics}
                onClick={handleSaveSpecifics}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer glow-indigo active:scale-95 disabled:opacity-50"
              >
                {isSavingSpecifics ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-white" />
                    <span>Saving Specifics...</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>Save Specifics &amp; Companion Info</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Sort Library Modal */}
      {isSortModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => {
            if (!isSorting) setIsSortModalOpen(false);
          }}
        >
          <div
            className="glass-panel w-full max-w-4xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-700/60 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-linear-to-br from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/30 glow-amber">
                  <ArrowUpDown size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
                    <span>Automatic Library Folder Sorter</span>
                    {sortPlan && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300">
                        {sortPlan.misplacedCount} Misplaced
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Relocate misplaced models to their standardized ComfyUI subdirectories (<code>controlnet/</code>, <code>diffusion_models/</code>, <code>LLM/</code>, <code>loras/</code>, etc.). Companion files are moved together.
                  </p>
                </div>
              </div>

              {!isSorting && (
                <button
                  type="button"
                  onClick={() => setIsSortModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
              {/* Feedback Banner */}
              {sortFeedback && (
                <div
                  className={`p-4 rounded-2xl border flex items-center gap-2.5 text-xs font-semibold animate-fadeIn ${
                    sortFeedback.isError
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 glow-rose'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 glow-emerald'
                  }`}
                >
                  {sortFeedback.isError ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                  <span>{sortFeedback.message}</span>
                </div>
              )}

              {/* Sorting Progress Banner */}
              {isSorting && sortProgress && (
                <div className="p-5 rounded-2xl bg-slate-900/90 border border-amber-500/40 space-y-3 shadow-xl glow-amber animate-fadeIn">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                    <span className="flex items-center gap-2">
                      <Loader2 size={15} className="animate-spin text-amber-400" />
                      <span>Relocating Models ({sortProgress.current} of {sortProgress.total})...</span>
                    </span>
                    <span className="font-mono text-amber-400">
                      {Math.round((sortProgress.current / sortProgress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                    <div
                      className="bg-linear-to-r from-amber-500 via-yellow-400 to-amber-500 h-full transition-all duration-300 rounded-full glow-amber"
                      style={{ width: `${Math.round((sortProgress.current / sortProgress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono line-clamp-1">
                    {sortProgress.file}
                  </p>
                </div>
              )}

              {/* Top View Toggle: Misplaced Models vs Ignored Models */}
              <div className="flex items-center justify-between gap-3 p-1.5 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <div className="flex items-center gap-1.5 flex-1">
                  <button
                    type="button"
                    onClick={() => setShowIgnoredSortList(false)}
                    className={`flex-1 py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      !showIgnoredSortList
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <ArrowUpDown size={14} />
                    <span>Misplaced Models ({sortPlan ? sortPlan.misplacedCount : 0})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowIgnoredSortList(true)}
                    className={`flex-1 py-2 px-3.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      showIgnoredSortList
                        ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <EyeOff size={14} />
                    <span>Ignored ({ignoredSortModels.length})</span>
                  </button>
                </div>
              </div>

              {showIgnoredSortList ? (
                /* Ignored Models Management View */
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between p-3.5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <EyeOff size={16} className="text-rose-400 shrink-0" />
                      <span>
                        <strong>{ignoredSortModels.length}</strong> model{ignoredSortModels.length === 1 ? '' : 's'} ignored. These stay permanently in their current folders for specialized custom node requirements.
                      </span>
                    </div>
                    {ignoredSortModels.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearIgnoredSort}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors cursor-pointer shrink-0"
                      >
                        Clear All Ignored
                      </button>
                    )}
                  </div>

                  {ignoredSortModels.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 glass-panel rounded-2xl border border-slate-800 bg-slate-900/40">
                      <ShieldCheck size={32} className="text-slate-500" />
                      <h4 className="text-xs font-bold text-slate-300">No Ignored Models</h4>
                      <p className="text-[11px] text-slate-500 max-w-sm">
                        Click the "Ignore" button on any model card to exempt it permanently from auto-sorting.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {ignoredSortModels.map((item) => (
                        <div
                          key={item.model_id}
                          className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <h5 className="text-xs font-bold text-slate-200 truncate" title={item.file_name || item.model_id}>
                              {item.file_name || item.model_id}
                            </h5>
                            {item.file_path && (
                              <p className="text-[10px] text-slate-400 font-mono truncate" title={item.file_path}>
                                {item.file_path}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUnignoreSortItem(item.model_id)}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-800 hover:border-amber-500/40 text-xs font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
                          >
                            <Eye size={13} />
                            <span>Unignore</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Standard Misplaced Models View */
                <div className="space-y-5">
                  {/* Category Filter & Selection Bar */}
                  {sortPlan && sortPlan.items.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900/70 border border-slate-800 rounded-2xl">
                      {/* Category Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setSortCategoryFilter('all')}
                          className={`px-3 py-1 rounded-xl border transition-all cursor-pointer ${
                            sortCategoryFilter === 'all'
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          All ({sortPlan.items.length})
                        </button>
                        {Array.from(new Set(sortPlan.items.map((i) => i.targetFolder))).sort().map((folder) => {
                          const count = sortPlan.items.filter((i) => i.targetFolder === folder).length;
                          const isSelected = sortCategoryFilter === folder;

                          const getFolderStyle = (f: string) => {
                            switch (f) {
                              case 'loras':
                                return { label: 'LoRA', activeCls: 'bg-rose-500/20 border-rose-500/40 text-rose-300' };
                              case 'controlnet':
                                return { label: 'ControlNet', activeCls: 'bg-purple-500/20 border-purple-500/40 text-purple-300' };
                              case 'diffusion_models':
                                return { label: 'Diffusion Models', activeCls: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300' };
                              case 'LLM':
                                return { label: 'LLM / Text', activeCls: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' };
                              case 'checkpoints':
                                return { label: 'Checkpoints', activeCls: 'bg-blue-500/20 border-blue-500/40 text-blue-300' };
                              case 'upscale_models':
                                return { label: 'Upscalers', activeCls: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300' };
                              case 'vae':
                                return { label: 'VAE', activeCls: 'bg-pink-500/20 border-pink-500/40 text-pink-300' };
                              case 'embeddings':
                                return { label: 'Embeddings', activeCls: 'bg-teal-500/20 border-teal-500/40 text-teal-300' };
                              case 'text_encoders':
                                return { label: 'Text Encoders', activeCls: 'bg-violet-500/20 border-violet-500/40 text-violet-300' };
                              case 'clip':
                                return { label: 'CLIP', activeCls: 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-300' };
                              case 'clip_vision':
                                return { label: 'CLIP Vision', activeCls: 'bg-sky-500/20 border-sky-500/40 text-sky-300' };
                              case 'insightface':
                                return { label: 'InsightFace', activeCls: 'bg-amber-500/20 border-amber-500/40 text-amber-300' };
                              case 'ultralytics':
                              case 'yolo':
                              case 'detection':
                                return { label: 'Detection / YOLO', activeCls: 'bg-orange-500/20 border-orange-500/40 text-orange-300' };
                              case 'gguf':
                                return { label: 'GGUF', activeCls: 'bg-lime-500/20 border-lime-500/40 text-lime-300' };
                              case 'hypernetworks':
                                return { label: 'Hypernetworks', activeCls: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300' };
                              default:
                                return { label: f, activeCls: 'bg-slate-700/40 border-slate-600 text-slate-200' };
                            }
                          };

                          const style = getFolderStyle(folder);

                          return (
                            <button
                              key={folder}
                              type="button"
                              onClick={() => setSortCategoryFilter(folder)}
                              className={`px-3 py-1 rounded-xl border transition-all cursor-pointer ${
                                isSelected
                                  ? `${style.activeCls} font-bold`
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {style.label} ({count})
                            </button>
                          );
                        })}
                      </div>

                      {/* Select All Toggle */}
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedSortModelIds.size === sortPlan.items.length) {
                              setSelectedSortModelIds(new Set());
                            } else {
                              setSelectedSortModelIds(new Set(sortPlan.items.map((i) => i.id)));
                            }
                          }}
                          className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                        >
                          {selectedSortModelIds.size === sortPlan.items.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <span className="text-slate-400 text-[11px]">
                          {selectedSortModelIds.size} of {sortPlan.items.length} selected
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Items List */}
                  {isAnalyzingSort ? (
                    <div className="flex flex-col items-center justify-center py-16 space-y-3">
                      <Loader2 size={32} className="animate-spin text-amber-400" />
                      <span className="text-xs text-slate-400 font-medium">Analyzing library model directory hierarchy...</span>
                    </div>
                  ) : sortPlan && sortPlan.items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 glass-panel rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
                      <CheckCircle2 size={40} className="text-emerald-400" />
                      <h3 className="text-sm font-bold text-emerald-300">All Models Are Perfectly Placed!</h3>
                      <p className="text-xs text-slate-400 max-w-md">
                        Every ControlNet, diffusion model, LLM, LoRA, and Checkpoint in your library is already organized in its designated ComfyUI subfolder.
                      </p>
                    </div>
                  ) : sortPlan && (
                    <div className="space-y-3">
                      {sortPlan.items
                        .filter((item) => {
                          if (sortCategoryFilter === 'all') return true;
                          return item.targetFolder === sortCategoryFilter;
                        })
                        .map((item) => {
                          const isSelected = selectedSortModelIds.has(item.id);
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                setSelectedSortModelIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(item.id)) next.delete(item.id);
                                  else next.add(item.id);
                                  return next;
                                });
                              }}
                              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                                isSelected
                                  ? 'bg-slate-900/90 border-amber-500/50 shadow-md shadow-amber-950/20'
                                  : 'bg-slate-950/60 border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                {/* Checkbox */}
                                <div className="pt-1 shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      setSelectedSortModelIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(item.id)) next.delete(item.id);
                                        else next.add(item.id);
                                        return next;
                                      });
                                    }}
                                    className="rounded border-slate-700 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer h-4 w-4"
                                  />
                                </div>

                                {/* Thumbnail Preview */}
                                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0">
                                  <FallbackImage
                                    src={item.previewUrl}
                                    alt={item.fileName}
                                    className="w-full h-full object-cover"
                                  />
                                </div>

                                {/* Model Details */}
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-bold text-slate-100 text-xs truncate max-w-sm" title={item.fileName}>
                                      {item.fileName}
                                    </h4>
                                    {item.baseModel && (
                                      <span className="px-2 py-0.5 rounded-md text-[9px] font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                                        {item.baseModel}
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-[11px] text-amber-300 font-medium">
                                    {item.reason}
                                  </p>

                                  {item.companionFiles.length > 0 && (
                                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                      <span className="text-[10px] font-semibold text-slate-400">
                                        +{item.companionFiles.length} companion{item.companionFiles.length > 1 ? 's' : ''}:
                                      </span>
                                      {item.companionFiles.slice(0, 3).map((c, idx) => {
                                        const companionName = c.split(/[\\/]/).pop() || c;
                                        return (
                                          <span
                                            key={idx}
                                            title={companionName}
                                            className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 text-[9px] font-mono truncate max-w-[180px]"
                                          >
                                            {companionName}
                                          </span>
                                        );
                                      })}
                                      {item.companionFiles.length > 3 && (
                                        <span
                                          title={item.companionFiles.slice(3).map((c) => c.split(/[\\/]/).pop()).join('\n')}
                                          className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500 text-[9px] font-semibold"
                                        >
                                          +{item.companionFiles.length - 3} more
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Relocation Route Indicator & Ignore Button */}
                              <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                                <div className="flex items-center gap-2 text-xs font-bold bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 shadow-inner">
                                  <span className="px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-500/40 text-rose-300 font-mono text-[11px]">
                                    {item.currentFolder}
                                  </span>
                                  <ArrowRight size={14} className="text-amber-400" />
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono text-[11px]">
                                    {item.targetFolder}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  title="Ignore this model - Keep in this folder permanently (for specialized custom node requirements)"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleIgnoreSortItem(item);
                                  }}
                                  className="p-2 px-3 rounded-xl bg-slate-950/80 hover:bg-rose-500/15 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold group"
                                >
                                  <EyeOff size={14} className="group-hover:text-rose-400" />
                                  <span className="inline">Ignore</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={isSorting}
                onClick={() => setIsSortModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                disabled={isSorting || isAnalyzingSort || !sortPlan || selectedSortModelIds.size === 0}
                onClick={handleExecuteSort}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-linear-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black transition-all shadow-lg shadow-amber-950/50 cursor-pointer glow-amber active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSorting ? (
                  <>
                    <Loader2 size={15} className="animate-spin text-slate-950 font-bold" />
                    <span>Relocating Models...</span>
                  </>
                ) : (
                  <>
                    <ArrowUpDown size={15} className="text-slate-950 font-bold" />
                    <span>Auto-Sort Selected ({selectedSortModelIds.size} Models)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

