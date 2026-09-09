/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
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
