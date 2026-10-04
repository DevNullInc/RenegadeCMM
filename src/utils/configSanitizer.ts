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
import { AppConfig } from '../types/app';

/**
 * Strips or masks secret credentials from AppConfig for client responses.
 * - When `includeMasks` is false (e.g. for the local HTTP bridge `/api/config`),
 *   sensitive credentials are completely removed and replaced with boolean status flags.
 * - When `includeMasks` is true (e.g. for internal IPC `get-config`),
 *   credentials are masked with bullets (`••••••••`) to signal active presence.
 */
export function getSanitizedConfig(
  config: AppConfig,
  includeMasks = false
): AppConfig & { has_civitai_api_key: boolean; has_huggingface_token: boolean } {
  const sanitized = { ...config };
  const hasCivitai = !!(sanitized.civitai_api_key && sanitized.civitai_api_key.trim());
  const hasHf = !!(sanitized.huggingface_token && sanitized.huggingface_token.trim());

  if (includeMasks) {
    sanitized.civitai_api_key = hasCivitai ? '••••••••' : '';
    sanitized.huggingface_token = hasHf ? '••••••••' : '';
  } else {
    delete (sanitized as any).civitai_api_key;
    delete (sanitized as any).huggingface_token;
  }

  return {
    ...sanitized,
    has_civitai_api_key: hasCivitai,
    has_huggingface_token: hasHf,
  };
}
