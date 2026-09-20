# Renegade Core Model Manager — Architecture & System Design

This document details the architectural topology, security boundaries, IPC contracts, data layer, and subsystems of **Renegade Core Model Manager (RenegadeCMM)**.

---

## 1. System Topology & Runtime Architecture

RenegadeCMM operates on a decoupled multi-process architecture combining a privileged Electron Node.js runtime, an isolated Chromium renderer, a local HTTP API bridge, an optional Python `.venv` worker, and communication bridges to local sister applications.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 RenegadeCMM Application                                │
│                                                                                        │
│  ┌────────────────────────┐      IPC Contract (Preload)      ┌──────────────────────┐  │
│  │     Vite Renderer      │ <==============================> │ Electron Main (Node) │  │
│  │   (React + UI Canvas)  │  contextIsolation: true          │  (Privileged Host)   │  │
│  └────────────────────────┘  sandbox: true                   └──────────┬───────────┘  │
│                                                                         │              │
│  ┌────────────────────────┐         Internal Loopback                   │              │
│  │    Local HTTP Bridge   │ <───────────────────────────────────────────┤              │
│  │   (127.0.0.1:5174)     │   REST API / SSE Events                     │              │
│  └────────────────────────┘                                             │              │
│                                                                         │              │
│  ┌────────────────────────┐     child_process / stdio                   │              │
│  │  Python .venv Worker   │ <───────────────────────────────────────────┤              │
│  │  (SafeTensors Engine)  │                                             │              │
│  └────────────────────────┘                                             │              │
│                                                                         │              │
│  ┌────────────────────────┐     SQLite WAL Transactions                 │              │
│  │ Local SQLite Database  │ <───────────────────────────────────────────┘              │
│  │ (renegadecmm.sqlite)   │                                                            │
│  └────────────────────────┘                                                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
          │                                                    │
          │ HTTP / WebSocket (:8188)                           │ HTTP / Ingest (:5180)
          ▼                                                    ▼
┌───────────────────────────┐                        ┌───────────────────────────┐
│     ComfyUI Instance      │                        │  RenegadeSwarm P2P Daemon │
│ (Live Workspace / Canvas) │                        │ (Decentralized Seeding)   │
└───────────────────────────┘                        └───────────────────────────┘
```

---

## 2. Process Boundaries & Security Contracts

### Privileged Host Process (`src/main/index.ts`)
- The single process possessing operating system privileges (filesystem access, native process spawning, SQLite access, and network sockets).
- Enforces strict process isolation (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
- Validates all incoming IPC invocations at runtime using strict **Zod schemas** (`zod`). Any payload violating schema contracts, containing invalid types, exceeding bounds, or injecting non-canonical parameters is rejected at the privileged process boundary before execution.
- Arbitrary shell commands and unvalidated filesystem paths are prohibited; all filesystem access is confined to verified application storage roots.
- Governs application lifecycle, system tray integration, and window state persistence.

### Renderer Process (`src/App.tsx`, `src/components/*`)
- Executes inside a sandboxed Chromium webview.
- Completely isolated from Node.js globals (`require`, `process`, `Buffer`).
- Communicates exclusively through typed bridge APIs exposed by `src/main/preload.ts` (`window.civitaiAPI`).
- Adheres to the principle of zero-trust: when local files are dragged into the UI, the renderer passes only the trusted OS-level `file.path` across the IPC contract to the privileged main process. The renderer never reads raw byte streams directly when operating in the Electron desktop environment.
- Supports running inside standard web browsers (`http://127.0.0.1:5173`) via the web bridge fallback (`src/utils/webBridge.ts`).

### Localhost HTTP API Bridge (`src/main/index.ts` / Port 5174)
- Provides a headless REST API and Server-Sent Events (SSE) stream for ComfyUI custom nodes and CLI tools.
- Strict security controls:
  - Binds strictly to loopback (`127.0.0.1`).
  - Blocks cross-origin requests from non-local web pages.
  - Redacts sensitive credentials on configuration queries (`GET /api/config`).
  - Validates and sanitizes all path inputs to prevent directory traversal.

---

## 3. Data Storage & Database Architecture

All catalog indexes, download task states, configuration settings, and duplicate groupings reside in a local SQLite database (`renegadecmm.sqlite`).

### Database Configuration
- **Journal Mode**: Write-Ahead Logging (`PRAGMA journal_mode = WAL;`) for high concurrency and non-blocking reads.
- **Synchronous Mode**: Normal (`PRAGMA synchronous = NORMAL;`) balancing durability and transaction speed.
- **Foreign Keys**: Enabled (`PRAGMA foreign_keys = ON;`).
- **Schema Migrations**: Linear schema tracking via `PRAGMA user_version`.

### Primary Tables

| Table | Purpose | Key Attributes |
|---|---|---|
| `local_models` | Catalog of all scanned and installed model weights. | `id`, `file_path`, `file_name`, `file_size`, `sha256`, `model_type`, `base_model`, `source`, `hf_repo_id`, `quantization`, `nsfw` |
| `downloads` | Persistent download queue state across launches. | `id`, `url`, `file_name`, `target_path`, `status`, `progress`, `total_bytes`, `downloaded_bytes`, `sha256` |
| `app_config` | Encrypted application configuration and API tokens. | `key`, `value` (Credentials encrypted with AES-256-GCM) |
| `ignored_updates` | Models exempted from automatic update notifications. | `model_id`, `version_id`, `created_at` |
| `duplicate_clusters`| Groupings of hardlinked or duplicate physical files. | `sha256`, `master_path`, `duplicate_path`, `is_hardlink` |

---

## 4. Subsystem Architectures

### Download Pipeline & Smart Routing (`downloadManager.ts`, `folderRouter.ts`)
- **Multi-Source Ingestion**: Uniform chunked streaming for CivitAI and Hugging Face Hub endpoints.
- **S3 LFS Redirect Handling**: Implements `beforeRedirect` hooks to strip `Authorization` headers on pre-signed AWS S3 CDN redirects.
- **Zero-Memory GGUF Parser (`ggufParser.ts`)**: Fast binary parser reading 128KB header buffers to extract architecture, tensor counts, and quantization levels (`Q4_K_M`, `Q8_0`, `BF16`) without allocating memory for weight tensors.
- **Triple-Asset Generation**: On download completion, automatically generates:
  1. `<model>.sha256`: Plaintext hash.
  2. `<model>.<ext>`: Preview thumbnail image.
  3. `<model>.<host>.info`: Metadata JSON.

### Storage Optimizer & Hardlink Consolidation (`storageOptimizer.ts`)
- Clusters duplicate files by SHA-256 hash across all configured storage roots.
- Verifies volume boundaries (`stat.dev`) before executing atomic replacement:
  ```
  [Duplicate File] ──> Create Temp Hardlink (.cmm-tmp-link) ──> Atomic Rename ──> [Consolidated Link]
  ```
- Retains distinct folder references in ComfyUI while reclaiming physical disk storage.

### PyTorch Pickle-to-SafeTensors Converter (`modelConverter.ts`)
- Converts legacy `.ckpt`, `.pt`, and `.bin` weights into `.safetensors` format with zero-copy binary serialization.
- Multi-tier Python discovery:
  1. User custom configured Python binary.
  2. ComfyUI embedded Python environment (`python_embeded/python.exe`).
  3. ComfyUI virtual environment (`venv/`).
  4. Local project virtual environment (`.venv/`).
  5. System Python runtime (`python3` / `python`).
- Hardware capacity pre-flight assessments (`hardwareScanner.ts`) evaluate CPU, RAM, and GPU VRAM to prevent out-of-memory terminations.

### Live ComfyUI Workspace & Workflow Canvas (`WorkflowNodeMap.tsx`)
- High-DPI interactive graph visualization powered by `@xyflow/react`.
- Background keep-alive engine: offscreen DOM mounting and `backgroundThrottling: false` ensure active image generations continue uninterrupted during navigation.
- 4-Tier Node Resolution engine automatically queries local directories, registry caches, and GitHub to clone and install missing ComfyUI custom nodes.

### Workflow Ingestion & Drag-and-Drop Pipeline (`workflowScanner.ts`, `WorkflowsTab.tsx`, `WorkflowImportModal.tsx`)
- **Pre-Parsing Magic Byte Verification**: Validates file existence, file size limits (< 50MB file, < 10MB JSON string), and checks file signatures (`0x89504E47` for PNG, valid ASCII/UTF-8 JSON) before parsing, explicitly rejecting disguised binary executables (ELF, PE, Mach-O).
- **PNG Metadata Extraction Hierarchy**: Extracts embedded ComfyUI workflows from PNG chunks with priority order:
  1. `iTXt` (UTF-8 unicode text chunks)
  2. `tEXt` (Latin-1 text chunks)
  3. `zTXt` (Deflate-compressed text chunks)
- **Secure File Archiving (`archiveWorkflow`)**:
  - Validates target workflow names against strict identifier pattern `^[a-zA-Z0-9_\- ]+$`.
  - Enforces directory confinement using `path.resolve()` ensuring target files cannot escape the configured ComfyUI workflows folder.
  - Implements atomic writes via nonce-prefixed temp files and atomic rename operations with `0o644` file modes.
  - Performs case-insensitive collision detection and prompts users for overwrite confirmation.
- **Full-Window Drag-and-Drop Interception**: Attaches window-level drag-and-drop listeners with a depth counter (`dragDepthRef`) and renders a full-window fixed overlay (`z-[9999]`), ensuring drops anywhere over the application window (including over embedded guest `<webview>` instances) are captured by the host application.
- **Live Canvas Synchronization**: Hooks into `window.app.loadGraphData` inside the ComfyUI webview on `dom-ready` to observe graph load events and automatically update CMM's node resolution state and model dependency index.

### RenegadeSwarm Sister App Integration (`swarmBridge.ts` & `swarmAuthToken.ts`)
- **Inter-Process Health & Window Management**: Tracks daemon health, peer counts, and seeding stats for the decentralized **RenegadeSwarm** P2P seeding daemon on port `5180`.
- **Sister Wakeup Protocol & Probe Rate-Limiting**:
  - **Outbound Startup Poke**: On bridge startup (`5174`), CMM fires a single non-blocking `POST http://127.0.0.1:5180/api/sister/wakeup` (400ms timeout, Bearer authenticated). If Swarm is running, it immediately wakes up and connects. If offline, the error is swallowed with zero retries.
  - **Inbound Sister Wakeup**: CMM exposes `POST /api/sister/wakeup` (port `5174`). When Swarm boots, it pokes CMM, causing CMM to reset its probe retry budget to 5 and query health immediately without waiting for user action.
  - **5-Probe Retry Budget**: When Swarm is offline, CMM checks at most 5 times before sleeping, eliminating CPU and network polling loops. The budget is reset by an inbound wakeup poke, user status badge click, or successful reconnection.
- **Local Bearer Authentication**: CMM discovers and reads Swarm's well-known `daemon.token` from local OS app data directories, attaching `Authorization: Bearer <64-hex>` headers to privileged `POST /api/ingest`, `POST /api/window/focus`, and `POST /api/sister/wakeup` requests. Health telemetry (`/api/health`) remains public. The token is never exposed across the IPC boundary to the renderer.
- **Native Window Focus Heuristics**: Searches for active Electron window handles across Windows (`Win32`), macOS (`osascript`), and Linux (`wmctrl`), and launches installed desktop binaries before falling back to browser.
- **Automated Ingest Notifications**: Dispatches file metadata to Swarm (`POST /api/ingest`) on download completion for instant zero-latency P2P seeding.

---

## 5. Security Architecture

| Boundary | Threat Mitigation |
|---|---|
| **Secret Storage** | Machine-and-user bound AES-256-GCM encryption with `scrypt` key derivation. Keys never leave local memory. |
| **API Bridge** | Loopback binding (`127.0.0.1`), DNS rebinding protection, and path traversal sanitization. |
| **External Navigation** | Strict URI scheme allowlist (`http:`, `https:`), loopback/private IP blocking (SSRF prevention), and audit logging. |
| **Diagnostic Logs** | Automatic redaction of Bearer tokens, query parameters, and credential keys. |
| **IPC Boundary Validation** | Runtime validation of all IPC handler arguments using strict **Zod schemas** (`zod`). Zero direct shell or arbitrary filesystem exposure to renderer. |
| **File Import Validation** | Pre-parsing magic byte verification, 50MB file size limits, 10MB JSON string cap, and directory confinement checks. |
| **Atomic File Operations** | Temp file creation with random nonce + atomic rename with `0o644` permissions, preventing partial or corrupted writes on failure. |

---

## Documentation Index

- [Feature Reference Guide](FEATURES.md)
- [Local REST API Reference](API_REFERENCE.md)
- [API Security & Boundary Protections](APISecurity.md)
- [Product Roadmap & Milestones](ROADMAP.md)
- [Legal Notices & Third-Party Licenses](../LEGAL.md)
- [Security Policy & Disclosures](../SECURITY.md)
- [Privacy Policy](../PRIVACY.md)
