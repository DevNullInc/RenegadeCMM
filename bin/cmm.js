#!/usr/bin/env node
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
const path = require('path');
const fs = require('fs');

// Try requiring compiled CLI or TypeScript directly via ts-node / dist
const distCli = path.join(__dirname, '../dist/cli/index.js');

async function main() {
  let cliModule;
  if (fs.existsSync(distCli)) {
    cliModule = require(distCli);
  } else {
    const { execSync } = require('child_process');
    try {
      execSync('npx tsc -p tsconfig.main.json', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
      if (fs.existsSync(distCli)) {
        cliModule = require(distCli);
      }
    } catch (e) {
      console.error('Error compiling CMM CLI:', e);
      process.exit(1);
    }
  }

  if (cliModule && typeof cliModule.runCli === 'function') {
    const code = await cliModule.runCli(process.argv.slice(2));
    process.exit(code || 0);
  }
}

main().catch((err) => {
  console.error('\x1b[31m[!] Fatal CLI error:\x1b[0m', err);
  process.exit(1);
});
