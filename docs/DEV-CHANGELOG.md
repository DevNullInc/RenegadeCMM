# Renegade Core Model Manager — Development Changelog

This document serves as the active, rolling changelog for unreleased features, improvements, architectural updates, and bug fixes during active development cycles.

**Lifecycle Policy**:
1. All incremental changes, fixes, and features are logged here in real-time under **Unreleased (Active Cycle)**.
2. When creating a new official version release/build, the contents of this file are promoted into the permanent [CHANGELOG.md](../CHANGELOG.md) / Release Notes, and this file is reset/cleared for the next cycle.

---

## [Unreleased] - Active Development Cycle (Target: v1.7.0)

### Smart Collections, Trigger Hub & Semantic Search (Phase 4)
- **LoRA Trigger Word & Prompt Injector**:
  - One-click copy and direct ComfyUI node injection of trained trigger words and recommended LoRA strength weights.
- **Custom Collections & Smart Playlists**:
  - Group models by project, art style, or architecture (*"Flux Realism Setup"*, *"SDXL Inpainting Kit"*, *"Anime Style LoRAs"*).
- **Local Semantic Search**:
  - Embed local model descriptions and prompt tags with a lightweight embedded vector index for natural language queries.

### Pickle-to-SafeTensors Converter Architecture Overhaul
- **Generic Dynamic Archive Introspection (`scripts/convert_to_safetensors.py` & `modelConverter.ts`)**:
  - Support arbitrary nested state dict hierarchies, standalone DiT transformers, VAEs, and text encoders.
  - Modular conversion profiles preserving original tensor metadata and layer precision.
  - Chunked streaming conversion for large models (> 10GB) to prevent host CPU memory exhaustion.

### Gated & Early Access Model Filtering (`BrowseTab.tsx`, `types/civitai.ts`, `earlyAccessFilter.test.ts`)
- **Early Access & Gated Status Detection**:
  - Implemented `isVersionEarlyAccess` and `isModelEarlyAccessOrGated` helper functions checking `canDownload === false`, `availability === 'EarlyAccess'`, `status === 'EarlyAccess'`, and active `earlyAccessEndsAt` timestamps.
  - Extended CivitAI TypeScript interfaces (`CivitAIModel`, `CivitAIModelVersion`) with early access metadata, status, and downloadability parameters.
- **Toolbar Filter Controls & Batch Accumulation**:
  - Added `hideGated` state (defaulting to `true`) with an `Unlocked Only` / `Include Gated` toggle button across CivitAI and Hugging Face view toolbars.
  - Configured CivitAI auto-accumulation loop in `fetchModels` to request 100-item batches and accumulate until 48 downloadable, unlocked models are gathered.
  - Filtered gated repositories (`repo.gated`) from Hugging Face model cards when `hideGated` is active.
- **Card Badges & Modal Safeguards**:
  - CivitAI cards render an amber `Early Access` badge with lock icon on gated assets and replace the Quick Download button with an "Early Access" locked action button.
  - Model Details modal displays a warning banner for early access versions and substitutes the ComfyUI download button with an "Unlock on CivitAI" external link button.
  - Added unit test suite in `tests/earlyAccessFilter.test.ts` covering version flags, expiration timestamps, model overrides, and Hugging Face gated repo handling (12 tests).

### Search Bar Reset Control (`BrowseTab.tsx`, `LibraryTab.tsx`)
- **Inline Search Clear Button**:
  - Added an inline `✕` clear button within the search input field that renders conditionally when search text is present.
  - Implemented `handleClearSearch` resetting query text and pagination cursors without modifying active dropdown filters (`Model Type`, `Base Model`, `Sort Order`, `Period`, `NSFW`, or `Gated`).
  - Added matching `✕` clear functionality to the Local Model Library search input for consistent filtering UX.

### NSFW Routing to `civitai.red` (`BrowseTab.tsx`, `DownloadsTab.tsx`, `LibraryTab.tsx`, `folderRouter.ts`)
- **Strict `civitai.red` URL Resolution**:
  - Enforced `https://civitai.red/models/{id}` destination for all models, versions, and image previews marked as NSFW or mature (nsfwLevel >= 4) across browse cards, detail modals, download tables, and library cards.
  - Eliminates automatic HTTP redirects triggered when opening adult or mature model pages via `civitai.com`.

### Browse Card Quick Action State Synchronization (`BrowseTab.tsx`)
- **Instant Update Dismissal & Library Sync**:
  - Fixed an issue where ignoring an update on a browse card did not remove the quick update button until page refresh.
  - Added immediate local state eviction and synchronization so cards accurately reflect installed and ignored states in real time.

### Browser Workstation Bridge & Headless Web Parity (`vite.config.ts`, `src/utils/webBridge.ts`, `src/utils/comfyuiUtils.ts`)
- **Web Browser Runtime Emulation & Polyfill**:
  - Implemented `webBridge.ts` polyfill for `window.civitaiAPI` allowing RenegadeCMM to run as a standalone web application in standard web browsers (`http://localhost:5173/`) without requiring the Electron desktop wrapper.
  - Added dynamic API port resolution and auto-discovery across candidate ports (`5174`, `5175`, `5180`, `8080`, `8081`) with fallback to Vite dev server API endpoints and direct ComfyUI status probing (`/system_stats` on port `8188`).
  - Configured polling intervals for scan progress (`/api/get-scan-status`) and active download tasks (`/api/downloads`) to replicate native Electron IPC event streaming inside browser contexts.
- **Vite Dev Server API Middleware Parity**:
  - Expanded `apiServerPlugin` in `vite.config.ts` to implement full REST API parity for browser clients, including `/api/models`, `/api/config`, `/api/save-config`, `/api/scan`, `/api/get-scan-status`, `/api/downloads`, `/api/download`, `/api/cancel-download`, `/api/clear-finished-downloads`, `/api/list-directory`, `/api/check-folder-access`, `/api/browse-folder`, `/api/check-comfyui-install`, `/api/auto-detect-comfyui`, `/api/comfyui/status`, `/api/hardlink`, `/api/package-companion`, `/api/inspect-precision`, and `/api/convert-pickle`.
  - Backed browser endpoints directly with the local SQLite library database (`library.db`) and configuration files, ensuring browser sessions display identical model records, companion metadata, and download states as the desktop app.
  - Enforced strict allowed-root path containment (`isPathWithinAllowedRoots`) across all filesystem-touching middleware endpoints to prevent directory traversal in web mode.
- **Shared ComfyUI Inspection Pipeline**:
  - Extracted ComfyUI installation discovery and validation logic into `src/utils/comfyuiUtils.ts` to share installation heuristics, custom node scanning, and server telemetry between the Electron main process and the web API bridge.
- **Foundation for Remote Companion App Connectivity**:
  - Decoupled UI logic from native Electron IPC boundaries onto standard HTTP/JSON-RPC protocols, establishing the architectural foundation for future headless workstation hosting, remote browser access, and companion mobile application connectivity.
