/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Workflow,
  Sparkles,
  Layers,
  HardDrive,
  AlertTriangle,
  X,
  ArrowRight,
  Cpu,
} from 'lucide-react';
import { WorkflowInfo } from '../types/app';
import { WorkflowParseResult } from '../services/workflowScanner';

interface WorkflowImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  parsedData: WorkflowParseResult | null;
  savedWorkflows: WorkflowInfo[];
  onConfirmImport: (targetName: string, overwrite: boolean) => Promise<void>;
  isImporting: boolean;
}

const NAME_REGEX = /^[a-zA-Z0-9_\- ]+$/;

export const WorkflowImportModal: React.FC<WorkflowImportModalProps> = ({
  isOpen,
  onClose,
  parsedData,
  savedWorkflows,
  onConfirmImport,
  isImporting,
}) => {
  const [targetName, setTargetName] = useState<string>('');
  const [allowOverwrite, setAllowOverwrite] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize workflow name when modal opens with parsed data
  useEffect(() => {
    if (parsedData && isOpen) {
      const base = parsedData.fileName
        .replace(/\.(json|png)$/i, '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();
      setTargetName(base || 'imported_workflow');
      setAllowOverwrite(false);
      setErrorMsg(null);
    }
  }, [parsedData, isOpen]);

  // Check for case-insensitive collisions with existing workflows
  const existingCollision = useMemo(() => {
    if (!targetName.trim() || !savedWorkflows) return null;
    const targetWithExt = `${targetName.trim().toLowerCase()}.json`;
    return savedWorkflows.find(
      (w) =>
        w.fileName?.toLowerCase() === targetWithExt ||
        w.fileName?.toLowerCase() === targetName.trim().toLowerCase()
    );
  }, [targetName, savedWorkflows]);

  if (!isOpen || !parsedData) return null;

  const isNameValid = NAME_REGEX.test(targetName.trim()) && targetName.trim().length > 0;
  const isBlockedByCollision = !!existingCollision && !allowOverwrite;
  const canSubmit = isNameValid && !isBlockedByCollision && !isImporting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNameValid) {
      setErrorMsg('Workflow name can only contain letters, numbers, spaces, hyphens, and underscores.');
      return;
    }
    if (isBlockedByCollision) {
      setErrorMsg('A workflow with this name already exists. Enable overwrite to replace it.');
      return;
    }
    setErrorMsg(null);
    await onConfirmImport(targetName.trim(), allowOverwrite);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-cyan-950/30 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
              <Workflow size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                <span>Import ComfyUI Workflow</span>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                    parsedData.fileType === 'png'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  }`}
                >
                  {parsedData.fileType.toUpperCase()}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Source: <span className="text-slate-200 font-mono text-[11px]">{parsedData.fileName}</span>{' '}
                ({(parsedData.fileSize / 1024).toFixed(1)} KB)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-all cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Dependency & Graph Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="glass-panel p-3.5 rounded-2xl border border-slate-800 bg-slate-950/50 space-y-1">
              <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold">
                <Cpu size={14} />
                <span>Node Types</span>
              </div>
              <div className="text-2xl font-black text-slate-100">
                {parsedData.nodes?.length || 0}
              </div>
              <p className="text-[10px] text-slate-400">
                Custom & core nodes detected
              </p>
            </div>

            <div className="glass-panel p-3.5 rounded-2xl border border-slate-800 bg-slate-950/50 space-y-1">
              <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
                <HardDrive size={14} />
                <span>Model Refs</span>
              </div>
              <div className="text-2xl font-black text-slate-100">
                {parsedData.models?.length || 0}
              </div>
              <p className="text-[10px] text-slate-400">
                Checkpoints, LoRAs & VAE
              </p>
            </div>

            <div className="glass-panel p-3.5 rounded-2xl border border-slate-800 bg-slate-950/50 space-y-1 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                <Layers size={14} />
                <span>Canvas Layout</span>
              </div>
              <div className="text-2xl font-black text-slate-100">
                {parsedData.canvasGraph?.nodes?.length || parsedData.nodes?.length || 0}
              </div>
              <p className="text-[10px] text-slate-400">
                Interactive spatial nodes
              </p>
            </div>
          </div>

          {/* Workflow Name Input */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-200 tracking-wide uppercase">
              Workflow Destination Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={targetName}
                onChange={(e) => {
                  setTargetName(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="e.g. SDXL_Portrait_Generator"
                className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-400 rounded-2xl px-4 py-2.5 text-sm text-slate-100 font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
                disabled={isImporting}
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">
                .json
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Will be saved to ComfyUI's user workflows directory (<code className="text-cyan-300 text-[10px]">user/default/workflows/</code>)
            </p>
          </div>

          {/* Duplicate Workflow Warning & Overwrite Toggle */}
          {existingCollision && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                <span>Workflow Name Collision Detected</span>
              </div>
              <p className="text-[11px] text-amber-300/80">
                A workflow named <code className="font-mono font-bold text-amber-200">"{existingCollision.fileName}"</code> already exists in your ComfyUI workflows library.
              </p>
              <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowOverwrite}
                  onChange={(e) => {
                    setAllowOverwrite(e.target.checked);
                    setErrorMsg(null);
                  }}
                  className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700 focus:ring-cyan-400"
                />
                <span className="font-semibold text-xs text-slate-200">
                  Overwrite existing workflow file
                </span>
              </label>
            </div>
          )}

          {/* Validation Error Message */}
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2 animate-fadeIn">
              <AlertTriangle size={15} className="shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Detected Node Classes Preview Pills */}
          {parsedData.nodes && parsedData.nodes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-slate-300">Detected Custom & Extension Node Types:</span>
                <span className="text-[11px]">{parsedData.nodes.length} types</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                {parsedData.nodes.map((nodeType) => (
                  <span
                    key={nodeType}
                    className="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-lg bg-slate-900 text-slate-300 border border-slate-800"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    {nodeType}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Detected Model Dependencies Preview */}
          {parsedData.models && parsedData.models.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-bold text-slate-300">Detected Model Dependencies:</span>
                <span className="text-[11px]">
                  {parsedData.models.filter((m) => m.isInstalled).length} installed •{' '}
                  {parsedData.models.filter((m) => !m.isInstalled).length} missing
                </span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                {parsedData.models.map((m, idx) => (
                  <div
                    key={`${m.modelName}-${idx}`}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-900/60"
                  >
                    <span className="font-mono text-[11px] text-slate-200 truncate max-w-[340px]" title={m.modelName}>
                      {m.modelName}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        m.isInstalled
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                      }`}
                    >
                      {m.isInstalled ? 'Installed' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all cursor-pointer ${
                canSubmit
                  ? 'bg-linear-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white shadow-cyan-600/25 active:scale-95'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <Sparkles size={15} className={isImporting ? 'animate-spin' : ''} />
              <span>{isImporting ? 'Archiving & Resolving...' : 'Import & Check Missing Nodes'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
