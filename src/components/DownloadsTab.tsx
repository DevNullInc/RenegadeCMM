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
  Download,
  Pause,
  Play,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  RefreshCw,
  Activity,
  ArrowDownCircle,
  Trash2,
  ListChecks,
  Check,
} from 'lucide-react';
import { DownloadTask } from '../types/app';

export const DownloadsTab: React.FC = () => {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<boolean>(false);

  const refresh = async () => {
    if (window.civitaiAPI) {
      const currentTasks = await window.civitaiAPI.getDownloads();
      setTasks(Array.isArray(currentTasks) ? currentTasks : []);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchDownloads = async () => {
      if (window.civitaiAPI) {
        const currentTasks = await window.civitaiAPI.getDownloads();
        if (isMounted) {
          setTasks(Array.isArray(currentTasks) ? currentTasks : []);
        }
      }
    };

    fetchDownloads();

    let unsub: (() => void) | void;
    if (window.civitaiAPI && typeof window.civitaiAPI.onDownloadProgress === 'function') {
      unsub = window.civitaiAPI.onDownloadProgress((updatedTasks) => {
        if (isMounted) {
          setTasks(Array.isArray(updatedTasks) ? updatedTasks : []);
        }
      });
    }

    return () => {
      isMounted = false;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Prune selections that reference tasks that no longer exist in the queue.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (tasks.some((t) => t.id === id)) next.add(id);
      });
      return next;
    });
  }, [tasks]);

  const toggleTask = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (tasks.length === 0) return;
    const allIds = tasks.map((t) => t.id);
    setSelected((prev) => {
      const shouldSelectAll = allIds.some((id) => !prev.has(id));
      return shouldSelectAll ? new Set(allIds) : new Set<string>();
    });
  };

  const existingSelectedCount = Array.from(selected).filter((id) => tasks.some((t) => t.id === id)).length;
  const finishedCount = tasks.filter((t) => t.status === 'completed').length;
  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id));

  const handleDeleteSelected = async () => {
    const ids = Array.from(selected).filter((id) => tasks.some((t) => t.id === id));
    if (ids.length === 0 || !window.civitaiAPI) return;
    if (!window.confirm(`Remove ${ids.length} download(s) from the list?\n\nThe model files on disk will NOT be deleted.`)) return;
    setBusy(true);
    for (const id of ids) {
      try {
        await window.civitaiAPI.deleteDownload(id);
      } catch (err) {
        console.error('Failed to delete download from list:', id, err);
      }
    }
    setSelected(new Set());
    await refresh();
    setBusy(false);
  };

  const handleClearFinished = async () => {
    if (finishedCount === 0 || !window.civitaiAPI) return;
    if (!window.confirm(`Clear ${finishedCount} finished download(s) from the list?\n\nThe model files on disk will NOT be deleted.`)) return;
    setBusy(true);
    try {
      await window.civitaiAPI.clearFinishedDownloads();
    } catch (err) {
      console.error('Failed to clear finished downloads:', err);
    }
    setSelected(new Set());
    await refresh();
    setBusy(false);
  };

  const handlePause = async (id: string) => {
    if (window.civitaiAPI) {
      try {
        await window.civitaiAPI.pauseDownload(id);
      } catch (err) {
        console.error('Failed to pause download:', id, err);
      }
    }
    await refresh();
  };

  const handleResume = async (id: string) => {
    if (window.civitaiAPI) {
      try {
        await window.civitaiAPI.resumeDownload(id);
      } catch (err) {
        console.error('Failed to resume download:', id, err);
      }
    }
    await refresh();
  };

  const handleCancel = async (id: string) => {
    if (window.civitaiAPI) {
      try {
        await window.civitaiAPI.cancelDownload(id);
      } catch (err) {
        console.error('Failed to cancel download:', id, err);
      }
    }
    await refresh();
  };

  const handleForceComplete = async (id: string) => {
    if (window.civitaiAPI && typeof window.civitaiAPI.forceCompleteDownload === 'function') {
      try {
        await window.civitaiAPI.forceCompleteDownload(id);
      } catch (err) {
        console.error('Failed to force-complete download:', id, err);
      }
    }
    await refresh();
  };

  const formatSpeed = (bytesPerSec: number): string => {
    if (!bytesPerSec || bytesPerSec === 0) return '0 B/s';
    if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  };

  const formatSize = (bytes: number): string => {
    if (!bytes) return '0 MB';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalSpeed = tasks
    .filter((t) => t.status === 'downloading')
    .reduce((acc, t) => acc + (t.speedBps || 0), 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header & Global Speed Meter */}
      <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-2.5">
            <span>Download Queue</span>
            <ArrowDownCircle size={24} className="text-purple-400" />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Active background model downloads with automatic Range resumption and SHA256 integrity verification.
          </p>
        </div>

        <div className="glass-panel px-5 py-3.5 rounded-2xl flex items-center gap-4 border border-purple-500/30 shadow-xl glow-purple">
          <div className="p-2.5 rounded-xl bg-purple-600/20 text-purple-400">
            <Activity className="animate-pulse" size={22} />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium block">Total Speed</span>
            <span className="text-base font-extrabold text-slate-100 font-mono">{formatSpeed(totalSpeed)}</span>
          </div>
        </div>
      </div>

      {/* Queue Management Toolbar */}
      {tasks.length > 0 && (
        <div className="glass-panel p-3.5 rounded-2xl flex flex-wrap items-center gap-3 justify-between border border-slate-800 shadow-xl">
          <button
            onClick={toggleSelectAll}
            disabled={tasks.length === 0}
            className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              allSelected
                ? 'bg-purple-600/20 border-purple-500/50 text-purple-200'
                : 'bg-slate-900/80 border-slate-700/80 text-slate-300 hover:text-white hover:border-purple-500/40'
            }`}
            title={allSelected ? 'Unselect all downloads' : `Select all downloads (${tasks.length})`}
          >
            <span className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
              allSelected ? 'bg-purple-500 border-purple-400' : 'bg-slate-950 border-slate-600'
            }`}>
              {allSelected && <Check size={13} className="text-white stroke-[3]" />}
            </span>
            <span>
              {allSelected ? 'Unselect All' : `Select All (${tasks.length})`}
            </span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDeleteSelected}
              disabled={existingSelectedCount === 0 || busy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Delete the selected downloads from this list. Files on disk are NOT touched."
            >
              <Trash2 size={14} className="text-rose-400" />
              <span>Delete Selected ({existingSelectedCount})</span>
            </button>

            <button
              onClick={handleClearFinished}
              disabled={finishedCount === 0 || busy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Remove every finished download from this list. Files on disk are NOT touched."
            >
              <ListChecks size={14} className="text-emerald-400" />
              <span>Clear All Finished ({finishedCount})</span>
            </button>
          </div>
        </div>
      )}

      {/* Queue List */}
      {tasks.length === 0 ? (
        <div className="text-center py-28 text-slate-500 text-sm glass-panel rounded-2xl">
          No active or past downloads in queue. Browse models to start downloading.
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`glass-card p-4 pl-3 sm:p-5 sm:pl-4 rounded-2xl border space-y-4 shadow-xl flex items-start gap-3 transition-colors ${
                selected.has(task.id) ? 'border-purple-500/60 bg-purple-950/10' : 'border-slate-800'
              }`}
            >
              <label
                className={`mt-5 shrink-0 flex items-center justify-center w-5 h-5 rounded-md border cursor-pointer transition-colors select-none ${
                  selected.has(task.id) ? 'bg-purple-500 border-purple-400' : 'bg-slate-950/80 border-slate-600 hover:border-purple-400'
                }`}
                title={selected.has(task.id) ? 'Deselect this download' : 'Select this download'}
              >
                <input
                  type="checkbox"
                  checked={selected.has(task.id)}
                  onChange={() => toggleTask(task.id)}
                  className="sr-only"
                />
                {selected.has(task.id) && <Check size={14} className="text-white stroke-[3] pointer-events-none" />}
              </label>
              <div className="flex-1 min-w-0 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-bold text-slate-100 text-base">{task.modelName}</h3>
                    <span className="bg-purple-950/80 border border-purple-500/40 text-purple-300 text-[10px] font-bold px-2.5 py-0.5 rounded-lg shadow-sm">
                      {task.versionName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-1 truncate">
                    Target Folder: <span className="text-purple-300 font-semibold">{task.targetFolder}/</span> ({task.fileName})
                  </p>
                </div>

                {/* Status Badges & Controls */}
                <div className="flex items-center gap-3">
                  {task.status === 'downloading' && (
                    <span className="text-xs font-mono font-bold text-purple-300 bg-purple-500/10 px-3 py-1.5 rounded-xl border border-purple-500/30 flex items-center gap-2 glow-purple">
                      <RefreshCw className="animate-spin" size={14} />
                      {formatSpeed(task.speedBps)}
                    </span>
                  )}

                  {task.status === 'verifying' && (
                    <span className="text-xs font-semibold text-amber-300 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/30 flex items-center gap-2 glow-amber">
                      <RefreshCw className="animate-spin" size={14} /> Verifying SHA256
                    </span>
                  )}

                  {task.status === 'completed' && (
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30 flex items-center gap-2 glow-emerald">
                      <CheckCircle2 size={14} /> Complete
                    </span>
                  )}

                  {task.status === 'failed' && (
                    <span className="text-xs font-bold text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/30 flex items-center gap-2">
                      <AlertTriangle size={14} /> Failed
                    </span>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    {task.status === 'downloading' && (
                      <button
                        onClick={() => handlePause(task.id)}
                        title="Pause Download"
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                      >
                        <Pause size={18} />
                      </button>
                    )}

                    {(task.status === 'paused' || task.status === 'failed') && (
                      <button
                        onClick={() => handleResume(task.id)}
                        title="Resume Download"
                        className="p-2 rounded-xl text-purple-400 hover:text-purple-300 hover:bg-purple-500/20 transition-colors"
                      >
                        <Play size={18} />
                      </button>
                    )}

                    <button
                      onClick={() => handleCancel(task.id)}
                      title="Cancel Download"
                      className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <XCircle size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress Bar & Numeric Stats */}
              <div className="space-y-2">
                <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800 shadow-inner">
                  <div
                    className={`h-full transition-all duration-300 ${
                      task.status === 'completed'
                        ? 'bg-linear-to-r from-emerald-500 to-teal-400'
                        : task.status === 'failed'
                        ? 'bg-red-500'
                        : 'bg-linear-to-r from-purple-600 to-indigo-500'
                    }`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                  <span>
                    {formatSize(task.downloadedBytes)} / {formatSize(task.totalBytes)} ({task.progress}%)
                  </span>
                  {task.error && <span className="text-red-400 font-sans font-medium">{task.error}</span>}
                </div>

                {task.status === 'completed' && task.note && (
                  <div
                    className={`p-3 border rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fadeIn ${
                      /(NOT|could not|Could not|still on disk)/.test(task.note)
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 glow-amber'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 glow-emerald'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/(NOT|could not|Could not|still on disk)/.test(task.note) ? (
                        <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                      ) : (
                        <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                      )}
                      <span>{task.note}</span>
                    </div>
                  </div>
                )}

                {task.status === 'failed' && (task.isHashMismatch || task.error?.toLowerCase().includes('sha256') || task.error?.toLowerCase().includes('hash')) && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-fadeIn glow-amber">
                    <div className="flex items-center gap-2 text-amber-300">
                      <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                      <span>The download finished, but CivitAI's reported SHA256 checksum did not match. You can finalize and keep this file anyway.</span>
                    </div>
                    <button
                      onClick={() => handleForceComplete(task.id)}
                      className="px-3.5 py-1.5 bg-linear-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer shrink-0"
                    >
                      Keep & Finish File
                    </button>
                  </div>
                )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
