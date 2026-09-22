/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  Background,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  NodeProps,
  Edge,
  Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Crosshair,
  X,
  Workflow,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
} from 'lucide-react';
import { CanvasGraph, CanvasNode } from '../types/app';

export type NodeStatus = 'ready' | 'missing-model' | 'missing-node';
export type WorkflowViewMode = 'both' | 'map' | 'matrix' | 'live' | 'split';

export interface WorkflowNodeMapHandle {
  /** Pans and zooms the map so the first node of the given type fills the viewport. */
  zoomToNodeType: (nodeType: string | number | null) => void;
}

const STATUS_THEMES: Record<
  NodeStatus,
  { border: string; bg: string; badgeBg: string; badgeText: string; icon: any; label: string; minimapColor: string }
> = {
  ready: {
    border: 'border-emerald-500/50 shadow-emerald-950/20',
    bg: 'bg-slate-900/90 hover:bg-slate-900',
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    badgeText: 'text-emerald-400',
    icon: CheckCircle2,
    label: 'Ready',
    minimapColor: '#10b981',
  },
  'missing-model': {
    border: 'border-amber-500/60 shadow-amber-950/30',
    bg: 'bg-slate-900/95 hover:bg-slate-900',
    badgeBg: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
    badgeText: 'text-amber-400',
    icon: AlertTriangle,
    label: 'Missing Model',
    minimapColor: '#f59e0b',
  },
  'missing-node': {
    border: 'border-rose-500/70 shadow-rose-950/40',
    bg: 'bg-slate-900/95 hover:bg-slate-900',
    badgeBg: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
    badgeText: 'text-rose-400',
    icon: XCircle,
    label: 'Missing Node',
    minimapColor: '#f43f5e',
  },
};

export interface CustomNodeData extends Record<string, unknown> {
  canvasNode: CanvasNode;
  status: NodeStatus;
  onFocus: (nodeType: string | number | null) => void;
}

/**
 * Custom High-DPI React Flow card for ComfyUI nodes.
 */
function ComfyUINodeComponent({ data, selected }: NodeProps<Node<CustomNodeData>>) {
  const { canvasNode, status, onFocus } = data;
  const theme = STATUS_THEMES[status] || STATUS_THEMES.ready;
  const StatusIcon = theme.icon;

  const nodeTitle = canvasNode?.title || canvasNode?.type || `Node #${canvasNode?.id}`;
  const isTypeDifferent = canvasNode?.title && canvasNode?.type && canvasNode.title !== canvasNode.type;

  // Widget parameters preview
  const widgetPreview = useMemo(() => {
    if (!canvasNode?.widgets_values || !Array.isArray(canvasNode.widgets_values)) return [];
    return canvasNode.widgets_values
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map((v) => {
        if (typeof v === 'string') {
          return v.length > 32 ? v.slice(0, 32) + '...' : v;
        }
        if (typeof v === 'number') {
          return Number.isInteger(v) ? String(v) : v.toFixed(3);
        }
        return String(v);
      })
      .slice(0, 3);
  }, [canvasNode?.widgets_values]);

  const inputs = canvasNode?.inputs || [];
  const outputs = canvasNode?.outputs || [];
  const maxSockets = Math.max(inputs.length, outputs.length);
  const minHeightPx = Math.max(80, 44 + maxSockets * 22);

  return (
    <div
      onClick={() => onFocus(canvasNode?.type || canvasNode?.id)}
      style={{ minHeight: `${minHeightPx}px` }}
      className={`group relative min-w-[240px] max-w-[320px] rounded-xl border backdrop-blur-md transition-all duration-150 select-none shadow-xl flex flex-col justify-between ${
        theme.border
      } ${theme.bg} ${selected ? 'ring-2 ring-indigo-500 shadow-indigo-500/20' : ''}`}
    >
      {/* Input Sockets */}
      {inputs.map((inp, idx) => (
        <Handle
          key={`in-${idx}`}
          type="target"
          position={Position.Left}
          id={`in_${idx}`}
          style={{
            top: `${36 + idx * 22}px`,
            background: '#6366f1',
            width: 10,
            height: 10,
            border: '2px solid #0f172a',
          }}
          title={inp.name || `Input ${idx}`}
        />
      ))}

      {/* Output Sockets */}
      {outputs.map((out, idx) => (
        <Handle
          key={`out-${idx}`}
          type="source"
          position={Position.Right}
          id={`out_${idx}`}
          style={{
            top: `${36 + idx * 22}px`,
            background: '#10b981',
            width: 10,
            height: 10,
            border: '2px solid #0f172a',
          }}
          title={out.name || `Output ${idx}`}
        />
      ))}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-3.5 py-2.5 bg-slate-950/40 rounded-t-xl gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-200 truncate" title={nodeTitle}>
            {nodeTitle}
          </span>
        </div>
        <div
          className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${theme.badgeBg}`}
        >
          <StatusIcon className="w-3 h-3 shrink-0" />
          <span>{theme.label}</span>
        </div>
      </div>

      {/* Body Details */}
      <div className="p-3 space-y-2 text-xs flex-1">
        {isTypeDifferent && (
          <div className="text-[11px] text-slate-400 font-mono truncate" title={canvasNode?.type}>
            type: {canvasNode?.type}
          </div>
        )}

        {widgetPreview.length > 0 && (
          <div className="space-y-1">
            {widgetPreview.map((val, i) => (
              <div
                key={i}
                className="text-[11px] font-mono text-slate-300 bg-slate-950/60 px-2 py-1 rounded border border-slate-800/60 truncate"
                title={val}
              >
                {val}
              </div>
            ))}
          </div>
        )}

        {inputs.length > 0 && (
          <div className="text-[10px] text-slate-500">
            {inputs.length} input{inputs.length > 1 ? 's' : ''} &bull; {outputs.length} output
            {outputs.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  comfyNode: ComfyUINodeComponent,
};

interface WorkflowNodeMapProps {
  graph?: CanvasGraph;
  getNodeStatus: (node: CanvasNode) => NodeStatus;
  onFocusNode: (nodeType: string | number | null) => void;
  viewMode: WorkflowViewMode;
  isMapExpanded: boolean;
  onToggleExpand: () => void;
}

function WorkflowNodeMapInner(
  { graph, getNodeStatus, onFocusNode, isMapExpanded, onToggleExpand }: WorkflowNodeMapProps,
  ref: React.ForwardedRef<WorkflowNodeMapHandle>
) {
  const { fitView, zoomIn, zoomOut, getNodes, setCenter } = useReactFlow<Node<CustomNodeData>, Edge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CustomNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Transform ComfyUI CanvasGraph into React Flow nodes and edges
  useEffect(() => {
    if (!graph || !Array.isArray(graph.nodes)) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // 1. Index existing node IDs and compute max referenced socket slots for inputs & outputs
    const existingNodeIds = new Set<string>();
    const maxOriginSlotPerNode = new Map<string, number>();
    const maxTargetSlotPerNode = new Map<string, number>();

    graph.nodes.forEach((n) => {
      existingNodeIds.add(String(n.id));
    });

    if (Array.isArray(graph.links)) {
      graph.links.forEach((l) => {
        if (!Array.isArray(l) || l.length < 5) return;
        const [_, originId, originSlot, targetId, targetSlot] = l;
        const srcIdStr = String(originId);
        const tgtIdStr = String(targetId);

        if (existingNodeIds.has(srcIdStr)) {
          const slotNum = typeof originSlot === 'number' ? originSlot : (parseInt(originSlot, 10) || 0);
          const currentSrcMax = maxOriginSlotPerNode.get(srcIdStr) ?? -1;
          if (slotNum > currentSrcMax) {
            maxOriginSlotPerNode.set(srcIdStr, slotNum);
          }
        }

        if (existingNodeIds.has(tgtIdStr)) {
          const slotNum = typeof targetSlot === 'number' ? targetSlot : (parseInt(targetSlot, 10) || 0);
          const currentTgtMax = maxTargetSlotPerNode.get(tgtIdStr) ?? -1;
          if (slotNum > currentTgtMax) {
            maxTargetSlotPerNode.set(tgtIdStr, slotNum);
          }
        }
      });
    }

    const flowNodes: Node<CustomNodeData>[] = graph.nodes.map((n) => {
      const status = getNodeStatus(n);
      const posX = Array.isArray(n.pos) && typeof n.pos[0] === 'number' ? n.pos[0] : 0;
      const posY = Array.isArray(n.pos) && typeof n.pos[1] === 'number' ? n.pos[1] : 0;
      const idStr = String(n.id);

      // Ensure inputs array has enough slots for all referenced links
      const rawInputs = Array.isArray(n.inputs) ? [...n.inputs] : [];
      const maxTargetSlot = maxTargetSlotPerNode.get(idStr) ?? -1;
      while (rawInputs.length <= maxTargetSlot) {
        rawInputs.push({ name: `Input ${rawInputs.length}`, type: 'any' });
      }

      // Ensure outputs array has enough slots for all referenced links
      const rawOutputs = Array.isArray(n.outputs) ? [...n.outputs] : [];
      const maxOriginSlot = maxOriginSlotPerNode.get(idStr) ?? -1;
      while (rawOutputs.length <= maxOriginSlot) {
        rawOutputs.push({ name: `Output ${rawOutputs.length}`, type: 'any' });
      }

      const normalizedCanvasNode: CanvasNode = {
        ...n,
        inputs: rawInputs,
        outputs: rawOutputs,
      };

      return {
        id: idStr,
        type: 'comfyNode',
        position: { x: posX, y: posY },
        data: {
          canvasNode: normalizedCanvasNode,
          status,
          onFocus: onFocusNode,
        },
      };
    });

    const flowEdges: Edge[] = [];
    if (Array.isArray(graph.links)) {
      graph.links.forEach((l, idx) => {
        if (!Array.isArray(l) || l.length < 5) return;
        const [linkId, originId, originSlot, targetId, targetSlot] = l;
        const srcIdStr = String(originId);
        const tgtIdStr = String(targetId);

        // Discard dangling links where source or target node does not exist in graph
        if (!existingNodeIds.has(srcIdStr) || !existingNodeIds.has(tgtIdStr)) {
          return;
        }

        const srcSlot = typeof originSlot === 'number' ? originSlot : (parseInt(originSlot, 10) || 0);
        const tgtSlot = typeof targetSlot === 'number' ? targetSlot : (parseInt(targetSlot, 10) || 0);

        flowEdges.push({
          id: `edge-${linkId || idx}`,
          source: srcIdStr,
          target: tgtIdStr,
          sourceHandle: `out_${srcSlot}`,
          targetHandle: `in_${tgtSlot}`,
          animated: false,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        });
      });
    }

    setNodes(flowNodes);
    setEdges(flowEdges);

    // Auto-fit view after rendering
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 50);
  }, [graph, getNodeStatus, onFocusNode, setNodes, setEdges, fitView]);

  useImperativeHandle(
    ref,
    () => ({
      zoomToNodeType: (target: string | number | null) => {
        if (!target) return;
        const currentNodes = getNodes();
        const targetStr = String(target).toLowerCase();
        const found = currentNodes.find((n) => {
          const cNode = (n.data as CustomNodeData)?.canvasNode;
          return (
            String(n.id) === targetStr ||
            cNode?.type?.toLowerCase() === targetStr ||
            cNode?.title?.toLowerCase() === targetStr
          );
        });

        if (found) {
          setCenter(found.position.x + 150, found.position.y + 75, { zoom: 1.2, duration: 400 });
        }
      },
    }),
    [getNodes, setCenter]
  );

  return (
    <div className="relative w-full h-full bg-slate-950/95 overflow-hidden select-none">
      <ReactFlow<Node<CustomNodeData>, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        panOnScroll={true}
        zoomOnPinch={true}
        zoomOnScroll={false}
        selectionOnDrag={true}
        panOnDrag={[1, 2]}
        minZoom={0.1}
        maxZoom={2.5}
        onMove={(_e, viewport) => {
          setZoomLevel(Math.round(viewport.zoom * 100));
        }}
        className="touch-none"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#334155" />
        <MiniMap
          nodeColor={(n) => {
            const data = n.data as unknown as CustomNodeData;
            return STATUS_THEMES[data?.status]?.minimapColor || '#64748b';
          }}
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-slate-900/90 !border-slate-800 !rounded-lg"
        />
      </ReactFlow>

      {/* Floating Canvas Controls Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-2.5 py-1.5 rounded-lg shadow-xl text-slate-300">
        <button
          type="button"
          onClick={() => zoomIn({ duration: 200 })}
          className="p-1.5 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono px-1 text-slate-400 min-w-[42px] text-center">
          {zoomLevel}%
        </span>
        <button
          type="button"
          onClick={() => zoomOut({ duration: 200 })}
          className="p-1.5 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-slate-800 mx-1" />
        <button
          type="button"
          onClick={() => fitView({ padding: 0.2, duration: 300 })}
          className="p-1.5 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
          title="Fit to Screen"
        >
          <Crosshair className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          className="p-1.5 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
          title={isMapExpanded ? 'Exit Fullscreen' : 'Expand Fullscreen'}
        >
          {isMapExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-lg shadow-xl text-[11px] text-slate-300">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
          <span>Ready</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
          <span>Missing Model</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
          <span>Missing Node</span>
        </div>
      </div>
    </div>
  );
}

const WorkflowNodeMapInnerWithRef = forwardRef(WorkflowNodeMapInner);

export const WorkflowNodeMap = forwardRef<WorkflowNodeMapHandle, WorkflowNodeMapProps>(
  function WorkflowNodeMap(props, ref) {
    const { viewMode, isMapExpanded, onToggleExpand } = props;
    const visible = viewMode === 'both' || viewMode === 'map';

    if (!visible) return null;

    if (isMapExpanded) {
      return createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-slate-200">
                Visual Workflow Node Map (Offline React Flow)
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleExpand}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
              title="Close Fullscreen Map"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 w-full h-full relative">
            <ReactFlowProvider>
              <WorkflowNodeMapInnerWithRef {...props} ref={ref} />
            </ReactFlowProvider>
          </div>
        </div>,
        document.body
      );
    }

    return (
      <div className="w-full h-[480px] rounded-xl border border-slate-800 overflow-hidden shadow-2xl relative">
        <ReactFlowProvider>
          <WorkflowNodeMapInnerWithRef {...props} ref={ref} />
        </ReactFlowProvider>
      </div>
    );
  }
);

export default WorkflowNodeMap;
