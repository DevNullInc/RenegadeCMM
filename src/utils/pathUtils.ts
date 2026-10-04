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
import fs from 'fs';
import path from 'path';

export function normalizePath(filePath: string): string {
  if (!filePath) return '';
  // Normalize separators to forward slashes for internal consistency or system path
  let normalized = path.normalize(filePath);
  // Ensure Windows long paths are handled if needed
  return normalized;
}

export function joinPaths(...parts: string[]): string {
  return path.join(...parts);
}

export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  // Strip control characters (0-31, 127) and OS invalid filename characters
  let clean = name.replace(/[\x00-\x1f\x7f/\\?%*:|"<>]/g, '_').trim();
  // Strip relative traversal sequences (two or more dots)
  clean = clean.replace(/\.{2,}/g, '_');
  if (clean === '.' || clean === '_') {
    clean = '_';
  }
  // Strip trailing periods or spaces which cause issues on Windows
  clean = clean.replace(/[. ]+$/, '');
  return clean || '_';
}

export function getFileExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

export interface FolderAccessCheck {
  exists: boolean;
  writable: boolean;
  error?: string;
}

/**
 * Performs a pre-flight sanity check on a folder path to verify:
 * 1. The target directory exists or can be created.
 * 2. The drive/filesystem is unlocked and writable (not read-only, locked BitLocker, or permissions-blocked).
 */
export function testFolderWritable(folderPath: string): FolderAccessCheck {
  if (!folderPath || typeof folderPath !== 'string') {
    return { writable: false, exists: false, error: 'Path is required' };
  }
  const cleanPath = path.resolve(folderPath.trim());
  try {
    if (!fs.existsSync(cleanPath)) {
      try {
        fs.mkdirSync(cleanPath, { recursive: true });
      } catch (mkdirErr: any) {
        let msg = mkdirErr.message || 'Could not create directory';
        if (mkdirErr.code === 'EACCES' || mkdirErr.code === 'EPERM') {
          msg = 'Permission denied: Drive or directory is locked or read-only';
        } else if (mkdirErr.code === 'ENOENT') {
          msg = 'Drive or parent directory not found (Drive may be disconnected or unmounted)';
        } else if (mkdirErr.code === 'EROFS') {
          msg = 'Read-only file system: Drive is locked or write-protected';
        }
        return {
          writable: false,
          exists: false,
          error: msg,
        };
      }
    }

    // Verify write permissions with a temporary probe file
    const probeFile = path.join(
      cleanPath,
      `.cmm_write_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.tmp`
    );
    fs.writeFileSync(probeFile, 'cmm_write_ok', 'utf8');
    if (fs.existsSync(probeFile)) {
      try {
        fs.unlinkSync(probeFile);
      } catch {}
    }
    return { writable: true, exists: true };
  } catch (err: any) {
    let msg = err.message || 'Write permission denied or drive is locked';
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      msg = 'Permission denied: Drive or directory is locked or read-only';
    } else if (err.code === 'ENOENT') {
      msg = 'Directory or drive not found (Drive may be disconnected or unmounted)';
    } else if (err.code === 'EROFS') {
      msg = 'Read-only file system: Drive is locked or write-protected';
    }
    return {
      writable: false,
      exists: fs.existsSync(cleanPath),
      error: msg,
    };
  }
}
