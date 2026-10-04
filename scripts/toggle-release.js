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

const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '..', 'src', 'version.ts');
if (!fs.existsSync(versionFilePath)) {
  console.error(`Error: Could not locate ${versionFilePath}`);
  process.exit(1);
}

const arg = (process.argv[2] || '').toLowerCase().trim();
let content = fs.readFileSync(versionFilePath, 'utf8');
const isCurrentlyDev = /IS_DEV_BUILD:\s*true/.test(content);

if (arg === 'release' || arg === 'prod' || arg === 'production' || arg === 'stable') {
  content = content.replace(/IS_DEV_BUILD:\s*(true|false)/, 'IS_DEV_BUILD: false');
  content = content.replace(/RELEASE_CHANNEL:\s*['"][^'"]+['"]/, "RELEASE_CHANNEL: 'stable'");
  fs.writeFileSync(versionFilePath, content, 'utf8');
  console.log('\n🔒 [RELEASE MODE ACTIVATED]');
  console.log('   - IS_DEV_BUILD set to: false');
  console.log('   - RELEASE_CHANNEL set to: "stable"');
  console.log('   - Development update checks & warning banners are now DISABLED.\n');
} else if (arg === 'dev' || arg === 'development') {
  content = content.replace(/IS_DEV_BUILD:\s*(true|false)/, 'IS_DEV_BUILD: true');
  content = content.replace(/RELEASE_CHANNEL:\s*['"][^'"]+['"]/, "RELEASE_CHANNEL: 'development'");
  fs.writeFileSync(versionFilePath, content, 'utf8');
  console.log('\n⚡ [DEVELOPMENT MODE ACTIVATED]');
  console.log('   - IS_DEV_BUILD set to: true');
  console.log('   - RELEASE_CHANNEL set to: "development"');
  console.log('   - Development update checks & GitHub commit alert banners are now ENABLED.\n');
} else if (arg === 'toggle') {
  const nextDev = !isCurrentlyDev;
  content = content.replace(/IS_DEV_BUILD:\s*(true|false)/, `IS_DEV_BUILD: ${nextDev}`);
  content = content.replace(
    /RELEASE_CHANNEL:\s*['"][^'"]+['"]/,
    nextDev ? "RELEASE_CHANNEL: 'development'" : "RELEASE_CHANNEL: 'stable'"
  );
  fs.writeFileSync(versionFilePath, content, 'utf8');
  console.log(`\n🔄 [BUILD MODE TOGGLED] => ${nextDev ? 'DEVELOPMENT (IS_DEV_BUILD = true)' : 'RELEASE (IS_DEV_BUILD = false)'}\n`);
} else {
  console.log('\n======================================================');
  console.log('  Renegade Core Model Manager - Build Mode Status');
  console.log('======================================================');
  console.log(`  Current Mode : ${isCurrentlyDev ? '⚡ DEVELOPMENT (IS_DEV_BUILD = true)' : '🔒 RELEASE / PRODUCTION (IS_DEV_BUILD = false)'}`);
  console.log(`  File         : src/version.ts\n`);
  console.log('Commands:');
  console.log('  npm run mode:release  -> Switch to Release mode (disables dev update banners)');
  console.log('  npm run mode:dev      -> Switch to Development mode (enables dev update alerts)');
  console.log('  npm run mode:status   -> Show current build mode status\n');
}
