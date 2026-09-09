# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

Instead, report security concerns privately:

- **Email**: <bug-report@renegadeinc.net> with subject line "CMM Security Issue"
- **GitHub**: Use the [Private Vulnerability Reporting](https://github.com/DevNullInc/RenegadeCMM/security/advisories) feature

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact (local file access, remote code execution, etc.)
- Your environment (OS, Node version, CMM version)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial assessment**: Within 7 days
- **Fix & release**: Depends on severity, typically 14-30 days for verified issues
- **Public disclosure**: After fix is released and users have had time to update

### Scope

CMM handles file system operations, external API calls (CivitAI), and executes SHA256 hashing. Vulnerabilities in these areas are especially critical.

### Out of Scope

- ComfyUI itself (report to [ComfyUI](https://github.com/comfyanonymous/ComfyUI))
- CivitAI API vulnerabilities (report to [CivitAI](https://civitai.com))
- Electron/Chromium security issues (report to [Electron](https://github.com/electron/electron))

## Binary Integrity & False-Positive Mitigation

### Windows Installer Elevation Helper Removal

Starting with release `v1.4.1`, RenegadeCMM explicitly strips the NSIS elevation helper binary (`packElevateHelper: false`, `allowElevation: false`, `perMachine: false` in Electron Builder configuration).

- **Why this was changed**: Default NSIS installers bundle an unsigned elevation helper (`elevate.exe` / `elevation.exe`) designed to facilitate administrative UAC prompts. Automated malware scanning engines (including GitHub Release heuristic scanners and Microsoft Defender) frequently flag this binary as a potential security risk (`HackTool:Win32/AutoElevate`), which previously triggered automated false-positive moderation flags.
- **User-Space Operation**: RenegadeCMM installs and runs entirely in user space (`%LOCALAPPDATA%\Programs\RenegadeCMM`) without requiring administrative elevation. Stripping the elevation helper eliminates false positives while preserving full application functionality.
- **Code Signing**: Official release packages are signed with certificates provided by the [SignPath Foundation](https://signpath.org) through [SignPath.io](https://signpath.io).

## Security Architecture & Threat Model Disclosures

### 1. Local Native HTTP Bridge & CORS Isolation
RenegadeCMM provides an embedded HTTP/REST API bridge on `127.0.0.1:5174` to support the desktop UI, web browser mode, and external workflow automations.
- **Loopback Enforcement**: The bridge binds exclusively to `127.0.0.1` and drops any non-loopback network packets.
- **DNS Rebinding & Host Validation**: The server validates the HTTP `Host` header on all inbound requests against local hostnames (`localhost`, `127.0.0.1`, `::1`). External or rebinding hostnames are rejected with HTTP 403 Forbidden.
- **Strict Origin Checking & CSRF Defense**: Cross-Origin requests are checked using strict URL hostname matching. Browsers visiting third-party websites cannot issue unauthorized requests or extract sensitive local model data.

### 2. Electron Process & Navigation Security
- **Strict Content Security Policy (CSP)**: The renderer process enforces a CSP meta policy restricting script execution, styles, external font providers, and backend network sockets.
- **External Link Handling**: All window creation events (`window.open` / `target="_blank"`) are intercepted via `setWindowOpenHandler` and directed to the user's default OS browser via `shell.openExternal`.
- **Top-Level Navigation Guards**: The main application window restricts navigation away from local bundle origins.
- **Embedded Webview Sandboxing**: Attached `<webview>` elements (used for embedding the ComfyUI workspace) have preload scripts stripped and enforce `contextIsolation: true` and `nodeIntegration: false`.

### 3. API Key Hardening, Machine-Bound Encryption & Leak Prevention
- **Unified Machine-and-User Bound Encryption**: CivitAI API keys and Hugging Face tokens are encrypted at rest in the SQLite database (`app_config`) using authenticated AES-256-GCM. Cryptographic keys are derived using `scrypt` (`N=32768, r=8, p=1`) from unique machine and user entropy (`username:homedir:hostname:platform`). This binds stored credentials to the local machine and user account, providing solid defense against casual database theft.
- **Cross-Environment GUI & Headless CLI Compatibility**: The machine-bound scheme operates uniformly across both the Electron desktop main process and the standalone Node.js CLI runner (`cmm.sh` / `cmm.ps1`), avoiding fragmentation while ensuring seamless interoperability. A transparent migration layer decrypts legacy databases on first launch and automatically upgrades them to the new machine-bound scheme.
- **Local API Bridge Redaction**: The `/api/config` HTTP endpoint suppresses secret tokens and replaces them with boolean status flags (`has_civitai_api_key`, `has_huggingface_token`), preventing local scripts or rogue processes on the machine from scraping credentials from `127.0.0.1:5174`.
- **Sanitized Backup Exports**: All exported backup archives (both ZIP archives generated by `backupService` and JSON dumps produced by the CLI `export` command) explicitly sanitize configuration files and strip API keys. Raw database files are excluded from backup bundles, ensuring users can freely share configuration zips for troubleshooting without inadvertently distributing private tokens.
- **Ephemeral Download Tokens & Log Scrubbing**: Download task URLs stored in SQLite never persist authentication tokens (`?token=` is scrubbed before saving). Tokens are appended dynamically in-memory only when dispatching network requests to Civitai. In addition, `logger.ts` systematically sanitizes logs, scrubbing Bearer headers, sensitive URL query tokens, and credential JSON objects from console logs, disk logs, and diagnostic reports.

### 4. Custom Node Installation & Execution Boundaries
- **Python Environment Execution**: Installing custom nodes clones external Git repositories and invokes `pip install -r requirements.txt` and `python install.py` within the ComfyUI environment.
- **Inherent Risk**: Custom nodes in ComfyUI execute arbitrary Python code by design. RenegadeCMM enforces positional parameter boundaries (`--`) and directory traversal checks on target folders, but users should only install custom nodes from trusted authors and repositories.

### 5. Backup Archive Handling & adm-zip Notice
- Automated dependency scanners may report advisory `GHSA-vwc7-r8mq-g2x9` on `adm-zip` regarding symlink traversal during disk extraction.
- **Non-Exploitable Context**: RenegadeCMM utilizes `adm-zip` exclusively for creating backup archives and reading entry buffers in memory (`getData()`). CMM never extracts archive contents directly to disk via `extractAllTo` or follows destination symlinks, neutralizing this attack vector.

