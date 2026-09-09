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
import https from 'https';
import http from 'http';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { dbManager } from '../db/db';
import { logger } from '../utils/logger';
import {
  GitHubNodeRepo,
  NodeResolutionResult,
  NodeCloneResult,
  CustomNodePackage,
} from '../types/app';

const execFileAsync = promisify(execFile);

// URLs for ComfyUI-Manager curated node databases
const MANAGER_NODE_MAP_URL =
  'https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/extension-node-map.json';
const MANAGER_NODE_LIST_URL =
  'https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/custom-node-list.json';

const REGISTRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

// ComfyUI Official Registry (registry.comfy.org) — authoritative node-to-repo mapping
// used as a fallback when the ComfyUI-Manager community registry misses a node class.
const COMFY_REGISTRY_SEARCH_URL = 'https://api.comfy.org/nodes/search';

// Persistent node-resolution cache TTLs (SQLite). Missing results refresh sooner so
// newly-installed nodes get picked up; installed/registry results are long-lived but
// installed entries are re-validated against disk before being trusted.
const RESOLUTION_CACHE_MISSING_TTL_MS = 6 * 60 * 60 * 1000; // 6 Hours
const RESOLUTION_CACHE_INSTALLED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days

// ComfyUI built-in core node classes — static fallback used only when the ComfyUI
// install's nodes.py / comfy_extras sources cannot be read. The authoritative list is
// parsed dynamically from the install so every core node is recognized.
const CORE_NODE_FALLBACK = new Set<string>([
  'KSampler',
  'KSamplerAdvanced',
  'CheckpointLoaderSimple',
  'CheckpointLoader',
  'CheckpointLoaderSDXL',
  'VAELoader',
  'VAEDecode',
  'VAEDecodeTiled',
  'VAEEncode',
  'VAEEncodeTiled',
  'CLIPTextEncode',
  'CLIPTextEncodeSDXL',
  'CLIPLoader',
  'DualCLIPLoader',
  'TripleCLIPLoader',
  'UNETLoader',
  'DiffusionModelLoader',
  'LoraLoader',
  'LoraLoaderModelOnly',
  'ControlNetLoader',
  'ControlNetApply',
  'ControlNetApplyAdvanced',
  'EmptyLatentImage',
  'EmptyLatentImageSDXL',
  'SaveImage',
  'PreviewImage',
  'LoadImage',
  'LoadImageMask',
  'ImageToMask',
  'MaskToImage',
  'UpscaleModelLoader',
  'ImageUpscaleWithModel',
  'ImageScale',
  'ImageScaleBy',
  'LatentUpscale',
  'LatentUpscaleBy',
  'LatentComposite',
  'LatentBlend',
  'LatentFlip',
  'LatentRotate',
  'LatentCrop',
  'ConditioningCombine',
  'ConditioningAverage',
  'ConditioningConcat',
  'ConditioningSetArea',
  'ConditioningSetTimestepRange',
  'ConditioningZeroOut',
  'Reroute',
  'PrimitiveNode',
  'Note',
]);

const VALID_PYTHON_BASENAMES = new Set([
  'python',
  'python3',
  'python.exe',
  'python3.exe',
  'python3.10',
  'python3.11',
  'python3.12',
  'python3.13',
  'python3.10.exe',
  'python3.11.exe',
  'python3.12.exe',
  'python3.13.exe',
]);

/**
 * Validates that a path points to a legitimate Python binary executable.
 */
export function isValidPythonBinary(binPath: string): boolean {
  if (!binPath || typeof binPath !== 'string') return false;
  const base = path.basename(binPath).toLowerCase();
  if (!VALID_PYTHON_BASENAMES.has(base)) return false;

  if (path.isAbsolute(binPath)) {
    try {
      return fs.existsSync(binPath) && fs.statSync(binPath).isFile();
    } catch {
      return false;
    }
  }
  return true;
}

export class NodeResolverService {
  private inMemorySearchCache = new Map<string, { timestamp: number; results: GitHubNodeRepo[] }>();
  private inFlightSearches = new Map<string, Promise<GitHubNodeRepo[]>>();
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private lastRequestTimestamp = 0;
  private minIntervalMs = 750; // Respect GitHub 10 req/min unauthenticated limit
  private rateLimitCooldownUntil = 0;
  private rateLimitCooldownLoggedAt = 0;
  private readonly GITHUB_RATE_LIMIT_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes after a 403
  private coreNodeTypesCache: { key: string; nodeTypes: Set<string> } | null = null;

  /**
   * Auto-locates the exact Python binary associated with the local ComfyUI installation.
   * Handles Windows Portable (python_embeded) and Linux/macOS virtual environments.
   */
  detectPythonBinary(comfyuiDir?: string): string {
    if (!comfyuiDir || !fs.existsSync(comfyuiDir)) {
      if (process.env.VIRTUAL_ENV) {
        const venvPython = path.join(
          process.env.VIRTUAL_ENV,
          process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
        );
        if (isValidPythonBinary(venvPython)) return venvPython;
      }
      return process.platform === 'win32' ? 'python.exe' : 'python3';
    }

    const resolved = path.resolve(comfyuiDir);
    const parent = path.dirname(resolved);

    const candidates: string[] = [
      // Windows Portable python_embeded inside or adjacent
      path.join(resolved, 'python_embeded', 'python.exe'),
      path.join(parent, 'python_embeded', 'python.exe'),
      path.join(resolved, 'python', 'python.exe'),
      // Virtual environments (venv / .venv)
      path.join(resolved, 'venv', 'bin', 'python'),
      path.join(resolved, '.venv', 'bin', 'python'),
      path.join(resolved, 'venv', 'Scripts', 'python.exe'),
      path.join(resolved, '.venv', 'Scripts', 'python.exe'),
      path.join(parent, 'venv', 'bin', 'python'),
      path.join(parent, '.venv', 'bin', 'python'),
      path.join(parent, 'venv', 'Scripts', 'python.exe'),
      path.join(parent, '.venv', 'Scripts', 'python.exe'),
    ];

    for (const p of candidates) {
      if (isValidPythonBinary(p)) {
        return p;
      }
    }

    // Fallback to active virtualenv or system python
    if (process.env.VIRTUAL_ENV) {
      const venvPy = path.join(
        process.env.VIRTUAL_ENV,
        process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
      );
      if (isValidPythonBinary(venvPy)) return venvPy;
    }

    return process.platform === 'win32' ? 'python.exe' : 'python3';
  }

  /**
   * Scans local custom_nodes directory to build a catalog of installed packages,
   * detecting requirements.txt, install.py, and exporting class names from NODE_CLASS_MAPPINGS.
   */
  async inspectLocalCustomNodes(customNodesDir: string): Promise<CustomNodePackage[]> {
    if (!customNodesDir || !fs.existsSync(customNodesDir)) {
      return [];
    }

    const packages: CustomNodePackage[] = [];
    try {
      const entries = fs.readdirSync(customNodesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === '__pycache__') {
          continue;
        }

        const fullPath = path.join(customNodesDir, entry.name);
        const hasRequirements = fs.existsSync(path.join(fullPath, 'requirements.txt'));
        const hasInstallScript = fs.existsSync(path.join(fullPath, 'install.py'));
        const nodeClasses = this.extractClassMappingsFromFolder(fullPath);
        const gitRemoteUrl = this.getGitRemoteUrl(fullPath);

        packages.push({
          folderName: entry.name,
          fullPath,
          hasRequirements,
          hasInstallScript,
          nodeClasses,
          gitRemoteUrl,
        });
      }
    } catch (err) {
      logger.warn(`Error scanning custom nodes directory: ${customNodesDir}`, err);
    }

    return packages;
  }

  /**
   * Scans Python files within a custom node folder for NODE_CLASS_MAPPINGS keys.
   * Uses brace-balanced extraction so nested dicts never truncate the mapping block.
   */
  private extractClassMappingsFromFolder(folderPath: string): string[] {
    const classNames = new Set<string>();

    try {
      const files = fs.readdirSync(folderPath);
      const pyFiles = files.filter((f) => f.endsWith('.py'));

      for (const pyFile of pyFiles) {
        try {
          const content = fs.readFileSync(path.join(folderPath, pyFile), 'utf-8');
          const blocks = this.extractAssignmentBraces(content, 'NODE_CLASS_MAPPINGS');
          for (const block of blocks) {
            const keyMatches = block.matchAll(/["']([^"']+)["']\s*:/g);
            for (const m of keyMatches) {
              if (m[1]) classNames.add(m[1].trim());
            }
          }
        } catch {}
      }
    } catch {}

    return Array.from(classNames);
  }

  /**
   * Locates `name = { ... }` blocks in Python source and returns each block's inner
   * content using brace counting, skipping quoted strings. Unlike a naive [^}]+ match,
   * this tolerates nested dictionaries inside the mapping.
   */
  private extractAssignmentBraces(content: string, name: string): string[] {
    const blocks: string[] = [];
    const re = new RegExp(`\\b${name}\\s*=\\s*\\{`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      let depth = 1;
      let i = re.lastIndex;
      while (i < content.length && depth > 0) {
        const ch = content[i];
        if (ch === "'" || ch === '"') {
          const quote = ch;
          i++;
          while (i < content.length && content[i] !== quote) {
            if (content[i] === '\\') i++;
            i++;
          }
          i++;
          continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      if (depth === 0) {
        blocks.push(content.slice(re.lastIndex, i - 1));
      }
    }
    return blocks;
  }

  /**
   * Reads .git/config to determine the repository remote origin URL if present.
   */
  private getGitRemoteUrl(folderPath: string): string | undefined {
    try {
      const gitConfigPath = path.join(folderPath, '.git', 'config');
      if (fs.existsSync(gitConfigPath)) {
        const content = fs.readFileSync(gitConfigPath, 'utf-8');
        const match = content.match(/url\s*=\s*(https?:\/\/[^\s]+|git@[^\s]+)/);
        if (match && match[1]) {
          return match[1].replace(/\.git$/, '');
        }
      }
    } catch {}
    return undefined;
  }

  /**
   * The ComfyUI-Manager extension-node-map.json is keyed by **repository URL**, not node
   * class name: `{ "<repo-url>": [[ "NodeClassA", "NodeClassB", ... ], { "title_aux": "PackName" }] }`.
   * Building a reverse index (className -> pack) lets resolveMissingNode answer "which
   * extension supplies this node?" so missing-node cards can lead with the pack name.
   */
  private buildNodeReverseMap(
    nodeMap: Record<string, [string[], { title_aux?: string; author?: string }]>
  ): Map<string, { gitUrl: string; title_aux?: string; author?: string }> {
    const reverse = new Map<string, { gitUrl: string; title_aux?: string; author?: string }>();
    for (const [gitUrl, entry] of Object.entries(nodeMap)) {
      const classes = Array.isArray(entry) && Array.isArray(entry[0]) ? entry[0] : [];
      const meta = Array.isArray(entry) && entry[1] ? entry[1] : {};
      for (const cls of classes) {
        if (typeof cls !== 'string' || !cls.trim()) continue;
        const key = cls.trim().toLowerCase();
        // First occurrence wins; later (duplicate) class registrations are ignored.
        if (!reverse.has(key)) {
          reverse.set(key, { gitUrl, title_aux: meta.title_aux, author: meta.author });
        }
      }
    }
    return reverse;
  }

  /**
   * Fetches and caches the ComfyUI-Manager node registry with SQLite ETag and 24h TTL,
   * returning both the raw URL-keyed map and a class-name reverse index.
   */
  async getManagerRegistry(): Promise<{
    nodeMap: Record<string, [string[], { title_aux?: string; author?: string }]>;
    reverseMap: Map<string, { gitUrl: string; title_aux?: string; author?: string }>;
    customNodeList: any[];
  }> {
    let cachedMap: any = null;
    let cachedList: any = null;

    try {
      const mapRow: any = await dbManager.get(
        "SELECT value FROM app_config WHERE key = 'manager_node_map_cache';"
      );
      const metaRow: any = await dbManager.get(
        "SELECT value FROM app_config WHERE key = 'manager_node_map_meta';"
      );

      if (mapRow?.value && metaRow?.value) {
        const meta = JSON.parse(metaRow.value);
        if (Date.now() - (meta.timestamp || 0) < REGISTRY_CACHE_TTL_MS) {
          cachedMap = JSON.parse(mapRow.value);
        }
      }
    } catch (e) {
      logger.warn('Error reading cached manager node map from SQLite:', e);
    }

    if (cachedMap) {
      return {
        nodeMap: cachedMap,
        reverseMap: this.buildNodeReverseMap(cachedMap),
        customNodeList: cachedList || [],
      };
    }

    // Download fresh registry JSON with fallback
    try {
      const fetchedMap = await this.fetchJsonWithETag(MANAGER_NODE_MAP_URL, 'manager_node_map');
      if (fetchedMap) {
        cachedMap = fetchedMap;
        await dbManager.run(
          "INSERT OR REPLACE INTO app_config (key, value) VALUES ('manager_node_map_cache', ?);",
          [JSON.stringify(fetchedMap)]
        );
        await dbManager.run(
          "INSERT OR REPLACE INTO app_config (key, value) VALUES ('manager_node_map_meta', ?);",
          [JSON.stringify({ timestamp: Date.now() })]
        );
      }
    } catch (err) {
      logger.warn('Failed to fetch latest ComfyUI-Manager node map:', err);
    }

    return {
      nodeMap: cachedMap || {},
      reverseMap: this.buildNodeReverseMap(cachedMap || {}),
      customNodeList: [],
    };
  }

  /**
   * Queries GitHub Search API with token-bucket rate limiter, in-flight de-duplication,
   * and a 403 circuit breaker. Only commits results to the in-memory cache when the
   * search was not aborted by rate limiting, so affected nodes can retry after cooldown.
   */
  async searchGitHubNodes(query: string, limit = 3): Promise<GitHubNodeRepo[]> {
    const rawTerm = query.trim();
    if (!rawTerm) return [];

    // Circuit breaker: after a 403 rate-limit response, refuse GitHub searches for
    // the cooldown window so a single burst cannot keep tripping the unauthenticated
    // 10 req/min budget.
    if (Date.now() < this.rateLimitCooldownUntil) {
      this.logRateLimitCooldown();
      return [];
    }

    const cacheKey = rawTerm.toLowerCase();
    const cached = this.inMemorySearchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < REGISTRY_CACHE_TTL_MS) {
      return cached.results.slice(0, limit);
    }

    // De-duplicate concurrent searches for the same term into a single request chain.
    const inFlight = this.inFlightSearches.get(cacheKey);
    if (inFlight) {
      return (await inFlight).slice(0, limit);
    }

    const request = this.performGitHubSearches(rawTerm, limit).then((results) => {
      if (Date.now() >= this.rateLimitCooldownUntil) {
        this.inMemorySearchCache.set(cacheKey, { timestamp: Date.now(), results });
      }
      return results;
    });

    this.inFlightSearches.set(cacheKey, request);
    try {
      return (await request).slice(0, limit);
    } finally {
      this.inFlightSearches.delete(cacheKey);
    }
  }

  /**
   * Runs the sanitized query cascade (scoped search, then fallbacks) for a single term.
   */
  private async performGitHubSearches(rawTerm: string, limit: number): Promise<GitHubNodeRepo[]> {
    // Query Sanitization: strip common prefixes and suffixes
    const sanitized = rawTerm
      .replace(/^(ComfyUI-|Comfy_|comfyui-|comfy_)/i, '')
      .replace(/(Loader|Sampler|Node|Processor|Wrapper)$/i, '')
      .trim();

    // 1. Primary Scoped Query: topic:comfyui <term>
    let results = await this.executeGitHubSearch(`topic:comfyui ${sanitized || rawTerm}`, limit);

    // 2. Fallback Query: ComfyUI <term> in:name,description,topics
    if (results.length === 0) {
      results = await this.executeGitHubSearch(`ComfyUI ${rawTerm} in:name,description,topics`, limit);
    }

    // 3. Fallback Query: raw sanitized term
    if (results.length === 0 && sanitized && sanitized !== rawTerm) {
      results = await this.executeGitHubSearch(`ComfyUI ${sanitized} in:name,description`, limit);
    }

    return results;
  }

  private onGitHubRateLimited(): void {
    this.rateLimitCooldownUntil = Date.now() + this.GITHUB_RATE_LIMIT_COOLDOWN_MS;
    this.logRateLimitCooldown();
  }

  private logRateLimitCooldown(): void {
    const now = Date.now();
    if (now - this.rateLimitCooldownLoggedAt > 60_000) {
      this.rateLimitCooldownLoggedAt = now;
      logger.warn('GitHub Search API rate limit reached; pausing GitHub node searches until the cooldown expires.');
    }
  }

  private executeGitHubSearch(q: string, limit: number): Promise<GitHubNodeRepo[]> {
    return new Promise((resolve) => {
      if (Date.now() < this.rateLimitCooldownUntil) {
        this.logRateLimitCooldown();
        return resolve([]);
      }
      this.enqueueRateLimited(async () => {
        try {
          const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
            q
          )}&sort=stars&order=desc&per_page=${limit}`;

          const data = await this.fetchHttpJson(url, {
            headers: {
              'User-Agent': 'RenegadeCMM/1.4.2',
              Accept: 'application/vnd.github.v3+json',
            },
          });

          if (data && Array.isArray(data.items)) {
            const parsed: GitHubNodeRepo[] = data.items.map((item: any) => ({
              id: item.id,
              name: item.name,
              fullName: item.full_name,
              author: item.owner?.login || item.full_name?.split('/')[0] || '',
              htmlUrl: item.html_url,
              cloneUrl: item.clone_url || `${item.html_url}.git`,
              description: item.description || '',
              stars: item.stargazers_count || 0,
              language: item.language || 'Python',
              topics: Array.isArray(item.topics) ? item.topics : [],
              updatedAt: item.updated_at || '',
            }));
            resolve(parsed);
            return;
          }
          resolve([]);
        } catch (err: any) {
          const message = err?.message || String(err);
          if (/^HTTP 403|rate limit/i.test(message)) {
            // Trip the circuit breaker and stay quiet: every subsequent search in
            // the cooldown window would only fan the flames.
            this.onGitHubRateLimited();
          } else {
            logger.warn(`GitHub Search API error for query "${q}":`, message);
          }
          resolve([]);
        }
      });
    });
  }

  /**
   * Builds a cache key that changes whenever the ComfyUI core node sources (nodes.py
   * or any comfy_extras/*.py) are modified, so parsed results stay fresh.
   */
  private getCoreNodeCacheKey(comfyuiDir: string): string {
    try {
      const nodesPy = path.join(comfyuiDir, 'nodes.py');
      const parts = [`nodes.py:${fs.statSync(nodesPy).mtimeMs}`];
      const extrasDir = path.join(comfyuiDir, 'comfy_extras');
      if (fs.existsSync(extrasDir)) {
        const extras = fs.readdirSync(extrasDir).filter((f) => f.endsWith('.py')).sort();
        let sig = '';
        for (const f of extras) {
          try {
            sig += `${f}:${fs.statSync(path.join(extrasDir, f)).mtimeMs};`;
          } catch {}
        }
        parts.push(`comfy_extras:${sig}`);
      }
      return parts.join('|');
    } catch {
      return 'invalid';
    }
  }

  /**
   * Parses the installed ComfyUI's built-in core node classes from its base folder:
   * nodes.py plus comfy_extras/nodes_*.py (the same sources the frontend loads).
   * Results are cached per install until those files change.
   */
  private async getComfyUICoreNodeTypes(comfyuiDir?: string): Promise<Set<string>> {
    if (!comfyuiDir || !fs.existsSync(path.join(comfyuiDir, 'nodes.py'))) {
      return new Set(CORE_NODE_FALLBACK);
    }

    const cacheKey = this.getCoreNodeCacheKey(comfyuiDir);
    if (this.coreNodeTypesCache && this.coreNodeTypesCache.key === cacheKey) {
      return this.coreNodeTypesCache.nodeTypes;
    }

    const nodeTypes = new Set<string>();
    const filesToScan = [path.join(comfyuiDir, 'nodes.py')];
    const extrasDir = path.join(comfyuiDir, 'comfy_extras');
    try {
      if (fs.existsSync(extrasDir)) {
        for (const f of fs.readdirSync(extrasDir)) {
          if (f.endsWith('.py')) filesToScan.push(path.join(extrasDir, f));
        }
      }
      for (const file of filesToScan) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          for (const block of this.extractAssignmentBraces(content, 'NODE_CLASS_MAPPINGS')) {
            const keyMatches = block.matchAll(/["']([^"']+)["']\s*:/g);
            for (const m of keyMatches) {
              if (m[1]) nodeTypes.add(m[1].trim());
            }
          }
        } catch {}
      }
    } catch {}

    for (const fallback of CORE_NODE_FALLBACK) {
      if (!nodeTypes.has(fallback)) nodeTypes.add(fallback);
    }
    this.coreNodeTypesCache = { key: cacheKey, nodeTypes };
    return nodeTypes;
  }

  /**
   * Node Resolution:
   * Tier 1: Local package & NODE_CLASS_MAPPINGS inspection
   * Tier 2: ComfyUI-Manager curated database lookup
   * Tier 2.5: ComfyUI Official Registry (registry.comfy.org) fallback
   * Tier 3 (opt-in): Rate-limited GitHub Search API fallback (top 3 candidates).
   *   Tier 3 only runs when opts.searchGitHub is true — i.e. for a specifically
   *   requested node in an active workflow — never for bulk workflow scans.
   */
  async resolveMissingNode(
    nodeType: string,
    customNodesDir?: string,
    installDir?: string,
    opts?: { searchGitHub?: boolean; forceRefresh?: boolean }
  ): Promise<NodeResolutionResult> {
    const cleanType = nodeType.trim();
    const result: NodeResolutionResult = {
      nodeType: cleanType,
      isInstalled: false,
      githubCandidates: [],
    };

    if (!cleanType) return result;

    // ComfyUI built-in core nodes — parsed from <install_dir>/nodes.py + comfy_extras/*.py,
    // with a static fallback for installs whose sources can't be read. Always installed, so
    // never persisted to the SQLite cache (they're deterministic per install).
    const coreNodeTypes = await this.getComfyUICoreNodeTypes(installDir);
    if (coreNodeTypes.has(cleanType)) {
      result.isInstalled = true;
      result.installedFolder = 'ComfyUI Core (Built-in)';
      return result;
    }

    // Authoritative manual override: the user declared which installed folder supplies
    // this node (fallback for when the local scanner fails to detect a class that is
    // actually installed). Consulted before any cache or scan so the workflow stops
    // flagging the node as missing.
    const manual = await this.getManualMapping(cleanType, customNodesDir);
    if (manual) {
      result.isInstalled = true;
      result.installedFolder = manual.folder_name;
      result.installedPath = manual.folder_path || undefined;
      return result;
    }

    // Persistent cache (SQLite): previous outcomes — successful or failed — are
    // honored so that loading the same workflow again never re-attempts a node.
    // Passed only when the caller explicitly asks for a fresh (re-)search.
    if (!opts?.searchGitHub && !opts?.forceRefresh) {
      const cached = await this.getCachedResolution(cleanType, customNodesDir);
      if (cached) return cached;
    }

    // Tier 1: Local Check
    if (customNodesDir && fs.existsSync(customNodesDir)) {
      const localPackages = await this.inspectLocalCustomNodes(customNodesDir);
      for (const pkg of localPackages) {
        // Direct folder name match
        const normFolder = pkg.folderName.toLowerCase().replace(/^(comfyui-|comfy_)/i, '');
        const normType = cleanType.toLowerCase().replace(/^(comfyui-|comfy_)/i, '');

        if (
          normFolder === normType ||
          pkg.nodeClasses.some((c) => c.toLowerCase() === cleanType.toLowerCase())
        ) {
          result.isInstalled = true;
          result.installedFolder = pkg.folderName;
          result.installedPath = pkg.fullPath;
          await this.storeResolution(cleanType, result, customNodesDir);
          return result;
        }
      }
    }

    // Tier 2: ComfyUI-Manager Registry Database Check
    const { reverseMap } = await this.getManagerRegistry();
    // The registry is keyed by repo URL; reverseMap indexes it by node class (lowercased).
    const entry = reverseMap.get(cleanType.toLowerCase());
    if (entry) {
      const gitUrl = entry.gitUrl;
      const title = entry.title_aux || path.basename(gitUrl);
      result.managerMatch = {
        title,
        author: entry.author || gitUrl.split('/')[3] || 'Community',
        gitUrl,
        description: `Registered ComfyUI extension supplying [${cleanType}]`,
      };
      await this.storeResolution(cleanType, result, customNodesDir);
      return result;
    }

    // Tier 2.5: ComfyUI Official Registry (registry.comfy.org) Fallback
    // The community extension-node-map may not list every published node; the official
    // registry maintains its own node-to-repo index and is authoritative for packages
    // published through its pipeline. Query it before falling through to a broad GitHub
    // search so the missing-node card can show the correct pack name and repo link.
    const comfyRegistryMatch = await this.searchComfyRegistry(cleanType);
    if (comfyRegistryMatch) {
      result.managerMatch = comfyRegistryMatch;
      await this.storeResolution(cleanType, result, customNodesDir);
      return result;
    }

    // Tier 3: GitHub Fallback Search (Top 3 Candidates) - opt-in only
    if (opts?.searchGitHub) {
      result.queryUsed = cleanType;
      result.githubCandidates = await this.searchGitHubNodes(cleanType, 3);
    }

    // Failed attempt — persisted so the same workflow won't re-attempt this node.
    await this.storeResolution(cleanType, result, customNodesDir);
    return result;
  }

  /**
   * User-declared fallback: maps a node type to an existing folder in the custom_nodes
   * directory, permanently marking the node as installed. Used when the local scanner
   * cannot detect a class that the user knows is installed. The mapping is durable
   * (no TTL) and is consulted by resolveMissingNode before any cache or scan.
   */
  async markNodeInstalled(
    nodeType: string,
    folderName: string,
    customNodesDir?: string
  ): Promise<NodeResolutionResult> {
    const cleanType = nodeType.trim();
    const cleanFolder = folderName.trim();
    const result: NodeResolutionResult = {
      nodeType: cleanType,
      isInstalled: false,
      githubCandidates: [],
    };

    if (!cleanType || !cleanFolder || !customNodesDir) {
      return result;
    }

    const folderPath = path.join(customNodesDir, cleanFolder);
    // Refuse the override if the folder no longer exists on disk.
    if (!fs.existsSync(folderPath)) {
      return result;
    }

    try {
      await dbManager.run(
        `INSERT OR REPLACE INTO manual_node_mappings
          (node_type, custom_nodes_dir, folder_name, folder_path, created_at)
        VALUES (?, ?, ?, ?, ?);`,
        [cleanType, customNodesDir, cleanFolder, folderPath, Date.now()]
      );
      result.isInstalled = true;
      result.installedFolder = cleanFolder;
      result.installedPath = folderPath;
      // Refresh the fast-path resolution cache so both reads agree with the override.
      await this.storeResolution(cleanType, result, customNodesDir);
    } catch (err) {
      logger.warn(`Failed to persist manual node mapping [${cleanType}] -> ${cleanFolder}:`, err);
    }
    return result;
  }

  /**
   * Reads a durable user-declared mapping (node_type -> folder), if any. Stale mappings
   * whose folder has disappeared are dropped so a genuinely missing node is not hidden
   * forever by an obsolete override.
   */
  private async getManualMapping(
    nodeType: string,
    customNodesDir?: string
  ): Promise<{ folder_name: string; folder_path: string | null } | null> {
    try {
      const row: any = await dbManager.get(
        'SELECT folder_name, folder_path FROM manual_node_mappings WHERE node_type = ? AND custom_nodes_dir = ?;',
        [nodeType, customNodesDir || '']
      );
      if (!row?.folder_name) return null;

      if (customNodesDir && !fs.existsSync(path.join(customNodesDir, row.folder_name))) {
        await dbManager.run(
          'DELETE FROM manual_node_mappings WHERE node_type = ? AND custom_nodes_dir = ?;',
          [nodeType, customNodesDir || '']
        );
        return null;
      }
      return { folder_name: row.folder_name, folder_path: row.folder_path || null };
    } catch {
      return null;
    }
  }

  /**
   * Reads a persisted resolution outcome for a node type from SQLite.
   * Returns null when the entry is missing, stale, or no longer valid on disk.
   */
  private async getCachedResolution(
    nodeType: string,
    customNodesDir?: string
  ): Promise<NodeResolutionResult | null> {
    try {
      const row: any = await dbManager.get(
        'SELECT * FROM node_resolution_cache WHERE node_type = ? AND custom_nodes_dir = ?;',
        [nodeType, customNodesDir || '']
      );
      if (!row?.status) return null;

      const age = Date.now() - (row.updated_at || 0);
      const ttl = row.status === 'missing' ? RESOLUTION_CACHE_MISSING_TTL_MS : RESOLUTION_CACHE_INSTALLED_TTL_MS;
      if (age > ttl) return null;

      // Installed entries are only trusted while the folder still exists on disk.
      if (row.status === 'installed') {
        const exists =
          (row.installed_path && fs.existsSync(row.installed_path)) ||
          (row.installed_folder &&
            customNodesDir &&
            fs.existsSync(path.join(customNodesDir, row.installed_folder)));
        if (!exists) return null;
      }

      const result: NodeResolutionResult = {
        nodeType,
        isInstalled: row.status === 'installed',
        githubCandidates: [],
      };
      if (row.status === 'installed') {
        result.isInstalled = true;
        if (row.installed_folder) result.installedFolder = row.installed_folder;
        if (row.installed_path) result.installedPath = row.installed_path;
      } else if (row.status === 'registry' && row.manager_json) {
        try {
          result.managerMatch = JSON.parse(row.manager_json);
        } catch {}
      }
      if (row.github_candidates_json) {
        try {
          result.githubCandidates = JSON.parse(row.github_candidates_json) || [];
        } catch {}
      }
      if (row.query_used) result.queryUsed = row.query_used;
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Persists a resolution outcome — successful or failed — into the SQLite cache.
   */
  private async storeResolution(
    nodeType: string,
    result: NodeResolutionResult,
    customNodesDir?: string
  ): Promise<void> {
    try {
      const status = result.isInstalled ? 'installed' : result.managerMatch ? 'registry' : 'missing';
      await dbManager.run(
        `INSERT OR REPLACE INTO node_resolution_cache
          (node_type, custom_nodes_dir, status, installed_folder, installed_path, manager_json, github_candidates_json, query_used, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          result.nodeType,
          customNodesDir || '',
          status,
          result.installedFolder || null,
          result.installedPath || null,
          result.managerMatch ? JSON.stringify(result.managerMatch) : null,
          result.githubCandidates && result.githubCandidates.length > 0
            ? JSON.stringify(result.githubCandidates)
            : null,
          result.queryUsed || null,
          Date.now(),
        ]
      );
    } catch (err) {
      logger.debug('Failed to persist node resolution cache:', err);
    }
  }

  /**
   * Clears cached outcomes for any node type supplied by a freshly installed folder,
   * so the next resolution pass detects it instead of serving a stale "missing".
   */
  private async invalidateResolutionCacheForFolder(folderPath: string): Promise<void> {
    try {
      const folderName = path.basename(folderPath);
      const nodeTypes = this.extractClassMappingsFromFolder(folderPath);
      const conditions: string[] = [];
      const binds: any[] = [];
      if (nodeTypes.length > 0) {
        conditions.push(`node_type IN (${nodeTypes.map(() => '?').join(',')})`);
        binds.push(...nodeTypes);
      }
      // Also drop any entry previously recorded as resolved from this exact folder.
      conditions.push('installed_folder = ?');
      binds.push(folderName);
      await dbManager.run(
        `DELETE FROM node_resolution_cache WHERE ${conditions.join(' OR ')}`,
        binds
      );
    } catch {}
  }

  /**
   * Clones a custom node repository into <custom_nodes_dir> and detects requirements.txt / install.py
   */
  async cloneCustomNode(
    gitUrl: string,
    customNodesDir: string,
    comfyuiDir?: string,
    customFolderName?: string
  ): Promise<NodeCloneResult> {
    if (!gitUrl || !customNodesDir) {
      return {
        success: false,
        folderName: '',
        targetPath: '',
        hasRequirements: false,
        hasInstallScript: false,
        error: 'Missing git URL or custom_nodes directory',
      };
    }

    const resolvedNodesDir = path.resolve(customNodesDir);
    if (!fs.existsSync(resolvedNodesDir)) {
      fs.mkdirSync(resolvedNodesDir, { recursive: true });
    }

    const trimmedUrl = (gitUrl || '').trim();
    // Validate gitUrl strictly against allowed Git/HTTPS URL formats
    const isHttpsGit = /^https?:\/\/[a-zA-Z0-9][-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/i.test(trimmedUrl);
    const isSshGit = /^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+(\.git)?$/i.test(trimmedUrl);

    if (!isHttpsGit && !isSshGit) {
      return {
        success: false,
        folderName: '',
        targetPath: '',
        hasRequirements: false,
        hasInstallScript: false,
        error: 'Invalid or unsupported Git URL format',
      };
    }

    let folderName = (customFolderName || '').trim();
    if (!folderName) {
      folderName = path.basename(trimmedUrl).replace(/\.git$/i, '');
    }
    // Sanitize folder name to prevent path traversal or flag injection
    folderName = folderName.replace(/[\x00-\x1f\x7f/\\?%*:|"<>]/g, '_').trim();
    if (folderName === '.' || folderName === '..' || folderName.replace(/\./g, '') === '') {
      folderName = 'custom_node';
    }
    if (folderName.startsWith('-')) {
      folderName = '_' + folderName.substring(1);
    }
    if (!folderName) {
      folderName = 'custom_node';
    }

    const targetPath = path.resolve(path.join(resolvedNodesDir, folderName));

    // Ensure targetPath stays strictly inside resolvedNodesDir
    const relFromNodesDir = path.relative(resolvedNodesDir, targetPath);
    if (relFromNodesDir.startsWith('..') || path.isAbsolute(relFromNodesDir) || relFromNodesDir === '') {
      return {
        success: false,
        folderName,
        targetPath,
        hasRequirements: false,
        hasInstallScript: false,
        error: 'Target path resolves outside custom_nodes directory',
      };
    }

    if (fs.existsSync(targetPath)) {
      const hasRequirements = fs.existsSync(path.join(targetPath, 'requirements.txt'));
      const hasInstallScript = fs.existsSync(path.join(targetPath, 'install.py'));
      const detectedPythonPath = this.detectPythonBinary(comfyuiDir);

      // Drop stale "missing" cache entries that this folder may now satisfy.
      await this.invalidateResolutionCacheForFolder(targetPath);

      return {
        success: true,
        folderName,
        targetPath,
        hasRequirements,
        hasInstallScript,
        detectedPythonPath,
      };
    }

    try {
      logger.info(`Cloning custom node [${folderName}] from: ${trimmedUrl}`);
      // Use '--' positional separator to prevent command argument/flag injection
      await execFileAsync('git', ['clone', '--depth', '1', '--', trimmedUrl, targetPath]);

      const hasRequirements = fs.existsSync(path.join(targetPath, 'requirements.txt'));
      const hasInstallScript = fs.existsSync(path.join(targetPath, 'install.py'));
      const detectedPythonPath = this.detectPythonBinary(comfyuiDir);

      logger.info(`Successfully cloned custom node [${folderName}]. Dependencies: requirements=${hasRequirements}, installScript=${hasInstallScript}`);

      // Drop stale "missing" cache entries that this new folder may now satisfy.
      await this.invalidateResolutionCacheForFolder(targetPath);

      return {
        success: true,
        folderName,
        targetPath,
        hasRequirements,
        hasInstallScript,
        detectedPythonPath,
      };
    } catch (err: any) {
      logger.error(`Failed to clone custom node from ${trimmedUrl}:`, err);
      return {
        success: false,
        folderName,
        targetPath,
        hasRequirements: false,
        hasInstallScript: false,
        error: err?.message || 'Git clone failed',
      };
    }
  }

  /**
   * Executes a Python script or module safely using a hardcoded command literal
   * with the ComfyUI Python directory prepended to the environment PATH.
   */
  private async executePython(
    args: string[],
    cwd: string,
    comfyuiDir?: string
  ): Promise<{ stdout: string; stderr: string }> {
    const detectedPython = this.detectPythonBinary(comfyuiDir);
    const pythonDir = path.isAbsolute(detectedPython) ? path.dirname(detectedPython) : '';

    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const currentPath = process.env[pathKey] || process.env.PATH || '';
    const updatedPath = pythonDir ? `${pythonDir}${path.delimiter}${currentPath}` : currentPath;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: updatedPath,
      Path: updatedPath,
    };

    if (process.platform === 'win32') {
      return await execFileAsync('python.exe', args, { cwd, env });
    } else {
      return await execFileAsync('python3', args, { cwd, env });
    }
  }

  /**
   * Installs Python dependencies using the targeted ComfyUI Python binary.
   */
  async installNodeDependencies(
    nodeFolderPath: string,
    comfyuiDir?: string
  ): Promise<{ success: boolean; output: string; error?: string }> {
    if (!nodeFolderPath) {
      return { success: false, output: '', error: 'Target directory not provided' };
    }

    const resolvedFolder = path.resolve(nodeFolderPath);
    if (!fs.existsSync(resolvedFolder)) {
      return { success: false, output: '', error: 'Target directory not found' };
    }

    const reqPath = path.join(resolvedFolder, 'requirements.txt');
    const installPyPath = path.join(resolvedFolder, 'install.py');

    let outputLog = '';

    try {
      if (fs.existsSync(reqPath)) {
        logger.info(`Installing requirements in ${resolvedFolder}...`);
        const { stdout, stderr } = await this.executePython(
          ['-m', 'pip', 'install', '-r', 'requirements.txt'],
          resolvedFolder,
          comfyuiDir
        );
        outputLog += (stdout || '') + '\n' + (stderr || '');
      }

      if (fs.existsSync(installPyPath)) {
        logger.info(`Executing install.py in ${resolvedFolder}...`);
        const { stdout, stderr } = await this.executePython(
          ['install.py'],
          resolvedFolder,
          comfyuiDir
        );
        outputLog += (stdout || '') + '\n' + (stderr || '');
      }

      return { success: true, output: outputLog };
    } catch (err: any) {
      logger.error(`Error installing dependencies in ${resolvedFolder}:`, err);
      return { success: false, output: outputLog, error: err?.message || 'Installation failed' };
    }
  }

  private enqueueRateLimited(task: () => Promise<void>): void {
    this.requestQueue.push(task);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRequestTimestamp;
      if (elapsed < this.minIntervalMs) {
        await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
      }

      const task = this.requestQueue.shift();
      if (task) {
        this.lastRequestTimestamp = Date.now();
        await task().catch(() => {});
      }
    }

    this.isProcessingQueue = false;
  }

  private fetchHttpJson(urlStr: string, options: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlStr);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.get(urlStr, options, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }

        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : null);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(8000, () => {
        req.destroy(new Error('Request timeout'));
      });
    });
  }

  /**
   * Simple HTTPS GET returning the response body as a string, or null on any error.
   */
  private httpGet(urlStr: string): Promise<string | null> {
    return new Promise((resolve) => {
      https
        .get(urlStr, { headers: { 'User-Agent': 'RenegadeCMM/1.4.2' } }, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(null);
          }
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(body));
        })
        .on('error', () => resolve(null));
    });
  }

  /**
   * Queries the ComfyUI Official Registry (registry.comfy.org) for a node class name
   * and returns the hosting extension's repo URL, display name, and author when found.
   * Results are cached in SQLite with a 24h TTL; negative (not-found) results are also
   * cached so the same workflow won't re-query the API every load.
   */
  private async searchComfyRegistry(
    nodeType: string
  ): Promise<{ title: string; author: string; gitUrl: string; description: string } | null> {
    const cleanType = nodeType.trim();
    if (!cleanType) return null;

    const cacheKey = `comfy_registry_cache_${cleanType.toLowerCase()}`;
    const metaKey = `comfy_registry_meta_${cleanType.toLowerCase()}`;

    // Check cache (24h TTL; negative results cached as null)
    try {
      const row: any = await dbManager.get(
        'SELECT value FROM app_config WHERE key = ?;',
        [cacheKey]
      );
      const metaRow: any = await dbManager.get(
        'SELECT value FROM app_config WHERE key = ?;',
        [metaKey]
      );
      if (row?.value && metaRow?.value) {
        const meta = JSON.parse(metaRow.value);
        if (Date.now() - (meta.timestamp || 0) < REGISTRY_CACHE_TTL_MS) {
          const cached = JSON.parse(row.value);
          return cached; // null = negative cache
        }
      }
    } catch {}

    // Query the official ComfyUI Registry
    const url = `${COMFY_REGISTRY_SEARCH_URL}?comfy_node_search=${encodeURIComponent(cleanType)}&limit=5`;
    try {
      const body = await this.httpGet(url);
      if (!body) {
        await this.cacheComfyRegistryResult(cacheKey, metaKey, null);
        return null;
      }

      const data = JSON.parse(body);
      const nodes = data?.nodes;
      if (!Array.isArray(nodes) || nodes.length === 0) {
        await this.cacheComfyRegistryResult(cacheKey, metaKey, null);
        return null;
      }

      // Find best match: prefer an exact comfy_node_names hit, then a name match.
      const lower = cleanType.toLowerCase();
      let best: any = null;
      for (const n of nodes) {
        const names: string[] = Array.isArray(n.names) ? n.names : [];
        if (names.some((nm) => nm.toLowerCase() === lower)) {
          best = n;
          break;
        }
      }
      if (!best) {
        best = nodes.find((n: any) => n.name?.toLowerCase() === lower);
      }
      if (!best) {
        // Fallback: first Active-status node
        best = nodes.find((n: any) => n.status === 'NodeStatusActive') || nodes[0];
      }

      if (!best?.repository) {
        await this.cacheComfyRegistryResult(cacheKey, metaKey, null);
        return null;
      }

      const result = {
        title: best.name || path.basename(best.repository),
        author: best.author || best.publisher?.id || 'Community',
        gitUrl: best.repository,
        description: best.description || `ComfyUI Official Registry entry for [${cleanType}]`,
      };

      await this.cacheComfyRegistryResult(cacheKey, metaKey, result);
      return result;
    } catch (err) {
      logger.debug('ComfyUI Official Registry search failed:', err);
      return null;
    }
  }

  private async cacheComfyRegistryResult(
    cacheKey: string,
    metaKey: string,
    result: any
  ): Promise<void> {
    try {
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        [cacheKey, JSON.stringify(result)]
      );
      await dbManager.run(
        'INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?);',
        [metaKey, JSON.stringify({ timestamp: Date.now() })]
      );
    } catch {}
  }

  private fetchJsonWithETag(urlStr: string, cachePrefix: string): Promise<any> {
    return new Promise(async (resolve) => {
      try {
        let etag = '';
        try {
          const row: any = await dbManager.get(
            `SELECT value FROM app_config WHERE key = '${cachePrefix}_etag';`
          );
          if (row?.value) etag = JSON.parse(row.value);
        } catch {}

        const headers: Record<string, string> = {
          'User-Agent': 'RenegadeCMM/1.4.2',
        };
        if (etag) {
          headers['If-None-Match'] = etag;
        }

        https
          .get(urlStr, { headers }, async (res) => {
            if (res.statusCode === 304) {
              const cachedRow: any = await dbManager.get(
                `SELECT value FROM app_config WHERE key = '${cachePrefix}_cache';`
              );
              return resolve(cachedRow?.value ? JSON.parse(cachedRow.value) : null);
            }

            if (res.statusCode === 200) {
              let body = '';
              res.on('data', (chunk) => (body += chunk));
              res.on('end', async () => {
                try {
                  const parsed = JSON.parse(body);
                  const newEtag = res.headers.etag;
                  if (newEtag) {
                    await dbManager.run(
                      `INSERT OR REPLACE INTO app_config (key, value) VALUES ('${cachePrefix}_etag', ?);`,
                      [JSON.stringify(newEtag)]
                    );
                  }
                  resolve(parsed);
                } catch {
                  resolve(null);
                }
              });
              return;
            }

            resolve(null);
          })
          .on('error', () => resolve(null));
      } catch {
        resolve(null);
      }
    });
  }
}

export const nodeResolverService = new NodeResolverService();
