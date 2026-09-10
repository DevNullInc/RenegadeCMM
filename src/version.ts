/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Central application version & build configuration
 */
export const APP_VERSION = '1.5.0';

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

