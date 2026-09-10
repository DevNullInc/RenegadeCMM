# Security Policy & Architecture Disclosures

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Instead, report security concerns privately to the maintainers:

- **Security Email**: <contact-us@renegadeinc.net> (CC: <bug-report@renegadeinc.net>) with subject line `[SECURITY] CMM Vulnerability Report`
- **GitHub**: Submit via [GitHub Private Vulnerability Reporting](https://github.com/DevNullInc/RenegadeCMM/security/advisories/new)

### What to Include

- Clear description of the vulnerability and attack vector
- Minimal reproducible steps or proof-of-concept (PoC)
- Potential security impact (e.g., local file disclosure, remote code execution, token leakage)
- Environment details (OS, Node.js version, Electron/CMM version)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial triage & assessment**: Within 7 days
- **Fix & patch release**: Typically 14–30 days for verified issues depending on severity
- **Public disclosure**: Coordinated disclosure after the patch release is published

### Scope

In-scope components include:
- Local HTTP REST API bridge and CORS/host validation
- Credential encryption and at-rest storage in SQLite
- File system operations, path validation, and directory traversal protections
- Download management, hash verification, and network client authentication
- Workflow parsing, node resolution, and Git execution boundaries

### Out of Scope

- ComfyUI core or third-party custom node codebases (report to [ComfyUI](https://github.com/comfyanonymous/ComfyUI) or node authors)
- CivitAI and Hugging Face remote API infrastructure
- Upstream Electron or Chromium vulnerabilities (report directly to [Electron](https://github.com/electron/electron))

---

## Binary Integrity & False-Positive Mitigation

### Windows Installer Elevation Helper Removal

Starting with release `v1.4.1`, RenegadeCMM explicitly strips the NSIS elevation helper binary (`packElevateHelper: false`, `allowElevation: false`, `perMachine: false` in Electron Builder configuration).

- **Why this was changed**: Default NSIS installers bundle an unsigned elevation helper (`elevate.exe` / `elevation.exe`) designed to facilitate administrative UAC prompts. Automated malware scanning engines (including GitHub Release heuristic scanners and Microsoft Defender) frequently flag this binary as a potential security risk (`HackTool:Win32/AutoElevate`), which previously triggered automated false-positive moderation flags.
- **Code Signing (In Progress)**: Code signing integration is actively in progress through the [SignPath Foundation](https://signpath.org) and [SignPath.io](https://signpath.io). In the interim, release packages are compiled directly from source on public GitHub Actions runners.

---

## Security Architecture & Threat Model Disclosures

### 1. Local Native HTTP API Bridge & CORS Isolation

RenegadeCMM provides an embedded REST API bridge on `127.0.0.1:5174` to support the desktop UI, headless browser operations, and external workflow automations.

- **Loopback Binding Enforcement**: The server binds strictly to IPv4 loopback (`127.0.0.1`). Any attempt to bind to public interfaces is prevented, and inbound packets originating from non-loopback addresses are rejected.
- **DNS Rebinding Defense**: The server inspects the HTTP `Host` header on all inbound requests. Requests containing external hostnames, non-loopback IPs, or public domain names are rejected immediately with `HTTP 403 Forbidden`. Only `localhost`, `127.0.0.1`, `::1`, and matching port variants are permitted.
- **Strict Origin Checking & CSRF Defense**: Cross-Origin Resource Sharing (CORS) headers are restricted to trusted local development and runtime origins (`http://localhost:*`, `http://127.0.0.1:*`). Arbitrary web pages visited in external web browsers cannot access the bridge or exfiltrate local models and directory data.
- **Bridge Kill-Switch (`local_api_enabled`)**: Users can disable the local API bridge entirely via the Settings tab. When set to `false`, the server rejects all operational API routes with `HTTP 503 Service Unavailable`, permitting only internal configuration management.

---

### 2. REST API Endpoints & Input Sanitization

The local HTTP bridge exposes dedicated endpoints categorized by function. All endpoints enforce strict input validation and path sanitization:

| Category | Endpoint | Method | Security Controls |
| :--- | :--- | :--- | :--- |
| **System & Health** | `/api/status`, `/api/health` | `GET` | Read-only runtime health and version telemetry. |
| **Configuration** | `/api/config` | `GET` | **Credentials redacted**. Returns `has_civitai_api_key` and `has_huggingface_token` boolean flags. |
| **Configuration** | `/api/save-config` | `POST` | Validates canonical folder paths; ignores masked bullet inputs (`••••••••`) to protect stored secrets. |
| **Model Scanning** | `/api/scan-library`, `/api/cancel-scan` | `POST` | Path traversal prevention; scans bounded to configured ComfyUI directories. |
| **Model Inventory** | `/api/models`, `/api/local-models` | `GET` | Read-only model database queries; sanitizes local path strings. |
| **Downloads** | `/api/add-download` | `POST` | Sanitizes URLs; prevents persistent token storage; validates target paths. |
| **Downloads** | `/api/downloads` | `GET` | Read-only active queue status with scrubbed URLs. |
| **Downloads** | `/api/pause-download`, `/api/resume-download`, `/api/cancel-download`, `/api/delete-download` | `POST` | Validates task ID existence; safe cleanup of partial `.part` files. |
| **Missing Models** | `/api/pull-missing-model` | `POST` | Validates hash format; attaches auth dynamically without URL pollution. |
| **CivitAI Search** | `/api/search-models` | `POST` | Passes queries through rate-limited `civitaiClient` with strict parameter bounds. |
| **Hugging Face Hub** | `/api/hf/search` | `POST` | Query length sanitization (max 200 chars); clamped limit bounds (`1–100`); safe JSON serialization. |
| **Hugging Face Repos** | `/api/hf/check`, `/api/hf/whoami`, `/api/hf/validate-token` | `POST`/`GET` | Strict regex validation (`^[a-zA-Z0-9_.-]+(/[a-zA-Z0-9_.-]+)?$`); prevents SSRF and path traversal. |
| **GGUF Inspection** | `/api/inspect-gguf` | `POST` | Zero-memory 128KB header parsing; regular file verification; strictly gated to `.gguf`, `.gguf.part`, and `.bin` extensions. |
| **Custom Nodes** | `/api/nodes/resolve`, `/api/nodes/installed` | `GET` | Read-only node class mapping resolution. |
| **Custom Nodes** | `/api/nodes/clone`, `/api/nodes/install-deps` | `POST` | Positional parameter boundaries (`--`); command injection defenses; restricted target directories. |
| **Workflows** | `/api/workflows`, `/api/inspect-workflow` | `POST` | In-memory JSON parsing; schema validation without script execution. |
| **Backups** | `/api/export-backup-zip` | `GET` | Sanitizes `config.json` (strips API tokens); excludes raw SQLite database files. |
| **Backups** | `/api/import-backup-zip` | `POST` | In-memory buffer inspection; path traversal guards on entry extraction. |

#### Path Traversal Defenses (`sanitizeFolderPath` & `sanitizeFileName`)
All user-supplied filesystem paths (`comfyui_root`, `comfyui_folders`, `comfyui_install_dir`, `comfyui_custom_nodes_dir`, `targetRoot`, and download filenames) are normalized and sanitized through [pathUtils.ts](file:///home/stygianrenegade/Projects/manager/Civitai-manager-ComfyUI/src/utils/pathUtils.ts):
- Null bytes, control characters, and dangerous shell metacharacters are stripped.
- Path traversal sequences (`../`, `..\`) are resolved and rejected if attempting to escape designated root boundaries.
- Windows volume drive patterns and POSIX absolute roots are validated against strict canonical structures.

---

### 3. API Key Hardening, Machine-Bound Encryption & Leak Prevention

#### Unified Machine-and-User Bound Encryption At Rest
CivitAI API keys and Hugging Face tokens are encrypted at rest in SQLite (`app_config` table) using authenticated **AES-256-GCM**.
- **Entropy Derivation**: The cryptographic key is derived using `scrypt` (`N=32768, r=8, p=1`) from unique machine-and-user entropy (`cmm-entropy:<username>:<homedir>:<hostname>:<platform>`).
- **Format**: Ciphertexts are stored as `mb_gcm:<ivHex>:<authTagHex>:<ciphertextHex>`.
- **Casual Theft Resistance**: Offline theft of the `database.sqlite` file does not yield plaintext credentials because decryption requires the exact user account and machine identifiers of the originating system.
- **Cross-Environment Parity**: Unlike Chromium's OS-only `safeStorage` (which is unavailable in headless Node.js runtimes), this scheme functions identically in both the Electron desktop main process and the standalone Node.js CLI runner (`cmm.sh` / `cmm.ps1`).
- **Seamless Legacy Migration**: A transparent fallback check detects legacy static-salt ciphertexts (`iv:authTag:ciphertext`). Upon application launch or CLI execution, legacy rows are cleanly decrypted and automatically re-encrypted under the new machine-bound format.

#### Credential Redaction on Public APIs
- The `/api/config` HTTP endpoint suppresses secret tokens and outputs boolean flags (`has_civitai_api_key`, `has_huggingface_token`).
- IPC `get-config` masks credentials with bullets (`••••••••`).
- Both HTTP and IPC `save-config` handlers verify whether incoming strings match mask patterns, preventing accidental overwrite of existing keys when saving unrelated configuration options.
- Supplying an explicit empty string (`""`) cleanly deletes the credential from the database and zeroes active in-memory clients.

#### Sanitized Backup Exports (ZIP & JSON)
- **ZIP Backups (`backupService.ts`)**: Configuration JSON exported in backup archives is sanitized to omit `civitai_api_key` and `huggingface_token`. Raw SQLite database files are excluded from backup bundles.
- **CLI Exports (`src/cli/index.ts`)**: The `cmm export --format json` command filters out secret keys from export dumps.
- Users can safely share backup archives with community members when diagnosing ComfyUI folder mappings without risking credential leakage.

#### Ephemeral Download Tokens & Automated Log Scrubbing
- **Download URLs**: The `downloads` table in SQLite never stores `?token=` or `&token=` parameters. Authentication tokens are injected dynamically in-memory exclusively when dispatching HTTP requests to CivitAI endpoints.
- **Log Scrubbing (`logger.ts`)**: Console logs, disk log files, and IPC diagnostic events pass through automated redaction:
  - Authorization headers (`Bearer <token>`) are masked as `Bearer [REDACTED]`.
  - Sensitive URL query parameters (`?token=...`, `&token=...`, `apiKey=...`) are sanitized.
  - JSON credential fields (`"civitai_api_key"`, `"huggingface_token"`) are redacted before emission.

---

### 4. Process Isolation & Electron Security Controls

RenegadeCMM enforces a hardened Electron security model:

- **Strict Content Security Policy (CSP)**: The renderer process enforces a strict CSP restricting script execution, style sources, fonts, and network connections:
  ```http
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https://civitai.com https://*.civitai.com https://huggingface.co https://*.huggingface.co http://127.0.0.1:* http://localhost:*;
  ```
- **Process Isolation**: The renderer window runs with `contextIsolation: true` and `nodeIntegration: false`. The renderer communicates with the backend exclusively via typed IPC channels defined in [preload.ts](file:///home/stygianrenegade/Projects/manager/Civitai-manager-ComfyUI/src/main/preload.ts).
- **Navigation Guards & External Links**: Window navigation away from the local bundle is blocked. Window creation requests (`window.open`, `<a target="_blank">`) are intercepted via `setWindowOpenHandler` and forwarded to the user's default OS browser using `shell.openExternal`.
- **Embedded Webview Sandboxing**: Attached `<webview>` elements (used for embedding the ComfyUI workspace) have preload scripts stripped, enforcing `contextIsolation: true` and `nodeIntegration: false`.

---

### 5. Custom Node Resolution & Git Execution Boundaries

RenegadeCMM allows users to resolve missing custom nodes and install them into ComfyUI:

- **Git Argument Injection Defenses**: All Git execution routines (`git clone`, `git checkout`) in [nodeResolverService.ts](file:///home/stygianrenegade/Projects/manager/Civitai-manager-ComfyUI/src/services/nodeResolverService.ts) enforce positional parameter boundaries (`--`) to prevent flag injection attacks (e.g. `--upload-pack`, `-u`).
- **Target Folder Boundaries**: Cloned repositories are restricted to validated subdirectories within `comfyui_custom_nodes_dir`.
- **Python Execution Disclosure**: Installing node dependencies invokes `pip install -r requirements.txt` and `python install.py` within the target ComfyUI environment. Users are advised to only install custom nodes from trusted authors.

---

### 6. Model Verification & File Integrity

- **Cryptographic Hash Verification**: Downloaded model files are verified against SHA-256 hashes retrieved from the CivitAI API before being finalized in the library. When `strict_hash_verification` is enabled, files failing hash validation are marked with error states to prevent corrupted or tampered weights from loading.
- **Partial File Cleanup**: Interrupted downloads write to temporary `.part` files. Range requests (`Range: bytes=...`) are verified against HTTP 416 responses, auto-restarting from offset 0 if remote offsets mismatch.
- **Conflict Strategies**: Users can configure file collision behavior (`rename`, `overwrite`, `skip`) to prevent unintentional overwrites of existing model files.

---

### 7. Dependency Security & Third-Party Advisories

- **Advisory Disclosure (adm-zip `GHSA-vwc7-r8mq-g2x9` / CVE-2026-76845)**: Dependency scanners may flag advisory `GHSA-vwc7-r8mq-g2x9` regarding symlink traversal during archive extraction.
  - **Non-Exploitable Context**: RenegadeCMM utilizes `adm-zip` exclusively for creating backup archives (`zip.toBuffer()`) and reading entry buffers in memory (`getData()`). CMM never extracts archive contents directly to disk via `extractAllTo` or follows destination symlinks on the filesystem, neutralizing this attack vector.
- **Resolved Advisory (Vitest `GHSA-82fw-gwwq-j7x9` / CVE-2026-84373)**: Addressed via upgrading `vitest` to `^4.1.11` in devDependencies, eliminating the path traversal / arbitrary file read vulnerability in `@vitest/mocker`.
- **URL Substring Sanitization Hardening (CodeQL `js/incomplete-url-substring-sanitization`)**: Replaced loose `.includes('civitai.com')` substring checks in [downloadManager.ts](file:///home/stygianrenegade/Projects/manager/Civitai-manager-ComfyUI/src/services/downloadManager.ts) with strict WHATWG URL parsing (`isCivitaiUrl` / `attachCivitaiToken`). Authenticated tokens are dynamically appended only to verified `https://civitai.com`, `https://civitai.red`, or legitimate CivitAI subdomains over TLS, preventing SSRF and credential leakage to attacker-controlled domains.

---

### 8. Native Hugging Face & GGUF Engine Security Architecture

Starting with release `v1.5.0`, RenegadeCMM implements native Hugging Face downloads and binary GGUF inspection without relying on external Python runtimes:

- **Zero-Memory GGUF Header Parser (`ggufParser.ts`)**:
  - **Memory Exhaustion Defense (CWE-400)**: Multi-gigabyte `.gguf` model files are never loaded into memory. The parser uses synchronous file descriptors (`fs.openSync` / `fs.readSync`) to read only the initial 128KB header buffer, ensuring the Electron main process and renderer maintain zero memory bloat.
  - **CPU Starvation & ReDoS Protections (CWE-834)**:
    - Bounded loop processing: Uses labeled loops (`kvLoop`) to guarantee that encountering truncated key-value entries or out-of-bounds strings breaks out of execution immediately rather than spinning.
    - $O(1)$ Array element skips: Fixed-size primitive arrays (uint8, uint16, uint32, uint64, float32, float64) are skipped using arithmetic offset multiplication (`len * elemSize`) instead of linear element-by-element iteration.
  - **Path Traversal & Device File Protections (CWE-22 / CWE-59)**:
    - File extension gating: GGUF inspection strictly rejects files not matching `.gguf`, `.gguf.part`, or `.bin` extensions.
    - File type verification: `fs.statSync(source).isFile()` confirms the target path is a regular file before calling `fs.openSync`, preventing hangs or unbounded blocking on FIFOs (named pipes) or character device files (e.g. `/dev/urandom`, `/dev/zero`).
- **Hugging Face Authentication & Credential Boundary (CWE-200 / CWE-798)**:
  - **Targeted Gateway Authorization**: Bearer tokens (`Authorization: Bearer <hf_token>`) are injected exclusively into requests targeting `huggingface.co` or `www.huggingface.co` over TLS. Direct requests to untrusted or CDN domains never receive token headers.
  - **Case-Insensitive AWS S3 LFS Redirect Scrubbing**: When downloading gated weights, Hugging Face responds with HTTP 302 redirects to pre-signed AWS S3 LFS URLs (`cdn-lfs.huggingface.co`). Axios `beforeRedirect` hooks inspect the destination hostname and case-insensitively delete all `Authorization` headers. This prevents token exposure to third-party CDNs and avoids AWS S3 `HTTP 400 Bad Request` ("Only one auth mechanism allowed") errors.
- **Repository Identifier Regex Sanitization**:
  - The Hugging Face API client validates all user-supplied repository strings against strict alphanumeric patterns (`^[a-zA-Z0-9_.-]+(/[a-zA-Z0-9_.-]+)?$`), preventing path traversal and URL injection in API requests.

