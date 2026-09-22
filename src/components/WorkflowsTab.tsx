/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Workflow,
  Upload,
  FolderSearch,
  CheckCircle2,
  AlertCircle,
  Download,
  GitBranch,
  Sparkles,
  Layers,
  Search,
  RefreshCw,
  Eye,
  LayoutGrid,
  FileJson,
  Image as ImageIcon,
  HardDrive,
  ExternalLink,
  ChevronRight,
  Package,
  Activity,
  ArrowRight,
  ChevronDown,
  X,
  Radio,
  Maximize2,
  Minimize2,
  Play,
  Send,
  Columns,
  MonitorPlay,
  SlidersHorizontal,
} from 'lucide-react';
import {
  WorkflowInfo,
  WorkflowModelReference,
  CanvasGraph,
  CanvasNode,
  NodeResolutionResult,
  DownloadTask,
  ComfyUIStatus,
} from '../types/app';
import { NodeResolutionCard } from './NodeResolutionCard';
import WorkflowNodeMap, { NodeStatus, WorkflowNodeMapHandle } from './WorkflowNodeMap';
import { WorkflowImportModal } from './WorkflowImportModal';
import { WorkflowParseResult } from '../services/workflowScanner';

// ComfyUI component/subgraph references use UUIDs as canvas node "type" values.
const UUID_TYPE_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function collectSubgraphNames(data: any): Map<string, string> {
  const map = new Map<string, string>();
  if (!data || typeof data !== 'object') return map;
  const defs = data.definitions;
  if (!defs || typeof defs !== 'object') return map;

  const list: any[] = Array.isArray(defs) ? defs : Array.isArray(defs.subgraphs) ? defs.subgraphs : [];
  for (const sub of list) {
    if (!sub || typeof sub !== 'object') continue;
    const id = sub.id != null ? String(sub.id) : '';
    const name = sub.name || sub.display_name || sub.title;
    if (id && typeof name === 'string' && name.trim()) map.set(id, name.trim());
  }

  if (!Array.isArray(defs)) {
    for (const [key, val] of Object.entries<any>(defs)) {
      if (!val || typeof val !== 'object' || Array.isArray(val) || key === 'subgraphs') continue;
      const name = val.name || val.display_name || val.title;
      if (typeof name === 'string' && name.trim()) map.set(key, name.trim());
    }
  }
  return map;
}

function resolveNodeTypeLabel(raw: any, subgraphNames: Map<string, string>): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (UUID_TYPE_RE.test(t)) return subgraphNames.get(t) || null;
  return t;
}

interface WorkflowsTabProps {
  onSearchModel?: (query: string) => void;
  onNavigateToDownloads?: () => void;
  onComfyStatusChange?: (status: ComfyUIStatus) => void;
  onComfyFullscreenChange?: (isFullscreen: boolean) => void;
}

export const WorkflowsTab: React.FC<WorkflowsTabProps> = ({
  onSearchModel,
  onNavigateToDownloads,
  onComfyStatusChange,
  onComfyFullscreenChange,
}) => {
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>(() => {
    try {
      const saved = sessionStorage.getItem('civitai_workflows_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { }
    return [];
  });
  const [selectedWorkflowIndex, setSelectedWorkflowIndex] = useState<number>(0);
  const [savedWorkflows, setSavedWorkflows] = useState<WorkflowInfo[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState<boolean>(false);
  const [scanFeedback, setScanFeedback] = useState<{ message: string; success: boolean } | null>(null);
  
  // Drop zone states: 'idle' | 'drag-over-valid' | 'drag-over-invalid' | 'processing'
  // Visual feedback must clearly distinguish valid (.json/.png) from invalid drops.
  type DropZoneState = 'idle' | 'drag-over-valid' | 'drag-over-invalid' | 'processing';
  const [dropState, setDropState] = useState<DropZoneState>('idle');
  const [isWindowDragging, setIsWindowDragging] = useState<boolean>(false);
  const dragDepthRef = useRef<number>(0);
  const [importModalData, setImportModalData] = useState<WorkflowParseResult | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isArchivingWorkflow, setIsArchivingWorkflow] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'both' | 'map' | 'matrix' | 'live' | 'split'>('both');
  const [selectedNodeId, setSelectedNodeId] = useState<string | number | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(false);
  const [comfyStatus, setComfyStatus] = useState<ComfyUIStatus | null>(null);
  const [hasMountedComfyUI, setHasMountedComfyUI] = useState<boolean>(false);
  const [isComfyFullscreen, setIsComfyFullscreen] = useState<boolean>(false);
  const [showFullscreenNodeDrawer, setShowFullscreenNodeDrawer] = useState<boolean>(false);
  const [serverUrl, setServerUrl] = useState<string>('http://127.0.0.1:8188');
  const [injectionFeedback, setInjectionFeedback] = useState<string | null>(null);
  const [isInjecting, setIsInjecting] = useState<boolean>(false);

  const handleToggleFullscreen = useCallback((enable: boolean) => {
    setIsComfyFullscreen(enable);
    if (enable) {
      setHasMountedComfyUI(true);
    }
    onComfyFullscreenChange?.(enable);
  }, [onComfyFullscreenChange]);

  // Resolution states for custom node classes
  const [nodeResolutions, setNodeResolutions] = useState<Record<string, NodeResolutionResult>>({});
  const [isResolvingNodes, setIsResolvingNodes] = useState<boolean>(false);

  // Active download tracking for inline progress
  const [activeTasks, setActiveTasks] = useState<Record<string, DownloadTask>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeMapRef = useRef<WorkflowNodeMapHandle>(null);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);
  const comfySectionRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Window-level drag and drop listener to catch drops anywhere in the window
  // (including directly over the ComfyUI webview or when maximized)
  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        dragDepthRef.current++;
        setIsWindowDragging(true);
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragDepthRef.current--;
      if (dragDepthRef.current <= 0) {
        dragDepthRef.current = 0;
        setIsWindowDragging(false);
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsWindowDragging(false);
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFilesDropped(e.dataTransfer.files);
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  // Sync workflows with sessionStorage whenever they change
  useEffect(() => {
    try {
      if (workflows && workflows.length > 0) {
        sessionStorage.setItem('civitai_workflows_state', JSON.stringify(workflows));
      } else {
        sessionStorage.removeItem('civitai_workflows_state');
      }
    } catch { }
  }, [workflows]);

  // Load configured workflows on initial mount
  useEffect(() => {
    loadWorkflows();
  }, []);

  // Listen for real-time download progress to update inline progress bars
  useEffect(() => {
    if (window.civitaiAPI?.onDownloadProgress) {
      window.civitaiAPI.onDownloadProgress((tasks: DownloadTask[]) => {
        const taskMap: Record<string, DownloadTask> = {};
        for (const t of tasks) {
          if (t.fileName) {
            taskMap[t.fileName.toLowerCase()] = t;
          }
        }
        setActiveTasks(taskMap);
      });
    }
  }, []);

  // Background ComfyUI health probing
  useEffect(() => {
    let mounted = true;
    const probeComfy = async () => {
      try {
        let target = serverUrl;
        if (window.civitaiAPI?.getConfig) {
          const cfg = await window.civitaiAPI.getConfig();
          if (cfg?.comfyui_server_url && mounted) {
            target = cfg.comfyui_server_url;
            setServerUrl(cfg.comfyui_server_url);
          }
        }
        if (window.civitaiAPI?.checkComfyUIStatus) {
          const status = await window.civitaiAPI.checkComfyUIStatus(target);
          if (mounted) {
            setComfyStatus(status);
            onComfyStatusChange?.(status);
            if (status.online) {
              setHasMountedComfyUI(true);
            }
          }
        }
      } catch {}
    };

    probeComfy();
    const interval = setInterval(probeComfy, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [serverUrl]);

  // Fullscreen escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isComfyFullscreen) {
        handleToggleFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isComfyFullscreen, handleToggleFullscreen]);

  const loadWorkflows = async (forceRescan = false) => {
    if (!window.civitaiAPI?.scanWorkflows) return;
    setIsLoadingWorkflows(true);
    try {
      const results: WorkflowInfo[] = await window.civitaiAPI.scanWorkflows();
      if (results && Array.isArray(results)) {
        setSavedWorkflows(results);
        if (workflows.length === 0 || forceRescan) {
          if (results.length > 0) {
            setWorkflows(results);
            setSelectedWorkflowIndex(0);
          }
        }
        setScanFeedback({
          success: true,
          message: `Found ${results.length} ${results.length === 1 ? 'workflow' : 'workflows'} in your ComfyUI directory${forceRescan ? '' : ' (click Rescan for an updated refresh)'
            }.`,
        });
        // Always re-resolve the active workflow's nodes after a scan. Previously this
        // only ran when the queue was empty, so a queue restored from sessionStorage
        // kept nodeResolutions empty — the Custom Node Extensions panel read
        // "0 installed • 0 missing" and every map node defaulted to "ready" (green)
        // even when its extension (e.g. TIPO, MXReroute) isn't installed.
        const active = workflows.length > 0 ? workflows[selectedWorkflowIndex] : results[0];
        if (active) resolveWorkflowNodes(active);
      } else {
        setScanFeedback({ success: false, message: 'Scan returned no results.' });
      }
    } catch (err) {
      console.error('Failed to scan workflows:', err);
      setScanFeedback({
        success: false,
        message: 'Failed to scan ComfyUI directories. Check your installation path in Settings.',
      });
    } finally {
      setIsLoadingWorkflows(false);
    }
  };

  const handleInjectWorkflowIntoComfyUI = useCallback(
    async (wf?: WorkflowInfo) => {
      const targetWf = wf || workflows[selectedWorkflowIndex];
      if (!targetWf) return;

      setIsInjecting(true);
      let graphData = targetWf.rawGraph?.workflow || targetWf.rawGraph;
      if (!graphData?.nodes && targetWf.canvasGraph?.nodes?.length) {
        graphData = {
          nodes: targetWf.canvasGraph.nodes,
          links: targetWf.canvasGraph.links || [],
          groups: (targetWf.rawGraph as any)?.groups || [],
          config: (targetWf.rawGraph as any)?.config || {},
          extra: (targetWf.rawGraph as any)?.extra || {},
        };
      }

      if (!graphData) {
        setInjectionFeedback('No canvas graph found in this workflow.');
        setIsInjecting(false);
        setTimeout(() => setInjectionFeedback(null), 3000);
        return;
      }

      const script = `
        (function() {
          try {
            const graph = ${JSON.stringify(graphData)};
            if (window.app && typeof window.app.loadGraphData === 'function') {
              window.app.loadGraphData(graph, true);
              return { success: true, api: 'window.app' };
            } else if (window.comfyAPI && window.comfyAPI.app && window.comfyAPI.app.app && typeof window.comfyAPI.app.app.loadGraphData === 'function') {
              window.comfyAPI.app.app.loadGraphData(graph, true);
              return { success: true, api: 'window.comfyAPI' };
            }
            return { success: false, error: 'ComfyUI frontend app object not found on window' };
          } catch (e) {
            return { success: false, error: e.message };
          }
        })()
      `;

      let executed = false;
      // 1. Electron webview
      if (webviewRef.current && typeof webviewRef.current.executeJavaScript === 'function') {
        try {
          const res = await webviewRef.current.executeJavaScript(script);
          if (res && res.success) {
            executed = true;
            setInjectionFeedback(`✓ Injected "${targetWf.fileName}" into active ComfyUI canvas!`);
          } else if (res && res.error) {
            console.warn('loadGraphData returned error:', res.error);
          }
        } catch (err) {
          console.warn('Failed to execute in webview:', err);
        }
      }

      // 2. iframe fallback
      if (!executed && iframeRef.current) {
        try {
          iframeRef.current.contentWindow?.postMessage(
            {
              type: 'load_workflow',
              workflow: graphData,
            },
            '*'
          );
        } catch {}
      }

      if (!executed) {
        setInjectionFeedback(`Pushed "${targetWf.fileName}" to ComfyUI`);
      }
      setIsInjecting(false);
      setTimeout(() => setInjectionFeedback(null), 3500);
    },
    [workflows, selectedWorkflowIndex]
  );

  const handleSelectFromDropdown = (targetIdentifier: string) => {
    if (!targetIdentifier) return;

    // 1. Check if already present in loaded workflows list
    const existingIdx = workflows.findIndex(
      (w) => w.filePath === targetIdentifier || w.fileName === targetIdentifier
    );
    if (existingIdx !== -1) {
      handleSelectWorkflow(existingIdx);
      return;
    }

    // 2. Otherwise find from savedWorkflows and add to top of loaded list
    const found = savedWorkflows.find(
      (w) => w.filePath === targetIdentifier || w.fileName === targetIdentifier
    );
    if (found) {
      const nextList = [found, ...workflows];
      setWorkflows(nextList);
      setSelectedWorkflowIndex(0);
      setSelectedNodeId(null);
      resolveWorkflowNodes(found);
      if (viewMode === 'live' || viewMode === 'split' || isComfyFullscreen) {
        setTimeout(() => handleInjectWorkflowIntoComfyUI(found), 150);
      }
    }
  };

  const activeWorkflow: WorkflowInfo | undefined = workflows[selectedWorkflowIndex];

  // Resolve custom node classes for the active workflow. Resolution reads the persistent
  // SQLite cache first (so reloading a workflow never re-attempts a node), then checks
  // the local install, ComfyUI's built-in core nodes (parsed from install nodes.py +
  // comfy_extras), and the curated registry. GitHub is never queried via the API here;
  // the per-node card opens GitHub in the browser instead.
  const resolveWorkflowNodes = async (wf?: WorkflowInfo, forceRefresh = false) => {
    if (!wf || !wf.nodeTypes || wf.nodeTypes.length === 0 || !window.civitaiAPI?.resolveMissingNode) {
      return;
    }

    setIsResolvingNodes(true);
    const newResolutions: Record<string, NodeResolutionResult> = {};

    for (const nodeType of wf.nodeTypes) {
      try {
        const res = await window.civitaiAPI.resolveMissingNode(nodeType, undefined, undefined, forceRefresh);
        newResolutions[nodeType] = res;
      } catch (err) {
        newResolutions[nodeType] = {
          nodeType,
          isInstalled: false,
          githubCandidates: [],
        };
      }
    }

    setNodeResolutions(newResolutions);
    setIsResolvingNodes(false);
  };

  // Handle workflow selection
  const handleSelectWorkflow = (index: number) => {
    setSelectedWorkflowIndex(index);
    setSelectedNodeId(null);
    resolveWorkflowNodes(workflows[index]);
    if (viewMode === 'live' || viewMode === 'split' || isComfyFullscreen) {
      setTimeout(() => handleInjectWorkflowIntoComfyUI(workflows[index]), 150);
    }
  };

  // "Show in Workflow": make sure the map is actually VISIBLE before zooming to a node.
  // In Matrix view the map container is hidden (display:none), so zooming a zero-size
  // canvas did nothing visible. Switch to Split view to reveal it, then wait a frame for
  // the map to re-layout/re-fit before panning/zooming to the requested node type, and
  // scroll the map into view.
  const handleLocateInWorkflow = useCallback(
    (type: string) => {
      setSelectedNodeId(type);
      if (viewMode === 'matrix') {
        setViewMode('both');
      }
      requestAnimationFrame(() => {
        nodeMapRef.current?.zoomToNodeType(type);
        mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    },
    [viewMode]
  );

  // Handle workflow removal from list
  const handleRemoveWorkflow = (e: React.MouseEvent, removeIdx: number) => {
    e.stopPropagation();
    const nextWorkflows = workflows.filter((_, i) => i !== removeIdx);
    setWorkflows(nextWorkflows);

    if (nextWorkflows.length === 0) {
      setSelectedWorkflowIndex(0);
      setNodeResolutions({});
      setSelectedNodeId(null);
    } else if (removeIdx === selectedWorkflowIndex) {
      const newIdx = Math.min(removeIdx, nextWorkflows.length - 1);
      setSelectedWorkflowIndex(newIdx);
      resolveWorkflowNodes(nextWorkflows[newIdx]);
    } else if (removeIdx < selectedWorkflowIndex) {
      setSelectedWorkflowIndex((prev) => prev - 1);
    }
  };

  // Automatically synchronize when the live ComfyUI guest webview loads or changes workflows
  const handleGuestGraphLoaded = useCallback(async (graphData: any) => {
    try {
      let parsedWf: WorkflowInfo;
      if (window.civitaiAPI?.parseWorkflow) {
        parsedWf = await window.civitaiAPI.parseWorkflow(graphData, 'Live ComfyUI Canvas');
      } else {
        parsedWf = await fallbackParseInBrowser(graphData, 'Live ComfyUI Canvas', 'json');
      }
      setWorkflows((prev) => {
        const filtered = prev.filter((w) => w.fileName !== 'Live ComfyUI Canvas');
        return [parsedWf, ...filtered];
      });
      setSelectedWorkflowIndex(0);
      resolveWorkflowNodes(parsedWf, true);
      setScanFeedback({
        success: true,
        message: `Synced with active ComfyUI canvas (${parsedWf.nodeTypes?.length || 0} nodes, ${parsedWf.models?.length || 0} models detected)`,
      });
    } catch (err) {
      console.warn('Failed to parse guest graph update from ComfyUI:', err);
    }
  }, []);

  // Webview dom-ready and guest canvas message hook
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDomReady = () => {
      const guestHookScript = `
        (function() {
          if (window.__cmm_canvas_hooked) return;
          window.__cmm_canvas_hooked = true;

          function hookComfyApp() {
            const app = window.app || (window.comfyAPI && window.comfyAPI.app && window.comfyAPI.app.app);
            if (app && typeof app.loadGraphData === 'function' && !app.__cmm_orig_loadGraphData) {
              app.__cmm_orig_loadGraphData = app.loadGraphData;
              app.loadGraphData = function(graphData, clean) {
                try {
                  console.log('__CMM_GUEST_GRAPH_LOADED__:' + JSON.stringify(graphData));
                } catch(e) {}
                return app.__cmm_orig_loadGraphData.apply(this, arguments);
              };
            }
          }
          hookComfyApp();
          setInterval(hookComfyApp, 2000);
        })();
      `;
      try {
        if (typeof webview.executeJavaScript === 'function') {
          webview.executeJavaScript(guestHookScript).catch(() => {});
        }
      } catch {}
    };

    const handleConsoleMessage = (e: any) => {
      const msg = e.message;
      if (typeof msg === 'string' && msg.startsWith('__CMM_GUEST_GRAPH_LOADED__:')) {
        try {
          const rawJson = msg.slice('__CMM_GUEST_GRAPH_LOADED__:'.length);
          const graphData = JSON.parse(rawJson);
          if (graphData && (graphData.nodes || graphData.prompt)) {
            handleGuestGraphLoaded(graphData);
          }
        } catch (err) {
          console.warn('Failed to handle guest graph console message:', err);
        }
      }
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('console-message', handleConsoleMessage);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('console-message', handleConsoleMessage);
    };
  }, [hasMountedComfyUI, handleGuestGraphLoaded]);

  // Automatically save valid uploaded workflow to ComfyUI user workflows directory
  // and pass-through to live ComfyUI instance if online
  const handleValidWorkflowLoaded = async (
    parsedWorkflowInfo: WorkflowInfo,
    rawPayload: any,
    ext: string,
    fileName: string
  ) => {
    // 1. Cross-app auto-save to ComfyUI user workflows directory
    if (window.civitaiAPI?.saveWorkflowToComfyUI) {
      try {
        const saveRes = await window.civitaiAPI.saveWorkflowToComfyUI(fileName, rawPayload, ext);
        if (saveRes && saveRes.success) {
          parsedWorkflowInfo.filePath = saveRes.filePath || parsedWorkflowInfo.filePath;
          parsedWorkflowInfo.fileName = saveRes.fileName || parsedWorkflowInfo.fileName;
          setSavedWorkflows((prev) => {
            if (prev.some((w) => w.fileName === parsedWorkflowInfo.fileName)) return prev;
            return [parsedWorkflowInfo, ...prev];
          });
          setScanFeedback({
            success: true,
            message: `Auto-saved "${parsedWorkflowInfo.fileName}" to ComfyUI workflows directory`,
          });
        }
      } catch (saveErr) {
        console.warn('Auto-save to ComfyUI directory failed:', saveErr);
      }
    }

    const updated = [parsedWorkflowInfo, ...workflows];
    setWorkflows(updated);
    setSelectedWorkflowIndex(0);
    resolveWorkflowNodes(parsedWorkflowInfo);

    // 2. Drag-and-drop passthrough: if ComfyUI is online or if currently in Live/Split/Fullscreen view, inject immediately
    if (comfyStatus?.online || viewMode === 'live' || viewMode === 'split' || isComfyFullscreen) {
      setTimeout(() => {
        handleInjectWorkflowIntoComfyUI(parsedWorkflowInfo);
      }, 150);
    }
  };

  // Handle confirmation from WorkflowImportModal
  const handleConfirmWorkflowImport = async (targetName: string, overwrite: boolean) => {
    if (!importModalData) return;
    setIsArchivingWorkflow(true);

    try {
      let savedFilePath = importModalData.filePath;
      let savedFileName = `${targetName}.json`;

      if (window.civitaiAPI?.archiveWorkflow) {
        const res = await window.civitaiAPI.archiveWorkflow({
          targetName,
          workflowData: importModalData.workflow,
          overwrite,
        });

        if (!res.success) {
          alert(res.error || 'Failed to archive workflow to ComfyUI directory.');
          setIsArchivingWorkflow(false);
          return;
        }

        if (res.filePath) savedFilePath = res.filePath;
        if (res.fileName) savedFileName = res.fileName;
      }

      const newWorkflowInfo: WorkflowInfo = {
        filePath: savedFilePath,
        fileName: savedFileName,
        fileType: 'json',
        modelCount: importModalData.models?.length || 0,
        models: importModalData.models || [],
        nodeTypes: importModalData.nodes || [],
        rawGraph: importModalData.workflow,
        canvasGraph: importModalData.canvasGraph,
      };

      const nextWorkflows = [
        newWorkflowInfo,
        ...workflows.filter((w) => w.fileName !== savedFileName),
      ];
      setWorkflows(nextWorkflows);
      setSelectedWorkflowIndex(0);
      setSelectedNodeId(null);

      setSavedWorkflows((prev) => [
        newWorkflowInfo,
        ...prev.filter((w) => w.fileName !== savedFileName),
      ]);

      // 1. Activate workflow in canvas (if Live ComfyUI connected)
      if (comfyStatus?.online || viewMode === 'live' || viewMode === 'split' || isComfyFullscreen) {
        setTimeout(() => {
          handleInjectWorkflowIntoComfyUI(newWorkflowInfo);
        }, 150);
      }

      // 2. Trigger resolveWorkflowNodes() to scan for missing nodes
      resolveWorkflowNodes(newWorkflowInfo, true);

      // 3. Update status feedback
      setScanFeedback({
        success: true,
        message: `Successfully imported "${savedFileName}". Checking custom node extensions and model dependencies...`,
      });

      setIsImportModalOpen(false);
      setImportModalData(null);
    } catch (err: any) {
      console.error('Failed to confirm workflow import:', err);
      alert(`Import failed: ${err?.message || err}`);
    } finally {
      setIsArchivingWorkflow(false);
      setDropState('idle');
    }
  };

  // SECURITY: Renderer never reads file content directly.
  // We only receive file.path from Electron's drop event (chromium trusted).
  // Content parsing happens in main process with full Node.js privileges.
  // This prevents renderer exploitation from accessing arbitrary files.
  const handleFilesDropped = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).slice(0, 10); // Maximum 10 files per drop event
    if (files.length === 0) {
      setDropState('idle');
      return;
    }

    const validFiles = files.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext === 'json' || ext === 'png';
    });

    const invalidFiles = files.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext !== 'json' && ext !== 'png';
    });

    if (invalidFiles.length > 0) {
      setScanFeedback({
        success: false,
        message: `Rejected ${invalidFiles.length} unsupported file(s): ${invalidFiles.map((f) => f.name).join(', ')}. Only .json and .png ComfyUI workflows are supported.`,
      });
    }

    if (validFiles.length === 0) {
      setDropState('idle');
      return;
    }

    setDropState('processing');
    setIsLoadingWorkflows(true);

    try {
      const targetFile = validFiles[0];
      const filePath = (targetFile as any).path;

      if (filePath && window.civitaiAPI?.parseDroppedWorkflowFile) {
        const parseResult: WorkflowParseResult = await window.civitaiAPI.parseDroppedWorkflowFile(filePath);
        setImportModalData(parseResult);
        setIsImportModalOpen(true);
      } else {
        // Fallback in-browser parsing for non-Electron or mock environments
        const ext = targetFile.name.split('.').pop()?.toLowerCase();
        if (ext === 'json') {
          const text = await targetFile.text();
          let parsed: any;
          try {
            parsed = JSON.parse(text);
          } catch (e: any) {
            throw new Error(`Invalid JSON format in "${targetFile.name}": ${e.message}`);
          }

          let parsedWf: WorkflowInfo;
          if (window.civitaiAPI?.parseWorkflow) {
            parsedWf = await window.civitaiAPI.parseWorkflow(parsed, targetFile.name);
          } else {
            parsedWf = await fallbackParseInBrowser(parsed, targetFile.name, 'json');
          }

          setImportModalData({
            filePath: '',
            fileName: targetFile.name,
            fileType: 'json',
            fileSize: targetFile.size,
            workflow: parsedWf.rawGraph,
            nodes: parsedWf.nodeTypes || [],
            models: parsedWf.models || [],
            metadata: parsedWf.rawGraph?.extra || {},
            canvasGraph: parsedWf.canvasGraph,
            modelCount: parsedWf.modelCount || 0,
            workflowFormat: parsedWf.workflowFormat,
          });
          setIsImportModalOpen(true);
        } else if (ext === 'png') {
          const arrayBuffer = await targetFile.arrayBuffer();
          const extracted = parsePngWorkflowInBrowser(new Uint8Array(arrayBuffer));
          if (!extracted) {
            throw new Error(`No ComfyUI workflow metadata found embedded in PNG file "${targetFile.name}".`);
          }

          let parsedWf: WorkflowInfo;
          if (window.civitaiAPI?.parseWorkflow) {
            parsedWf = await window.civitaiAPI.parseWorkflow(extracted, targetFile.name);
          } else {
            parsedWf = await fallbackParseInBrowser(extracted, targetFile.name, 'png');
          }

          setImportModalData({
            filePath: '',
            fileName: targetFile.name,
            fileType: 'png',
            fileSize: targetFile.size,
            workflow: parsedWf.rawGraph,
            nodes: parsedWf.nodeTypes || [],
            models: parsedWf.models || [],
            metadata: parsedWf.rawGraph?.extra || {},
            canvasGraph: parsedWf.canvasGraph,
            modelCount: parsedWf.modelCount || 0,
            workflowFormat: parsedWf.workflowFormat,
          });
          setIsImportModalOpen(true);
        }
      }
    } catch (err: any) {
      console.error('Error parsing dropped workflow file:', err);
      setScanFeedback({
        success: false,
        message: `Failed to parse workflow: ${err?.message || err}`,
      });
    } finally {
      setIsLoadingWorkflows(false);
      setDropState('idle');
    }
  };

  const handleFileUpload = (file: File) => {
    handleFilesDropped([file]);
  };

  // Browser Fallback parser when IPC is unavailable
  const fallbackParseInBrowser = async (
    parsed: any,
    fileName: string,
    fileType: 'json' | 'png'
  ): Promise<WorkflowInfo> => {
    const localModels = (await window.civitaiAPI?.getLocalModels()) || [];
    const modelMap = new Map<string, string>();
    for (const m of localModels) {
      if (m.fileName) modelMap.set(m.fileName.toLowerCase(), m.filePath);
    }

    const modelRefs: WorkflowModelReference[] = [];
    const nodeTypes = new Set<string>();
    const rawData = parsed.workflow || parsed.prompt || parsed;
    const subgraphNames = collectSubgraphNames(rawData);

    // UI Canvas format
    const nodes = rawData.nodes || [];
    if (Array.isArray(nodes)) {
      for (const n of nodes) {
        const label = resolveNodeTypeLabel(n.type, subgraphNames);
        if (label) nodeTypes.add(label);
        if (Array.isArray(n.widgets_values)) {
          for (const w of n.widgets_values) {
            if (
              typeof w === 'string' &&
              (w.endsWith('.safetensors') || w.endsWith('.ckpt') || w.endsWith('.gguf') || w.endsWith('.pt'))
            ) {
              modelRefs.push({
                nodeId: String(n.id),
                nodeType: n.type || 'Node',
                inputName: 'widget',
                modelName: w,
                isInstalled: modelMap.has(w.toLowerCase()),
                localPath: modelMap.get(w.toLowerCase()),
              });
            }
          }
        }
      }
    }

    // API Prompt format
    const promptNodes = rawData.prompt || rawData;
    if (promptNodes && typeof promptNodes === 'object' && !Array.isArray(promptNodes)) {
      for (const [id, nodeObj] of Object.entries<any>(promptNodes)) {
        if (nodeObj && typeof nodeObj === 'object') {
          const classType = resolveNodeTypeLabel(nodeObj.class_type || nodeObj.type, subgraphNames);
          if (classType) nodeTypes.add(classType);
          if (nodeObj.inputs) {
            for (const [k, v] of Object.entries(nodeObj.inputs)) {
              if (
                typeof v === 'string' &&
                (v.endsWith('.safetensors') || v.endsWith('.ckpt') || v.endsWith('.gguf') || v.endsWith('.pt'))
              ) {
                modelRefs.push({
                  nodeId: String(id),
                  nodeType: classType || 'Loader',
                  inputName: k,
                  modelName: v,
                  isInstalled: modelMap.has(v.toLowerCase()),
                  localPath: modelMap.get(v.toLowerCase()),
                });
              }
            }
          }
        }
      }
    }

    return {
      filePath: '',
      fileName,
      fileType,
      modelCount: modelRefs.length,
      models: modelRefs,
      nodeTypes: Array.from(nodeTypes),
      rawGraph: rawData,
      canvasGraph: nodes.length > 0 ? { nodes, links: rawData.links || [] } : undefined,
      workflowFormat: nodes.length > 0 ? 'full_canvas' : 'api_prompt',
    };
  };

  // Browser PNG Chunks Parser
  const parsePngWorkflowInBrowser = (bytes: Uint8Array): any => {
    if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
      return null;
    }

    let workflowData: any = null;
    let promptData: any = null;
    const view = new DataView(bytes.buffer);
    let offset = 8;

    while (offset < bytes.length) {
      if (offset + 8 > bytes.length) break;
      const length = view.getUint32(offset);
      const chunkType = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
      );
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd > bytes.length) break;

      if (chunkType === 'tEXt') {
        const slice = bytes.slice(dataStart, dataEnd);
        let nullIdx = -1;
        for (let i = 0; i < slice.length; i++) {
          if (slice[i] === 0) {
            nullIdx = i;
            break;
          }
        }
        if (nullIdx > 0) {
          const key = new TextDecoder('latin1').decode(slice.slice(0, nullIdx));
          const val = new TextDecoder('utf-8').decode(slice.slice(nullIdx + 1));
          try {
            if (key === 'workflow') workflowData = JSON.parse(val);
            if (key === 'prompt') promptData = JSON.parse(val);
          } catch { }
        }
      }

      offset = dataEnd + 4;
    }

    if (workflowData) return { workflow: workflowData, prompt: promptData };
    if (promptData) return { prompt: promptData };
    return null;
  };

  // Compute node readiness status
  const getNodeStatus = useCallback(
    (node: CanvasNode): NodeStatus => {
      const nodeType = node.type;
      const res = nodeResolutions[nodeType];
      if (res && !res.isInstalled) {
        return 'missing-node';
      }

      // Check if any widget value references a missing model
      if (activeWorkflow?.models) {
        const nodeModels = activeWorkflow.models.filter(
          (m) => String(m.nodeId) === String(node.id) || m.nodeType === node.type
        );
        if (nodeModels.some((m) => !m.isInstalled)) {
          return 'missing-model';
        }
      }

      return 'ready';
    },
    [nodeResolutions, activeWorkflow]
  );


  // Computed summary metrics
  const totalModelsCount = activeWorkflow?.models?.length || 0;
  const installedModelsCount = activeWorkflow?.models?.filter((m) => m.isInstalled).length || 0;
  const missingModelsCount = totalModelsCount - installedModelsCount;

  const totalCustomNodesCount = Object.keys(nodeResolutions).length;
  const installedCustomNodesCount = Object.values(nodeResolutions).filter((r) => r.isInstalled).length;
  const missingCustomNodesCount = totalCustomNodesCount - installedCustomNodesCount;

  const isWorkflowFullyReady = missingModelsCount === 0 && missingCustomNodesCount === 0;

  // Render Dependency Matrix & Resolution Cards (reusable in preview, split, and fullscreen drawer)
  const renderDependencyMatrix = (isCompact = false) => {
    if (!activeWorkflow) return null;

    return (
      <div className={`space-y-6 ${isCompact ? 'text-xs' : ''}`}>
        {/* 1. Model Dependencies Section */}
        <div className={`glass-panel ${isCompact ? 'p-4 rounded-2xl' : 'p-6 rounded-3xl'} border border-slate-800 space-y-4 shadow-xl`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-100 font-bold text-sm md:text-base">
              <HardDrive className="text-purple-400" size={isCompact ? 16 : 20} />
              <h2>Model Dependencies ({totalModelsCount})</h2>
            </div>
            <span className="text-[11px] text-slate-400">
              {installedModelsCount} installed • {missingModelsCount} missing
            </span>
          </div>

          {activeWorkflow.models.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              No model files detected in this workflow.
            </p>
          ) : (
            <div className="space-y-2.5">
              {activeWorkflow.models.map((model, mIdx) => {
                const task = activeTasks[model.modelName.toLowerCase()];
                const isDownloading = task && (task.status === 'downloading' || task.status === 'pending');

                return (
                  <div
                    key={mIdx}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      model.isInstalled
                        ? 'bg-slate-900/60 border-slate-800/80 text-slate-200'
                        : 'bg-amber-950/10 border-amber-500/30 text-amber-200'
                    }`}
                  >
                    <div className="flex items-start md:items-center justify-between gap-3 flex-col md:flex-row">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {model.isInstalled ? (
                            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                          ) : (
                            <AlertCircle size={15} className="text-amber-400 shrink-0" />
                          )}
                          <span className="font-bold text-xs font-mono text-slate-100 truncate max-w-[280px]">
                            {model.modelName}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            {model.nodeType}
                          </span>
                        </div>

                        {model.isInstalled ? (
                          <p className="text-[10px] text-slate-400 font-mono truncate max-w-xl">
                            {model.localPath}
                          </p>
                        ) : (
                          <p className="text-[10px] text-amber-300/80">
                            Model file not found locally. Download from CivitAI or Hugging Face.
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      {!model.isInstalled && (
                        <div className="flex items-center gap-2 shrink-0">
                          {onSearchModel && (
                            <button
                              onClick={() => {
                                const cleanSearchTerm = model.modelName
                                  .replace(/\.(safetensors|ckpt|pt|pth|gguf)$/i, '')
                                  .replace(/[-_]/g, ' ');
                                onSearchModel(cleanSearchTerm);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow cursor-pointer active:scale-95"
                            >
                              <Search size={12} />
                              <span>Search CivitAI</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Inline Download Progress Bar */}
                    {isDownloading && task && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300">
                          <span>Downloading: {task.progress}%</span>
                          <span>{(task.speedBps / (1024 * 1024)).toFixed(1)} MB/s</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-linear-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Custom Node Extensions Section */}
        <div className={`glass-panel ${isCompact ? 'p-4 rounded-2xl' : 'p-6 rounded-3xl'} border border-slate-800 space-y-4 shadow-xl`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-100 font-bold text-sm md:text-base">
              <Package className="text-cyan-400" size={isCompact ? 16 : 20} />
              <h2>Custom Node Extensions ({totalCustomNodesCount})</h2>
            </div>
            <span className="text-[11px] text-slate-400">
              {installedCustomNodesCount} installed • {missingCustomNodesCount} missing
            </span>
          </div>

          {Object.keys(nodeResolutions).length === 0 && !isResolvingNodes ? (
            <p className="text-xs text-slate-500 italic py-2">
              No custom node classes detected in this workflow.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(nodeResolutions).map(([nodeType, resolution]) => {
                const isSelected = selectedNodeId === nodeType;

                return (
                  <div
                    key={nodeType}
                    className={`transition-all ${isSelected ? 'ring-2 ring-cyan-400 rounded-2xl' : ''}`}
                  >
                    <NodeResolutionCard
                      nodeType={nodeType}
                      resolution={resolution}
                      onLocateInWorkflow={(type) => {
                        handleLocateInWorkflow(type);
                      }}
                      onInstalled={(folderName) => {
                        setNodeResolutions((prev) => ({
                          ...prev,
                          [nodeType]: {
                            ...prev[nodeType],
                            isInstalled: true,
                            installedFolder: folderName,
                          },
                        }));
                        if (activeWorkflow) resolveWorkflowNodes(activeWorkflow, true);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={
        isComfyFullscreen
          ? 'h-full w-full flex-1 flex flex-col min-h-0 overflow-hidden select-none'
          : 'flex flex-col h-full w-full space-y-6 pb-12 overflow-y-auto px-6 pt-2 select-none'
      }
    >
      {/* Standard Workflows Tab Controls (only shown when not maximized) */}
      {!isComfyFullscreen && (
        <>
          {/* Top Header & Overview */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30">
                  <Workflow size={24} />
                </div>
                <div>
                  <h1 className="text-xl font-black text-slate-100 tracking-tight flex items-center gap-2.5">
                    <span>ComfyUI Workflows & Dependency Resolver</span>
                  </h1>
                  <p className="text-xs text-slate-400">
                    Inspect visual workflow maps, resolve missing Checkpoints/LoRAs, and 1-click install custom node extensions.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        comfyStatus?.online
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-800/80 border-slate-700 text-slate-400'
                      }`}
                      title={comfyStatus?.online ? `ComfyUI online at ${serverUrl} (Interactive Canvas — Edit Possible)` : `ComfyUI offline at ${serverUrl} (Read-Only Preview)`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          comfyStatus?.online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      <span>
                        {comfyStatus?.online
                          ? `Live ComfyUI: Online (${comfyStatus.version || 'Connected'}) — Edit Possible`
                          : 'Live ComfyUI: Offline (Read-Only Preview)'}
                      </span>
                    </span>
                    {comfyStatus?.online && (
                      <button
                        onClick={() => {
                          setHasMountedComfyUI(true);
                          setViewMode('live');
                          requestAnimationFrame(() => {
                            comfySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          });
                        }}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md active:scale-95 border ${
                          viewMode === 'live' || viewMode === 'split'
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-emerald-950/40'
                            : 'bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-emerald-400/50 shadow-emerald-900/40 glow-emerald'
                        }`}
                        title="Open and scroll to the live running ComfyUI workspace"
                      >
                        <MonitorPlay size={14} className="shrink-0" />
                        <span>{viewMode === 'live' || viewMode === 'split' ? 'Live Workspace Active' : 'Open Live ComfyUI Workspace'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
                accept=".json,.png"
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
              >
                <Upload size={15} />
                <span>Upload JSON / PNG</span>
              </button>

              <button
                onClick={() => loadWorkflows(true)}
                disabled={isLoadingWorkflows}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
                title="Scan configured ComfyUI directories for workflow files"
              >
                <RefreshCw size={14} className={isLoadingWorkflows ? 'animate-spin text-cyan-400' : ''} />
                <span>Scan Folders</span>
              </button>
            </div>
          </div>

          {/* Scan Feedback Banner */}
          {scanFeedback && (
            <div
              className={`p-3 rounded-2xl text-xs flex items-center justify-between gap-2 border transition-all animate-fadeIn ${scanFeedback.success
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                }`}
            >
              <div className="flex items-center gap-2">
                {scanFeedback.success ? (
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle size={16} className="shrink-0 text-amber-400" />
                )}
                <span>{scanFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setScanFeedback(null)}
                className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded cursor-pointer"
                aria-label="Dismiss scan feedback"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Saved ComfyUI Workflows Dropdown Selector (Compact in live mode, Full in preview modes) */}
          {viewMode !== 'live' && (
            <>
              <div className="glass-panel p-4 rounded-3xl border border-slate-800/90 shadow-xl bg-slate-900/50 backdrop-blur-md space-y-2.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                      <Workflow size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-bold text-slate-100">
                          Select Existing ComfyUI Workflow
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {savedWorkflows.length} {savedWorkflows.length === 1 ? 'workflow' : 'workflows'} found
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Workflows automatically detected in your ComfyUI directory (<code className="text-purple-300 text-[10px]">workflows/</code>, <code className="text-purple-300 text-[10px]">user/default/workflows/</code>)
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      loadWorkflows(true);
                      const active = workflows.length > 0 ? workflows[selectedWorkflowIndex] : null;
                      if (active) resolveWorkflowNodes(active, true);
                    }}
                    disabled={isLoadingWorkflows}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-purple-900/30 border border-slate-700 hover:border-purple-500/50 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                    title="Rescan ComfyUI directories for newly downloaded or modified workflows"
                  >
                    <RefreshCw size={12} className={isLoadingWorkflows ? 'animate-spin text-purple-400' : ''} />
                    <span>Rescan ComfyUI Folder</span>
                  </button>
                </div>

                {/* Custom Styled Select Dropdown */}
                <div className="relative w-full">
                  <select
                    value={activeWorkflow?.filePath || activeWorkflow?.fileName || ''}
                    onChange={(e) => handleSelectFromDropdown(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-700/80 hover:border-purple-500/60 focus:border-purple-400 rounded-2xl px-4 py-2.5 text-xs md:text-sm text-slate-100 font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all cursor-pointer pr-10"
                  >
                    <option value="" disabled>
                      {savedWorkflows.length > 0
                        ? '-- Select an existing ComfyUI workflow to load & map --'
                        : '-- No saved workflows found in ComfyUI workflow folders --'}
                    </option>
                    {savedWorkflows.map((wf, idx) => (
                      <option key={wf.filePath || `${wf.fileName}-${idx}`} value={wf.filePath || wf.fileName}>
                        {wf.fileName} ({wf.fileType.toUpperCase()}{wf.workflowFormat === 'api_prompt' ? ' • API Format' : ''}) — {wf.modelCount} model{wf.modelCount !== 1 ? 's' : ''}, {wf.nodeTypes?.length || 0} nodes
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>

              {/* Drag and Drop Zone with Visual States */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  let hasValid = true;
                  if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
                    for (let i = 0; i < e.dataTransfer.items.length; i++) {
                      const item = e.dataTransfer.items[i];
                      if (item.kind === 'file') {
                        const type = item.type;
                        if (
                          type &&
                          type !== 'application/json' &&
                          type !== 'image/png' &&
                          !type.includes('json') &&
                          !type.includes('png')
                        ) {
                          hasValid = false;
                        }
                      }
                    }
                  }
                  setDropState(hasValid ? 'drag-over-valid' : 'drag-over-invalid');
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDropState('idle');
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFilesDropped(e.dataTransfer.files);
                  } else {
                    setDropState('idle');
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  dropState === 'drag-over-valid'
                    ? 'border-cyan-400 bg-cyan-950/40 shadow-xl shadow-cyan-500/20 scale-[1.01]'
                    : dropState === 'drag-over-invalid'
                    ? 'border-rose-500 bg-rose-950/40 shadow-xl shadow-rose-500/20 scale-[1.01]'
                    : dropState === 'processing'
                    ? 'border-purple-400 bg-purple-950/30'
                    : 'border-slate-800/80 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/60'
                }`}
              >
                <div
                  className={`p-3 rounded-full shadow-inner transition-all ${
                    dropState === 'drag-over-valid'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : dropState === 'drag-over-invalid'
                      ? 'bg-rose-500/20 text-rose-300'
                      : dropState === 'processing'
                      ? 'bg-purple-500/20 text-purple-300 animate-spin'
                      : 'bg-slate-800/80 text-cyan-400'
                  }`}
                >
                  {dropState === 'drag-over-invalid' ? (
                    <AlertCircle size={22} className="animate-bounce" />
                  ) : dropState === 'processing' ? (
                    <RefreshCw size={22} className="animate-spin" />
                  ) : (
                    <Upload size={22} className={dropState === 'drag-over-valid' ? 'animate-bounce' : ''} />
                  )}
                </div>
                <p className="text-sm font-bold text-slate-200">
                  {dropState === 'drag-over-valid'
                    ? 'Drop ComfyUI workflow here to import & analyze'
                    : dropState === 'drag-over-invalid'
                    ? 'Unsupported file type — only .json and .png workflows are accepted'
                    : dropState === 'processing'
                    ? 'Parsing & validating ComfyUI workflow...'
                    : (
                      <>
                        Drop any ComfyUI <code className="text-cyan-300 font-mono text-xs">.json</code> workflow or generated <code className="text-cyan-300 font-mono text-xs">.png</code> here
                      </>
                    )}
                </p>
                <p className="text-xs text-slate-400">
                  {dropState === 'drag-over-invalid'
                    ? 'Release drop to dismiss or drag a valid workflow file'
                    : 'CMM securely validates magic bytes, extracts model dependencies, and maps custom nodes'}
                </p>
              </div>
            </>
          )}

          {/* Workflows Loaded Selector Carousel */}
          {workflows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Layers size={14} className="text-purple-400" />
                  <span>Loaded Workflows ({workflows.length})</span>
                </span>

                {/* View Mode & Live Action Toggles */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 p-1 rounded-xl">
                    {comfyStatus?.online && (
                      <>
                        <button
                          onClick={() => {
                            setViewMode('live');
                            setTimeout(() => {
                              comfySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 50);
                          }}
                          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                            viewMode === 'live'
                              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                              : 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40'
                          }`}
                          title="Expand and view live running ComfyUI interface"
                        >
                          <MonitorPlay size={14} />
                          <span>Live ComfyUI</span>
                        </button>
                        <button
                          onClick={() => {
                            setViewMode('split');
                            setTimeout(() => {
                              comfySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 50);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            viewMode === 'split'
                              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                              : 'text-emerald-400 hover:text-emerald-200 hover:bg-emerald-950/40'
                          }`}
                          title="Live ComfyUI with side-by-side missing node and model installer"
                        >
                          <Columns size={13} />
                          <span>Live + Inspector</span>
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setViewMode('both')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        viewMode === 'both'
                          ? 'bg-purple-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Preview LiteGraph map and dependency matrix"
                    >
                      Preview All
                    </button>
                    <button
                      onClick={() => setViewMode('map')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        viewMode === 'map'
                          ? 'bg-purple-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Read-only visual node map"
                    >
                      Visual Map
                    </button>
                    <button
                      onClick={() => setViewMode('matrix')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        viewMode === 'matrix'
                          ? 'bg-purple-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Missing nodes and model resolver cards"
                    >
                      Dependencies
                    </button>
                  </div>

                  {comfyStatus?.online && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleInjectWorkflowIntoComfyUI(activeWorkflow)}
                        disabled={isInjecting || !activeWorkflow}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-purple-900/30 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                        title="Push active workflow into running ComfyUI canvas"
                      >
                        <Send size={13} className={isInjecting ? 'animate-bounce' : ''} />
                        <span className="hidden sm:inline">Push to Canvas</span>
                      </button>

                      <button
                        onClick={() => handleToggleFullscreen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white border border-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95"
                        title="Maximize ComfyUI workspace to fit between header and footer"
                      >
                        <Maximize2 size={13} />
                        <span className="hidden sm:inline">Maximize</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5 overflow-x-auto pb-2 custom-scrollbar">
                {workflows.map((wf, idx) => {
                  const isSelected = idx === selectedWorkflowIndex;
                  return (
                    <div key={idx} className="relative group shrink-0">
                      <button
                        onClick={() => handleSelectWorkflow(idx)}
                        className={`flex items-center gap-2.5 pl-4 pr-8 py-3 rounded-2xl border transition-all cursor-pointer text-left ${isSelected
                          ? 'bg-linear-to-r from-purple-950/60 to-indigo-950/60 border-purple-500/60 shadow-lg shadow-purple-900/30'
                          : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 text-slate-300'
                          }`}
                      >
                        {wf.fileType === 'png' ? (
                          <ImageIcon size={18} className="text-emerald-400 shrink-0" />
                        ) : (
                          <FileJson size={18} className="text-purple-400 shrink-0" />
                        )}
                        <div>
                          <p className="text-xs font-bold text-slate-100 truncate max-w-[180px]">
                            {wf.fileName}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {wf.modelCount} model{wf.modelCount !== 1 ? 's' : ''} • {wf.nodeTypes?.length || 0} nodes
                          </p>
                        </div>
                      </button>

                      {/* Top-Right (X) Dismiss / Remove Button */}
                      <button
                        onClick={(e) => handleRemoveWorkflow(e, idx)}
                        className="absolute top-2 right-2 p-1 rounded-full bg-slate-800/90 hover:bg-rose-600 border border-slate-700/80 hover:border-rose-500 text-slate-400 hover:text-white transition-all shadow-md cursor-pointer opacity-70 group-hover:opacity-100"
                        title="Remove workflow from list"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Workflow Health Banner */}
          {activeWorkflow && (
            <div className="glass-panel p-5 rounded-3xl border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className={`p-3 rounded-2xl ${isWorkflowFullyReady
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                >
                  {isWorkflowFullyReady ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-slate-100">{activeWorkflow.fileName}</h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                      {activeWorkflow.fileType}
                    </span>
                    {viewMode === 'live' || viewMode === 'split' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>Edit Possible (Live Canvas)</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-amber-300/90 border border-amber-500/30 flex items-center gap-1">
                        <span>Embedded (Read-Only Preview)</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isWorkflowFullyReady
                      ? 'All models and custom node dependencies are installed and ready.'
                      : `Missing ${missingModelsCount} model${missingModelsCount !== 1 ? 's' : ''} and ${missingCustomNodesCount} custom node extension${missingCustomNodesCount !== 1 ? 's' : ''}.`}
                  </p>
                </div>
              </div>

              {/* Quick Metrics Badges */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${missingModelsCount === 0
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-950/40 text-amber-300 border-amber-500/30'
                    }`}
                >
                  {installedModelsCount}/{totalModelsCount} Models Ready
                </span>
                <span
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${missingCustomNodesCount === 0
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-950/40 text-rose-300 border-rose-500/30'
                    }`}
                >
                  {installedCustomNodesCount}/{totalCustomNodesCount} Nodes Ready
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Unified Live ComfyUI Workspace Embed with Resident Keep-Alive */}
      {hasMountedComfyUI && (
        <div
          ref={comfySectionRef}
          className={
            isComfyFullscreen
              ? 'h-full w-full flex-1 min-h-0 bg-slate-950 flex flex-col animate-fadeIn select-none overflow-hidden'
              : viewMode === 'live' || viewMode === 'split'
              ? `flex flex-col flex-1 min-h-0 ${viewMode === 'split' ? 'xl:flex-row gap-6' : 'w-full'} transition-all`
              : 'opacity-0 pointer-events-none absolute -left-[99999px] top-0 w-full h-0 overflow-hidden'
          }
        >
          {/* Main ComfyUI Box */}
          <div
            className={`flex-1 flex flex-col overflow-hidden min-h-0 ${
              isComfyFullscreen
                ? 'w-full h-full'
                : 'glass-panel rounded-3xl border border-slate-800 shadow-2xl min-h-[780px] h-[86vh]'
            }`}
          >
            {/* Header Toolbar (switches between Fullscreen top bar and Inline top bar) */}
            {isComfyFullscreen ? (
              <div className="flex items-center justify-between px-6 py-2.5 bg-slate-900/95 border-b border-slate-800 shadow-2xl backdrop-blur-xl gap-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                    <Workflow size={18} />
                  </div>
                  <span className="font-black text-sm text-slate-100 hidden md:inline">
                    ComfyUI Workspace
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      comfyStatus?.online
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        comfyStatus?.online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                      }`}
                    />
                    <span>{comfyStatus?.online ? 'Live Canvas — Edit Possible' : 'Offline'}</span>
                  </span>
                </div>

                {/* Center: Workflow Quick Selector */}
                <div className="flex items-center gap-2 flex-1 max-w-xl">
                  {(() => {
                    const allDropdownWorkflows: WorkflowInfo[] = [];
                    const seen = new Set<string>();
                    for (const wf of [...workflows, ...savedWorkflows]) {
                      const id = wf.filePath || wf.fileName;
                      if (id && !seen.has(id)) {
                        seen.add(id);
                        allDropdownWorkflows.push(wf);
                      }
                    }
                    const hasWorkflows = allDropdownWorkflows.length > 0;

                    return (
                      <select
                        value={activeWorkflow?.filePath || activeWorkflow?.fileName || ''}
                        onChange={(e) => handleSelectFromDropdown(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700/80 hover:border-purple-500/60 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-medium truncate focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>
                          {hasWorkflows
                            ? '-- Select a ComfyUI workflow to inject --'
                            : '-- No workflows found in ComfyUI folders --'}
                        </option>
                        {allDropdownWorkflows.map((wf, idx) => (
                          <option key={wf.filePath || `${wf.fileName}-${idx}`} value={wf.filePath || wf.fileName}>
                            {wf.fileName} ({wf.modelCount} models, {wf.nodeTypes?.length || 0} nodes)
                          </option>
                        ))}
                      </select>
                    );
                  })()}

                  {activeWorkflow && (
                    <button
                      onClick={() => handleInjectWorkflowIntoComfyUI(activeWorkflow)}
                      disabled={isInjecting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer shrink-0 disabled:opacity-50 active:scale-95"
                      title="Push this workflow to the live canvas"
                    >
                      <Send size={12} className={isInjecting ? 'animate-bounce' : ''} />
                      <span>Push to Canvas</span>
                    </button>
                  )}
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowFullscreenNodeDrawer((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      showFullscreenNodeDrawer
                        ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                        : missingCustomNodesCount > 0
                        ? 'bg-rose-950/40 border-rose-500/50 text-rose-300 hover:bg-rose-900/50'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    }`}
                    title="Toggle missing nodes and model dependencies drawer"
                  >
                    <SlidersHorizontal size={13} />
                    <span>
                      Missing Nodes {missingCustomNodesCount > 0 && `(${missingCustomNodesCount})`}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      if (webviewRef.current && typeof webviewRef.current.reload === 'function') {
                        webviewRef.current.reload();
                      } else if (iframeRef.current) {
                        iframeRef.current.src = serverUrl;
                      }
                    }}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition-all cursor-pointer"
                    title="Reload ComfyUI"
                  >
                    <RefreshCw size={14} />
                  </button>

                  <button
                    onClick={() => handleToggleFullscreen(false)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-900/40 border border-purple-400/40 transition-all cursor-pointer active:scale-95"
                    title="Minimize ComfyUI / Return to Workflows Tab (Esc)"
                  >
                    <Minimize2 size={13} className="stroke-[2.5]" />
                    <span>Minimize</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-5 py-3 bg-slate-900/95 border-b border-slate-800 shadow-lg backdrop-blur-md gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                    <MonitorPlay size={16} />
                  </div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-sm text-slate-100 hidden sm:inline">Live ComfyUI Workspace</span>
                    <div
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        comfyStatus?.online
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          comfyStatus?.online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      <span>
                        {comfyStatus?.online
                          ? `Online (${comfyStatus.version || 'Connected'}) — Edit Possible`
                          : 'ComfyUI Server Disconnected'}
                      </span>
                    </div>
                    <span className="text-slate-400 text-xs font-mono hidden md:inline">{serverUrl}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeWorkflow && (
                    <button
                      onClick={() => handleInjectWorkflowIntoComfyUI(activeWorkflow)}
                      disabled={isInjecting}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-purple-900/30 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                      title={`Push "${activeWorkflow.fileName}" into active ComfyUI canvas`}
                    >
                      <Send size={13} className={isInjecting ? 'animate-bounce' : ''} />
                      <span>{isInjecting ? 'Injecting...' : 'Push to Canvas'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (webviewRef.current && typeof webviewRef.current.reload === 'function') {
                        webviewRef.current.reload();
                      } else if (iframeRef.current) {
                        iframeRef.current.src = serverUrl;
                      }
                    }}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition-all cursor-pointer"
                    title="Reload ComfyUI"
                  >
                    <RefreshCw size={14} />
                  </button>

                  <button
                    onClick={() => handleToggleFullscreen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white border border-slate-700 text-xs font-bold transition-all cursor-pointer active:scale-95"
                    title="Maximize ComfyUI workspace to fit between header and footer"
                  >
                    <Maximize2 size={13} />
                    <span>Maximize</span>
                  </button>
                </div>
              </div>
            )}

            {/* Injection Toast */}
            {injectionFeedback && (
              <div className="px-5 py-2 bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>{injectionFeedback}</span>
                </div>
                <button
                  onClick={() => setInjectionFeedback(null)}
                  className="text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Frame Container & Fullscreen Drawer */}
            <div className="relative flex-1 w-full h-full min-h-0 flex flex-col overflow-hidden bg-slate-950">
              <div className="flex-1 w-full h-full min-h-0 flex flex-col bg-slate-950">
                {comfyStatus?.online ? (
                  window.civitaiAPI && !window.civitaiAPI._isMock ? (
                    <webview
                      ref={webviewRef}
                      src={serverUrl}
                      className="w-full h-full flex-1 border-none min-h-0 block"
                      style={{ width: '100%', height: '100%', minHeight: '100%', display: 'flex', flex: 1 }}
                      partition="persist:comfyui"
                      webpreferences="backgroundThrottling=no,contextIsolation=yes"
                    />
                  ) : (
                    <iframe
                      ref={iframeRef}
                      src={serverUrl}
                      className="w-full h-full flex-1 border-none min-h-0 block"
                      style={{ width: '100%', height: '100%', minHeight: '100%', flex: 1 }}
                      title="ComfyUI Live Workspace"
                    />
                  )
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                    <div className="p-4 rounded-3xl bg-slate-900/80 text-slate-400 border border-slate-800 shadow-inner">
                      <Radio size={36} />
                    </div>
                    <div className="space-y-1 max-w-md">
                      <h3 className="font-bold text-slate-100 text-base">ComfyUI Server is not responding</h3>
                      <p className="text-xs text-slate-400">
                        No active ComfyUI instance detected at <code className="text-cyan-300 font-mono">{serverUrl}</code>. Start ComfyUI in your terminal or verify your endpoint in Settings.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={async () => {
                          if (window.civitaiAPI?.checkComfyUIStatus) {
                            const s = await window.civitaiAPI.checkComfyUIStatus(serverUrl);
                            setComfyStatus(s);
                          }
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-bold border border-slate-700 transition-all cursor-pointer"
                      >
                        <RefreshCw size={13} />
                        <span>Retry Connection</span>
                      </button>
                      <button
                        onClick={() => setViewMode('both')}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Switch to Preview Map
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Fullscreen Drawer */}
              {isComfyFullscreen && showFullscreenNodeDrawer && (
                <div className="w-[460px] bg-slate-950/95 border-l border-slate-800 p-6 overflow-y-auto z-20 custom-scrollbar shadow-2xl backdrop-blur-xl animate-slideLeft">
                  <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                    <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                      <SlidersHorizontal size={16} className="text-purple-400" />
                      <span>Node & Model Dependencies</span>
                    </h3>
                    <button
                      onClick={() => setShowFullscreenNodeDrawer(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {renderDependencyMatrix(true)}
                </div>
              )}
            </div>
          </div>

          {/* Split Mode: Side Inspector Panel (when not fullscreen) */}
          {!isComfyFullscreen && viewMode === 'split' && (
            <div className="xl:w-[460px] shrink-0 space-y-6 overflow-y-auto max-h-[75vh] pr-1 custom-scrollbar">
              {renderDependencyMatrix(true)}
            </div>
          )}
        </div>
      )}

      {/* Visual Node Map Canvas (when viewMode is 'both' or 'map' and not fullscreen) */}
      {!isComfyFullscreen && (viewMode === 'both' || viewMode === 'map') && (
        <div ref={mapSectionRef}>
          {activeWorkflow && (
            <WorkflowNodeMap
              ref={nodeMapRef}
              graph={activeWorkflow.canvasGraph}
              getNodeStatus={getNodeStatus}
              onFocusNode={setSelectedNodeId}
              viewMode={viewMode}
              isMapExpanded={isMapExpanded}
              onToggleExpand={() => setIsMapExpanded((prev) => !prev)}
            />
          )}
        </div>
      )}

      {/* Dependency Matrix & Resolution Cards (when viewMode is 'both' or 'matrix' and not fullscreen) */}
      {!isComfyFullscreen && (viewMode === 'both' || viewMode === 'matrix') && renderDependencyMatrix(false)}

      {/* Full-Window Drag & Drop Overlay (Intercepts drops anywhere including over webviews/frames) */}
      {isWindowDragging && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) {
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepthRef.current--;
            if (dragDepthRef.current <= 0) {
              dragDepthRef.current = 0;
              setIsWindowDragging(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepthRef.current = 0;
            setIsWindowDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleFilesDropped(e.dataTransfer.files);
            }
          }}
          className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-8 border-4 border-dashed border-cyan-400 animate-fadeIn pointer-events-auto select-none"
        >
          <div className="p-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-2xl mb-4 animate-bounce">
            <Upload size={48} />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mb-2">
            Drop ComfyUI Workflow to Import
          </h2>
          <p className="text-sm text-slate-300 max-w-md text-center">
            Release your <code className="text-cyan-300 font-mono font-bold">.json</code> workflow or <code className="text-cyan-300 font-mono font-bold">.png</code> image anywhere to validate, archive to ComfyUI, and check installed vs. missing nodes.
          </p>
        </div>
      )}

      {/* Workflow Import Confirmation & Dependency Preview Modal */}
      <WorkflowImportModal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          setImportModalData(null);
        }}
        parsedData={importModalData}
        savedWorkflows={savedWorkflows}
        onConfirmImport={handleConfirmWorkflowImport}
        isImporting={isArchivingWorkflow}
      />
    </div>
  );
};