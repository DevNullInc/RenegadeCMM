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
import React, { useState, useEffect, useCallback } from 'react';
import { Folder, FolderOpen, HardDrive, ChevronRight, Check, X, Loader2, CornerUpLeft } from 'lucide-react';

interface FolderBrowserModalProps {
  open: boolean;
  title: string;
  initialPath?: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

interface DirectoryListing {
  path: string;
  name: string;
  parent: string;
  isRoot: boolean;
  roots: string[];
  entries: { name: string; isDirectory: boolean; path: string }[];
}

export const FolderBrowserModal: React.FC<FolderBrowserModalProps> = ({
  open,
  title,
  initialPath,
  onSelect,
  onCancel,
}) => {
  const [path, setPath] = useState('');
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback(async (dirPath: string) => {
    if (!window.civitaiAPI?.listDirectory) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.civitaiAPI.listDirectory(dirPath);
      setListing(res);
      setPath(res.path || dirPath);
    } catch (e: any) {
      setError(e?.message || 'Could not read this folder.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      navigate(initialPath || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn" onClick={onCancel}>
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scaleUp" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-300">
              <FolderOpen size={22} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-100">{title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">Browse to a folder on this machine</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick drive roots */}
        {listing && listing.roots.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {listing.roots.map((root) => (
              <button
                key={root}
                type="button"
                onClick={() => navigate(root)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                  path.toLowerCase().startsWith(root.toLowerCase())
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                <HardDrive size={12} />
                {root.replace(/[\\/]$/, '')}
                <ChevronRight size={10} className="opacity-60" />
              </button>
            ))}
          </div>
        )}

        {/* Current path */}
        <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-2">
          {listing && !listing.isRoot && (
            <button
              type="button"
              title="Go up one level"
              onClick={() => navigate(listing.parent)}
              className="text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer shrink-0"
            >
              <CornerUpLeft size={16} />
            </button>
          )}
          <span className="text-[11px] font-mono text-cyan-300 truncate flex-1" title={path}>
            {path || 'Loading…'}
          </span>
        </div>

        {/* Directory listing */}
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1 border border-slate-800 rounded-2xl p-2 bg-slate-950/40">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-xs">
              <Loader2 size={16} className="animate-spin text-cyan-400" />
              Loading folders…
            </div>
          ) : error ? (
            <div className="py-8 text-center text-xs text-rose-400">
              {error}
              <div className="mt-2 text-slate-500">File might need elevated permissions.</div>
            </div>
          ) : listing && listing.entries.length > 0 ? (
            listing.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                onClick={() => navigate(entry.path)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs text-slate-300 hover:bg-slate-800/80 hover:text-slate-100 transition-all cursor-pointer"
              >
                {entry.name === '..' ? (
                  <CornerUpLeft size={14} className="text-slate-500 shrink-0" />
                ) : (
                  <Folder size={14} className="text-amber-300/80 shrink-0" />
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              No subfolders here. You can select this folder.
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800 text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!path}
            onClick={() => onSelect(path)}
            className="px-5 py-2.5 bg-linear-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-cyan-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Check size={14} />
            <span>Select This Folder</span>
          </button>
        </div>
      </div>
    </div>
  );
};