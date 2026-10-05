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
export const APP_VERSION = '1.6.2';

/**
 * Build Configuration & Release Mode Toggle
 *
 * Set IS_DEV_BUILD to:
 *   - true  : Development Mode (enables Git commit vs GitHub main branch update checking & top warning banner)
 *   - false : Release Mode (disables the development banner and commit checks entirely for official production .exe / release packages)
 */
export const BUILD_CONFIG = {
  IS_DEV_BUILD: false, // <-- TOGGLE THIS: true = Dev Mode (commit alerts on), false = Release Mode (alerts off)
  RELEASE_CHANNEL: 'stable' as 'development' | 'stable',
  APP_VERSION,
} as const;

