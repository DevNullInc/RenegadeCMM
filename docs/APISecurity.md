# 🔐 Renegade Core Model Manager (CMM) — API Key & Secret Storage Security

**Audience:** Users, contributors, and security reviewers.
**Scope:** How the CivitAI API key and HuggingFace access token are handled, encrypted, stored, transmitted, and used at runtime — in both the desktop (Electron) and browser (dev) builds of this app.

> **Trust is paramount.** The CivitAI API key can spend compute credits and is effectively a credential to your CivitAI account; the HuggingFace token can access private/gated models. This document explains exactly what the app does with them so you can make an informed decision about whether (and where) to store them.

---

## 1. What secrets does the app store?

| Secret | Settings field | What it unlocks |
|--------|----------------|-----------------|
| **CivitAI API key** | "CivitAI API Key" | NSFW / private / creator-restricted downloads, higher rate limits |
| **HuggingFace access token** (`hf_...`) | "HuggingFace Token" | Downloading gated models from HuggingFace |

These are **optional**. The app functions fully without them for public models.

---

## 2. Where secrets live after you save them

| Layer | Storage location | Format |
|-------|------------------|--------|
| **On disk (persisted)** | SQLite `app_config` table, keys `civitai_api_key` and `huggingface_token` | AES-256-GCM machine-bound ciphertext (`mb_gcm:...`), JSON-quoted in a `key/value` row |
| **In memory (runtime)** | The process `currentConfig` object | Plaintext (required to authenticate requests) |
| **Network (transmit)** | CivitAI downloads / HuggingFace requests | Token passed to the remote API in-memory (see §4) |
| **Local HTTP Bridge** | `GET /api/config` on `127.0.0.1:5174` | Redacted: boolean flags `has_civitai_api_key` and `has_huggingface_token` |
| **Renderer / IPC** | Settings tab `<input type="password">` / IPC `get-config` | Masked with bullets (`••••••••`); never written to `localStorage` |
| **Backup Exports** | `backupService` ZIPs & CLI JSON dumps | Sanitized: API keys stripped; raw SQLite database excluded from ZIPs |

The database file location:

- **Electron (packaged):** `%APPDATA%/<app>/` on Windows, `~/Library/Application Support/<app>/` on macOS, `~/.config/<app>/` on Linux.
- **Browser dev build (vite):** the vite dev-server database in the project directory (dev-only; not meant for production).

---

## 3. How keys are encrypted at rest

All secrets are encrypted **before** being written to the `app_config` table, using the app's `src/utils/secureStorage.ts`:

- **Algorithm:** `AES-256-GCM` (authenticated encryption — detects tampering).
- **Key derivation:** `crypto.scryptSync(secret, machineSalt, 32)` producing a 256-bit key, using `N=32768, r=8, p=1`.
- **Machine & User Entropy:** `machineSalt` is dynamically computed from user and host identifiers (`cmm-entropy:<username>:<homedir>:<hostname>:<platform>`). Decryption requires the identical machine and user account.
- **Per-value IV:** a fresh random 12-byte IV per encryption.
- **Auth tag:** GCM auth tag (16 bytes) is stored with the ciphertext and verified on decrypt.
- **Record format:** `mb_gcm:ivHex:authTagHex:ciphertextHex` stored as a single string value.
- **Legacy Migration:** Transparent backward compatibility automatically detects legacy `iv:authTag:ciphertext` values, decrypts them, and re-encrypts under the machine-bound format during startup and CLI invocation.

The full write path (`ipcMain.handle('save-config')` and the matching HTTP/CLI paths):

```
user types key  →  encryptKey(plaintext)  →  JSON.stringify(ciphertext)
              →  INSERT OR REPLACE INTO app_config ('civitai_api_key', value)
```

The full read path (`loadConfigFromDb()` at startup):

```
app_config row  →  decryptKey(ciphertext)  →  plaintext
              →  currentConfig.civitai_api_key  →  civitaiClient.setApiKey(key)
```

---

## 4. How secrets are used at runtime

- **CivitAI API:** The key is never stored raw in the DB. At runtime it is sent as an HTTP `Authorization: Bearer <key>` header on API calls.
- **Ephemeral Download Tokens:** Download task URLs saved to SQLite (`downloads` table) have `?token=` and `&token=` stripped upon ingestion (`addTask`, `persistTask`). Authentication tokens are attached in-memory immediately prior to dispatching HTTP requests, ensuring persistent records and diagnostic dumps stay free of secrets.
- **HuggingFace:** The token is sent as an `Authorization: Bearer <token>` header to `huggingface.co`.
- **Automated Log Scrubbing:** `src/utils/logger.ts` intercepts all console, disk, and IPC log outputs, redacting Bearer headers, query parameter tokens (`?token=...`, `&token=...`, `apiKey=...`), and JSON credential keys before emission.

---

## 5. Security model & cross-environment parity

- **Cross-Environment Parity (Desktop GUI + Standalone CLI):** RenegadeCMM can be operated either via the Electron desktop interface or via headless CLI scripts (`cmm.sh` / `cmm.ps1`). Standard OS-only keychains (such as Chromium's `safeStorage` DPAPI on Windows) are inaccessible to external Node.js CLI processes. Utilizing machine-and-user entropy ensures both environments decrypt the exact same SQLite database seamlessly.
- **Casual Theft Resistance:** If a database file or backup is stolen offline or copied to another machine or user profile, the ciphertext cannot be decrypted without the originating machine's environment and username entropy.
- **Root/Local Compromise Limitation:** As with any local application where the decryption routine runs within user space, an attacker with full interactive code execution under your exact user account on the same machine could derive the entropy. For shared or high-risk multi-user workstations, avoid saving credentials permanently or clear them when finished.

---

## 6. Practical security guidance for users

Since a leaked CivitAI key can **cost you money** (credits) and expose private/NSFW content tied to your account:

- **Use a token with scoped permissions** where possible, and revoke it if you no longer use it. CivitAI lets you create and revoke API tokens from **Account Settings → API Keys**.
- **Dedicated Clear Buttons:** Use the one-click "Clear Key" or "Clear Token" buttons in the Settings tab to instantly purge stored secrets from the database and zero active in-memory clients.
- **Safe Community Backups:** Built-in backup export (`backupService`) automatically strips API keys from `config.json` and excludes raw SQLite database files. You can safely share backup ZIP archives with friends or community members for folder mapping or model troubleshooting.
- **Log out / clear on shared machines:** On a shared machine, use the Clear buttons after your session.

---

## 7. Guidelines for developers / contributors

- **Never log a key or token.** Automated sanitizers in `logger.ts` provide defense-in-depth, but always avoid passing plaintext secrets to log statements.
- **Keep secrets out of `localStorage`.** Secrets live only in the DB (encrypted) and memory — never in `localStorage`.
- **Sanitize public endpoints.** When exposing new configuration or status endpoints on the local HTTP bridge (`src/server/index.ts`), always redact credentials using `sanitizeConfigForClient()`.
- **Route auth-required links through the OS browser.** Links to CivitAI account/API-key pages and HuggingFace token pages open via `shell.openExternal` (the user's real browser) so users can verify the HTTPS certificate/URL themselves — never inside the embedded Electron window.

### Status of Hardening Roadmap

- [x] Machine-and-user bound authenticated encryption (`mb_gcm:`).
- [x] Ephemeral download tokens (URL query tokens stripped before DB persistence).
- [x] Local HTTP bridge credential redaction (`has_civitai_api_key`, `has_huggingface_token`).
- [x] Sanitized community backup exports (ZIP & JSON).
- [x] Dedicated one-click "Clear Key" and "Clear Token" controls in Settings UI.
- [x] Automated log scrubbing for Bearer tokens, query strings, and credential keys.

---

## 8. Related files

| Concern | Location |
|---------|----------|
| Encryption / decryption primitives | `src/utils/secureStorage.ts` |
| Config sanitization & redaction | `src/utils/configSanitizer.ts` |
| Config load & startup migration | `src/main/index.ts` → `loadConfigFromDb()` |
| Config save / key write | `src/main/index.ts` → `ipcMain.handle('save-config')` |
| Local HTTP REST API bridge | `src/server/index.ts` |
| Ephemeral download token handling | `src/services/downloadManager.ts` |
| Log sanitization | `src/utils/logger.ts` |
| Backup export sanitization | `src/services/backupService.ts` |
| CLI config loader & exporter | `src/cli/index.ts` |
| External link handling | `src/main/index.ts` → `ipcMain.handle('open-external')` |

---

*Last reviewed against source: current development build. This document accurately reflects the current machine-bound encryption, API redaction, and download token architecture.*
