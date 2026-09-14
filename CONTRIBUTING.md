# Contributing to Renegade Core Model Manager

Thank you for your interest in contributing to **Renegade Core Model Manager**!

This project is an open-source, community-driven desktop application built with Electron, React, TypeScript, and SQLite, designed to streamline model management, workflow dependency resolution, automated downloads, and storage optimization for ComfyUI.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features & Enhancements](#suggesting-features--enhancements)
  - [Submitting a Pull Request](#submitting-a-pull-request)
- [Development Setup](#development-setup)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
- [Project Architecture](#project-architecture)
- [Code Style & Guidelines](#code-style--guidelines)
- [Testing & Verification](#testing--verification)
- [Commit Message Conventions](#commit-message-conventions)
- [License](#license)

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and collaborative in all issues, pull requests, and discussions.

---

## How Can I Contribute?

### Reporting Bugs

If you discover a bug, please check the [existing issues](https://github.com/DevNullInc/RenegadeCMM/issues) first. If it hasn't been reported, open a new issue with:

- **A clear, descriptive title.**
- **Steps to reproduce the issue.**
- **Expected vs. actual behavior.**
- **Environment details:** OS (Linux/Windows/macOS), Node.js version, Electron version, ComfyUI installation type (Portable vs. Standard venv).
- **Relevant logs or screenshots** (App logs can be viewed in the Settings tab or terminal).

### Suggesting Features & Enhancements

Feature requests are always welcome! Before opening a feature request:

- Check [`docs/ROADMAP.md`](docs/ROADMAP.md) to see if the feature is already planned.
- Explain the **use case**, **why it is valuable**, and any proposed interface designs or workflow implications.

### Submitting a Pull Request

1. **Fork the repository** and clone your fork locally.
2. **Create a topic branch** from `main`:

   ```bash
   git checkout -b feat/my-new-feature
   ```

3. **Make your changes** following our code guidelines and test coverage.
4. **Run the test suite and verify builds** cleanly:

   ```bash
   npm test
   npm run build
   ```

---

## Development Setup

### Prerequisites

- **Node.js**: `v20+` or `v22+ LTS` recommended (`node --version`)
- **npm**: `v10+` (`npm --version`)
- **Python 3**: (Optional, for PyTorch Pickle-to-SafeTensors converter) `python --version`
- **Git**: (`git --version`)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/DevNullInc/RenegadeCMM.git
cd RenegadeCMM

# 2. Automated environment provisioning (Node.js + Python .venv + PyTorch + SafeTensors)
# On Windows (PowerShell):
.\cmm.ps1 install
# On Linux / macOS:
./cmm.sh install

# 3. Launch the development environment
# Windows:
.\cmm.ps1 start
# Linux:
./cmm.sh start
# macOS:
./cmm-mac.sh start
```

---

## Project Architecture

```text
RenegadeCMM/
├── src/
│   ├── main/                 # Electron main process & privileged host bridge
│   │   ├── index.ts          # Main entry, IPC handlers, HTTP API Bridge (:5174)
│   │   └── preload.ts        # contextBridge API exposing window.civitaiAPI
│   ├── services/             # Core backend business logic & subsystems
│   │   ├── civitaiClient.ts  # CivitAI REST API v1 client
│   │   ├── huggingfaceClient.ts # Hugging Face Hub metadata & chunked download pipeline
│   │   ├── downloadManager.ts# Persistent chunked download queue
│   │   ├── libraryScanner.ts # Recursive folder scanner & 64MB SHA-256 accelerator
│   │   ├── storageOptimizer.ts # Hardlink deduplicator & companion packager
│   │   ├── modelConverter.ts # PyTorch Pickle to SafeTensors converter engine
│   │   ├── precisionInspector.ts # Tensor precision & optimizer state analyzer
│   │   ├── orphanFinder.ts   # Unused library model discovery engine
│   │   ├── hardwareScanner.ts# Host CPU/RAM/VRAM hardware telemetry
│   │   ├── swarmBridge.ts    # RenegadeSwarm sister daemon integration & window focus
│   │   ├── nodeResolverService.ts # 4-Tier custom node resolver & Git installer
│   │   ├── workflowScanner.ts# In-memory & disk JSON/PNG workflow parser
│   │   └── backupService.ts  # SQLite & config backup creator (via adm-zip)
│   ├── components/           # React UI tabs & components
│   │   ├── BrowseTab.tsx     # Dual-source model browser (CivitAI + HF Hub)
│   │   ├── LibraryTab.tsx    # Local models manager, duplicate inspector & updates
│   │   ├── WorkflowsTab.tsx  # React Flow visual node map & dependency matrix
│   │   ├── DownloadsTab.tsx  # Live download queue with speed graphs
│   │   └── SettingsTab.tsx   # ComfyUI paths, auto-sorter & API bridge configuration
│   ├── types/                # TypeScript interfaces and shared type definitions
│   └── utils/                # Web bridge, logger, formatters, and security validator
├── tests/                    # Vitest unit and integration test suite (19 suites, 107 tests)
├── docs/                     # Technical documentation & architecture specifications
│   ├── ARCHITECTURE.md       # Multi-process architecture & system design
│   ├── FEATURES.md           # Technical feature reference
│   ├── API_REFERENCE.md      # Local REST API documentation & examples
│   ├── APISecurity.md        # API key / token encryption & storage security
│   ├── ROADMAP.md            # Product milestones and development roadmap
│   └── DEV-CHANGELOG.md      # Rolling developer changelog for active sprint
├── CHANGELOG.md              # Historical log of notable releases
├── LEGAL.md                  # Statutory terms & third-party license notices
├── LICENSE                   # GNU General Public License v3.0
├── PRIVACY.md                # Privacy policy & local-first data guarantees
└── SECURITY.md               # Vulnerability disclosure policy & reporting
```

---

## Code Style & Guidelines

- **TypeScript**: Strict mode is enabled. Avoid `any` where possible and define clear interfaces in `src/types/`.
- **Styling**: Use curated, harmonious dark-mode palettes, smooth gradients, and glassmorphism styling consistent with the existing UI.
- **Security**:
  - The HTTP API Bridge (`127.0.0.1:5174`) is strictly bound to localhost. Never expose internal filesystem routes to external origins.
  - Process termination in `cmm.sh` / `cmm.ps1` must always verify process names to prevent closing external web browsers.
- **Archive Operations**: For internal application backups and database archives, use `adm-zip`.

---

## Testing & Verification

All contributions must pass the test suite and TypeScript build without errors:

```bash
# Run automated Vitest test suite:
npm test

# Run build verification (TypeScript + Vite bundling):
npm run build
```

When implementing new features or resolving bugs, please add corresponding unit or integration tests in `tests/`.

---

## Commit Message Conventions

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new user-facing feature or enhancement.
- `fix:` A bug fix.
- `docs:` Documentation changes only.
- `style:` Formatting, whitespace, or visual polish (no code logic changes).
- `refactor:` Code restructuring without changing external behavior.
- `test:` Adding or updating automated tests.
- `chore:` Build scripts, dependencies, or maintenance.

**Example:**

```git
feat: add interactive visual node map to Workflows tab

- Preserves React Flow canvas coordinates and bezier wiring
- Adds 1-click node installation and dependency status badges
```

---

## License

By contributing to **Renegade Core Model Manager**, you agree that your contributions will be licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)** without additional restrictions. See [LICENSE](LICENSE) and [LEGAL.md](LEGAL.md) for full statutory terms and source availability disclosures.
