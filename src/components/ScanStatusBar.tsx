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
import React from 'react';
import { RefreshCw, Square, ArrowRight } from 'lucide-react';
import { useScan } from '../context/ScanContext';

interface ScanStatusBarProps {
  onNavigateToLibrary?: () => void;
  activeTab?: string;
}

export const ScanStatusBar: React.FC<ScanStatusBarProps> = ({
  onNavigateToLibrary,
  activeTab,
}) => {
  const { isScanning, scanProgress, cancelScan } = useScan();

  if (!isScanning && (!scanProgress || scanProgress.status === 'idle')) {
    return null;
  }

  const total = scanProgress?.totalFiles || 0;
  const scanned = scanProgress?.scannedFiles || 0;
  const percent = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : isScanning ? 5 : 0;
  const status = scanProgress?.status || 'scanning';

  const getStatusLabel = () => {
    switch (status) {
      case 'scanning':
        return '1. Scanning Directory Structure';
      case 'hashing':
        return '2. Computing SHA256 Hashes';
      case 'lookup':
        return '3. Querying CivitAI Matching';
      case 'completed':
        return 'Scan Completed';
      case 'failed':
        return 'Scan Failed';
      default:
        return 'Background Scan';
    }
  };

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Background Folder Scan Progress"
      className="w-full bg-slate-950/95 border-t border-purple-500/40 backdrop-blur-xl px-6 py-2.5 shadow-2xl shrink-0 z-40 animate-fadeIn select-none"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        {/* Left: Progress info & animation */}
        <div className="flex items-center gap-3 min-w-0 flex-1 w-full sm:w-auto">
          <div className="p-1.5 rounded-xl bg-purple-500/20 text-purple-300 shrink-0">
            <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-100">{getStatusLabel()}</span>
              <span className="text-purple-300 font-mono font-bold">{percent}%</span>
              {total > 0 && (
                <span className="text-slate-400 font-mono text-[11px]">
                  ({scanned} / {total} files)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate max-w-xl mt-0.5">
              {scanProgress?.currentFile || 'Processing models in background...'}
            </p>
          </div>
        </div>

        {/* Center Progress Bar */}
        <div className="w-full sm:w-64 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800 shrink-0 shadow-inner">
          <div
            className="bg-linear-to-r from-purple-600 via-indigo-500 to-purple-400 h-full transition-all duration-300 rounded-full glow-purple"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          {activeTab !== 'library' && onNavigateToLibrary && (
            <button
              onClick={onNavigateToLibrary}
              title="View in Library tab"
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-purple-300 border border-slate-800 hover:border-purple-500/40 text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>Library Tab</span>
              <ArrowRight size={12} />
            </button>
          )}

          {isScanning && (
            <button
              onClick={cancelScan}
              title="Stop scanning"
              className="px-3 py-1 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Square size={10} className="fill-rose-300" />
              <span>Stop</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
