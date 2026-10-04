# Legal Information & Notices

**Project:** Renegade Core Model Manager (RenegadeCMM)  
**Maintainer:** TheStygianRenegade / /dev/null Inc  
**Legal Contact:** <legal@renegadeinc.net> (CC: <contact-us@renegadeinc.net>)  
**Source Repository:** <https://github.com/DevNullInc/RenegadeCMM>

---

## Software Classification

Renegade Core Model Manager is **desktop productivity software**, not a:
- Content hosting platform
- Social media service  
- Cloud computing service
- Online marketplace

**Legal Status**: CMM is functionally equivalent to package managers (npm, pip, Steam) or download clients (curl, wget) — a local desktop tool for fetching and organizing files from public repositories on your personal workstation.

---

## 1. Copyright & Business Source License 1.1 (BUSL-1.1)

Renegade Core Model Manager is Copyright (C) 2025–2026 TheStygianRenegade / /dev/null Inc.

This software is licensed under the **Business Source License 1.1 (BUSL-1.1)**, with an automatic conversion to the **GNU General Public License v3.0 or later (GPL-3.0-or-later)** four (4) years from the date of release.

The full license text is provided in the root [LICENSE](LICENSE) file.

### Summary of Licensing Terms & Additional Use Grant

1. **Single-User Evaluation & Individual Use:** The software is provided on a single-user evaluation model with all features and capabilities fully functional without artificial lockouts or timeouts. Individual users are invited to purchase a single-user license or support ongoing development. Polite reminder notices may be displayed periodically, but will never disable features, lock data, or impair application functionality.
2. **Commercial & Multi-User Requirements (> 5 Persons):** Any business, studio, company, enterprise, or location with more than five (5) individuals (employees, contractors, or active users) must obtain a commercial enterprise license prior to production deployment. Inquiries: <licensing@renegadeinc.net>.
3. **GitHub Sponsors Grant ($10+ USD):** Supporters who contribute $10 or more (one-time or monthly) via GitHub Sponsors receive a complimentary single-user license key. To claim, email your GitHub username and public signature key to <licensing@renegadeinc.net>.
4. **Managed Service Protection:** You may not host or offer the software as a paid cloud, managed SaaS, or multi-tenant API service in competition with the Licensor.
5. **Sunset to GPL-3.0-or-later:** On the fourth (4th) anniversary of any released version, the licensing for that specific release permanently and irrevocably converts to the **GNU General Public License v3.0 or later**.

### Source Code Availability

The source code for Renegade Core Model Manager is openly and publicly available for inspection, auditing, and building at:

- **Primary Repository:** <https://github.com/DevNullInc/RenegadeCMM>
- **Mirror / Downstream:** <https://github.com/DevNullInc/Civitai-manager-ComfyUI>

### Contributing & License Terms

By submitting contributions, pull requests, or patches to this project, you agree that your contributions will be licensed under the terms of the project's **Business Source License 1.1 (BUSL-1.1)** and will transition to **GPL-3.0-or-later** pursuant to the Change Date terms, without additional encumbrances.

---

## 2. Disclaimer of Warranty

In accordance with the Business Source License 1.1 terms and statutory standards:

> **THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.**

### Supplementary Operational Disclaimers

Without limiting the statutory disclaimer above:

- **Filesystem & Data Integrity:** RenegadeCMM modifies local files, moves downloaded weights, unpacks archive entries, and updates ComfyUI directory trees. You assume full responsibility for maintaining backups of your files, workflows, and custom node directories.
- **PyTorch Pickle to SafeTensors Conversion:** Model conversion executes local Python scripts using PyTorch and SafeTensors libraries to serialize legacy `.ckpt`, `.pt`, and `.bin` files into `.safetensors`. While the Application performs local hardware telemetry and memory safety checks to prevent Out-Of-Memory (OOM) crashes, conversions depend on host memory availability. Opting to delete original files permanently removes the legacy checkpoint once verified.
- **Storage Optimizer & Hardlink Deduplication:** Hardlinking utilizes native filesystem allocation links (NTFS hardlinks on Windows, ext4/btrfs on Linux, APFS on macOS). Hardlinked files share identical disk blocks; modifying or overwriting one path alters all referencing instances on that volume.
- **ComfyUI Compatibility:** ComfyUI and third-party custom nodes evolve independently. We do not guarantee uninterrupted compatibility with all ComfyUI releases, custom node packages, Python environments, or operating system updates.
- **Local Security Environment:** While stored API credentials are encrypted at rest using machine-and-user bound AES-256-GCM, the software cannot protect against active keyloggers, rootkits, compromised Node.js dependencies, or administrative access under your operating system account.

---

## 3. Limitation of Liability

In accordance with the Business Source License 1.1 terms and statutory standards:

> **IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS), EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.**

If the disclaimer of warranty and limitation of liability provided above cannot be given local legal effect according to their terms, reviewing courts shall apply local law that most closely approximates an absolute waiver of all civil liability in connection with the Program.

### Specific Scope of Liability Exclusion

To the maximum extent permitted by applicable law, /dev/null Inc, TheStygianRenegade, and project contributors shall have no liability arising out of or related to:

- Interruption, modification, or termination of third-party APIs or download endpoints (CivitAI, Hugging Face, GitHub).
- Unintentional loss, corruption, or overwriting of models, workflows, generated images, or custom configurations.
- Any actions taken by third-party custom node installation scripts (`requirements.txt`, `install.py`) executed within your local ComfyUI environment.
- Out-of-memory terminations or hardware resource pressure during PyTorch model conversions.
- Automated client-side revocation, local identity key invalidation, or the recording of hardware-bound revocation tombstones (`.cmm_tombstone.vault`) triggered by integrity canaries, binary tampering, function hooking, or malicious network behavior.
- Any resulting inability to access, decrypt, or synchronize assets, compute jobs, or distributed shards across dependent satellite services (including RenegadeSwarm, SwarmForge, or RenegadeVault) once local identity material is burned.

---

## 4. Third-Party Content, Services & Trademarks

RenegadeCMM is an automation and management tool. **It does not host, curate, store, or distribute model weights, checkpoints, LoRAs, VAEs, or generative AI assets.**

- **CivitAI Integration:** Model downloads and metadata queries communicate directly with civitai.com. Models retrieved from CivitAI are created by third parties and governed by the respective creator's license (e.g., OpenRAIL, Creative Commons, or custom permissions). Users are solely responsible for verifying and complying with model usage rights and [CivitAI Terms of Service](https://civitai.com/terms).
- **Hugging Face Integration:** Model repository queries and gated downloads connect directly to huggingface.co. Access to gated or restricted models requires compliance with individual repository licenses and [Hugging Face Terms of Service](https://huggingface.co/terms).
- **GitHub Integration:** Custom node resolution references public repositories on github.com. Cloned repositories are licensed under terms set by their respective authors.
- **ComfyUI Integration:** Target workflow execution environments are licensed under the upstream [ComfyUI License](https://github.com/comfyanonymous/ComfyUI/blob/master/LICENSE).
- **Trademark Notice:** "ComfyUI", "CivitAI", "Hugging Face", "GitHub", "Electron", "SQLite", "React Flow", "PyTorch", and other product names or marks referenced herein are trademarks or registered trademarks of their respective owners. RenegadeCMM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by any of these organizations.

### Age Requirements & Mature Content Opt-In

CMM includes optional access to mature content (via CivitAI and mirror integration). By enabling NSFW filters in application settings, you certify that you are at least 18 years of age (or the legal age of majority in your jurisdiction).

---

## 5. Cryptography & Export Control Compliance

RenegadeCMM implements cryptographic algorithms strictly for local at-rest confidentiality, authentication, identity authorization, and data integrity:

- **Symmetric Encryption & Key Derivation:** Authenticated AES-256-GCM encryption with key derivation via `scrypt` (`N=32768, r=8, p=1`) utilizing dynamic machine-and-user entropy (`cmm-entropy:<username>:<homedir>:<hostname>:<platform>`) for protecting user-supplied API credentials and securing hardware-bound revocation tombstones.
- **Asymmetric Digital Signatures & Identity Keys:** Standard Ed25519 (Edwards-curve Digital Signature Algorithm) key generation, signing, and public key verification utilized for local client identity provisioning, cryptographic proof-of-ownership challenges, and decentralized token validation.
- **State Integrity & Hashing:** SHA-256 state hashing and hardware-bound entropy collection for tamper tripwires, local integrity validation, and non-repudiation tracking.
- **Purpose:** Securing user credentials at rest against offline extraction, enforcing client licensing and ownership contracts without telemetry, detecting binary or memory-hook tampering, and preventing forged inter-process communications.
- **U.S. Export Administration Regulations (EAR):** This software is publicly available open-source software under 15 C.F.R. § 734.7. Complete source code is published openly and free of charge. It qualifies for export under U.S. EAR publicly available encryption software exceptions (15 C.F.R. § 742.15(b)).
- **International Users:** Users outside the United States are solely responsible for ensuring compliance with all local laws and regulations governing the import, export, and use of cryptographic software in their respective jurisdictions.

---

## 6. Third-Party Open Source Licenses & Compatibility

RenegadeCMM incorporates, bundles, or links with several open-source libraries. All bundled third-party libraries use permissive open-source licenses that are compatible with the Business Source License 1.1 and downstream Change License terms:

| Component | Upstream License | Compatibility | Role in RenegadeCMM |
| :--- | :--- | :--- | :--- |
| **Electron** | MIT (Chromium: BSD/MIT/LGPL) | Compatible | Cross-platform desktop runtime framework |
| **@xyflow/react (React Flow)** | MIT | Compatible | Offline interactive visual node canvas & workflow inspection |
| **SQLite (Core Engine)** | Public Domain | Compatible | Embedded database storage engine |
| **sqlite3 (npm package)** | BSD 3-Clause | Compatible | Node.js native binding layer for SQLite |
| **lucide-react** | ISC | Compatible | UI icons and interface visual assets |
| **react / react-dom** | MIT | Compatible | Frontend reactive component framework |
| **react-window** | MIT | Compatible | Virtualized list rendering for large model libraries |
| **adm-zip** | MIT | Compatible | ZIP backup export and archive buffer parsing |
| **axios** | MIT | Compatible | HTTP client for remote API requests and streaming |
| **chokidar** | MIT | Compatible | Filesystem watcher for model folder synchronization |
| **electron-log** | MIT | Compatible | Local file and console diagnostic logging |
| **electron-updater** | MIT | Compatible | GitHub release update detection and notification |
| **keytar** | MIT | Compatible | Native OS credential store interface layer |
| **Vite** | MIT | Compatible | Frontend build tooling and local preview server |
| **TypeScript** | Apache-2.0 | Compatible | Type system and static analysis compiler |
| **Vitest** | MIT | Compatible | Unit and integration test runner suite |
| **PyTorch (torch)\*** | BSD 3-Clause | Compatible | Optional runtime dependency for pickle tensor conversion |
| **safetensors\*** | Apache-2.0 | Compatible | Optional runtime dependency for zero-copy tensor writing |
| **ComfyUI** | GPL-3.0 | Compatible | External integration target for model directories |

*\*Note: PyTorch and SafeTensors are external Python runtime dependencies utilized in conversion tasks and are not statically linked into the Node.js/Electron application binary.*

Full license texts for all bundled open-source dependencies are preserved in the `node_modules` manifests of binary release distributions and acknowledged in [LICENSE](LICENSE).

---

## 7. Governing Law & Severability

These legal notices and disclaimers shall be governed by and construed in accordance with the laws of the United States and the State of Oregon, without regard to conflicts of law principles.

- **Severability:** If any provision of these legal notices is determined by a court of competent jurisdiction to be invalid, illegal, or unenforceable, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
- **License Supremacy:** In the event of any conflict between the text of this `LEGAL.md` file and the root [LICENSE](LICENSE) file (Business Source License 1.1), the terms of the `LICENSE` file shall control and prevail.

---

## 8. Revisions & Updates

We may update these notices periodically as the project and its legal context evolve. Updates will be reflected in this file with a revised "Last Updated" timestamp. Continued use of the software after such revisions signifies your acknowledgment of the updated terms.

**Last Updated:** September 30, 2026  
**Applicable Release:** RenegadeCMM v1.7.0 and subsequent releases
