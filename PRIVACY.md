# 🛡️ Renegade Core Model Manager (CMM) — Privacy Policy

**Effective Date:** September 3, 2026  
**Last Updated:** September 9, 2026  
**Project:** Renegade Core Model Manager (RenegadeCMM)  
**Maintainer:** TheStygianRenegade / /dev/null Inc  
**Privacy & Legal Contact:** <legal@renegadeinc.net> (CC: <contact-us@renegadeinc.net>)  
**Source Repository:** <https://github.com/DevNullInc/RenegadeCMM>  

---

## 1. Core Commitment: 100% Local-First & Zero Telemetry

Renegade Core Model Manager ("CMM", "the Application", "we") is built from the ground up on the principle of **absolute user privacy and local-first data ownership**.

- **NO Tracking or Analytics:** CMM contains **zero** analytics tracking, telemetry collectors, usage trackers, session recorders, crash reporting daemons, or user behavior profiling.
- **NO Third-Party Advertising:** The Application has zero advertising networks, tracking pixels, or marketing SDKs.
- **NO Mandatory Cloud Accounts:** You do not need to create an account with us to use CMM. The Application runs entirely locally on your workstation.
- **NO Central Storage:** We do not operate remote servers that collect, store, or log your personal data, local directory paths, downloaded model files, or generated AI workflows.
- **User as Sole Custodian:** You retain 100% control and custody over your local database, downloaded files, and stored configuration options.

---

## 2. API Keys, Secret Storage & Ephemeral Authentication

CMM provides optional integration with external generative AI platforms (CivitAI and Hugging Face) to enable higher download rate limits, access to gated/private models, and NSFW content filtering.

### Machine-and-User Bound Encryption At Rest

- **Local Storage Only:** When you enter an API key or access token, it is persisted strictly on your local machine inside your local SQLite database (`renegadecmm.sqlite` / `app_config` table).
- **Authenticated Encryption:** Secrets are encrypted using **AES-256-GCM** with 256-bit keys derived via `scrypt` (`N=32768, r=8, p=1`).
- **Machine & User Entropy Derivation Disclosure:** The cryptographic salt is computed dynamically from local machine and user account identifiers (`cmm-entropy:<username>:<homedir>:<hostname>:<platform>`).
  - **Zero Transmission Guarantee:** This entropy string is derived strictly in volatile memory on your local machine to protect your credentials against offline disk theft. **It is never transmitted over the network, never sent to remote telemetry servers, and never stored in plaintext.**
- **Never Sent to CMM Maintainers:** Your keys and tokens are **never** transmitted to /dev/null Inc, the maintainers, or any proxy server.

### Ephemeral Download Authentication & URL Privacy

- **No Token Persistence in Download History:** When model download tasks are queued (`addTask`, `persistTask`), authentication query parameters (`?token=` and `&token=`) are stripped before writing the task record to SQLite. The persistent `downloads` table stores clean URLs without credentials.
- **In-Memory Injection Only:** Authentication tokens are attached dynamically in-memory immediately prior to dispatching HTTP requests to CivitAI or Hugging Face.
- **Direct HTTPS Transmissions:** All network requests authenticate directly with the destination provider over encrypted TLS/HTTPS:
  - **CivitAI API Key:** Sent directly to `civitai.com` (or user-specified CivitAI mirrors) via authorization headers or in-memory signed download tokens.
  - **Hugging Face Token:** Sent directly to `huggingface.co` via HTTP authorization headers to authenticate access to gated model repositories.
- **Automated Diagnostic Log Scrubbing:** Application loggers in `src/utils/logger.ts` automatically redact Bearer headers, query parameter tokens (`?token=...`, `&token=...`, `apiKey=...`), and JSON credential keys before streaming logs to the console, disk files, or IPC diagnostics.

### Dedicated User Control & Instant Purge

- **One-Click Clear Controls:** Dedicated "Clear Key" and "Clear Token" buttons in the **Settings** tab instantly purge credentials from the local SQLite database and zero active in-memory client instances.
- **Masked Input Protection:** Entering masked bullet characters (`••••••••`) in Settings will never overwrite or corrupt existing stored secrets. Supplying an empty string explicitly clears the credential.

---

## 3. Local File Management & Storage Access

To organize models and inspect ComfyUI workflows, CMM requests access to local storage directories configured by the user.

### Scope of Access

File system operations are strictly confined to:
1. The user-configured ComfyUI installation folder and model subdirectories (`checkpoints/`, `loras/`, `vae/`, `controlnet/`, `diffusion_models/`, `text_encoders/`, etc.).
2. The workflow storage folders (`workflows/`, `user/default/workflows/`).
3. The CMM application database and configuration directory (`renegadecmm.sqlite`).

### What Data is Processed Locally

- **Metadata Indexing:** CMM reads file names, file sizes, modification timestamps, and calculates cryptographic SHA-256 checksums to index local libraries, resolve missing dependencies, detect duplicates, and check for upstream version updates.
- **Workflow Analysis:** CMM inspects `.json` workflow files and `.png` image metadata (`tEXt` / `iTXt` chunks) to identify required model filenames and custom node class types.
- **Strict Local Boundaries:** Your local model files, workflow compositions, generated images, and directory structures are **never** uploaded, synced, or shared with remote servers.
- **Safe Deletion Controls:** CMM provides explicit options when removing models ("Remove from Library Only" vs. "Delete from Disk & Library") to protect you against accidental data loss.

---

## 4. External Network Communications & Third-Party Processors

CMM only communicates over the network when explicitly necessary to fulfill features requested by you:

| Destination / Endpoint | Purpose | Trigger Condition | Data Transmitted |
| :--- | :--- | :--- | :--- |
| **CivitAI** (`civitai.com`, `civitai.red`) | Model search, version checking, downloading models and preview images | User browsing, searching, or downloading CivitAI assets | Model queries, hash queries, optional API key for auth |
| **Hugging Face** (`huggingface.co`) | Repository inspection and downloading model weights | User inspecting or downloading Hugging Face repositories | Repository IDs, optional auth token for gated models |
| **GitHub Releases & API** (`api.github.com`, `github.com`) | Checking for application updates (`electron-updater`) and querying custom node mappings | Startup update check, Workflows tab custom node resolution | Release version tags, node class names; **no personal data** |
| **Python Package Index** (`pypi.org`) | Installing Python dependencies for resolved custom nodes | User triggers "Install Dependencies" for custom nodes | Package requests dispatched via local `pip` executable |
| **Local ComfyUI** (`127.0.0.1:8188` or custom host) | Local instance health probing and 1-click workflow canvas injection | Workflows tab active or ComfyUI integration enabled | Loopback queries to verify ComfyUI process status |
| **User Webhooks** (Custom URLs) | Dispatching download completion and update notifications | Configured explicitly by user in Settings | Event payloads (`task_id`, `model_name`, `status`) |

All external connections are initiated directly from your client machine to the specified endpoint without any intermediate proxy, tracker, or logging server operated by /dev/null Inc.

---

## 5. Localhost API Server (`127.0.0.1:5174`)

CMM runs an embedded local HTTP bridge server for companion ComfyUI custom nodes and CLI utilities:

- **Strict Loopback Binding:** Bound strictly to IPv4 loopback (`127.0.0.1`). External or non-loopback connections are rejected.
- **DNS Rebinding Defense:** Validates HTTP `Host` headers to prevent DNS rebinding attacks originating from malicious web pages.
- **Origin Checking:** Enforces strict HTTP Origin checking to mitigate cross-site request forgery (CSRF) from untrusted browser tabs.
- **Public API Credential Redaction:** The `/api/config` HTTP endpoint suppresses secret keys and outputs boolean flags (`has_civitai_api_key`, `has_huggingface_token`), preventing local scripts or extensions from harvesting stored credentials.
- **Bridge Kill-Switch:** The local API bridge can be completely disabled at any time in **Settings** (`local_api_enabled: false`).

---

## 6. Sanitized Community Backup Exports (ZIP & JSON)

RenegadeCMM provides tools to export configurations and library structures for migration or troubleshooting:

- **Automated Credential Stripping:** Backup ZIP archives generated by `backupService.ts` automatically sanitize `config.json` to strip `civitai_api_key` and `huggingface_token`.
- **Database Exclusion:** Raw SQLite database files (`renegadecmm.sqlite`) are excluded from backup bundles.
- **CLI Export Sanitization:** CLI JSON export dumps (`cmm export --format json`) filter out private tokens.
- **Community Safe Sharing:** You can safely share backup ZIP archives or workflow dumps with friends or community support forums without leaking your private credentials.

---

## 7. Data Custody & Statutory Rights (GDPR & CCPA/CPRA)

Although RenegadeCMM is a local-first software application with no central cloud infrastructure, we respect global privacy rights and align with the principles of the **General Data Protection Regulation (GDPR / UK GDPR)** and the **California Consumer Privacy Act (CCPA / CPRA)**:

### Data Controller vs. Data Processor Status

- **You are the Data Controller:** You retain sole legal custody and control of all model assets, generated imagery, workflow metadata, and API credentials managed by the software.
- **No Remote Processing:** Neither /dev/null Inc nor project maintainers act as Data Processors or possess access to, ownership of, or custody over your local data.

### Exercise of Privacy Rights

- **Right of Access & Portability:** All data collected locally is immediately accessible to you in standard open formats (SQLite database file `renegadecmm.sqlite` and JSON export bundles).
- **Right to Rectification & Erasure:** You can modify or permanently delete any model record, library entry, or configuration setting directly within the UI or by deleting the local database file.
- **Right to Restriction & Objection:** Because we collect no telemetry and operate no user accounts, you do not need to submit formal "opt-out" requests. Disabling external integrations or setting API keys to blank values halts all outbound traffic to external services.
- **"Do Not Sell or Share My Personal Information" (CCPA/CPRA):** We do not sell, rent, monetize, or disclose your personal information, local files, or usage data to any third party for commercial or advertising purposes.

### Children's Privacy (COPPA & GDPR Art. 8)

RenegadeCMM does not knowingly collect, solicit, or process personal information from children under 13 years of age (or under 16 in the European Economic Area and UK). The application is an administrative tool for desktop generative AI environments and is not directed at children.

---

## 8. Data Retention, Symlinks & Uninstallation

Because CMM does not collect your data on remote servers:

- **Instant Purge:** Deleting models or clearing your library within CMM removes records from the local SQLite database.
- **Full Removal:** Uninstalling CMM and deleting the application data directory (and `renegadecmm.sqlite`) permanently removes 100% of all stored application data, configurations, and cached metadata.
- **Symlinks & Directory Junctions:** If you configured symlinks (or NTFS junctions on Windows) to route models across folders, uninstalling CMM will **not** delete those symlinks or their target files. Symlinks remain lightweight filesystem pointers (0–1 KB) referencing your original files and can be deleted manually using standard OS file managers if no longer desired.

---

## 9. Security & Vulnerability Reporting

If you discover a security vulnerability or privacy flaw regarding credential handling or network isolation, please report it through our responsible disclosure channels:

- **Security Email:** <contact-us@renegadeinc.net> (CC: <bug-report@renegadeinc.net>) with subject line `[SECURITY] CMM Vulnerability Report`
- **GitHub Private Advisory:** [https://github.com/DevNullInc/RenegadeCMM/security/advisories/new](https://github.com/DevNullInc/RenegadeCMM/security/advisories/new)
- **Security Policy:** Review our full [Security Policy & Architecture Disclosures](SECURITY.md).

---

## 10. Updates to this Policy

As Renegade CMM continues to evolve, this privacy policy may be updated. All updates will be published directly in the repository with a revised "Last Updated" timestamp. Our core commitment to **zero telemetry, local-first computing, and strict credential isolation** is absolute and immutable.

- **Major Changes:** Any architectural change that introduces new network destinations or modifies data handling will be announced in release notes at least 30 days before taking effect.
- **Security Hardening:** Improvements that strengthen encryption, restrict network endpoints, or sanitize logs may be released immediately to protect users.

---

*Last reviewed against source: September 9, 2026*