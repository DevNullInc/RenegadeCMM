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
import React, { useState } from 'react';
import {
  Star,
  GitBranch,
  CheckCircle2,
  ExternalLink,
  Download,
  AlertCircle,
  Terminal,
  Loader2,
  Sparkles,
  RefreshCw,
  Link as LinkIcon,
  Package,
  FolderSearch,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  Layers,
} from 'lucide-react';
import { NodeResolutionResult, NodeCloneResult, CustomNodePackage } from '../types/app';

interface NodeResolutionCardProps {
  nodeType?: string;
  groupedNodeTypes?: string[];
  groupPackName?: string;
  resolution?: NodeResolutionResult | null;
  defaultExpanded?: boolean;
  onInstalled?: (folderName: string, affectedNodeTypes?: string[]) => void;
  onLocateInWorkflow?: (nodeType: string) => void;
}

export const NodeResolutionCard: React.FC<NodeResolutionCardProps> = ({
  nodeType,
  groupedNodeTypes,
  groupPackName,
  resolution,
  defaultExpanded = false,
  onInstalled,
  onLocateInWorkflow,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [customGitUrl, setCustomGitUrl] = useState('');
  const [isCloning, setIsCloning] = useState<string | null>(null);
  const [cloneResult, setCloneResult] = useState<NodeCloneResult | null>(null);
  const [isInstallingDeps, setIsInstallingDeps] = useState(false);
  const [installOutput, setInstallOutput] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  // Set once "Run Pip Install" succeeds, so the button can't be pressed again.
  const [depsInstalled, setDepsInstalled] = useState(false);

  // Manual fallback mapping (searchable dropdown of installed custom node folders)
  const [manualPickerOpenForNode, setManualPickerOpenForNode] = useState<string | null>(null);
  const [manualSearch, setManualSearch] = useState('');
  const [installedFolders, setInstalledFolders] = useState<CustomNodePackage[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  const linkedNodes: string[] =
    groupedNodeTypes && groupedNodeTypes.length > 0
      ? groupedNodeTypes
      : nodeType
      ? [nodeType]
      : [];

  const isGroup = linkedNodes.length > 1;

  const formatStars = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(count);
  };

  const formatRelativeTime = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (days === 0) return 'Updated today';
      if (days === 1) return 'Updated yesterday';
      if (days < 30) return `Updated ${days} days ago`;
      const months = Math.floor(days / 30);
      return `Updated ${months} month${months > 1 ? 's' : ''} ago`;
    } catch {
      return '';
    }
  };

  const handleCloneRepo = async (gitUrl: string) => {
    if (!gitUrl || !window.civitaiAPI?.cloneCustomNode) return;
    setIsCloning(gitUrl);
    setCloneResult(null);
    setInstallOutput(null);
    setInstallError(null);

    try {
      const res: NodeCloneResult = await window.civitaiAPI.cloneCustomNode(gitUrl);
      setCloneResult(res);
      if (res.success && onInstalled) {
        onInstalled(res.folderName, linkedNodes);
      }
    } catch (err: any) {
      setCloneResult({
        success: false,
        folderName: '',
        targetPath: '',
        hasRequirements: false,
        hasInstallScript: false,
        error: err?.message || 'Clone failed',
      });
    } finally {
      setIsCloning(null);
    }
  };

  const handleInstallDeps = async (folderPath: string) => {
    if (!window.civitaiAPI?.installNodeDependencies) return;
    setIsInstallingDeps(true);
    setInstallError(null);

    try {
      const res = await window.civitaiAPI.installNodeDependencies(folderPath);
      if (res.success) {
        setInstallOutput(res.output || 'Dependencies installed successfully.');
        setDepsInstalled(true);
      } else {
        setInstallError(res.error || 'Failed to install dependencies.');
        setInstallOutput(res.output || null);
      }
    } catch (e: any) {
      setInstallError(e?.message || 'Execution error');
    } finally {
      setIsInstallingDeps(false);
    }
  };

  // The extension/pack that hosts this node — e.g. "ComfyUI-Easy-Use" for the
  // "EasyNegative" class. When the registry match knows the repo it wins; otherwise
  // the installed folder name is the best signal (missing-node cards get the pack
  // name only when the registry identified it).
  const packName =
    groupPackName ||
    resolution?.managerMatch?.title ||
    (resolution?.isInstalled ? resolution.installedFolder : undefined) ||
    (linkedNodes.length === 1 ? linkedNodes[0] : 'Custom Node Extension');

  const handleSearchGitHub = () => {
    if (!window.civitaiAPI?.openExternal) return;
    const term =
      groupPackName ||
      resolution?.managerMatch?.title ||
      (linkedNodes.length === 1 ? `comfyui ${linkedNodes[0]}` : packName);
    const searchUrl = `https://github.com/search?q=${encodeURIComponent(
      term
    )}&type=repositories`;
    window.civitaiAPI.openExternal(searchUrl);
  };

  const handleOpenManualPicker = async (targetNode: string) => {
    const nextTarget = manualPickerOpenForNode === targetNode ? null : targetNode;
    setManualPickerOpenForNode(nextTarget);
    if (nextTarget && installedFolders.length === 0 && window.civitaiAPI?.getInstalledCustomNodes) {
      setIsLoadingFolders(true);
      try {
        const pkgs = await window.civitaiAPI.getInstalledCustomNodes();
        setInstalledFolders(Array.isArray(pkgs) ? pkgs : []);
      } catch {
        setInstalledFolders([]);
      } finally {
        setIsLoadingFolders(false);
      }
    }
  };

  const handleManualSelect = async (targetNode: string, folderName: string) => {
    if (!folderName || !window.civitaiAPI?.markCustomNodeInstalled) return;
    setIsMapping(true);
    setMappingError(null);
    try {
      const res = await window.civitaiAPI.markCustomNodeInstalled(targetNode, folderName);
      if (res?.isInstalled) {
        setManualPickerOpenForNode(null);
        setManualSearch('');
        if (onInstalled) onInstalled(folderName, isGroup ? linkedNodes : [targetNode]);
      } else {
        setMappingError(
          'Could not map this node to that folder. The folder may have been removed from disk.'
        );
      }
    } catch (err: any) {
      setMappingError(err?.message || 'Failed to map node to folder.');
    } finally {
      setIsMapping(false);
    }
  };

  const filteredFolders = installedFolders.filter((f) =>
    f.folderName.toLowerCase().includes(manualSearch.toLowerCase())
  );

  const candidates = resolution?.githubCandidates || [];
  const primaryGitUrl = resolution?.managerMatch?.gitUrl || (candidates.length > 0 ? candidates[0].cloneUrl : null);

  return (
    <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 shadow-xl transition-all">
      {/* Header Flag */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row cursor-pointer select-none group"
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-2 rounded-xl bg-cyan-600/15 text-cyan-400 border border-cyan-500/25 shrink-0 group-hover:scale-105 transition-transform">
            <Package size={20} />
          </div>
          <div className="min-w-0 space-y-0.5 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-100 group-hover:text-cyan-300 transition-colors truncate">
                {packName}
              </h3>
              {resolution?.managerMatch?.author && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/90 text-purple-300 border border-slate-700/80 font-mono">
                  by {resolution.managerMatch.author}
                </span>
              )}
            </div>
            {isGroup ? (
              <p className="text-[11px] text-slate-400">
                {linkedNodes.length} workflow node classes linked to this package
              </p>
            ) : nodeType && nodeType !== packName ? (
              <p className="text-[11px] font-mono text-slate-400 truncate">
                {nodeType}
              </p>
            ) : null}
          </div>
        </div>

        {/* Right Badges & Top Actions */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {resolution?.isInstalled ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
              <CheckCircle2 size={13} />
              <span>Installed ({resolution.installedFolder || 'ComfyUI'})</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold">
              <AlertCircle size={13} />
              <span>{isGroup ? `${linkedNodes.length} Missing Nodes` : 'Missing Node'}</span>
            </span>
          )}

          {/* Top Install Extension Button */}
          {!resolution?.isInstalled && primaryGitUrl && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCloneRepo(primaryGitUrl);
              }}
              disabled={isCloning === primaryGitUrl}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold text-xs shadow-md shadow-purple-900/30 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
              title="1-click Git clone this custom node extension into ComfyUI custom_nodes folder"
            >
              {isCloning === primaryGitUrl ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
              <span>Install Extension</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSearchGitHub();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
            title="Search GitHub for this custom node repository"
          >
            <ExternalLink size={13} />
            <span className="hidden sm:inline">Search GitHub</span>
          </button>

          {!isGroup && nodeType && onLocateInWorkflow && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLocateInWorkflow(nodeType);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
              title="Pan and zoom to this node in workflow canvas"
            >
              <MapPin size={13} />
              <span className="hidden sm:inline">Show in Workflow</span>
            </button>
          )}

          <div className="p-1 rounded-lg text-slate-400 group-hover:text-slate-200 transition-colors">
            <ChevronDown
              size={18}
              className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>
      </div>

      {/* Short Preview List of Linked Missing Nodes (Visible in Collapsed & Expanded modes) */}
      {isGroup && (
        <div className="pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
              <Layers size={12} className="text-purple-400" />
              <span>Linked Nodes ({linkedNodes.length}):</span>
            </span>
            {linkedNodes.slice(0, 6).map((nt) => (
              <span
                key={nt}
                onClick={(e) => {
                  e.stopPropagation();
                  onLocateInWorkflow?.(nt);
                }}
                className="px-2.5 py-0.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 text-slate-200 font-mono text-[10px] transition-colors cursor-pointer"
                title={`Click to show ${nt} in workflow map`}
              >
                {nt}
              </span>
            ))}
            {linkedNodes.length > 6 && (
              <span
                onClick={() => setIsExpanded(true)}
                className="text-[10px] text-cyan-400 font-semibold cursor-pointer hover:underline"
              >
                +{linkedNodes.length - 6} more...
              </span>
            )}
          </div>
        </div>
      )}

      {/* Expanded Details Section */}
      {isExpanded && (
        <div className="space-y-4 pt-3 border-t border-slate-800/80 animate-fadeIn">
          {/* Registry Match Details */}
          {resolution?.managerMatch && (
            <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/40 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-purple-400" />
                  <span>Registry Package: {resolution.managerMatch.title}</span>
                </span>
                {resolution.managerMatch.gitUrl && (
                  <a
                    href={resolution.managerMatch.gitUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      if (window.civitaiAPI?.openExternal) {
                        e.preventDefault();
                        window.civitaiAPI.openExternal(resolution.managerMatch!.gitUrl);
                      }
                    }}
                    className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    <span>View Repository</span>
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
              {resolution.managerMatch.description && (
                <p className="text-slate-300 leading-relaxed">{resolution.managerMatch.description}</p>
              )}
            </div>
          )}

          {/* Full List of Nodes Linked to this Setup */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Node Classes Provided by this Extension ({linkedNodes.length})
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {linkedNodes.map((nt) => {
                const isPickerOpen = manualPickerOpenForNode === nt;

                return (
                  <div
                    key={nt}
                    className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/90 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {resolution?.isInstalled ? (
                        <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle size={13} className="text-amber-400 shrink-0" />
                      )}
                      <span className="font-mono text-xs text-slate-100 truncate">{nt}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onLocateInWorkflow && (
                        <button
                          type="button"
                          onClick={() => onLocateInWorkflow(nt)}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                          title={`Zoom to ${nt} in visual workflow map`}
                        >
                          <MapPin size={11} />
                          <span>Show</span>
                        </button>
                      )}

                      {!resolution?.isInstalled && (
                        <button
                          type="button"
                          onClick={() => handleOpenManualPicker(nt)}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                          title="Map this node to an already installed folder"
                        >
                          <FolderSearch size={11} />
                          <span>Map</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Fallback Manual Folder Mapping Dropdown */}
          {manualPickerOpenForNode && (
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-cyan-500/30 space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                  <FolderSearch size={14} />
                  <span>Map "{manualPickerOpenForNode}" to an installed folder in custom_nodes:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setManualPickerOpenForNode(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {mappingError && <p className="text-[11px] text-rose-400">{mappingError}</p>}

              <div className="space-y-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search installed custom node folders..."
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    autoFocus
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 custom-scrollbar">
                  {isLoadingFolders ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-slate-400">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Scanning custom_nodes folder...</span>
                    </div>
                  ) : filteredFolders.length === 0 ? (
                    <p className="px-3 py-2.5 text-[11px] text-slate-500 italic">
                      {installedFolders.length === 0
                        ? 'No custom node folders detected.'
                        : 'No folders match your search.'}
                    </p>
                  ) : (
                    filteredFolders.map((f) => (
                      <button
                        key={f.folderName}
                        type="button"
                        onClick={() => handleManualSelect(manualPickerOpenForNode, f.folderName)}
                        disabled={isMapping}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-900 text-xs text-slate-200 transition-colors cursor-pointer disabled:opacity-50 border-b border-slate-800/50 last:border-b-0"
                      >
                        <span className="font-mono truncate">{f.folderName}</span>
                        {f.nodeClasses.length > 0 && (
                          <span className="text-[10px] text-slate-500 shrink-0">
                            {f.nodeClasses.length} class{f.nodeClasses.length !== 1 ? 'es' : ''}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* GitHub Candidate Repositories */}
          {candidates.length > 0 && !resolution?.isInstalled && (
            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <GitBranch size={13} className="text-cyan-400" />
                <span>GitHub Repository Matches (Top {candidates.length})</span>
              </div>

              <div className="space-y-2">
                {candidates.map((repo) => {
                  const isCurrentlyCloning = isCloning === repo.cloneUrl || isCloning === repo.htmlUrl;

                  return (
                    <div
                      key={repo.id}
                      className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <a
                            href={repo.htmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => {
                              if (window.civitaiAPI?.openExternal) {
                                e.preventDefault();
                                window.civitaiAPI.openExternal(repo.htmlUrl);
                              }
                            }}
                            className="text-cyan-400 hover:text-cyan-300 font-semibold text-xs flex items-center gap-1 transition-colors"
                          >
                            <span>{repo.fullName}</span>
                            <ExternalLink size={11} className="opacity-70" />
                          </a>
                          {repo.description && (
                            <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                              {repo.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1 text-amber-400 text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                            <Star size={12} className="fill-amber-400 text-amber-400" />
                            <span>{formatStars(repo.stars)}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCloneRepo(repo.cloneUrl || repo.htmlUrl)}
                            disabled={isCurrentlyCloning}
                            className="flex items-center gap-1.5 px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition-all shadow cursor-pointer disabled:opacity-50"
                          >
                            {isCurrentlyCloning ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Download size={13} />
                            )}
                            <span>Select & Clone</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Post-Clone Dependency Prompt */}
          {cloneResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${
                cloneResult.success
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-950/20 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5">
                  {cloneResult.success ? (
                    <CheckCircle2 size={15} className="text-emerald-400" />
                  ) : (
                    <AlertCircle size={15} className="text-rose-400" />
                  )}
                  <span>
                    {cloneResult.success
                      ? `Successfully installed ${cloneResult.folderName} (${linkedNodes.length} nodes updated)`
                      : `Failed to clone repository: ${cloneResult.error}`}
                  </span>
                </span>
              </div>

              {cloneResult.success && (cloneResult.hasRequirements || cloneResult.hasInstallScript) && (
                <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-700/70 text-slate-300 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-100">Dependencies Detected</p>
                      <p className="text-[11px] text-slate-400">
                        {cloneResult.hasRequirements && 'requirements.txt '}
                        {cloneResult.hasInstallScript && 'install.py '}
                        found. Python runtime:{' '}
                        <code className="text-cyan-300 font-mono text-[10px]">
                          {cloneResult.detectedPythonPath || 'default'}
                        </code>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInstallDeps(cloneResult.targetPath)}
                      disabled={isInstallingDeps || depsInstalled}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow cursor-pointer disabled:opacity-60"
                    >
                      {isInstallingDeps ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : depsInstalled ? (
                        <CheckCircle2 size={13} />
                      ) : (
                        <Terminal size={13} />
                      )}
                      <span>
                        {isInstallingDeps
                          ? 'Installing...'
                          : depsInstalled
                          ? 'Dependencies Installed'
                          : 'Run Pip Install'}
                      </span>
                    </button>
                  </div>

                  {installOutput && (
                    <pre className="p-2 rounded bg-black/80 border border-slate-800 text-[10px] font-mono text-slate-300 max-h-28 overflow-y-auto whitespace-pre-wrap">
                      {installOutput}
                    </pre>
                  )}
                  {installError && <p className="text-rose-400 text-[11px]">{installError}</p>}
                  {depsInstalled && (
                    <p className="flex items-start gap-1.5 text-amber-300/90 text-[11px] bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-2">
                      <RefreshCw size={13} className="shrink-0 mt-0.5" />
                      <span>
                        Dependencies installed. <strong>Restart ComfyUI</strong> to load the new nodes.
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tier 4: Custom Git URL Input */}
          {!resolution?.isInstalled && (
            <div className="pt-1">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <LinkIcon
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type="text"
                    placeholder="Or enter custom Git repository URL (https://github.com/...)"
                    value={customGitUrl}
                    onChange={(e) => setCustomGitUrl(e.target.value)}
                    className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleCloneRepo(customGitUrl)}
                  disabled={!customGitUrl.trim() || isCloning === customGitUrl}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 rounded-xl text-xs font-bold transition-all shadow cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isCloning === customGitUrl ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <GitBranch size={13} />
                  )}
                  <span>Clone Repo</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
