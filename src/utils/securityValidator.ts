/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import path from 'path';
import os from 'os';

export const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.gif',
]);

export const ALLOWED_MODEL_EXTENSIONS = new Set([
  '.safetensors',
  '.ckpt',
  '.pt',
  '.bin',
  '.gguf',
  '.sft',
  '.engine',
  '.onnx',
]);

export const ALLOWED_COMPANION_EXTENSIONS = new Set([
  '.sha256',
  '.info',
  '.civitai.info',
  '.json',
  '.txt',
  '.preview.png',
  '.preview.jpg',
  '.preview.jpeg',
  '.preview.webp',
]);

/**
 * Validates that an Origin or Referer header belongs to a trusted local environment
 * (localhost, 127.0.0.1, ::1, file://, app://, or vscode-webview://).
 * Protects against Cross-Site Request Forgery (CSRF) and DNS Rebinding.
 */
export function isAllowedOriginOrReferer(headerVal?: string): boolean {
  if (!headerVal || typeof headerVal !== 'string') return true; // Direct non-browser clients (curl, electron IPC) omit origin/referer

  const trimmed = headerVal.trim();
  if (!trimmed) return true;

  try {
    const parsed = new URL(trimmed);

    // App/Electron protocols
    if (
      parsed.protocol === 'app:' ||
      parsed.protocol === 'file:' ||
      parsed.protocol === 'vscode-webview:'
    ) {
      return true;
    }

    // Local loopback hostnames
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host === '[::1]' ||
        host.endsWith('.localhost')
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Ensures a filesystem path does not contain illegal characters, null bytes,
 * or unresolved directory traversals.
 */
export function sanitizePathString(p?: string): string | null {
  if (!p || typeof p !== 'string') return null;
  const s = p.trim();
  if (!s || s.length < 1 || s.length > 1024) return null;
  if (/[\0\x00-\x1F]/.test(s)) return null;
  return path.resolve(s);
}

/**
 * Checks whether a candidate file path resides strictly inside one of the allowed root directories.
 */
export function isPathWithinAllowedRoots(
  candidatePath: string,
  allowedRoots: (string | undefined | null)[],
  opts?: { allowTemp?: boolean }
): boolean {
  if (!candidatePath || typeof candidatePath !== 'string') return false;

  const resolvedCandidate = sanitizePathString(candidatePath);
  if (!resolvedCandidate) return false;

  // Build clean list of absolute allowed root directories
  const cleanRoots: string[] = [];
  for (const root of allowedRoots) {
    if (root && typeof root === 'string' && root.trim()) {
      const resolvedRoot = sanitizePathString(root.trim());
      if (resolvedRoot) {
        cleanRoots.push(resolvedRoot);
      }
    }
  }

  // Permit OS temp directory only if explicitly requested
  if (opts?.allowTemp) {
    const tempDir = path.resolve(os.tmpdir());
    if (tempDir) cleanRoots.push(tempDir);
  }

  if (cleanRoots.length === 0) return false;

  const candidateLower = resolvedCandidate.toLowerCase();

  return cleanRoots.some((root) => {
    const rootLower = root.toLowerCase();
    if (candidateLower === rootLower) return true;
    const relative = path.relative(root, resolvedCandidate);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  });
}

/**
 * Validates that a file has a recognized model extension and is within allowed roots if provided.
 */
export function isSafeModelPath(
  filePath: string,
  allowedRoots?: (string | undefined | null)[]
): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const resolved = sanitizePathString(filePath);
  if (!resolved) return false;

  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_MODEL_EXTENSIONS.has(ext)) {
    return false;
  }

  if (allowedRoots && allowedRoots.length > 0) {
    return isPathWithinAllowedRoots(resolved, allowedRoots);
  }

  return true;
}

/**
 * Validates that an outgoing HTTP/HTTPS URL does not target cloud instance metadata IP addresses
 * or dangerous non-HTTP schemes (SSRF protection).
 */
export function isSafeNetworkUrl(urlStr?: string): { safe: boolean; reason?: string; url?: string } {
  if (!urlStr || typeof urlStr !== 'string') {
    return { safe: false, reason: 'URL must be a non-empty string' };
  }

  const trimmed = urlStr.trim();
  // Reject obvious dangerous pseudo-protocols before URL parsing
  if (/^(file|javascript|vbscript|data|gopher|powershell|blob):/i.test(trimmed)) {
    return { safe: false, reason: 'Disallowed non-network protocol scheme' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: `Disallowed URL protocol: ${parsed.protocol}` };
    }

    const host = parsed.hostname.toLowerCase();

    // Block cloud instance metadata IP endpoints & internal cloud DNS
    const blockedHosts = [
      '169.254.169.254', // AWS, GCP, Azure, OpenStack instance metadata
      '100.100.100.200', // Alibaba Cloud metadata
      'metadata.google.internal',
      'metadata',
      'instance-data',
    ];

    if (blockedHosts.includes(host) || host.startsWith('169.254.')) {
      return { safe: false, reason: 'Access to cloud instance metadata service is forbidden' };
    }

    return { safe: true, url: parsed.toString() };
  } catch (err: any) {
    return { safe: false, reason: err?.message || 'Invalid URL format' };
  }
}

export interface SanitizedDeepLink {
  action: 'download' | 'model' | 'search' | 'navigate';
  modelId?: number;
  versionId?: number;
  query?: string;
  tab?: string;
  sourceUrl: string;
}

/**
 * Parses and sanitizes custom protocol URLs (`renegadecmm://...`).
 * Strictly validates actions and parameter types.
 */
export function parseSanitizedDeepLink(rawUrl: string): SanitizedDeepLink | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmed = rawUrl.trim();
  if (!trimmed.toLowerCase().startsWith('renegadecmm://')) return null;

  try {
    // Normalizing renegadecmm://action?params -> http://dummy/action?params for URL parsing
    const pseudoUrl = new URL(trimmed.replace(/^renegadecmm:\/\//i, 'http://localhost/'));
    const rawAction = pseudoUrl.pathname.replace(/^\/+/, '').toLowerCase();
    const params = pseudoUrl.searchParams;

    if (rawAction === 'download' || rawAction === 'add-download') {
      const modelIdStr = params.get('modelId') || params.get('model_id') || params.get('id');
      const versionIdStr = params.get('versionId') || params.get('version_id');

      if (modelIdStr && !/^\d+$/.test(modelIdStr.trim())) return null;
      if (versionIdStr && !/^\d+$/.test(versionIdStr.trim())) return null;

      const modelId = modelIdStr ? parseInt(modelIdStr.trim(), 10) : undefined;
      const versionId = versionIdStr ? parseInt(versionIdStr.trim(), 10) : undefined;

      if (!modelId && !versionId) return null;

      return {
        action: 'download',
        modelId: modelId && modelId > 0 ? modelId : undefined,
        versionId: versionId && versionId > 0 ? versionId : undefined,
        sourceUrl: trimmed,
      };
    }

    if (rawAction === 'model' || rawAction === 'view-model') {
      const modelIdStr = params.get('id') || params.get('modelId') || params.get('model_id');
      if (!modelIdStr || !/^\d+$/.test(modelIdStr.trim())) return null;
      const modelId = parseInt(modelIdStr.trim(), 10);
      if (!modelId || modelId <= 0) return null;

      return {
        action: 'model',
        modelId,
        sourceUrl: trimmed,
      };
    }

    if (rawAction === 'search' || rawAction === 'find') {
      const q = params.get('q') || params.get('query') || '';
      // Sanitize query string (alphanumeric, spaces, basic punctuation)
      const sanitizedQ = q.replace(/[\x00-\x1f\x7f<>]/g, '').trim();
      return {
        action: 'search',
        query: sanitizedQ.slice(0, 200),
        sourceUrl: trimmed,
      };
    }

    if (rawAction === 'navigate' || rawAction === 'tab' || rawAction === 'open') {
      const tab = (params.get('tab') || params.get('view') || rawAction).toLowerCase();
      const validTabs = new Set(['models', 'library', 'downloads', 'optimizer', 'workflows', 'settings']);
      if (validTabs.has(tab)) {
        return {
          action: 'navigate',
          tab,
          sourceUrl: trimmed,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}
