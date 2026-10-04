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
import { GitBranch, ExternalLink, X, Sparkles, Terminal } from 'lucide-react';
import { AppUpdateCheckResult } from '../types/app';
import { BUILD_CONFIG } from '../version';

export const DevelopmentUpdateBanner: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateCheckResult | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  // If built/configured for official production release, never query or display development banners
  if (!BUILD_CONFIG.IS_DEV_BUILD) {
    return null;
  }

  useEffect(() => {
    let isMounted = true;

    const checkUpdates = async () => {
      try {
        if (window.civitaiAPI && typeof window.civitaiAPI.checkAppUpdate === 'function') {
          const res = await window.civitaiAPI.checkAppUpdate();
          if (!isMounted || !res) return;

          // Check if this specific remote commit was already dismissed by the user
          const dismissedCommit = localStorage.getItem('civitai_dismissed_dev_commit');
          if (res.remoteCommit && dismissedCommit === res.remoteCommit) {
            setIsDismissed(true);
          }

          if (res.isUpdateAvailable) {
            setUpdateInfo(res);
          }
        }
      } catch (err) {
        console.warn('Development update check error:', err);
      }
    };

    // Initial check after short delay so app startup renders immediately
    const timer = setTimeout(() => {
      checkUpdates();
    }, 1500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  if (!updateInfo || !updateInfo.isUpdateAvailable || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    if (updateInfo.remoteCommit) {
      localStorage.setItem('civitai_dismissed_dev_commit', updateInfo.remoteCommit);
    }
  };

  const handleOpenGitHub = () => {
    const url = updateInfo.githubUrl || 'https://github.com/DevNullInc/RenegadeCMM';
    if (window.civitaiAPI && typeof window.civitaiAPI.openExternal === 'function') {
      window.civitaiAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <aside aria-label="Development Build Update Notice" className="w-full bg-linear-to-r from-amber-950/80 via-slate-900/90 to-purple-950/80 border-b border-amber-500/40 px-4 py-2 text-xs text-amber-100 flex flex-wrap items-center justify-between gap-3 shadow-lg shadow-amber-950/20 backdrop-blur-md z-[60] shrink-0 animate-fadeIn select-text">
      {/* Left: Indicator & Message */}
      <div className="flex items-center gap-2.5 flex-wrap min-w-0 flex-1">
        <span className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-extrabold px-2.5 py-0.5 rounded-full text-[10px] tracking-wider uppercase glow-amber shrink-0">
          <GitBranch size={12} className="text-amber-400" />
          Development Version
        </span>

        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-semibold text-slate-100">
            A newer development commit is available on GitHub:
          </span>
          {updateInfo.remoteCommit && (
            <span className="font-mono bg-slate-950/80 border border-amber-500/30 px-1.5 py-0.5 rounded text-[11px] text-amber-300 font-bold">
              {updateInfo.remoteCommit}
            </span>
          )}
          {updateInfo.remoteCommitMessage && (
            <span className="text-slate-300 truncate max-w-xs md:max-w-md lg:max-w-lg italic font-normal" title={updateInfo.remoteCommitMessage}>
              &ldquo;{updateInfo.remoteCommitMessage}&rdquo;
            </span>
          )}
          <span className="text-slate-400 text-[11px] hidden sm:inline">
            (Running: <strong className="text-slate-200 font-mono">{updateInfo.currentCommit || 'standalone build'}</strong>)
          </span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleOpenGitHub}
          className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 hover:border-amber-400 text-amber-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
          title="Open latest commit on GitHub"
        >
          <ExternalLink size={12} />
          <span>View on GitHub</span>
        </button>

        <button
          onClick={handleDismiss}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          title="Dismiss notification for this commit"
          aria-label="Dismiss development update banner"
        >
          <X size={15} />
        </button>
      </div>
    </aside>
  );
};
