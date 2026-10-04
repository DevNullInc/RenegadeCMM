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
import {
  Scale,
  Heart,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react';
import { LicenseValidationResult } from '../types/license';

interface EvaluationNagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAboutTab: () => void;
  licenseStatus?: LicenseValidationResult | null;
}

export const EvaluationNagModal: React.FC<EvaluationNagModalProps> = ({
  isOpen,
  onClose,
  onOpenAboutTab,
  licenseStatus,
}) => {
  if (!isOpen) return null;

  const openLink = (url: string) => {
    if (window.civitaiAPI && typeof window.civitaiAPI.openExternal === 'function') {
      window.civitaiAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleRegisterClick = () => {
    onClose();
    onOpenAboutTab();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div
        className="relative w-full max-w-xl glass-panel bg-slate-900/95 border border-purple-500/30 rounded-3xl p-6 md:p-8 shadow-2xl shadow-purple-950/40 text-slate-200 space-y-6 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eval-modal-title"
      >
        {/* Glow ambient background accents */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-purple-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-inner">
              <Scale size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="eval-modal-title" className="text-lg font-bold text-white tracking-wide">
                  Renegade Core Model Manager
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Evaluation Notice
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Weekly development reminder under Business Source License 1.1 (BSL-1.1)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Substantive Message */}
        <div className="space-y-3 relative z-10 text-xs text-slate-300 leading-relaxed">
          <p>
            Thank you for using <strong className="text-purple-300">RenegadeCMM</strong>! You are currently evaluating this software on a single-user basis.
          </p>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
              <CheckCircle2 size={15} />
              <span>Full Features &amp; Non-Expiring Capabilities</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal pl-5">
              All features—including CivitAI sync, Hugging Face downloads, workflow analysis, and duplicate optimization—are 100% unlocked and never artificially restricted or locked out.
            </p>
          </div>

          <p>
            If you enjoy the application and use it regularly in your creative workflows, please consider registering your copy. Anyone supporting development on <strong>GitHub Sponsors ($10+ tier)</strong> receives a complimentary personalized single-user license key.
          </p>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck size={14} className="text-indigo-400 shrink-0" />
            <span>Commercial organizations with &gt; 5 employees or contractors require a commercial seat license.</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
          <button
            onClick={() => openLink('https://github.com/sponsors/DevNullInc')}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 hover:border-pink-500/50 text-pink-300 hover:text-pink-200 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
          >
            <Heart size={14} className="text-pink-400 fill-pink-400/30" />
            <span>Support on GitHub</span>
            <ExternalLink size={12} className="text-pink-400/70 ml-0.5" />
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer w-full sm:w-auto text-center"
            >
              Continue Evaluating
            </button>
            <button
              onClick={handleRegisterClick}
              className="px-4 py-2.5 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <KeyRound size={14} />
              <span>Register License</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
