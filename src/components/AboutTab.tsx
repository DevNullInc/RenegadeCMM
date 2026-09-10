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
  Info,
  Github,
  Bug,
  Scale,
  User,
  Heart,
  Terminal,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  ShieldCheck,
  Layers,
  AlertCircle,
  AlertTriangle,
  Info as InfoIcon,
  RefreshCw,
  Sparkles,
  GitBranch,
} from 'lucide-react';
import {
  subscribeLogs,
  clearLogs,
  generateDiagnosticReport,
  LogEntry,
} from '../utils/consoleCapture';
import { APP_VERSION, BUILD_CONFIG } from '../version';
import { AppUpdateCheckResult } from '../types/app';

export function AboutTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<'all' | 'error' | 'warn'>('all');
  const [copied, setCopied] = useState(false);
  const [sysInfo, setSysInfo] = useState<any>({ version: APP_VERSION });
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'up-to-date' | 'error'>('idle');
  const [updateResult, setUpdateResult] = useState<AppUpdateCheckResult | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const isFullRelease = !BUILD_CONFIG.IS_DEV_BUILD || sysInfo.isDevBuild === false;

  const handleCheckUpdates = async () => {
    setUpdateStatus('checking');
    try {
      if (window.civitaiAPI && typeof window.civitaiAPI.checkAppUpdate === 'function') {
        const res = await window.civitaiAPI.checkAppUpdate();
        setUpdateResult(res);
        if (res && res.isUpdateAvailable) {
          setUpdateStatus('available');
        } else {
          setUpdateStatus('up-to-date');
        }
      } else {
        setUpdateStatus('up-to-date');
      }
    } catch (e) {
      console.warn('Failed to check for updates:', e);
      setUpdateStatus('error');
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeLogs((newLogs) => {
      setLogs(newLogs);
    });

    if (window.civitaiAPI && typeof window.civitaiAPI.getSystemInfo === 'function') {
      window.civitaiAPI.getSystemInfo().then((info) => {
        if (info) setSysInfo(info);
      });
    }

    handleCheckUpdates();

    return () => unsubscribe();
  }, []);

  const openLink = (url: string) => {
    if (window.civitaiAPI && typeof window.civitaiAPI.openExternal === 'function') {
      window.civitaiAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const updateTooltip = (isFullRelease || updateResult?.isReleaseMode)
    ? "A new release is available! Click to open the GitHub Releases page to download the latest installer or portable executable."
    : "A new update is available! Use the launcher script with the 'update' flag (./cmm.sh update or .\\cmm.ps1 update) to automatically update to the latest committed version.";

  const handleUpdateClick = () => {
    if (isFullRelease || updateResult?.isReleaseMode) {
      openLink('https://github.com/DevNullInc/RenegadeCMM/releases');
    } else {
      const url = updateResult?.githubUrl || 'https://github.com/DevNullInc/RenegadeCMM';
      openLink(url);
    }
  };

  const handleCopyReport = async () => {
    try {
      let configSummary = {};
      if (window.civitaiAPI && typeof window.civitaiAPI.getConfig === 'function') {
        const cfg = await window.civitaiAPI.getConfig();
        configSummary = {
          comfyui_root: cfg.comfyui_root,
          folder_count: (cfg.comfyui_folders || []).length,
          conflict_strategy: cfg.conflict_strategy,
          has_api_key: Boolean(cfg.civitai_api_key),
        };
      }
      const report = await generateDiagnosticReport(configSummary);
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      console.error('Failed to copy diagnostic report:', e);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filterLevel === 'error') return log.level === 'error';
    if (filterLevel === 'warn') return log.level === 'warn';
    return true;
  });

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8 animate-fade-in pb-24">
      {/* Hero Header Section */}
      <div className="glass-panel p-8 rounded-3xl border border-slate-800/80 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="p-4 rounded-3xl bg-linear-to-tr from-purple-600 via-indigo-600 to-blue-600 text-white shadow-xl shadow-purple-600/30 flex items-center justify-center">
              <Layers size={36} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black text-slate-100 tracking-tight">
                  Renegade Core Model Manager
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  v{sysInfo.version || APP_VERSION}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  isFullRelease
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}>
                  {isFullRelease ? 'Stable Release' : 'Development Build'}
                </span>

                {/* Dynamic Update Available Badge */}
                {updateStatus === 'available' && (
                  <button
                    onClick={handleUpdateClick}
                    title={updateTooltip}
                    className="px-3 py-1 rounded-full text-xs font-extrabold bg-linear-to-r from-emerald-500/25 via-teal-500/25 to-emerald-500/25 hover:from-emerald-500/40 hover:to-teal-500/40 text-emerald-300 hover:text-emerald-100 border border-emerald-500/60 hover:border-emerald-400 flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 animate-pulse hover:animate-none group"
                  >
                    <Sparkles size={13} className="text-emerald-400 group-hover:rotate-12 transition-transform" />
                    <span>Update Available</span>
                    {updateResult?.latestReleaseTag && (
                      <span className="font-mono text-[11px] opacity-80">({updateResult.latestReleaseTag})</span>
                    )}
                    {updateResult?.remoteCommit && !updateResult?.latestReleaseTag && (
                      <span className="font-mono text-[11px] opacity-80">({updateResult.remoteCommit})</span>
                    )}
                    <ExternalLink size={11} className="text-emerald-400/80" />
                  </button>
                )}

                {/* Up to date indicator */}
                {updateStatus === 'up-to-date' && (
                  <span
                    title="You are currently running the latest version."
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800/80 text-emerald-400/90 border border-emerald-500/30 flex items-center gap-1 cursor-default"
                  >
                    <Check size={11} className="text-emerald-400" />
                    <span>Up to Date</span>
                  </span>
                )}

                {/* Manual Check Updates Button */}
                <button
                  onClick={handleCheckUpdates}
                  disabled={updateStatus === 'checking'}
                  title="Check GitHub for newer updates or releases"
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60 hover:border-slate-500 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={11} className={updateStatus === 'checking' ? 'animate-spin text-purple-400' : 'text-slate-400'} />
                  <span>{updateStatus === 'checking' ? 'Checking...' : 'Check Updates'}</span>
                </button>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                The missing model manager and automated folder router for ComfyUI.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => openLink('https://github.com/DevNullInc/RenegadeCMM')}
              className="px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/70 hover:border-purple-500/50 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <Github size={15} className="text-purple-400" />
              <span>GitHub Repository</span>
              <ExternalLink size={12} className="text-slate-500" />
            </button>

            <button
              onClick={() => openLink('https://github.com/DevNullInc/RenegadeCMM/blob/main/PRIVACY.md')}
              className="px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/70 hover:border-emerald-500/50 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <ShieldCheck size={15} className="text-emerald-400" />
              <span>Privacy Policy</span>
              <ExternalLink size={12} className="text-slate-500" />
            </button>

            <button
              onClick={() => openLink('https://github.com/DevNullInc/RenegadeCMM/issues')}
              className="px-4 py-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-200 border border-rose-800/60 hover:border-rose-500/80 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-lg"
            >
              <Bug size={15} className="text-rose-400" />
              <span>Report Issue / Bug</span>
              <ExternalLink size={12} className="text-rose-400/60" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Credits, Licensing & Specifications */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Creator & Credits Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-purple-400 font-bold text-sm">
              <User size={18} />
              <span>Creator & Credits</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Designed, architected, and maintained with care for the AI generative art community.
            </p>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Author / Creator:</span>
                <span className="font-bold text-purple-300">TheStygianRenegade</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Organization:</span>
                <span className="font-semibold text-slate-200">DevNullInc</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 block">Buy me a coffee or something please?</span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => openLink('https://cash.app/$StygianRenegade/1.00')}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>☕ $1.00</span>
                </button>
                <button
                  onClick={() => openLink('https://cash.app/$StygianRenegade/5.00')}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>🥪 $5.00</span>
                </button>
                <button
                  onClick={() => openLink('https://cash.app/$StygianRenegade/10.00')}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>🍕 $10.00</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Heart size={12} className="text-rose-400 fill-rose-400" />
            <span>Dedicated to the ComfyUI & CivitAI creators</span>
          </div>
        </div>

        {/* License Info Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-indigo-400 font-bold text-sm">
              <Scale size={18} />
              <span>Open Source License</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Renegade Core Model Manager is Free and Open Source Software distributed under the terms of the GNU GPL v3.0 or later (GPL-3.0-or-later).
            </p>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">License:</span>
                <span className="font-bold text-emerald-400">GPL-3.0-or-later</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Copyleft:</span>
                <span className="text-slate-300">Disclose Source, Same License</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Permissions:</span>
                <span className="text-slate-300">Commercial, Modify, Distribute</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Warranty:</span>
                <span className="text-amber-400/90 font-medium">None (AS-IS)</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => openLink('https://www.gnu.org/licenses/gpl-3.0.html')}
                className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Scale size={14} />
                <span>Read GNU GPL-3.0</span>
                <ExternalLink size={11} className="text-indigo-400/60" />
              </button>
              <button
                onClick={() => openLink('https://github.com/DevNullInc/RenegadeCMM/blob/main/LEGAL.md')}
                className="text-slate-400 hover:text-indigo-300 text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>LEGAL.md</span>
                <ExternalLink size={11} className="text-slate-500" />
              </button>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              <span>Code signing by</span>
              <button
                onClick={() => openLink('https://signpath.org')}
                className="text-slate-400 hover:text-indigo-300 transition-colors underline cursor-pointer"
              >
                SignPath Foundation
              </button>
            </div>
          </div>
        </div>

        {/* Runtime & Environment Info Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-blue-400 font-bold text-sm">
              <Info size={18} />
              <span>System & Runtime</span>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Application Version:</span>
                <span className="font-semibold text-purple-300">
                  v{sysInfo.version || APP_VERSION} ({isFullRelease ? 'Stable Release' : 'Development Build'})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Platform / OS:</span>
                <span className="font-semibold text-slate-200">
                  {sysInfo.platform || 'windows'} ({sysInfo.arch || 'x64'})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Electron Engine:</span>
                <span className="font-mono text-slate-300">{sysInfo.electronVersion || 'v34.5.8'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Node Runtime:</span>
                <span className="font-mono text-slate-300">{sysInfo.nodeVersion || 'v20.x'}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>Hardware Hashing:</span>
            <span className="text-emerald-400 font-semibold">64MB AVX/SHA-NI</span>
          </div>
        </div>
      </div>

      {/* Diagnostics Console & Error Copy/Paste Section */}
      <div className="glass-panel p-6 rounded-3xl border border-slate-800/80 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Terminal size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Diagnostic Console & Error Logs</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-normal">
                  {logs.length} events
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Copy diagnostic telemetry and stack traces for easy pasting into GitHub bug reports.
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Filter Pills */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setFilterLevel('all')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${filterLevel === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                All ({logs.length})
              </button>
              <button
                onClick={() => setFilterLevel('error')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${filterLevel === 'error'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                  : 'text-slate-400 hover:text-rose-300'
                  }`}
              >
                <AlertCircle size={13} className="text-rose-400" />
                <span>Errors ({errorCount})</span>
              </button>
              <button
                onClick={() => setFilterLevel('warn')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${filterLevel === 'warn'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                  : 'text-slate-400 hover:text-amber-300'
                  }`}
              >
                <AlertTriangle size={13} className="text-amber-400" />
                <span>Warnings ({warnCount})</span>
              </button>
            </div>

            {/* Copy Report Button */}
            <button
              onClick={handleCopyReport}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-lg ${copied
                ? 'bg-emerald-600 text-white shadow-emerald-600/30 glow-emerald'
                : 'bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/30 glow-purple'
                }`}
            >
              {copied ? (
                <>
                  <Check size={14} className="stroke-[3]" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copy Diagnostic Report</span>
                </>
              )}
            </button>

            {/* Clear Button */}
            <button
              onClick={clearLogs}
              title="Clear Console Output"
              className="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-rose-300 border border-slate-800 transition-colors cursor-pointer"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Live Terminal Log Stream Container */}
        <div className="bg-slate-950 border border-slate-800/90 rounded-2xl p-4 font-mono text-xs overflow-hidden shadow-inner">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-[11px] text-slate-500">
            <span>TIMESTAMP & SEVERITY</span>
            <span>MESSAGE / STACK TRACE</span>
          </div>

          <div className="h-72 overflow-y-auto space-y-1.5 pr-2 scrollbar-thin select-text">
            {filteredLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 py-12 space-y-2">
                <Terminal size={32} className="opacity-30" />
                <p>No console messages matching the current filter.</p>
              </div>
            ) : (
              filteredLogs.map((entry) => (
                <div
                  key={entry.id}
                  className={`p-2 rounded-lg border text-left transition-colors flex flex-col gap-1 select-text ${entry.level === 'error'
                    ? 'bg-rose-950/25 border-rose-900/40 text-rose-300'
                    : entry.level === 'warn'
                      ? 'bg-amber-950/25 border-amber-900/40 text-amber-300'
                      : 'bg-slate-900/40 border-slate-800/50 text-slate-300'
                    }`}
                >
                  <div className="flex items-start gap-2.5 select-text">
                    <span className="text-[10px] text-slate-500 shrink-0 select-text">
                      {entry.time}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded shrink-0 select-none ${entry.level === 'error'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : entry.level === 'warn'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-400'
                        }`}
                    >
                      {entry.level}
                    </span>
                    <span className="whitespace-pre-wrap break-all flex-1 font-mono text-[11.5px] select-text">
                      {entry.message}
                    </span>
                  </div>

                  {entry.stack && (
                    <pre className="text-[10px] text-slate-500 bg-slate-950/80 p-2 rounded border border-slate-800/80 overflow-x-auto whitespace-pre font-mono mt-1 select-text">
                      {entry.stack}
                    </pre>
                  )}
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
