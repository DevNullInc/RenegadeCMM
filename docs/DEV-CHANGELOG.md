# Renegade Core Model Manager — Development Changelog

This document serves as the active, rolling changelog for unreleased features, improvements, architectural updates, and bug fixes during active development cycles.

**Lifecycle Policy**:
1. All incremental changes, fixes, and features are logged here in real-time under **Unreleased (Active Cycle)**.
2. When creating a new official version release/build (e.g., `v1.6.0`), the contents of this file are promoted into the permanent [CHANGELOG.md](../CHANGELOG.md) / Release Notes, and this file is reset/cleared for the next cycle.

---

## [Unreleased] - Active Development Cycle (Target: v1.7.0)

### UI & UX Improvements
- **ComfyUI Maximized Viewport Isolation & Minimize Controls (`WorkflowsTab.tsx`, `App.tsx`)**:
  - Restructured ComfyUI maximized view so the webview/iframe portal sits strictly between the fixed top navigation `<header>` and persistent bottom `<footer>`, preventing layout overlap and viewport clipping.
  - Eliminated main viewport scrollbars and bottom padding when ComfyUI is maximized (`overflow-hidden`, `min-h-0`, `h-full flex-1`).
  - Added a prominent, highlighted **Minimize** button with `<Minimize2 />` icon and hotkey tooltip in the ComfyUI maximized top bar.
  - Supported `Escape` keyboard shortcut to immediately return from maximized ComfyUI mode to the standard Workflows tab.
  - Added explicit empty/placeholder states (`-- No workflows found in ComfyUI folders --` / `-- Select a ComfyUI workflow to inject --`) to the maximized ComfyUI workflow selector dropdown with unified in-memory and disk workflow detection.
  - Transformed the top header "Open Live ComfyUI Workspace" action into a high-visibility, glowing pill button with automatic smooth-scrolling directly to the live ComfyUI portal.
  - Expanded the inline ComfyUI live workspace container height (`min-h-[720px] h-[82vh]`) with enhanced branding and status indicators for instant visual orientation.
  - Hides floating scroll-to-top button during live maximized view to prevent canvas UI obstruction.

### Planned & In-Progress

- **Smart Collections & Trigger Word Hub**: Grouping models into customized tag collections and automatic trigger word extraction.
- **Local Semantic Model Search**: Embedded vector store for natural language model querying.

## [1.6.1] - RenegadeSwarm Daemon Bearer Authentication Handshake, Sister Wakeup & Security Protocol

### Security Hardening & Zero-Trust Interop
- **Sister Wakeup Protocol**: Bidirectional non-blocking startup poke (`POST /api/sister/wakeup` on ports 5174/5180 with 400ms timeout) that immediately connects and notifies sister apps without persistent polling loops.
- **Probe Rate-Limiting & Retry Budget**: Caps offline health checks to 5 probes before entering sleep mode. Budget automatically resets on inbound sister wakeup pokes or manual status badge clicks.
- **Daemon Bearer Auth Handshake**: Main-process discovery of `daemon.token` (64-hex), automatic `Authorization: Bearer <token>` and `X-Swarm-Auth-Token` injection on `POST /api/ingest`, `POST /api/models/scan`, `POST /api/window/focus`, and `POST /api/sister/wakeup`.
- **401 Token Invalidation & Reload**: Memory cache auto-reloads token once from disk on 401 Unauthorized responses before returning failure.
- **403 Path Confinement Error Surfacing**: Detects directory confinement rejections from Swarm and provides explicit user error messaging.
- **Strict Focus Semantics**: Returns `{ success: false }` with diagnostic message when daemon, OS native, and executable fallbacks all fail.
- **Renderer Token Protection**: Token is strictly main-process bound, never exposed across IPC, in UI inputs, or stored in user config JSON.
- **100% Green Test Suite**: 127 tests passing across 21 test files with dedicated auth, security, and sister wakeup test coverage.

---

## [1.6.0] - RenegadeSwarm Sister Integration, Storage Optimization & Security Release

### Major Features & Architectural Additions

- **Startup Scripts Environment Provisioning & Automated Python .venv**:
  - Added `install` / `setup` / `init` commands to [`cmm.ps1`](../cmm.ps1), [`cmm.sh`](../cmm.sh), [`cmm-mac.sh`](../cmm-mac.sh), and [`cmm.bat`](../cmm.bat).
  - Probes Node.js, npm, Python 3, automatically initializes a dedicated local virtual environment (`.venv`), and verifies `torch>=2.0.0` and `safetensors>=0.4.0` via [`requirements.txt`](../requirements.txt).
  - Configured `.gitignore` to prevent local virtual environments and Python cache artifacts from entering source control.
  - Retains cold-start speed (< 0.05s script overhead) on routine launches via `.installed` marker.

- **Security Hardening & Penetration Verification**:
  - Resolved Electron duplicate `open-external` IPC handler registration issue.
  - Enforced strict loopback binding (`127.0.0.1`), DNS rebinding guards, and private IP/loopback address blocking on external URL open requests.
  - Implemented HMAC-SHA256 signature verification for outbound webhook dispatching.
  - Hardened Mojo IPC boundary isolation (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
  - Implemented DOM-level secret redaction preventing credential leakage in webviews and DevTools.

- **RenegadeSwarm Sister Application Integration**:
  - Live navbar and settings daemon health badge (`SwarmStatus`) tracking peer count, active seed count, and daemon version with real-time polling.
  - Multi-tier Native Electron Window Finder & Focus Activation (`swarmBridge.ts`): Probes Swarm daemon focus API endpoints (`/api/window/focus`, `/api/focus`), searches for active Electron desktop window handles on Windows (`WScript.Shell`, `Get-Process`, `ShowWindow`, `SetForegroundWindow`), macOS (`osascript`), and Linux (`wmctrl`), and launches installed desktop binaries before falling back to browser.
  - Automatic Swarm Ingest Notification on Download Complete (`downloadManager.ts`): Notifies local Swarm daemon (`POST /api/ingest`, `/api/models/scan`) when CMM finishes downloading weights and companion files.
  - Single-Model Swarm Companion Packager (`LibraryTab.tsx` & `storageOptimizer.ts`): Added 1-click companion packaging action button (`Package` icon) directly on library model cards to generate missing `.sha256`, `.info`, and preview image triplets on demand.
  - Custom Protocol Handler: Registered `renegadecmm://` deep link handler for OS automation.
  - System Tray: Native tray icon with window toggle and 1-click Swarm activation.

- **Storage Optimizer & Hardlink Deduplication Engine (`storageOptimizer.ts`)**:
  - Implemented `StorageOptimizerService` scanning local library models and grouping files by SHA-256 hash checksums.
  - Detects already-hardlinked models via inode (`stat.ino`) and device ID (`stat.dev`) analysis with link count verification (`nlink > 1`), accurately computing recoverable disk space without double-counting.
  - Implemented volume boundary pre-flight checks (`canHardlinkFiles`) preventing cross-drive linking failures on Windows (`C:\` vs `D:\`) and cross-device failures on Linux/macOS.
  - Executes atomic deduplication via temporary link creation (`.cmm-tmp-link`) and atomic replacement (`fs.renameSync`), guaranteeing zero data loss or partial writes if interrupted.
  - Automatically synchronizes companion files (`.sha256`, `.info`, preview thumbnails) from the master to the duplicate directory so both folder trees retain their full packaging.

- **Model Pruning & Precision Inspector (`precisionInspector.ts`)**:
  - Implemented `PrecisionInspector` with zero-copy binary header parsing for `.safetensors` and `.gguf` archives.
  - Extracts tensor precision distributions (`F32`, `F16`, `BF16`, `I8`, quantized) and computes total parameter counts.
  - Detects non-inference training optimizer states (`optimizer.*`, `adam_v`, `adam_m`, `exp_avg`, `model_ema`) and calculates exact strippable savings.
  - Computes prunable disk savings estimates (~50% disk space reclaimable on pure FP32 models when converted/pruned to FP16/BF16).
  - Exposes `POST /api/optimizer/precision-inspect` HTTP bridge route and `inspect-model-precision` IPC handler.

- **Orphan & Unused Model Finder (`orphanFinder.ts`)**:
  - Implemented `OrphanFinder` cross-referencing all local indexed models against user ComfyUI workflow `.json` and embedded `.png` graphs.
  - Groups models into `activelyUsed` (with workflow reference lists) and `orphans` (0 references found in library workflows).
  - Calculates total reclaimable storage from orphan models and surfaces per-model usage metrics.

- **PyTorch Pickle to SafeTensors Converter Engine (`modelConverter.ts` & `scripts/convert_to_safetensors.py`)**:
  - Implemented Python conversion script (`scripts/convert_to_safetensors.py`) with zero-copy binary serialization.
  - Automatically extracts state dicts from top-level dictionaries and nested checkpoint keys (`state_dict`, `model`, `model_state_dict`, `params`).
  - Automatically recalculates new SHA-256 hash checksums, updates SQLite `local_models` database records, and synchronizes companion `.sha256`, `.info`, and preview images to the new `.safetensors` basename.
  - Multi-tier Python runtime detector probing user custom Python, ComfyUI embedded Python, ComfyUI virtualenv, and local virtualenvs.

- **Host Hardware Telemetry & Memory/OOM Safety Scanner (`hardwareScanner.ts`)**:
  - Implemented `HardwareScannerService` providing live hardware discovery across Windows, Linux, and macOS for CPU cores, available system RAM, and GPU VRAM via NVIDIA NVML / `nvidia-smi`.
  - Assesses conversion safety and flags potential OOM risks before unpickling large models.

- **Offline High-DPI Visual Workflow Engine (`@xyflow/react`)**:
  - Replaced legacy `litegraph.js` canvas with modern React Flow (`@xyflow/react`), providing 100% offline standalone node rendering with full touchpad/trackpad momentum panning and pinch-to-zoom.

- **Installer UI Enhancement & Live Extraction Logs**:
  - Configured `"showDetails": true` in NSIS installer configuration for Windows builds, expanding live installation details by default.

---

### Automated Testing & Quality Assurance

- **19 test suites with 107 unit and integration tests passing with 100% pass rate** across Windows, Linux, and macOS test runners.
