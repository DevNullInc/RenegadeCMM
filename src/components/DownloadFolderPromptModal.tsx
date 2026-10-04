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
import { Folder, Download, X, Check, HardDrive, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface DownloadFolderPromptModalProps {
  modelName: string;
  versionName: string;
  folders: string[];
  onConfirm: (selectedFolder: string, rememberChoice: boolean) => void;
  onCancel: () => void;
}

export const DownloadFolderPromptModal: React.FC<DownloadFolderPromptModalProps> = ({
  modelName,
  versionName,
  folders,
  onConfirm,
  onCancel,
}) => {
  const [selectedFolder, setSelectedFolder] = useState<string>(folders[0] || '');
  const [rememberChoice, setRememberChoice] = useState<boolean>(false);
  const [folderAccess, setFolderAccess] = useState<Record<string, { exists: boolean; writable: boolean; error?: string }>>({});
  const [checkingAccess, setCheckingAccess] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    const checkAll = async () => {
      setCheckingAccess(true);
      const results: Record<string, { exists: boolean; writable: boolean; error?: string }> = {};
      if (window.civitaiAPI?.checkFolderAccess) {
        await Promise.all(
          folders.map(async (f) => {
            try {
              const res = await window.civitaiAPI.checkFolderAccess(f);
              results[f] = res;
            } catch (e: any) {
              results[f] = { exists: false, writable: false, error: e?.message || 'Check failed' };
            }
          })
        );
      }
      if (isMounted) {
        setFolderAccess(results);
        setCheckingAccess(false);

        // If the initially selected folder is unwritable, auto-switch to first writable folder
        if (results[folders[0]] && !results[folders[0]].writable) {
          const firstWritable = folders.find((f) => results[f]?.writable);
          if (firstWritable) {
            setSelectedFolder(firstWritable);
          }
        }
      }
    };
    checkAll();
    return () => {
      isMounted = false;
    };
  }, [folders]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolder) return;
    onConfirm(selectedFolder, rememberChoice);
  };

  const selectedAccess = folderAccess[selectedFolder];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn" onClick={onCancel}>
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scaleUp" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/20 text-purple-300">
              <Folder size={22} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-100">Select Download Destination</h2>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                {modelName} <span className="text-purple-400">({versionName})</span>
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Info */}
        <p className="text-xs text-slate-300 leading-relaxed">
          You have multiple ComfyUI model directories configured. Choose which directory this model should be routed and downloaded into:
        </p>

        {/* Locked / Unwritable Warning if selected folder is locked */}
        {selectedAccess && !selectedAccess.writable && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Destination Folder / Drive is Locked or Read-Only</div>
              <div className="text-[11px] text-rose-200/90 mt-0.5">
                {selectedAccess.error || 'Permission denied. Ensure the drive is unlocked and writable before downloading.'}
              </div>
            </div>
          </div>
        )}

        {/* Folder Options */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {folders.map((folder, idx) => {
              const isSelected = selectedFolder === folder;
              const access = folderAccess[folder];
              const isLocked = access && !access.writable;

              return (
                <div
                  key={folder}
                  onClick={() => setSelectedFolder(folder)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? isLocked
                        ? 'bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-950/30'
                        : 'bg-purple-950/40 border-purple-500/60 shadow-lg shadow-purple-950/30'
                      : isLocked
                      ? 'bg-slate-950/60 border-rose-900/40 hover:border-rose-700/60'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="radio"
                      name="destination_folder"
                      checked={isSelected}
                      onChange={() => setSelectedFolder(folder)}
                      className="w-4 h-4 text-purple-600 bg-slate-900 border-slate-700 focus:ring-purple-500 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <HardDrive size={13} className="text-slate-400 shrink-0" />
                        <span className="text-xs font-bold text-slate-200 truncate">
                          Folder #{idx + 1}
                        </span>
                        {checkingAccess ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <Loader2 size={10} className="animate-spin" /> checking...
                          </span>
                        ) : access ? (
                          access.writable ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-medium">
                              <CheckCircle2 size={10} /> Writable
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold" title={access.error}>
                              <AlertTriangle size={10} /> Locked / Read-Only
                            </span>
                          )
                        ) : null}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5" title={folder}>
                        {folder}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <span className={`p-1 rounded-full ${isLocked ? 'bg-rose-500/20 text-rose-300' : 'bg-purple-500/20 text-purple-300'}`}>
                      <Check size={14} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Remember Choice Checkbox */}
          <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-2xl">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="mt-0.5 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="font-semibold text-slate-200">Always use this folder for future downloads</span>
                <p className="text-[11px] text-slate-500">
                  You can change or reset this default anytime in the Settings tab.
                </p>
              </div>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFolder}
              className={`px-5 py-2.5 font-bold rounded-xl text-xs transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                selectedAccess && !selectedAccess.writable
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                  : 'bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/30'
              }`}
            >
              <Download size={14} />
              <span>{selectedAccess && !selectedAccess.writable ? 'Attempt Download Anyway' : 'Download Model'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
