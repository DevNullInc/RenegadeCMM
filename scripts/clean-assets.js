#!/usr/bin/env node
/**
 * Renegade Core Model Manager - Orphaned Asset Cleanup (Janitor)
 * Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
 * Licensed under GNU General Public License v3.0 (GPL-3.0)
 *
 * Prunes stale hashed renderer bundles from dist/assets while leaving the folder,
 * non-bundle assets, and the currently-referenced build untouched.
 *
 * Scope:        hashed `index-*.js`, `index-*.css`, and `vendor-*.js` bundles
 * Retention:    keep every asset referenced by `dist/index.html` PLUS the single
 *               most-recently-generated js/css pair (a safety net for any build that
 *               hasn't finished writing index.html yet, or a freshly emitted pair).
 * Safety:       never touches the rest of dist/assets, never runs from the dev build,
 *               never deletes a file still referenced by index.html, and exiting 0 even
 *               when there is nothing to prune (missing files are not errors).
 *
 * Usage:
 *   node scripts/clean-assets.js            # prune (idempotent)
 *   node scripts/clean-assets.js --dry-run  # report only, delete nothing
 *   node scripts/clean-assets.js --quiet    # no per-file output
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');
const INDEX_HTML = path.join(DIST, 'index.html');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const QUIET = args.includes('--quiet');

function log(msg) {
  if (!QUIET) console.log(msg);
}

function main() {
  // 1) Nothing to prune if the build output doesn't exist yet — not an error.
  if (!fs.existsSync(ASSETS) || !fs.statSync(ASSETS).isDirectory()) {
    log('[clean-assets] dist/assets not present; nothing to prune.');
    return 0;
  }

  // 2) Determine the active asset set referenced by the current index.html.
  const referenced = collectReferencedAssets();
  if (referenced.length === 0 && fs.existsSync(INDEX_HTML)) {
    log('[clean-assets] Could not parse asset references from dist/index.html; aborting to stay safe.');
    return 1;
  }

  // 3) Enumerate candidate orphan candidates: hashed `index-*.js` / `index-*.css` / `vendor-*.js`.
  const candidates = fs
    .readdirSync(ASSETS)
    .filter((f) => {
      const lower = f.toLowerCase();
      const isBundle = /^(index|vendor-[^/]+)-[^/]*\.(js|css)$/i.test(f);
      const isHashed = /^(index|vendor-[^/]+)-[A-Za-z0-9_-]{8,}\.(js|css)$/i.test(lower) || /^(index|vendor-[^/]+)-[^.]*\.(js|css)$/i.test(lower);
      return fs.statSync(path.join(ASSETS, f)).isFile() && isBundle && isHashed;
    })
    .sort();

  if (candidates.length === 0) {
    log('[clean-assets] No hashed bundles to prune.');
    return 0;
  }

  // 4) Compose the keep-set: anything index.html points at ...
  const keep = new Set(
    referenced.map((r) => path.basename(r))
  );

  // ... plus the single most-recently-generated js and css pair (safety net).
  const newestJs = newestMatching(/^index-.*\.js$/i);
  const newestCss = newestMatching(/^index-.*\.css$/i);
  if (newestJs) keep.add(path.basename(newestJs));
  if (newestCss) keep.add(path.basename(newestCss));

  // 5) Prune everything else.
  const removed = [];
  for (const f of candidates) {
    if (keep.has(f)) continue;
    const full = path.join(ASSETS, f);
    if (DRY_RUN) {
      removed.push(f);
      continue;
    }
    try {
      fs.unlinkSync(full);
      removed.push(f);
    } catch (err) {
      log(`[clean-assets] Skipped ${f} (${err.code || err.message})`);
    }
  }

  log(
    `[clean-assets] ${DRY_RUN ? '[dry-run] would remove' : 'Removed'} ${removed.length} ` +
      `orphaned bundle(s); kept ${keep.size} (active + newest pair).`
  );
  if (!DRY_RUN && removed.length > 0 && !QUIET) {
    log(`  - ${removed.join('\n  - ')}`);
  }
  return 0;
}

/** Returns basenames of every `./assets/...` (js/css) file referenced by index.html. */
function collectReferencedAssets() {
  if (!fs.existsSync(INDEX_HTML)) return [];
  let html = '';
  try {
    html = fs.readFileSync(INDEX_HTML, 'utf8');
  } catch {
    return [];
  }
  const refs = [];
  const re = /(?:src|href)\s*=\s*["']([^"']*assets\/[^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const val = m[1];
    if (/\.(js|css)$/i.test(val)) refs.push(val);
  }
  return Array.from(new Set(refs));
}

/** Returns the absolute path of the newest file matching `pattern` in dist/assets, or null. */
function newestMatching(pattern) {
  let best = null;
  let bestTime = -1;
  try {
    for (const f of fs.readdirSync(ASSETS)) {
      if (!pattern.test(f)) continue;
      const full = path.join(ASSETS, f);
      if (!fs.statSync(full).isFile()) continue;
      const t = fs.statSync(full).mtimeMs;
      if (t > bestTime) {
        bestTime = t;
        best = full;
      }
    }
  } catch {
    return null;
  }
  return best;
}

try {
  process.exit(main());
} catch (err) {
  console.error('[clean-assets] Unexpected error:', err && err.message ? err.message : err);
  process.exit(1);
}
