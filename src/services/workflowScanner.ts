/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { WorkflowInfo, WorkflowModelReference, CanvasGraph, WorkflowFormat } from '../types/app';
import { dbManager } from '../db/db';
import { logger } from '../utils/logger';

export type WorkflowImportErrorCode =
  | 'FILE_TOO_LARGE'
  | 'INVALID_MAGIC_BYTES'
  | 'PATH_TRAVERSAL'
  | 'FILE_EXISTS'
  | 'EXTRACTION_TIMEOUT'
  | 'CORRUPT_METADATA'
  | 'INVALID_WORKFLOW'
  | 'NO_COMFY_DIR'
  | 'FILE_NOT_FOUND'
  | 'NOT_A_FILE'
  | 'INVALID_ARGUMENT';

export interface WorkflowParseResult {
  filePath: string;
  fileName: string;
  fileType: 'json' | 'png';
  fileSize: number;
  workflow: any;
  nodes: string[];
  models: WorkflowModelReference[];
  metadata: any;
  canvasGraph?: CanvasGraph;
  modelCount: number;
  workflowFormat?: WorkflowFormat;
}

const MODEL_NODE_KEYS: Record<string, string[]> = {
  ckpt_name: ['CheckpointLoaderSimple', 'CheckpointLoader', 'Efficient Loader', 'ImpactCheckpointLoader', 'CMMDownloadModel'],
  unet_name: ['UNETLoader', 'DiffusionModelLoader', 'CMMDownloadModel'],
  lora_name: ['LoraLoader', 'LoraLoaderModelOnly', 'LoraLoader|pysssss', 'ImpactLoraLoader', 'CMMDownloadModel'],
  vae_name: ['VAELoader', 'ImpactVAELoader', 'CMMDownloadModel'],
  control_net_name: ['ControlNetLoader', 'ControlNetLoaderAdvanced', 'CMMDownloadModel'],
  clip_name: ['CLIPVisionLoader', 'CLIPLoader'],
  clip_name1: ['DualCLIPLoader'],
  clip_name2: ['DualCLIPLoader', 'TripleCLIPLoader'],
  clip_name3: ['TripleCLIPLoader'],
  model_name: ['UpscaleModelLoader', 'CMMDownloadModel', 'CMMCheckHuggingFace'],
  ipadapter_file: ['IPAdapterModelLoader', 'IPAdapterUnifiedLoader', 'CMMDownloadModel'],
  photomaker_model_name: ['PhotoMakerLoader'],
  gligen_name: ['GLIGENLoader'],
};

export class WorkflowScanner {
  async scanWorkflows(folderPaths: string | string[]): Promise<WorkflowInfo[]> {
    const paths = Array.isArray(folderPaths) ? folderPaths : [folderPaths];
    const existingPaths = paths.filter((p) => p && fs.existsSync(p));
    if (existingPaths.length === 0) {
      return [];
    }

    const workflowFiles: string[] = [];
    for (const p of existingPaths) {
      this.collectWorkflowFiles(p, workflowFiles);
    }

    logger.info(`Discovered ${workflowFiles.length} workflow file(s) for analysis.`);

    // Load all known local model filenames from SQLite for instant matching
    const localRows: any[] = await dbManager.all('SELECT file_name, file_path FROM local_models;');
    const localModelMap = new Map<string, string>();
    for (const r of localRows) {
      if (r.file_name) {
        localModelMap.set(r.file_name.toLowerCase(), r.file_path);
      }
      if (r.file_path) {
        localModelMap.set(path.basename(r.file_path).toLowerCase(), r.file_path);
      }
    }

    const results: WorkflowInfo[] = [];

    for (const filePath of workflowFiles) {
      try {
        const ext = path.extname(filePath).toLowerCase();
        let parsedData: any = null;

        if (ext === '.json') {
          const raw = fs.readFileSync(filePath, 'utf-8');
          try {
            parsedData = JSON.parse(raw);
          } catch {
            continue;
          }
        } else if (ext === '.png') {
          parsedData = this.extractPngWorkflow(filePath);
        }

        if (!parsedData) continue;

        const modelRefs = this.extractModelReferences(parsedData, localModelMap);
        const nodeTypes = this.extractNodeTypes(parsedData);
        const canvasGraph = this.buildCanvasGraph(parsedData);
        const workflowFormat = this.detectWorkflowFormat(parsedData);
        if (modelRefs.length > 0 || nodeTypes.length > 0 || canvasGraph) {
          results.push({
            filePath,
            fileName: path.basename(filePath),
            fileType: ext === '.json' ? 'json' : 'png',
            modelCount: modelRefs.length,
            models: modelRefs,
            nodeTypes,
            rawGraph: parsedData,
            canvasGraph,
            workflowFormat,
          });
        }
      } catch (err: any) {
        logger.warn(`Failed to process workflow file ${filePath}:`, err.message);
      }
    }

    return results;
  }

  /**
   * Deep normalizer for ComfyUI workflow JSON formats (Canvas UI, Prompt API, stringified metadata wrappers).
   */
  normalizeWorkflowData(raw: any): any {
    if (!raw) return null;
    let data = raw;

    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e: any) {
        throw new Error(`Invalid workflow JSON format: ${e.message}`);
      }
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Workflow payload must be a valid JSON object');
    }

    // Check if root is an array of nodes
    if (Array.isArray(data)) {
      return { nodes: data, links: [] };
    }

    // Unpack stringified subfields
    if (typeof data.workflow === 'string') {
      try {
        data.workflow = JSON.parse(data.workflow);
      } catch {}
    }
    if (typeof data.prompt === 'string') {
      try {
        data.prompt = JSON.parse(data.prompt);
      } catch {}
    }

    // Unpack CivitAI / extra_pnginfo metadata wrappers
    if (data.extra_pnginfo?.workflow) {
      const nested =
        typeof data.extra_pnginfo.workflow === 'string'
          ? JSON.parse(data.extra_pnginfo.workflow)
          : data.extra_pnginfo.workflow;
      data = { ...data, ...nested, workflow: nested };
    }
    if (data.extra?.prompt) {
      const nested =
        typeof data.extra.prompt === 'string'
          ? JSON.parse(data.extra.prompt)
          : data.extra.prompt;
      data = { ...data, prompt: nested };
    }

    // If data.workflow is an object containing nodes, promote nodes to top level
    if (data.workflow && typeof data.workflow === 'object' && Array.isArray(data.workflow.nodes)) {
      data = { ...data.workflow, ...data, nodes: data.workflow.nodes, links: data.workflow.links || [] };
    }

    return data;
  }

  /**
   * Distinguish between a Full Visual Canvas Workflow (.nodes array with spatial metadata)
   * versus an Exported Backend API Execution Prompt dictionary ("Save (API format)").
   */
  detectWorkflowFormat(raw: any): WorkflowFormat {
    if (!raw) return 'api_prompt';
    let data = raw;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return 'api_prompt';
      }
    }
    if (!data || typeof data !== 'object') return 'api_prompt';

    // 1. Direct or nested full UI canvas workflow format
    if (Array.isArray(data.nodes) && data.nodes.length > 0) {
      return 'full_canvas';
    }
    if (data.workflow && typeof data.workflow === 'object' && Array.isArray(data.workflow.nodes)) {
      return 'full_canvas';
    }
    if (data.extra_pnginfo?.workflow) {
      const nested =
        typeof data.extra_pnginfo.workflow === 'string'
          ? (() => {
              try {
                return JSON.parse(data.extra_pnginfo.workflow);
              } catch {
                return null;
              }
            })()
          : data.extra_pnginfo.workflow;
      if (nested && Array.isArray(nested.nodes)) return 'full_canvas';
    }

    // 2. API prompt format execution dictionary
    const promptObj = data.prompt ? data.prompt : data;
    if (promptObj && typeof promptObj === 'object' && !Array.isArray(promptObj)) {
      const values = Object.values(promptObj);
      const isApiFormat = values.some(
        (v: any) => v && typeof v === 'object' && (v.class_type !== undefined || v.inputs !== undefined)
      );
      if (isApiFormat) {
        return 'api_prompt';
      }
    }

    return 'full_canvas';
  }

  /**
   * Parse a raw JSON workflow or API prompt object/string directly from memory
   * with strict validation.
   */
  async parseWorkflow(workflowData: any, workflowName = 'direct_workflow.json'): Promise<WorkflowInfo> {
    const normalized = this.normalizeWorkflowData(workflowData);
    if (!normalized) {
      throw new Error(`Invalid workflow JSON format in "${workflowName}": Unable to parse JSON object.`);
    }

    // Load known local models from SQLite for instant matching
    let localModelMap = new Map<string, string>();
    try {
      if (!(dbManager as any).db) {
        await dbManager.init().catch(() => {});
      }
      const localRows: any[] = (await dbManager.all('SELECT file_name, file_path FROM local_models;')) || [];
      for (const r of localRows) {
        if (r.file_name) {
          localModelMap.set(r.file_name.toLowerCase(), r.file_path);
        }
        if (r.file_path) {
          localModelMap.set(path.basename(r.file_path).toLowerCase(), r.file_path);
        }
      }
    } catch {}

    const modelRefs = this.extractModelReferences(normalized, localModelMap);
    const nodeTypes = this.extractNodeTypes(normalized);
    const canvasGraph = this.buildCanvasGraph(normalized);
    const workflowFormat = this.detectWorkflowFormat(workflowData);

    const hasNodes = (canvasGraph?.nodes && canvasGraph.nodes.length > 0) || nodeTypes.length > 0;
    if (!hasNodes && modelRefs.length === 0) {
      throw new Error(
        `Invalid ComfyUI workflow JSON: No recognizable ComfyUI nodes or prompt execution graph found in "${workflowName}". Please ensure this is an exported ComfyUI workflow (.json) or ComfyUI API prompt.`
      );
    }

    return {
      filePath: '',
      fileName: workflowName,
      fileType: 'json',
      modelCount: modelRefs.length,
      models: modelRefs,
      nodeTypes,
      rawGraph: normalized,
      canvasGraph,
      workflowFormat,
    };
  }

  buildCanvasGraph(data: any): CanvasGraph | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const normalized = this.normalizeWorkflowData(data) || data;

    // 1. Full UI Canvas Workflow format (nodes with positions & link definitions)
    const uiWorkflow = normalized.workflow ? normalized.workflow : (normalized.nodes ? normalized : null);
    if (uiWorkflow && Array.isArray(uiWorkflow.nodes)) {
      const subgraphNames = this.extractSubgraphNames(uiWorkflow, normalized);
      return {
        nodes: uiWorkflow.nodes.map((n: any) => ({
          id: n.id,
          type: this.resolveNodeTypeLabel(n.type || n.class_type, subgraphNames) || 'Node',
          pos: Array.isArray(n.pos) ? [n.pos[0], n.pos[1]] : [100, 100],
          size: n.size || [220, 120],
          inputs: Array.isArray(n.inputs) ? n.inputs : [],
          outputs: Array.isArray(n.outputs) ? n.outputs : [],
          widgets_values: Array.isArray(n.widgets_values) ? n.widgets_values : [],
          title: n.title,
          color: n.color,
          bgcolor: n.bgcolor,
        })),
        links: Array.isArray(uiWorkflow.links) ? uiWorkflow.links : [],
        groups: Array.isArray(uiWorkflow.groups) ? uiWorkflow.groups : [],
      };
    }

// 2. Fallback: Synthesize spatial layout from prompt execution dictionary
const promptNodes = normalized.prompt ? normalized.prompt : normalized;
    if (promptNodes && typeof promptNodes === 'object' && !Array.isArray(promptNodes)) {
      const subgraphNames = this.extractSubgraphNames(normalized, promptNodes);
      const nodeEntries = Object.entries<any>(promptNodes).filter(([_, v]) => v && typeof v === 'object' && (v.class_type || v.type || v.inputs));
      if (nodeEntries.length > 0) {
        const nodes: any[] = [];
        const links: any[] = [];
        let linkIdCounter = 1;

        // Collect max output slot used across all links for each source node
        const maxOutputSlotPerNode = new Map<string, number>();
        nodeEntries.forEach(([_, nodeObj]) => {
          const inputs = nodeObj.inputs || {};
          for (const inVal of Object.values(inputs)) {
            if (Array.isArray(inVal) && inVal.length === 2 && (typeof inVal[0] === 'string' || typeof inVal[0] === 'number')) {
              const srcNodeId = String(inVal[0]);
              const srcSlot = typeof inVal[1] === 'number' ? inVal[1] : (parseInt(inVal[1], 10) || 0);
              const currentMax = maxOutputSlotPerNode.get(srcNodeId) ?? -1;
              if (srcSlot > currentMax) {
                maxOutputSlotPerNode.set(srcNodeId, srcSlot);
              }
            }
          }
        });

        nodeEntries.forEach(([id, nodeObj]) => {
          const classType = this.resolveNodeTypeLabel(nodeObj.class_type || nodeObj.type, subgraphNames) || 'Node';
          const inputs = nodeObj.inputs || {};

          const nodeInputs: any[] = [];
          for (const [inKey, inVal] of Object.entries(inputs)) {
            if (Array.isArray(inVal) && inVal.length === 2 && (typeof inVal[0] === 'string' || typeof inVal[0] === 'number')) {
              const srcNodeId = inVal[0];
              const srcSlot = typeof inVal[1] === 'number' ? inVal[1] : (parseInt(inVal[1], 10) || 0);
              const linkId = linkIdCounter++;
              nodeInputs.push({ name: inKey, type: 'any', link: linkId });
              links.push([linkId, Number(srcNodeId) || srcNodeId, srcSlot, Number(id) || id, nodeInputs.length - 1, 'any']);
            } else {
              nodeInputs.push({ name: inKey, type: typeof inVal, link: null });
            }
          }

          const maxOutputSlot = maxOutputSlotPerNode.get(String(id)) ?? 0;
          const nodeOutputs: any[] = [];
          for (let s = 0; s <= maxOutputSlot; s++) {
            nodeOutputs.push({ name: maxOutputSlot === 0 ? 'OUT' : `OUT ${s}`, type: 'any' });
          }

          nodes.push({
            id: Number(id) || id,
            type: classType,
            pos: [0, 0],
            size: [240, 140],
            inputs: nodeInputs,
            outputs: nodeOutputs,
          });
        });

        // Tempo: layered (longest-path) layout instead of a fixed 4-across grid so
        // linear pipelines read as left-to-right columns instead of a zigzagging blob.
        const layout = this.computeLayeredPositions(nodes, links);
        for (const n of nodes) {
          const p = layout.get(String(n.id));
          if (p) n.pos = [p.x, p.y];
        }

        return { nodes, links, groups: [] };
      }
    }

    return undefined;
  }

  /** ComfyUI component/subgraph references use UUIDs as canvas node "type" values. */
  private static readonly UUID_TYPE_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  /**
   * Newer ComfyUI canvas exports (component/subgraph "definitions" bundles) reference reusable
   * subgraphs with a UUID node "type". This maps those UUIDs to the subgraph's human-readable
   * name so nodes surface as names instead of raw hashes.
   */
  private extractSubgraphNames(...sources: any[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const src of sources) {
      if (!src || typeof src !== 'object') continue;
      const defs = src.definitions;
      if (!defs || typeof defs !== 'object') continue;

      const list: any[] = Array.isArray(defs) ? defs : Array.isArray(defs.subgraphs) ? defs.subgraphs : [];
      for (const sub of list) {
        if (!sub || typeof sub !== 'object') continue;
        const id = sub.id != null ? String(sub.id) : '';
        const name = sub.name || sub.display_name || sub.title;
        if (id && typeof name === 'string' && name.trim()) {
          map.set(id, name.trim());
        }
      }

      if (!Array.isArray(defs)) {
        for (const [key, val] of Object.entries<any>(defs)) {
          if (!val || typeof val !== 'object' || Array.isArray(val) || key === 'subgraphs') continue;
          const name = val.name || val.display_name || val.title;
          if (typeof name === 'string' && name.trim()) {
            map.set(key, name.trim());
          }
        }
      }
    }
    return map;
  }

  /**
   * Resolves a canvas node's type label. UUID-typed nodes (component/subgraph references) are
   * translated to the subgraph's display name; unrecognized UUIDs resolve to null so they are
   * never surfaced as hashed "missing" nodes.
   */
  private resolveNodeTypeLabel(raw: any, subgraphNames: Map<string, string>): string | null {
    if (typeof raw !== 'string') return null;
    const t = raw.trim();
    if (!t) return null;
    if (WorkflowScanner.UUID_TYPE_RE.test(t)) {
      return subgraphNames.get(t) || null;
    }
    return t;
  }

  /**
   * Layered (longest-path) layout for synthesized prompt graphs. Each node gets a column
   * matching its execution depth, and same-depth nodes stack vertically so overlapping or
   * lopsided clusters never occur.
   */
  private computeLayeredPositions(
    nodes: { id: number | string }[],
    links: any[][]
  ): Map<string, { x: number; y: number }> {
    const NODE_W = 240;
    const NODE_H = 120;
    const COL_GAP = NODE_W + 160;
    const ROW_GAP = NODE_H + 190;
    const margin = 120;

    const out = new Map<string, string[]>();
    const indeg = new Map<string, number>();
    for (const n of nodes) {
      const id = String(n.id);
      out.set(id, []);
      indeg.set(id, 0);
    }

    for (const l of links) {
      if (!Array.isArray(l)) continue;
      const src = l[1];
      const dst = l[3];
      if (src == null || dst == null) continue;
      const srcId = String(src);
      const dstId = String(dst);
      if (srcId === dstId || !out.has(srcId) || !out.has(dstId)) continue;
      out.get(srcId)!.push(dstId);
      indeg.set(dstId, (indeg.get(dstId) || 0) + 1);
    }

    const level = new Map<string, number>();
    const queue: string[] = [];
    for (const n of nodes) {
      const id = String(n.id);
      if (indeg.get(id) === 0) {
        level.set(id, 0);
        queue.push(id);
      }
    }
    while (queue.length) {
      const cur = queue.shift()!;
      const cl = level.get(cur) ?? 0;
      for (const nxt of out.get(cur) || []) {
        level.set(nxt, Math.max(level.get(nxt) ?? -1, cl + 1));
        const d = indeg.get(nxt)! - 1;
        indeg.set(nxt, d);
        if (d <= 0) queue.push(nxt);
      }
    }

    let nextLevel = 0;
    for (const n of nodes) {
      const lv = level.get(String(n.id));
      if (lv != null) nextLevel = Math.max(nextLevel, lv + 1);
    }
    for (const n of nodes) {
      const id = String(n.id);
      if (!level.has(id)) level.set(id, nextLevel++);
    }

    const cols = new Map<number, number[]>();
    nodes.forEach((n, i) => {
      const lv = level.get(String(n.id)) ?? 0;
      if (!cols.has(lv)) cols.set(lv, []);
      cols.get(lv)!.push(i);
    });

    const layout = new Map<string, { x: number; y: number }>();
    for (const [lv, indices] of cols) {
      indices.forEach((nodeIdx, row) => {
        const id = String(nodes[nodeIdx].id);
        layout.set(id, { x: margin + lv * COL_GAP, y: margin + row * ROW_GAP });
      });
    }
    return layout;
  }

  extractNodeTypes(data: any): string[] {
    const types = new Set<string>();
    if (!data || typeof data !== 'object') return [];
    const normalized = this.normalizeWorkflowData(data) || data;
    const subgraphNames = this.extractSubgraphNames(normalized, normalized.workflow);

    // Format 1: UI workflow format
    const uiWorkflow = normalized.workflow ? normalized.workflow : normalized;
    if (uiWorkflow && Array.isArray(uiWorkflow.nodes)) {
      for (const node of uiWorkflow.nodes) {
        if (node && typeof node === 'object') {
          const rawType = node.type || node.class_type;
          // Subgraph/component references carry a UUID "type" pointing at a definition
          // embedded IN this workflow file (e.g. an "Easy Negative" embedding component).
          // They are self-contained, never external extensions, so they must not surface
          // as "missing node" resolution candidates.
          if (typeof rawType === 'string' && WorkflowScanner.UUID_TYPE_RE.test(rawType.trim())) continue;
          const t = this.resolveNodeTypeLabel(rawType, subgraphNames);
          if (t) types.add(t);
        }
      }
    }

    // Format 2: API prompt format
    const rootNodes = normalized.prompt ? normalized.prompt : (uiWorkflow?.nodes ? null : normalized);
    if (rootNodes && typeof rootNodes === 'object' && !Array.isArray(rootNodes)) {
      for (const node of Object.values<any>(rootNodes)) {
        if (node && typeof node === 'object') {
          const rawType = node.class_type || node.type;
          if (typeof rawType === 'string' && WorkflowScanner.UUID_TYPE_RE.test(rawType.trim())) continue;
          const t = this.resolveNodeTypeLabel(rawType, subgraphNames);
          if (t) types.add(t);
        }
      }
    }

    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }

  /** Directories that should never be traversed when looking for workflow files. */
  private static readonly EXCLUDED_DIRS = new Set([
    'node_modules', '.git', '.venv', 'venv', '__pycache__', '.cache',
    'dist', 'build', 'output', 'temp', 'tmp', '.temp', '.tmp',
    'web', 'web_custom_versions', 'tests', 'test',
    '.tox', '.mypy_cache', '.pytest_cache', '.eggs',
  ]);

  private collectWorkflowFiles(dir: string, list: string[], depth = 0) {
    if (depth > 5 || !fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (WorkflowScanner.EXCLUDED_DIRS.has(entry.name.toLowerCase())) continue;
          this.collectWorkflowFiles(fullPath, list, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.json' || ext === '.png') {
            list.push(fullPath);
          }
        }
      }
    } catch {}
  }

  extractPngWorkflow(filePath: string): any {
    try {
      const buffer = fs.readFileSync(filePath);
      return this.extractPngWorkflowFromBuffer(buffer);
    } catch (e: any) {
      logger.warn(`Error reading PNG workflow file: ${filePath}`, e);
      return null;
    }
  }

  extractPngWorkflowFromBuffer(buffer: Buffer): any {
    try {
      // Verify PNG signature: 89 50 4E 47 0D 0A 1A 0A
      if (
        buffer[0] !== 0x89 ||
        buffer[1] !== 0x50 ||
        buffer[2] !== 0x4e ||
        buffer[3] !== 0x47 ||
        buffer[4] !== 0x0d ||
        buffer[5] !== 0x0a ||
        buffer[6] !== 0x1a ||
        buffer[7] !== 0x0a
      ) {
        return null;
      }

      // Extraction priority: iTXt (unicode) > tEXt (latin-1) > zTXt (compressed)
      // If multiple workflow chunks exist, use the first valid JSON parse.
      let workflowData: any = null;
      let promptData: any = null;

      let offset = 8;
      const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunk limit

      while (offset < buffer.length) {
        if (offset + 8 > buffer.length) break;
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;

        if (length > MAX_CHUNK_SIZE || dataEnd > buffer.length) {
          offset = dataEnd + 4;
          continue;
        }

        if (type === 'iTXt') {
          const chunkData = buffer.slice(dataStart, dataEnd);
          const nullIdx = chunkData.indexOf(0);
          if (nullIdx > 0) {
            const key = chunkData.slice(0, nullIdx).toString('utf-8');
            const compFlag = chunkData[nullIdx + 1];
            // Skip compMethod, langTag, transKey null separators
            let textOffset = nullIdx + 3;
            while (textOffset < chunkData.length && chunkData[textOffset] !== 0) textOffset++;
            textOffset++;
            while (textOffset < chunkData.length && chunkData[textOffset] !== 0) textOffset++;
            textOffset++;

            const textBuffer = chunkData.slice(textOffset);
            let uncompressedText = '';
            if (compFlag === 1) {
              try {
                uncompressedText = zlib.inflateSync(textBuffer, { maxOutputLength: 20 * 1024 * 1024 }).toString('utf-8');
              } catch {}
            } else {
              uncompressedText = textBuffer.toString('utf-8');
            }

            if (uncompressedText) {
              try {
                if (key === 'workflow' && !workflowData) {
                  workflowData = JSON.parse(uncompressedText);
                } else if (key === 'prompt' && !promptData) {
                  promptData = JSON.parse(uncompressedText);
                }
              } catch {}
            }
          }
        } else if (type === 'tEXt') {
          const chunkData = buffer.slice(dataStart, dataEnd);
          const nullIdx = chunkData.indexOf(0);
          if (nullIdx > 0) {
            const key = chunkData.slice(0, nullIdx).toString('latin1');
            const val = chunkData.slice(nullIdx + 1).toString('utf-8');
            try {
              if (key === 'workflow' && !workflowData) {
                workflowData = JSON.parse(val);
              } else if (key === 'prompt' && !promptData) {
                promptData = JSON.parse(val);
              }
            } catch {}
          }
        } else if (type === 'zTXt') {
          const chunkData = buffer.slice(dataStart, dataEnd);
          const nullIdx = chunkData.indexOf(0);
          if (nullIdx > 0 && nullIdx + 2 < chunkData.length) {
            const key = chunkData.slice(0, nullIdx).toString('latin1');
            const compMethod = chunkData[nullIdx + 1];
            if (compMethod === 0) {
              try {
                const decompressed = zlib.inflateSync(chunkData.slice(nullIdx + 2), {
                  maxOutputLength: 20 * 1024 * 1024,
                }).toString('utf-8');
                if (key === 'workflow' && !workflowData) {
                  workflowData = JSON.parse(decompressed);
                } else if (key === 'prompt' && !promptData) {
                  promptData = JSON.parse(decompressed);
                }
              } catch {}
            }
          }
        }

        offset = dataEnd + 4; // Skip 4-byte CRC
      }

      if (workflowData && promptData) {
        return { ...workflowData, workflow: workflowData, prompt: promptData };
      }
      if (workflowData) return workflowData;
      if (promptData) return promptData;
    } catch (e) {
      logger.warn('Error parsing PNG chunks for workflow buffer', e);
    }
    return null;
  }

  /**
   * Parse a dropped workflow file (.json or .png) directly from the filesystem.
   *
   * SECURITY: Magic byte verification MUST occur before any parsing
   * to prevent execution of disguised binaries (ELF/PE/mach-o).
   * See: https://en.wikipedia.org/wiki/File_signature
   */
  async parseDroppedFile(filePath: string): Promise<WorkflowParseResult> {
    if (!filePath || typeof filePath !== 'string') {
      const err = new Error('File path must be a non-empty string');
      (err as any).code = 'INVALID_ARGUMENT';
      throw err;
    }

    if (!fs.existsSync(filePath)) {
      const err = new Error(`File not found: ${filePath}`);
      (err as any).code = 'FILE_NOT_FOUND';
      throw err;
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      const err = new Error(`Target path is not a file: ${filePath}`);
      (err as any).code = 'NOT_A_FILE';
      throw err;
    }

    // Size limit: 50MB max file size
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (stat.size > MAX_FILE_SIZE) {
      const err = new Error(`File exceeds maximum allowed size of 50MB (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
      (err as any).code = 'FILE_TOO_LARGE';
      throw err;
    }

    // Read first 16 bytes for magic byte verification
    const fd = fs.openSync(filePath, 'r');
    const headerBuffer = Buffer.alloc(Math.min(16, stat.size));
    fs.readSync(fd, headerBuffer, 0, headerBuffer.length, 0);
    fs.closeSync(fd);

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const isPngMagic =
      headerBuffer.length >= 8 &&
      headerBuffer[0] === 0x89 &&
      headerBuffer[1] === 0x50 &&
      headerBuffer[2] === 0x4e &&
      headerBuffer[3] === 0x47 &&
      headerBuffer[4] === 0x0d &&
      headerBuffer[5] === 0x0a &&
      headerBuffer[6] === 0x1a &&
      headerBuffer[7] === 0x0a;

    // Check for JSON magic: non-whitespace/BOM start with '{' (0x7B) or '[' (0x5B)
    let isJsonMagic = false;
    let startIdx = 0;
    // Skip UTF-8 BOM if present
    if (headerBuffer.length >= 3 && headerBuffer[0] === 0xef && headerBuffer[1] === 0xbb && headerBuffer[2] === 0xbf) {
      startIdx = 3;
    }
    while (startIdx < headerBuffer.length) {
      const b = headerBuffer[startIdx];
      // Skip whitespace: space (0x20), tab (0x09), LF (0x0A), CR (0x0D)
      if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
        startIdx++;
        continue;
      }
      if (b === 0x7b || b === 0x5b) {
        isJsonMagic = true;
      }
      break;
    }

    if (!isPngMagic && !isJsonMagic) {
      const err = new Error(
        'Invalid file format: Magic number check failed. Dropped file is neither a valid PNG image nor a valid JSON document.'
      );
      (err as any).code = 'INVALID_MAGIC_BYTES';
      throw err;
    }

    const fileName = path.basename(filePath);
    let parsedWorkflowInfo: WorkflowInfo;

    if (isPngMagic) {
      const fileBuffer = fs.readFileSync(filePath);
      const extracted = this.extractPngWorkflowFromBuffer(fileBuffer);
      if (!extracted) {
        const err = new Error(`No ComfyUI workflow metadata found embedded in PNG file "${fileName}".`);
        (err as any).code = 'CORRUPT_METADATA';
        throw err;
      }
      parsedWorkflowInfo = await this.parseWorkflow(extracted, fileName);
    } else {
      const rawText = fs.readFileSync(filePath, 'utf-8');
      if (rawText.length > 10 * 1024 * 1024) {
        const err = new Error('JSON workflow payload exceeds 10MB text limit');
        (err as any).code = 'FILE_TOO_LARGE';
        throw err;
      }
      let parsedJson: any;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (e: any) {
        const err = new Error(`Malformed JSON in "${fileName}": ${e.message}`);
        (err as any).code = 'CORRUPT_METADATA';
        throw err;
      }
      parsedWorkflowInfo = await this.parseWorkflow(parsedJson, fileName);
    }

    return {
      filePath,
      fileName,
      fileType: isPngMagic ? 'png' : 'json',
      fileSize: stat.size,
      workflow: parsedWorkflowInfo.rawGraph,
      nodes: parsedWorkflowInfo.nodeTypes || [],
      models: parsedWorkflowInfo.models || [],
      metadata: parsedWorkflowInfo.rawGraph?.extra || parsedWorkflowInfo.rawGraph?.config || {},
      canvasGraph: parsedWorkflowInfo.canvasGraph,
      modelCount: parsedWorkflowInfo.modelCount || 0,
      workflowFormat: parsedWorkflowInfo.workflowFormat,
    };
  }

  /**
   * Save / archive a workflow directly into the configured ComfyUI user workflows directory.
   *
   * Atomic write prevents partial/corrupted files on crash or power loss.
   * Write to temp file in same filesystem, then rename (atomic operation).
   * Temp file prefix includes random nonce to prevent collision.
   *
   * @param targetName - Sanitized name without extension (alphanumeric, spaces, underscores, hyphens)
   * @param workflowData - The parsed workflow graph object
   * @param overwrite - If true, overwrite existing workflow with same name
   * @param customComfyDir - Optional explicit ComfyUI installation directory (verified in main)
   */
  async archiveWorkflow(
    targetName: string,
    workflowData: any,
    overwrite = false,
    customComfyDir?: string
  ): Promise<{ success: boolean; filePath?: string; fileName?: string; error?: string; code?: WorkflowImportErrorCode }> {
    try {
      if (!targetName || typeof targetName !== 'string') {
        return { success: false, error: 'Target workflow name must be a non-empty string', code: 'PATH_TRAVERSAL' };
      }

      // Security: Validate target name strictly against alphanumeric, hyphens, underscores, spaces
      const SAFE_NAME_RE = /^[a-zA-Z0-9_\- ]+$/;
      const trimmedName = targetName.trim();
      if (!SAFE_NAME_RE.test(trimmedName) || trimmedName.length === 0 || trimmedName.length > 200) {
        return {
          success: false,
          error: 'Invalid workflow name. Only alphanumeric characters, spaces, hyphens, and underscores are allowed (no path separators or special characters).',
          code: 'PATH_TRAVERSAL',
        };
      }

      // Prevent null byte injection or traversal sequences
      if (trimmedName.includes('\0') || trimmedName.includes('/') || trimmedName.includes('\\') || trimmedName.includes('..')) {
        return { success: false, error: 'Path traversal or null byte detected in workflow name', code: 'PATH_TRAVERSAL' };
      }

      // Determine ComfyUI directory from config or argument
      let comfyDir = customComfyDir;
      if (!comfyDir) {
        try {
          if (!(dbManager as any).db) {
            await dbManager.init().catch(() => {});
          }
          const row: any = await dbManager.get("SELECT value FROM config WHERE key = 'comfyui_install_dir';");
          if (row?.value) {
            comfyDir = row.value;
          }
        } catch {}
      }

      let targetDir = '';
      if (comfyDir && fs.existsSync(comfyDir)) {
        const modernUserWf = path.join(comfyDir, 'user', 'default', 'workflows');
        const rootWf = path.join(comfyDir, 'workflows');
        if (fs.existsSync(modernUserWf)) {
          targetDir = modernUserWf;
        } else if (fs.existsSync(rootWf)) {
          targetDir = rootWf;
        } else {
          fs.mkdirSync(modernUserWf, { recursive: true });
          targetDir = modernUserWf;
        }
      }

      if (!targetDir) {
        return {
          success: false,
          error: 'No ComfyUI installation directory configured or found. Set ComfyUI path in Settings before archiving workflows.',
          code: 'NO_COMFY_DIR',
        };
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const cleanFileName = `${trimmedName}.json`;
      const resolvedTargetDir = path.resolve(targetDir);
      const resolvedPath = path.resolve(resolvedTargetDir, cleanFileName);

      // Confinement check: verify resolved path is strictly inside allowed targetDir
      if (!resolvedPath.startsWith(resolvedTargetDir + path.sep) && resolvedPath !== resolvedTargetDir) {
        return {
          success: false,
          error: 'Path traversal attempt rejected. Workflow path must remain strictly within ComfyUI workflows folder.',
          code: 'PATH_TRAVERSAL',
        };
      }

      // Collision check: case-insensitive check against existing files in directory
      if (fs.existsSync(resolvedTargetDir)) {
        const existingFiles = fs.readdirSync(resolvedTargetDir);
        const collision = existingFiles.find((f) => f.toLowerCase() === cleanFileName.toLowerCase());
        if (collision && !overwrite) {
          return {
            success: false,
            error: `A workflow named "${collision}" already exists in the ComfyUI workflows folder.`,
            fileName: collision,
            filePath: path.join(resolvedTargetDir, collision),
            code: 'FILE_EXISTS',
          };
        }
      }

      // Prepare payload to write
      const normalized = this.normalizeWorkflowData(workflowData) || workflowData;
      const jsonContent = JSON.stringify(normalized, null, 2);

      // Atomic write: write to temp file in same directory first, then atomic rename
      const nonce = Math.random().toString(36).substring(2, 8);
      const tempPath = path.join(resolvedTargetDir, `.tmp_${Date.now()}_${nonce}.json`);

      fs.writeFileSync(tempPath, jsonContent, { encoding: 'utf-8', mode: 0o644 });
      fs.renameSync(tempPath, resolvedPath);

      logger.info(`[WorkflowScanner] Successfully archived workflow to: ${resolvedPath}`);
      return {
        success: true,
        filePath: resolvedPath,
        fileName: cleanFileName,
      };
    } catch (err: any) {
      logger.error('Failed to archive workflow:', err);
      return {
        success: false,
        error: `Failed to archive workflow: ${err?.message || err}`,
        code: (err as any)?.code || 'CORRUPT_METADATA',
      };
    }
  }

  extractModelReferences(data: any, localModelMap: Map<string, string>): WorkflowModelReference[] {
    const refs: WorkflowModelReference[] = [];
    const seen = new Set<string>();
    const normalized = this.normalizeWorkflowData(data) || data;

    const checkAndAdd = (nodeId: string, nodeType: string, inputName: string, modelName: any) => {
      if (!modelName || typeof modelName !== 'string') return;
      const cleanName = path.basename(modelName.trim());
      if (
        !cleanName ||
        cleanName === 'None' ||
        cleanName === 'undefined' ||
        cleanName === 'null' ||
        cleanName.startsWith('http://') ||
        cleanName.startsWith('https://')
      ) {
        return;
      }

      const lowerName = cleanName.toLowerCase();
      const isKnownModelExt =
        lowerName.endsWith('.safetensors') ||
        lowerName.endsWith('.ckpt') ||
        lowerName.endsWith('.pt') ||
        lowerName.endsWith('.pth') ||
        lowerName.endsWith('.gguf') ||
        lowerName.endsWith('.bin') ||
        lowerName.endsWith('.onnx');

      // STRICT: only values carrying an approved, generation-related file extension are
      // treated as model references. Widget values such as switches/modes ("off", "on",
      // "simple", ...) are never models, regardless of the node type or input name.
      if (!isKnownModelExt) {
        return;
      }

      const key = `${nodeType}:${inputName}:${cleanName.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);

      const localPath = localModelMap.get(cleanName.toLowerCase());
      refs.push({
        nodeId: String(nodeId),
        nodeType,
        inputName,
        modelName: cleanName,
        isInstalled: !!localPath,
        localPath,
      });
    };

    // 1. UI workflow format { "nodes": [ ... ] } — only widget VALUES carrying a model
    //    filename are scanned. Node input/output socket sections are never scanned, since
    //    they describe connections, not model data.
    const uiWorkflow = normalized.workflow ? normalized.workflow : normalized;
    if (uiWorkflow && Array.isArray(uiWorkflow.nodes)) {
      for (const node of uiWorkflow.nodes) {
        if (!node) continue;
        const nodeId = node.id || 'node';
        const nodeType = node.type || node.class_type || 'Node';
        const widgets = node.widgets_values;

        if (Array.isArray(widgets)) {
          for (let i = 0; i < widgets.length; i++) {
            const w = widgets[i];
            if (typeof w === 'string') {
              checkAndAdd(String(nodeId), nodeType, `widget_${i}`, w);
            }
          }
        } else if (widgets && typeof widgets === 'object') {
          for (const [k, v] of Object.entries(widgets)) {
            if (typeof v === 'string') {
              checkAndAdd(String(nodeId), nodeType, k, v);
            }
          }
        }
      }
    }

    // 2. API prompt format { "1": { "class_type": "...", "inputs": { ... } } }
    const rootNodes = normalized.prompt ? normalized.prompt : (uiWorkflow?.nodes ? null : normalized);
    if (rootNodes && typeof rootNodes === 'object' && !Array.isArray(rootNodes)) {
      for (const [nodeId, node] of Object.entries<any>(rootNodes)) {
        if (!node || typeof node !== 'object') continue;
        const classType = node.class_type || node.type || '';
        const inputs = node.inputs || {};

        for (const [inputKey, val] of Object.entries(inputs)) {
          if (typeof val === 'string') {
            checkAndAdd(nodeId, classType || 'Loader', inputKey, val);
          }
        }
      }
    }

    return refs;
  }
}

export const workflowScanner = new WorkflowScanner();
