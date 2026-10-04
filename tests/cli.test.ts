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
import { describe, it, expect } from 'vitest';
import { runCli } from '../src/cli/index';

describe('CLI Runner', () => {
  it('should print help and return 0 on help flag', async () => {
    const code = await runCli(['--help']);
    expect(code).toBe(0);
  });

  it('should return 0 on empty command (help default)', async () => {
    const code = await runCli([]);
    expect(code).toBe(0);
  });

  it('should print version and return 0 on --version flag', async () => {
    const code = await runCli(['--version']);
    expect(code).toBe(0);
  });

  it('should print version and return 0 on -v flag', async () => {
    const code = await runCli(['-v']);
    expect(code).toBe(0);
  });

  it('should return error code on unknown command', async () => {
    const code = await runCli(['nonexistent-command-xyz']);
    expect(code).toBe(1);
  });
});
