/**
 * Renegade Core Model Manager (RenegadeCMM)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
