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
} from 'lucide-react';
import { FallbackImage } from './FallbackImage';
import { useScan } from '../context/ScanContext';
import { LocalModel, ModelType, HardwareProfile, ConversionSafetyAssessment } from '../types/app';

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

  const loadLocalModels = async () => {
    setLoading(true);
    try {
      if (window.civitaiAPI) {
        const models = await window.civitaiAPI.getLocalModels();
        setLocalModels(models || []);
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

  // Auto-refresh the library when a download completes, so a model downloaded through
  // the app shows up immediately — no manual re-scan required.
  useEffect(() => {
    if (!window.civitaiAPI || typeof window.civitaiAPI.onDownloadProgress !== 'function') return;
    const seenCompleted = new Set<string>();
    window.civitaiAPI.onDownloadProgress((tasks: any[]) => {
      const completed = (Array.isArray(tasks) ? tasks : []).filter(
        (t) => t && t.status === 'completed' && t.computedPath
      );
      const hasNew = completed.some((t) => !seenCompleted.has(t.id));
      for (const t of completed) seenCompleted.add(t.id);
      if (hasNew) {
        // Brief delay so the completed file is fully flushed before it is indexed.
        setTimeout(() => loadLocalModels(), 1500);
      }
    });
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
      url = `${domain}/models/${model.civitaiModelId}${
        model.civitaiVersionId ? `?modelVersionId=${model.civitaiVersionId}` : ''
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
            className={`flex items-center gap-2 px-5 py-3 border font-bold rounded-2xl text-sm transition-all shadow-md cursor-pointer disabled:opacity-50 active:scale-95 ${
              localModels.some((m) => !m.isMatched)
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
                width: `${
                  scanProgress.totalFiles > 0
                    ? Math.min(100, Math.round((scanProgress.scannedFiles / scanProgress.totalFiles) * 100))
                    : scanProgress.status === 'completed' ? 100 : 5
                }%`,
              }}
            />
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
                className={`px-3.5 py-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer flex items-center gap-1.5 ${
                  filter === t
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
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                nsfwFilter === 'all'
                  ? 'bg-slate-800 text-slate-100 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Content
            </button>
            <button
              onClick={() => setNsfwFilter('sfw')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                nsfwFilter === 'sfw'
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
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                nsfwFilter === 'nsfw'
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
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-sm ${
              blurNsfw
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
            {['Checkpoint','LORA','LLM','LoCon','DoRA','TextualInversion','Hypernetwork','VAE','Controlnet','Upscaler','MotionModule','AestheticGradient','Poses','Wildcards','Workflows','Detection','Other'].map((t) => (
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
                className={`glass-card p-4.5 rounded-2xl flex flex-col justify-between gap-4 border transition-all shadow-md ${
                  isExpanded
                    ? 'border-amber-500/50 bg-slate-900/90 shadow-xl shadow-amber-950/20'
                    : 'border-slate-800/80 hover:border-purple-500/30'
                }`}
              >
                {/* Main Card Row */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 w-full">
                  <div
                    className={`flex items-center gap-4 flex-1 min-w-0 transition-all duration-300 ${
                      shouldBlur
                        ? 'filter blur-[7px] hover:blur-none opacity-60 hover:opacity-100 select-none cursor-pointer'
                        : ''
                    }`}
                    title={shouldBlur ? 'NSFW model: Hover to reveal name and path details' : undefined}
                  >
                    {/* Preview thumbnail if available, otherwise HardDrive icon */}
                    {model.previewUrl ? (
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-purple-500/30 shadow-md bg-slate-950 relative group">
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
                      <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-purple-400 shrink-0 shadow-inner">
                        <HardDrive size={20} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap max-w-full">
                        <h3
                          className="font-bold text-slate-100 text-sm truncate max-w-[15rem] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl"
                          title={model.civitaiName ? `${model.civitaiName} (${model.fileName})` : model.fileName}
                        >
                          {model.civitaiName || model.fileName}
                        </h3>
                        {isPickleModel(model) && (
                          <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-sm">
                            <Sparkles size={11} className="text-cyan-400" />
                            <span>Pickle ({model.fileName.split('.').pop()?.toUpperCase()})</span>
                          </span>
                        )}
                        {(model.modelType || model.civitaiType) && (
                          <span className="text-[10px] font-bold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-md">
                            {model.modelType || model.civitaiType}
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
                            className={`flex items-center gap-1.5 text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border transition-all cursor-pointer ${
                              model.isDuplicate
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
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer text-xs shadow-sm ${
                        isModelNsfw(model)
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

                    {model.isMatched ? (
                      <span className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl font-semibold">
                        <CheckCircle size={14} /> Matched
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-xl font-semibold">
                        <HelpCircle size={14} /> Unidentified
                      </span>
                    )}

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

                    {/* Convert to SafeTensors Action Button */}
                    {isPickleModel(model) && !model.isMissing && (
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
                    )}

                    {/* External Link Button (Hugging Face for GGUF/blobs, CivitAI / CivitAI.red for others) */}
                    {(() => {
                      const { label, isHf, isNsfw } = getModelExternalUrl(model);
                      return (
                        <button
                          onClick={() => handleOpenModelLink(model)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isHf
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
                    className={`w-full p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border animate-fadeIn ${
                      packageFeedback.isError
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
                    className={`w-full p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border animate-fadeIn ${
                      convertFeedback.isError
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
                    className={`w-full p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 border animate-fadeIn ${
                      pullFeedback.isError
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
                            className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer ${
                              isKeeper
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
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        hardwareAssessment.riskLevel === 'safe'
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
                    className={`p-2.5 rounded-xl border text-[11px] flex items-start gap-2 ${
                      hardwareAssessment.riskLevel === 'safe'
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
    </div>
  );
};
