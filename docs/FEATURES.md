# Renegade Core Model Manager — Feature Reference

This document provides a concise, categorized breakdown of all technical capabilities, architectural subsystems, and user workflows available in **Renegade Core Model Manager (RenegadeCMM)**.

---

## Architecture & Runtime Model

- **Dual Desktop & Web UI**: Operates as a native Electron desktop window or as a high-performance web interface served at `http://127.0.0.1:5173`.
- **Multi-Platform Support**: Native runtime support across Windows 10/11, Linux (GNOME/KDE/Wayland), and macOS (Apple Silicon and Intel x64).
- **Zero Cloud Lock-In**: All catalog state, download histories, and workflow mappings are stored locally in an embedded SQLite database (`renegadecmm.sqlite`) running in Write-Ahead Logging (WAL) mode.
- **Machine-Bound Encrypted Secret Storage**: API keys and access tokens are encrypted with AES-256-GCM using keys derived via `scrypt` from volatile machine-and-user entropy. Stored credentials are never transmitted to maintainers and are redacted from logs and exports.
- **Automated Startup & Environment Setup**: Cross-platform launcher scripts ([`cmm.ps1`](../cmm.ps1), [`cmm.sh`](../cmm.sh), [`cmm-mac.sh`](../cmm-mac.sh), [`cmm.bat`](../cmm.bat)) detect Node.js, Python 3, automatically provision a local `.venv` virtual environment, and install PyTorch / SafeTensors conversion dependencies on demand (`.\cmm.ps1 install`).

---

## Model Discovery & Multi-Hub Catalog

- **Dual-Source Hub Catalog**: Segmented toggle in the Browse interface allows switching between **CivitAI** and **Hugging Face Hub** repositories without losing active search filters.
- **CivitAI Catalog**: Full-text search, filtering, and tag inspection across Checkpoints, LoRAs, ControlNets, VAEs, Upscalers, Motion Modules, and Textual Inversions.
- **Hugging Face Hub Discovery**: Live querying of Hugging Face model repositories with cards showing repository ID, creator avatar, download metrics, likes, pipeline tags, and last-updated timestamps.
- **Interactive Repository File Inspector**: Inspect remote Hugging Face branch trees, file extensions (`.safetensors`, `.gguf`, `.bin`), and individual file sizes, with direct one-click downloading into mapped ComfyUI folders.
- **Gated Model Authentication**: Configure Hugging Face User Access Tokens (`hf_...`) in Settings to authenticate and download gated models (FLUX.1-dev, SD3.5, Wan2.1, HunyuanVideo).
- **Mirror Endpoint Support**: Configurable endpoints for alternative CivitAI mirrors (e.g. `civitai.red`).
- **Configurable NSFW Filtering**: Rating-level gates (PG to XXX) with instant image blur/unblur toggles.

---

## Download Pipeline & Smart Routing

- **Automated Directory Routing**: Categorizes and routes downloads into standard ComfyUI model directories (`checkpoints/`, `loras/`, `vae/`, `controlnet/`, `diffusion_models/`, `upscale_models/`, `text_encoders/`, `unet/`, `gguf/`).
- **Native Hugging Face Pipeline**: Chunked download pipeline supporting `huggingface.co` repository weights with Bearer token authentication and AWS S3 LFS redirect credential-stripping to prevent HTTP 400 errors on pre-signed CDN endpoints.
- **Zero-Memory GGUF Header Parser**: Reads the first 128KB header buffer from disk to parse architecture, tensor counts, and quantization levels (`Q4_0`, `Q4_K_M`, `Q5_K_M`, `Q8_0`, `BF16`, `F16`) without loading model weights into system RAM.
- **Subfolder Scaffolding**: Automatically verifies and creates standard ComfyUI subdirectories if missing from target storage roots.
- **Concurrent Queue Management**: Multi-connection parallel downloads with pause, resume, cancel, speed throttling, and real-time progress indicators.
- **Tamper Protection & Checksums**: Automatic SHA-256 checksum verification against CivitAI catalog hashes.
- **Persistent State Across Restarts**: Active and queued download tasks persist in SQLite and automatically restore upon application restart.
- **Triple-Asset Companion Generation**: Automatically writes `<model>.sha256` (plaintext hash), `<model>.<ext>` (preview image thumbnail), and `<model>.<host>.info` (metadata JSON) beside the downloaded model.

---

## Local Library & Storage Optimization

- **Local Model Library**: Search, filter, and inspect installed models by base model (SD 1.5, SDXL, Flux.1, SD3, Pony, Illustrious, AuraFlow), creator, model type, or keyword.
- **Offline Companion Asset Extraction**: Folder scans parse on-disk `.info` metadata and local `.sha256` hashes without requiring external network access.
- **Ghost Model Resurrector**: Detects models registered in the database that are missing from physical disk storage, offering one-click single or batch downloads by SHA-256 hash matching.
- **Storage Optimizer & Hardlink Deduplicator (`storageOptimizer.ts`)**:
  - Scans model directories to cluster duplicate files by SHA-256 checksum.
  - Verifies filesystem volume boundaries on Windows and Unix before performing atomic hardlink consolidation (`fs.linkSync` + atomic rename).
  - Preserves companion assets while reclaiming tens of gigabytes of disk storage without breaking ComfyUI references.
- **Model Precision Inspector (`precisionInspector.ts`)**:
  - Inspects internal tensor datatypes and identifies FP32 weights that can be safely pruned to FP16 or BF16.
  - Detects common quantization formats (GGUF, EXL2, AWQ, GPTQ, INT8, INT4, NF4).
- **Orphan & Unused Model Finder (`orphanFinder.ts`)**:
  - Cross-references scanned ComfyUI workflow files with installed library models to identify unused checkpoints and LoRAs.
- **PyTorch Pickle-to-SafeTensors Converter (`modelConverter.ts` & `scripts/convert_to_safetensors.py`)**:
  - Converts legacy pickle checkpoints (`.ckpt`, `.pt`, `.bin`) to secure, high-performance `.safetensors` format with zero-copy binary serialization.
  - Provides pre-conversion hardware capacity and OOM safety assessments via `hardwareScanner.ts`.
  - Supports automatic deletion of original pickle files post-conversion.

---

## Interactive Workflows & Live ComfyUI Workspace

- **Live ComfyUI Workspace Integration**:
  - Probes running ComfyUI instances in the background (`/system_stats` / `/prompt`).
  - **Live Canvas Mode**: Embeds the active ComfyUI interface directly inside CMM with interactive node editing and generation queueing.
  - **Split View Mode**: Displays live ComfyUI side-by-side with missing node resolution cards and model dependencies.
  - **Fullscreen Canvas**: Expands ComfyUI with slide-out node drawers and quick workflow selection dropdowns.
- **Resident Background Keep-Alive**: Generations continue uninterrupted when switching between CMM tabs via offscreen DOM keep-alive positioning and disabled CPU background throttling (`backgroundThrottling: false`).
- **One-Click Workflow Canvas Injection**: Injects selected or uploaded `.json` and embedded `.png` workflows directly into the active ComfyUI canvas.
- **React Flow Visual Node Map**: High-DPI interactive graph visualization powered by `@xyflow/react` displaying workflow nodes, bezier connections, MiniMap, and installed vs. missing status indicators.
- **4-Tier Custom Node Resolver**:
  1. *Local Check*: Inspects installed `custom_nodes/` extensions.
  2. *Registry Cache*: Checks local ComfyUI-Manager node index.
  3. *GitHub Search API*: Queries GitHub for unindexed node repositories.
  4. *One-Click Installation*: Clones repositories and executes dependency installation (`requirements.txt`).

---

## RenegadeSwarm Sister Application Integration

- **Authenticated Local Interop (`swarmAuthToken.ts` & `swarmBridge.ts`)**:
  - CMM automatically discovers and reads RenegadeSwarm's well-known `daemon.token` (64-hex bearer token) from platform data directories (`%APPDATA%`, `Library/Application Support`, `~/.config`), transmitting `Authorization: Bearer <token>` on model ingest, window focus, and wakeup calls. Health checks remain public. The secret token is never exposed to the UI renderer or stored in settings.
- **Sister Wakeup Protocol & Probe Rate-Limiting**:
  - **Bidirectional Wakeup Pokes (`POST /api/sister/wakeup`)**: Either application starting up fires a single non-blocking HTTP poke (400ms timeout) to alert the other without continuous polling.
  - **5-Probe Retry Budget**: When Swarm is offline, CMM checks at most 5 times and then halts polling to save CPU and network bandwidth. The budget is reset by an inbound wakeup poke from Swarm or by clicking the **Swarm: Offline** badge.
- **Native Electron Window Activation**:
  - Automatically locates, launches, or focuses active native Electron windows for the **RenegadeSwarm** sister application across Windows, macOS, and Linux.
  - Displays real-time Swarm daemon status, active peer counts, and seeding statistics in the header navbar and Settings tab.
- **Decentralized Ingestion Notifications**:
  - Automatically notifies the local RenegadeSwarm daemon (`POST /api/ingest` / `/api/models/scan`) when model downloads and companion files are finalized.
- **One-Click Companion Packaging**:
  - Generates standardized `.sha256`, `.info`, preview image, and `.swarm` manifest packages directly from library model cards.

---

## Local API Bridge & CLI Runner

- **Localhost HTTP API Bridge (`http://127.0.0.1:5174`)**:
  - Fully documented REST API for external tools, scripts, and ComfyUI custom nodes (see [`docs/API_REFERENCE.md`](API_REFERENCE.md)).
  - Strict loopback binding (`127.0.0.1`), DNS rebinding protection, and origin validation.
- **CLI Runner (`bin/cmm.js`)**:
  - `cmm scan --path <dir>`: Scans model directories.
  - `cmm download --id <id> --version <vid>`: Downloads models from the terminal.
  - `cmm check-updates`: Checks installed models for upstream updates.
  - `cmm export --format <json|zip>`: Generates sanitized library and configuration backups.
  - `cmm hf check <repo_id>`: Inspects Hugging Face repository metadata and files.
  - `cmm hf whoami`: Verifies Hugging Face token authentication status.
  - `cmm workflows --path <dir>`: Scans workflows for referenced model dependencies.
- **Webhook Integration**:
  - Dispatches HMAC-SHA256 signed JSON payloads for `on_download_complete` and `on_update_available` events.

---

## Security & Privacy Highlights

| Policy | Implementation |
|---|---|
| **Local-First Operation** | 100% of data stored locally in SQLite; zero analytics, telemetry, or remote user tracking. |
| **Encrypted Secrets** | Credentials encrypted at rest with AES-256-GCM; redacted from local APIs, logs, and exports. |
| **SSRF & Network Safety** | Blocks private IP addresses, loopback redirects, and dangerous URI schemes on external URL open requests. |
| **Sanitized Backups** | Backup archives (`.zip` / `.json`) strip API keys and exclude raw SQLite database binaries. |
| **SafeTensors First** | Integrated conversion engine eliminates arbitrary Python code execution risks inherent in legacy pickle files. |

---

## Documentation Index

- [Architecture & Process Isolation](ARCHITECTURE.md)
- [Local REST API Reference](API_REFERENCE.md)
- [API Security & Boundary Protections](APISecurity.md)
- [Product Roadmap & Milestones](ROADMAP.md)
- [Legal Notices & Third-Party Licenses](../LEGAL.md)
- [Security Policy & Disclosures](../SECURITY.md)
- [Privacy Policy](../PRIVACY.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
