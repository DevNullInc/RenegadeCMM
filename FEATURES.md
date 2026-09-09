# ⚡ Renegade Core Model Manager — Feature Crib-Notes

> **The TL;DR feature breakdown for anyone who wants the quick crib-notes without scrolling through long docs.**

---

## 🎯 At A Glance

- **Desktop App & Web UI in One**: Run as a native Electron desktop window or open `http://127.0.0.1:5173` in any browser.
- **100% Cross-Platform**: Works natively on **Linux**, **Windows**, and **macOS** (Apple Silicon & Intel).
- **Zero Cloud Lock-In**: Stores everything in a lightning-fast local SQLite database.
- **Machine-Bound Encrypted Credentials & Clean APIs**: CivitAI/HuggingFace keys are AES-256-GCM encrypted at rest using machine-and-user entropy across both GUI and CLI (see [`SECURITY.md`](SECURITY.md) and [`docs/APISecurity.md`](docs/APISecurity.md)). Keys are redacted on local HTTP APIs (`GET /api/config`), stripped from backup archives, and never persisted in download URLs. Login-required pages always open in your real system browser.
- **F5 / Ctrl+R Hard Refresh**: Refresh the active tab any time (same keys as a browser) to clear stale UI after a network hiccup.

---

## 📦 1. Model Discovery & Catalog

- **Dual-Source Catalog Browsing**: Segmented toggle in the Browse tab lets you seamlessly switch between **CivitAI** and **🤗 Hugging Face Hub** repositories without losing your search context.
- **Direct CivitAI Catalog Browsing**: Search, filter, and inspect thousands of Checkpoints, LoRAs, ControlNets, VAEs, Upscalers, and Motion Modules inside the app.
- **Hugging Face Hub Discovery & Search**: Query the Hugging Face Hub in real-time with responsive cards displaying repository ID, creator avatar, download counters, likes, pipeline tags, and last-updated timestamps.
- **Interactive Repository File Inspector Modal**: Click any Hugging Face repository to inspect its file tree, file extensions (`.safetensors`, `.gguf`, `.bin`), and individual file sizes, with direct 1-click downloading into ComfyUI folders.
- **Gated Model Authentication**: Configure your Hugging Face User Access Token (`hf_...`) in Settings to unlock gated model weights (FLUX.1-dev, SD3.5, Wan2.1, HunyuanVideo).
- **Mirror & CivitAI Red Support**: Switch between standard CivitAI endpoints and custom mirrors.
- **NSFW Filter Slider**: Configurable blur/unblur and rating level gates (PG to XXX) with 1-click toggling.

---

## 📥 2. Download Queue & Smart Routing

- **Automated Folder Routing**: Automatically routes downloads into ComfyUI's standard directories (`checkpoints/`, `loras/`, `vae/`, `controlnet/`, `diffusion_models/`, `upscale_models/`, `text_encoders/`, `unet/`, `gguf/`, etc.).
- **Native Hugging Face Download Pipeline**: High-performance chunked download pipeline supporting `huggingface.co` repository weights with Bearer token authentication for gated models — zero external Python or `hf` CLI dependencies required.
- **AWS S3 LFS Redirect Credential Stripping**: Automatic `beforeRedirect` hook strips `Authorization` headers when redirected to pre-signed AWS S3 LFS endpoints (`cdn-lfs.huggingface.co`), preventing HTTP 400 Bad Request errors.
- **Zero-Memory Binary GGUF Header Parser (`ggufParser.ts`)**: Fast little-endian binary header parser that reads only the first 128KB header buffer from disk via `fs.readSync` without loading multi-gigabyte weight tensors. Extracts architecture, tensor counts, and normalizes quantization levels (`Q4_0`, `Q4_K_M`, `Q5_K_M`, `Q8_0`, `BF16`, `F16`).
- **Architecture-Based Smart Folder Routing**: Routes diffusion models to `models/unet`, language models and text encoders to `models/LLM` or `models/text_encoders`, and general GGUF weights to `models/gguf`.
- **Database Schema Migration v9**: Upgraded SQLite database with `source` (`'civitai' | 'huggingface'`), `hf_repo_id`, `hf_commit_sha`, and `quantization` fields across `local_models` and `downloads` tables with full backward compatibility.
- **Automatic Subfolder Scaffolding**: If any standard ComfyUI model subdirectories are missing from your storage folders, CMM builds them on the fly.
- **Queue Management**: Multi-file concurrent downloads with pause, resume, cancel, speed throttling, and inline progress tracking.
- **Custom Filename Regex Patterns**: Map custom keywords (e.g. `ip-adapter`, `pulid`, `gguf`, `unet`) to specific custom folders.
- **Duplicate Conflict Handling**: Choose how to handle filename collisions (Rename, Replace, Skip, or Prompt).
- **SHA-256 Hash Verification**: Compares downloaded checksums against CivitAI for tamper protection.
- **Persistent Queue Across Restarts**: The download queue (with progress and superseded-file metadata) is saved to SQLite and fully restored on relaunch.
- **Ephemeral Authentication & Log Privacy**: Download task URLs stored in SQLite never persist authentication tokens (`?token=` and `&token=` stripped upon ingestion). Credentials are attached in-memory only when dispatching network requests, and diagnostic logs scrub Bearer headers, query tokens, and JSON credentials automatically.
- **Auto-Library on Completion**: A finished download is registered into the Library immediately — no manual re-scan — and Downloads-tab Pause/Resume/Cancel always reflect instantly.

---

## 📚 3. Local Library & Ghost Model Resurrector

- **Instant Search & Filter**: Search your installed model collection by base model (SD 1.5, SDXL, Flux.1, SD3, Pony, Illustrious, AuraFlow), creator, model type, or keyword.
- **Missing on Disk ("Ghost Model") Detector**:
  - Automatically flags models that exist in your database but are missing from your disk (e.g. after importing a backup on a fresh machine).
  - **1-Click "Download Model" (Hash Match)**: Queries CivitAI by SHA-256 hash or version ID and pulls missing files directly to disk.
  - **Batch "Download All Missing Models"**: Queue all missing assets at once.
- **Backup & Restore**: Export and import full library archives (JSON metadata and ZIP backups).

---

## 🔄 4. Automated Updates & Version Tracking

- **1-Click Update Checker**: Compares all local models against CivitAI API for newer revisions, bugfixes, and v2 releases.
- **Date-Aware "Newer" Detection**: Updates are flagged by comparing actual upload/publish dates (plus a SHA-256 hash cross-check), so older uploads never show as false "updates" when you already have the newest file.
- **Update Badging**: Shows update tags on model cards with changelogs and download buttons.
- **Ignore List**: Mute updates for specific model versions you don't want to change.

---

## 🗺️ 5. Interactive Workflows & Live ComfyUI Workspace

- **Dynamic Live ComfyUI Workspace Wrapper**:
  - Automatically detects running ComfyUI instances via background health probing (`/system_stats` / `/prompt`).
  - **Live Canvas Mode (`'live'`)**: Embeds the active ComfyUI interface directly into CMM with interactive node editing, prompt adjustment, and generation queueing.
  - **Live + Inspector Split Mode (`'split'`)**: Displays ComfyUI side-by-side with missing node resolution cards and model dependencies.
  - **Maximize / Fullscreen Mode**: Expand to an immersive workspace with workflow dropdown, 1-click canvas push, slide-out node drawer, and ComfyUI reload.
- **Resident Tab Keep-Alive System**:
  - Generations continue running uninterrupted in the background when switching to Browse, Library, Downloads, or Settings.
  - Offscreen keep-alive DOM positioning and zero-throttling preferences (`backgroundThrottling: false`) prevent Chromium from suspending WebSockets or guest execution.
  - Unified single resident `<webview>` shared across inline, split, and fullscreen views so toggling modes never reloads or aborts generation.
  - Navbar indicator dot displays real-time connection status to ComfyUI.
- **1-Click "Push to Canvas" Workflow Injection**:
  - Injects selected or uploaded workflow graphs directly into the active ComfyUI canvas via `window.app.loadGraphData(graph, true)`.
- **Automatic Cross-App Persistence & Drag-and-Drop**:
  - Uploaded `.json` and embedded `.png` workflows automatically persist to `<comfyui_install_dir>/user/default/workflows/` (with fallback to `workflows/`) and load directly onto the canvas when ComfyUI is online.
- **Saved Workflows Selector Dropdown**: Instantly select and inspect any existing `.json` or `.png` workflow discovered in your ComfyUI directory.
- **Visual Spatial Node Map**: High-performance offline LiteGraph pan/zoom canvas displaying nodes, bezier connections, and readiness color codes.
- **Dual PNG Metadata Extraction**: Parses embedded workflow and prompt graphs from ComfyUI generated `.png` images in-memory.
- **Model Dependency Matrix**: Lists required checkpoints, LoRAs, and VAEs with installed vs. missing status and 1-click downloads.
- **Differentiated Status Flags**: Clearly marks offline preview maps as `Embedded (Read-Only)` while identifying live connected workspaces as `Live ComfyUI (Edit Possible)`.
- **4-Tier Custom Node Resolver**:
  1. _Local Check_: Inspects installed `custom_nodes/` extensions.
  2. _Registry Cache_: Checks ComfyUI-Manager registry database.
  3. _GitHub Fallback_: Queries GitHub Search API for unindexed nodes and repositories.
  4. _1-Click Clone & Install_: Clones custom node repositories and auto-installs Python dependencies (`requirements.txt`).

---

## 🔌 6. Companion Node & Local API Bridge

- **Official Companion Custom Node (`ComfyUI-Model-Manager`)**: Companion node providing in-graph nodes (`CMMDownloadModel`, `CMMInspectWorkflow`, `CMMCheckHuggingFace`).
- **Localhost HTTP API Bridge (`http://127.0.0.1:5174`)**: Hardened REST API allowing external tools and ComfyUI nodes to scan, query, download, and parse workflows locally with strict loopback binding, DNS rebinding guards, path traversal sanitization, and credential redaction (`GET /api/config`).
- **Hugging Face Hub & GGUF API Endpoints**: Programmatically search Hugging Face models (`POST /api/hf/search`), inspect local binary GGUF headers (`POST /api/inspect-gguf`), and inspect remote repo metadata (`POST /api/hf/check`).
- **Sanitized Community Backups**: All backup ZIP archives (`backupService`) and CLI JSON dumps automatically strip API keys and exclude raw SQLite database files, eliminating credential leak risks when sharing setups.
- **Webhook Automation**: Dispatches webhooks on `on_download_complete` and `on_update_available`.

---

## 💻 7. CLI Runner & Power-User Tools

- **Full CLI Suite (`cmm`)**:
  - `cmm scan --path <dir>`: Scan local folders into database.
  - `cmm download --id <id> --version <vid>`: Download models from terminal.
  - `cmm check-updates`: Check library for new versions.
  - `cmm export --format <json|zip>`: Backup configuration and models.
  - `cmm hf check <repo_id>`: Inspect Hugging Face model repositories and file listings.
  - `cmm hf whoami`: Check Hugging Face CLI login and authorization status.
  - `cmm workflows --path <dir>`: Scan and extract workflow model dependencies.

---

## 🚀 8. Developer Tools & Launchers

- **Single-Command Launchers**: `./cmm.sh` (Linux/macOS) and `.\cmm.ps1` / `cmm.bat` (Windows).
- **1-Command Self-Updater**: `./cmm.sh update` or `.\cmm.ps1 update` automatically pulls the latest commits, installs dependencies, and rebuilds.
- **Non-Blocking Dev Update Alerts**: Fixed top banner notifies developers if a newer commit is available on GitHub `main`.
- **Release Mode Switcher**: `npm run mode:release` / `npm run mode:dev` cleans all dev alerts before building production release binaries.
