# 🛡️ Renegade Core Model Manager (CMM) — Privacy Policy

**Effective Date:** September 3, 2026  
**Last Updated:** September 9, 2026  
**Project:** Renegade Core Model Manager (RenegadeCMM)  
**Maintainer:** TheStygianRenegade / /dev/null Inc

---

## 1. Core Commitment: 100% Local-First & Zero Telemetry

Renegade Core Model Manager ("CMM", "the Application", "we") is built from the ground up on the principle of **absolute user privacy and local-first data ownership**.

- **NO Tracking or Analytics:** CMM contains **zero** analytics tracking, telemetry collectors, usage trackers, session recorders, crash reporting daemons, or user behavior profiling.
- **NO Third-Party Advertising:** The Application has zero advertising networks, tracking pixels, or marketing SDKs.
- **NO Mandatory Cloud Accounts:** You do not need to create an account with us to use CMM. The Application runs locally on your computer.
- **NO Central Storage:** We do not operate remote servers that collect, store, or log your personal data, local file paths, or generated AI content.

---

## 2. API Keys & Authentication Secrets

CMM provides optional integration with external platforms (CivitAI and Hugging Face) to enable higher download rate limits, access to gated/private models, and NSFW content filtering.

### How Secrets are Stored

- **Local Storage Only:** When you enter an API key or access token, it is saved strictly on your local machine inside your local SQLite database (`renegadecmm.sqlite`).
- **Encryption at Rest:** Secrets are encrypted using authenticated **AES-256-GCM** encryption before being written to disk (see [`docs/APISecurity.md`](docs/APISecurity.md) for full cryptographic details).
- **Never Sent to CMM Servers:** Your keys and tokens are **never** transmitted to /dev/null Inc, the maintainers, or any proxy server.

### How Secrets are Transmitted

- **Direct HTTPS Only:** When downloading models or checking version metadata, your API key or token is transmitted directly from your computer to the respective upstream service provider over encrypted TLS/HTTPS:
  - **CivitAI API Key:** Sent directly to `civitai.com` (or user-specified CivitAI mirrors) via authorization headers or signed download tokens.
  - **Hugging Face Token:** Sent directly to `huggingface.co` via HTTP authorization headers to authenticate downloads for gated repositories.
- **Redacted from Logs:** API keys, access tokens, and sensitive credentials are automatically sanitized and redacted from in-app console logs and generated diagnostic reports.

### User Control & Deletion

- You can clear or revoke your stored API keys at any time by deleting the value in **Settings** and clicking **Save**. This permanently deletes the key from both active memory and local disk storage.

---

## 3. Local File Management & Storage Access

To organize models and inspect ComfyUI workflows, CMM requests access to local storage directories configured by the user.

### Scope of Access

- File system operations are strictly confined to:
  1. The user-configured ComfyUI installation folder and model subdirectories (`checkpoints/`, `loras/`, `vae/`, `controlnet/`, etc.).
  2. The workflow storage folders (`workflows/`, `user/default/workflows/`).
  3. The CMM application database and configuration directory (`renegadecmm.sqlite`).

### What Data is Processed

- **Metadata Indexing:** CMM reads file names, file sizes, modification timestamps, and calculates cryptographic SHA-256 checksums to index local libraries, resolve missing dependencies, detect duplicates, and check for upstream version updates.
- **Workflow Analysis:** CMM inspects `.json` workflow files and `.png` image metadata (`tEXt` / `iTXt` chunks) to identify required model filenames and custom node class types.

### Privacy Guarantees

- **Your Files Stay on Your Device:** Your local model files, workflow compositions, generated images, and directory structures are **never** uploaded, synced, or shared with remote servers.
- **Safe Deletion Controls:** CMM provides explicit options when removing models ("Remove from Library Only" vs. "Delete from Disk & Library") to protect you against accidental data loss.

---

## 4. External Network Communications

CMM only communicates over the network when explicitly necessary to fulfill features requested by you:

| Destination / Endpoint                                     | Purpose                                                                              | Trigger Condition                                        |
| :--------------------------------------------------------- | :----------------------------------------------------------------------------------- | :------------------------------------------------------- |
| **CivitAI** (`civitai.com`, `civitai.red`)                 | Model search, version checking, downloading models and preview images                | User browsing, searching, or downloading CivitAI assets  |
| **Hugging Face** (`huggingface.co`)                        | Repository inspection and downloading model weights                                  | User inspecting or downloading Hugging Face repositories |
| **GitHub** (`api.github.com`, `raw.githubusercontent.com`) | Checking for newer CMM commits and querying the ComfyUI-Manager custom node registry | Startup development update check, custom node resolution |
| **Local ComfyUI** (`127.0.0.1:8188` or custom host)        | Local instance health probing and 1-click workflow canvas injection                  | Workflows tab active or ComfyUI integration enabled      |
| **User Webhooks** (Custom URLs)                            | Dispatching download and update notifications                                        | Only if explicitly configured by the user in Settings    |

All external connections are initiated directly from your client machine to the specified endpoint without any intermediate proxy or logging server.

---

## 5. Localhost API Server (`127.0.0.1:5174`)

CMM runs an optional local HTTP bridge server for companion ComfyUI custom nodes and CLI utilities:

- **Localhost-Only Binding:** Bound strictly to loopback interface `127.0.0.1` by default.
- **Remote Access Blocked:** Remote IP addresses and non-local requests are rejected to ensure no unauthorized devices on your local network (LAN) or the internet can query your library or execute local actions.
- **Origin Verification:** Enforces strict HTTP Origin checking to mitigate cross-site request forgery from untrusted web pages.
- **Configurable:** Can be disabled or configured with custom port settings directly in Settings.

---

## 6. Data Retention & Erasure

Because CMM does not collect your data on remote servers:

- **Instant Purge:** Deleting models or clearing your library within CMM removes records from the local SQLite database.
- **Full Removal:** Uninstalling CMM and deleting the application directory (and `renegadecmm.sqlite`) permanently removes 100% of all stored application data, configurations, and cached metadata.
- **Symlinks & Directory Junctions:** If you configured symlinks (or NTFS junctions on Windows) to route models across folders or between generative tools, please note that uninstalling or deleting CMM will **not** delete those symlinks or their target files. Depending on your operating system, symlinks will remain on your drive and must be removed manually if desired. Symlinks are simply lightweight filesystem pointers (typically 0–1 KB) referencing your original files—they do not consume duplicate storage, so you don't need to worry about unexpected duplicate files floating around your drive.

---

## 7. Security & Vulnerability Reporting

We take application security seriously. If you discover a security vulnerability or privacy concern regarding how credentials or files are handled, please disclose it responsibly via our [Security Policy](SECURITY.md) or open a private security advisory on GitHub:

- **Security Advisory:** [https://github.com/DevNullInc/RenegadeCMM/security](https://github.com/DevNullInc/RenegadeCMM/security)
- **Maintainer Contact:** `contact-us@renegadeinc.net`

---

## 8. Updates to this Policy

As Renegade CMM continues to evolve (e.g. multi-generation backend support, local LLM orchestration), this privacy policy may be updated. All updates will be published directly in the repository with a revised "Last Updated" timestamp. Our fundamental commitment to **zero telemetry, local-first computing, and strict credential isolation** will never change.

**Major Changes:** Changes that may affect user privacy or data handling (e.g., adding new external services, modifying encryption methods, introducing telemetry) will be announced in release notes and via GitHub repository notifications at least 30 days before taking effect. **Security hardening improvements** (e.g., strengthening encryption, removing unnecessary network calls, hardening the API bridge) may be deployed immediately without advance notice to protect users.

---

*Last reviewed against source: September 9, 2026*