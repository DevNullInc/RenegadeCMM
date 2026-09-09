# Legal Information & Notices

**Project:** Renegade Core Model Manager (RenegadeCMM)  
**Maintainer:** TheStygianRenegade / /dev/null Inc  
**Legal Contact:** <legal@renegadeinc.net> (CC: <contact-us@renegadeinc.net>)  
**Source Repository:** <https://github.com/DevNullInc/RenegadeCMM>  

---

## 1. Copyright & GNU General Public License v3.0

Renegade Core Model Manager is Copyright (C) 2025–2026 TheStygianRenegade / /dev/null Inc.

This program is free software: you can redistribute it and/or modify it under the terms of the **GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version (GPL-3.0-or-later)**.

The full license text is provided in the root [LICENSE](LICENSE) file and at <https://www.gnu.org/licenses/gpl-3.0.html>.

### Source Code Availability (GPL-3.0 Section 6)

In compliance with Section 6 of the GNU General Public License v3.0 (Conveying Non-Source Forms), complete Corresponding Source Code for all distributed binaries (Windows NSIS installers, Windows portable executables, Linux AppImages, Linux archives, and macOS DMGs) is freely and publicly accessible at:

- **Primary Repository:** <https://github.com/DevNullInc/RenegadeCMM>
- **Legacy Repository / Mirror:** <https://github.com/DevNullInc/Civitai-manager-ComfyUI>

Anyone receiving distributed binaries of this software has the right to access, inspect, modify, and recompile the Corresponding Source Code under the terms of GPL-3.0.

### Contributing & License Terms

By submitting contributions, pull requests, or patches to this project, you agree that your contributions are licensed under the terms of the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**, without additional restrictions or proprietary encumbrances.

---

## 2. Statutory Disclaimer of Warranty (GPL-3.0 Section 15)

In accordance with Section 15 of the GNU General Public License v3.0:

> **THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY APPLICABLE LAW. EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE. THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM IS WITH YOU. SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF ALL NECESSARY SERVICING, REPAIR OR CORRECTION.**

### Supplementary Operational Disclaimers

Without limiting the statutory disclaimer above:
- **Filesystem & Data Integrity:** RenegadeCMM modifies local files, moves downloaded weights, unpacks archive entries, and updates ComfyUI directory trees. You assume full responsibility for maintaining backups of your files, workflows, and custom node directories.
- **ComfyUI Compatibility:** ComfyUI and third-party custom nodes evolve independently. We do not guarantee uninterrupted compatibility with all ComfyUI releases, custom node packages, Python environments, or operating system updates.
- **Local Security Environment:** While stored API credentials are encrypted at rest using machine-and-user bound AES-256-GCM, the software cannot protect against active keyloggers, rootkits, compromised Node.js dependencies, or administrative access under your operating system account.

---

## 3. Statutory Limitation of Liability (GPL-3.0 Section 16 & Section 17)

In accordance with Section 16 of the GNU General Public License v3.0:

> **IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS), EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.**

Section 17 of the GNU General Public License v3.0 applies to the interpretation of Sections 15 and 16. If the disclaimer of warranty and limitation of liability provided above cannot be given local legal effect according to their terms, reviewing courts shall apply local law that most closely approximates an absolute waiver of all civil liability in connection with the Program.

### Specific Scope of Liability Exclusion

To the maximum extent permitted by applicable law, /dev/null Inc, TheStygianRenegade, and project contributors shall have no liability arising out of or related to:
- Interruption, modification, or termination of third-party APIs or download endpoints (CivitAI, Hugging Face, GitHub).
- Unintentional loss, corruption, or overwriting of models, workflows, generated images, or custom configurations.
- Any actions taken by third-party custom node installation scripts (`requirements.txt`, `install.py`) executed within your local ComfyUI environment.

---

## 4. Third-Party Content, Services & Trademarks

RenegadeCMM is an automation and management tool. **It does not host, curate, store, or distribute model weights, checkpoints, LoRAs, VAEs, or generative AI assets.**

- **CivitAI Integration:** Model downloads and metadata queries communicate directly with civitai.com. Models retrieved from CivitAI are created by third parties and governed by the respective creator's license (e.g., OpenRAIL, Creative Commons, or custom permissions). Users are solely responsible for verifying and complying with model usage rights.
- **Hugging Face Integration:** Model repository queries and gated downloads connect directly to huggingface.co. Access to gated or restricted models requires compliance with individual repository licenses and user agreements established on Hugging Face.
- **GitHub Integration:** Custom node resolution references public repositories on github.com. Cloned repositories are licensed under terms set by their respective authors.
- **Trademark Notice:** "ComfyUI", "CivitAI", "Hugging Face", "GitHub", "Electron", "SQLite", and other product names or marks referenced herein are trademarks or registered trademarks of their respective owners. RenegadeCMM is an independent open-source project and is not affiliated with, sponsored by, or endorsed by any of these organizations.

---

## 5. Cryptography & Export Control Compliance

RenegadeCMM implements cryptographic algorithms strictly for local at-rest confidentiality and data integrity:

- **Algorithm & Scheme:** Authenticated AES-256-GCM encryption with key derivation via `scrypt` (`N=32768, r=8, p=1`) utilizing dynamic machine-and-user entropy (`cmm-entropy:<username>:<homedir>:<hostname>:<platform>`).
- **Purpose:** Protecting user-supplied CivitAI API keys and Hugging Face personal access tokens stored in the local SQLite database (`app_config` table) against casual offline theft.
- **U.S. Export Administration Regulations (EAR):** This software is publicly available open-source software under 15 C.F.R. § 734.7. Complete source code is published openly and free of charge. It qualifies for export under U.S. EAR publicly available encryption software exceptions (15 C.F.R. § 742.15(b)).
- **International Users:** Users outside the United States are solely responsible for ensuring compliance with all local laws and regulations governing the import, export, and use of cryptographic software in their respective jurisdictions.

---

## 6. Third-Party Open Source Licenses & GPL-3.0 Compatibility

RenegadeCMM incorporates, bundles, or links with several open-source libraries. In accordance with Section 5(c) and Section 7 of the GNU General Public License v3.0, all bundled third-party libraries use permissive open-source licenses that are formally recognized by the Free Software Foundation (FSF) as fully compatible with GPL-3.0:

| Component | Upstream License | FSF GPL-3.0 Compatibility | Role in RenegadeCMM |
| :--- | :--- | :--- | :--- |
| **Electron** | MIT (Chromium: BSD/MIT/LGPL) | Compatible | Cross-platform desktop runtime framework |
| **LiteGraph.js** | MIT | Compatible | Node canvas workflow rendering & graph inspection |
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
| **ComfyUI** | GPL-3.0 | Compatible | External integration target for model directories |

Full license texts for all bundled open-source dependencies are preserved in the `node_modules` manifests of binary release distributions and acknowledged in [LICENSE](LICENSE).

---

## 7. Code Signing & Digital Certificates

Official release binaries of RenegadeCMM are digitally signed with code signing certificates provided by the **[SignPath Foundation](https://signpath.org)** through **[SignPath.io](https://signpath.io)**:

- Code signing certificates verify binary integrity and attest that release packages have not been tampered with or modified since compilation in the official CI/CD pipeline.
- Digital signatures provide binary provenance and do not constitute an endorsement, warranty, or assumption of liability by the SignPath Foundation.

---

## 8. Governing Law & Severability

These legal notices and disclaimers shall be governed by and construed in accordance with the laws of the United States and the State of Oregon, without regard to conflicts of law principles.

- **Severability:** If any provision of these legal notices is determined by a court of competent jurisdiction to be invalid, illegal, or unenforceable, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
- **GPL-3.0 Supremacy:** In the event of any conflict between the text of this `LEGAL.md` file and the GNU General Public License v3.0, the terms of the GNU General Public License v3.0 shall control and prevail.

---

## 9. Revisions & Updates

We may update these notices periodically as the project and its legal context evolve. Updates will be reflected in this file with a revised "Last Updated" timestamp. Continued use of the software after such revisions signifies your acknowledgment of the updated terms.

**Last Updated:** September 9, 2026  
**Applicable Release:** RenegadeCMM v1.4.2 and subsequent releases