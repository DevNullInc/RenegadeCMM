# Contributing to Renegade Core Model Manager

Thank you for your interest in contributing to **Renegade Core Model Manager**! 🎉

This project is an open-source, community-driven desktop application built with Electron, React, TypeScript, and SQLite, designed to streamline model management, workflow dependency resolution, and automated downloads for ComfyUI.

---

## 📜 Table of Contents

- [Contributing to Renegade Core Model Manager](#contributing-to-renegade-core-model-manager)
  - [📜 Table of Contents](#-table-of-contents)
  - [🤝 Code of Conduct](#-code-of-conduct)
  - [💡 How Can I Contribute?](#-how-can-i-contribute)
    - [Reporting Bugs](#reporting-bugs)
    - [Suggesting Features \& Enhancements](#suggesting-features--enhancements)
    - [Submitting a Pull Request](#submitting-a-pull-request)
  - [🛠️ Development Setup](#️-development-setup)
    - [Prerequisites](#prerequisites)
    - [Quick Start](#quick-start)
  - [🏛️ Project Architecture](#️-project-architecture)
  - [📐 Code Style \& Guidelines](#-code-style--guidelines)
  - [🧪 Testing \& Verification](#-testing--verification)
  - [📝 Commit Message Conventions](#-commit-message-conventions)
  - [📄 License](#-license)

---

## 🤝 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and collaborative in all issues, pull requests, and discussions.

---

## 💡 How Can I Contribute?

### Reporting Bugs

If you discover a bug, please check the [existing issues](https://github.com/DevNullInc/RenegadeCMM/issues) first. If it hasn't been reported, open a new issue with:

- **A clear, descriptive title.**
- **Steps to reproduce the issue.**
- **Expected vs. actual behavior.**
- **Environment details:** Available in the "Settings" tab with your OS (Linux/Windows/macOS), Node.js version, Electron version, ComfyUI installation type (Portable vs. Standard venv).
- **Relevant logs or screenshots** (App logs can be found in-app under the settings tab or via terminal or developer console).

### Suggesting Features & Enhancements

Feature requests are always welcome! Before opening a feature request:

- Check [`ROADMAP.md`](ROADMAP.md) to see if the feature is already planned.
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

5. **Update documentation and [`CHANGELOG.md`](CHANGELOG.md)** for any notable additions or fixes.
6. **Push to your fork** and submit a Pull Request to `main`.

---

## 🛠️ Development Setup

### Prerequisites

- **Node.js**: `v18.0.0` or higher (Recommended: `v20.x` or `v22.x` LTS)
- **npm**: `v9.0.0` or higher
- **Git**
- Optional: ComfyUI local installation (for testing live model paths & workflow scanner)

### Quick Start

```bash
# 1. Clone your fork
git clone https://github.com/DevNullInc/RenegadeCMM.git
cd RenegadeCMM

# 2. Install dependencies
npm install

# 3. Launch development environment:
# On Linux / macOS:
./cmm.sh

# On Windows (PowerShell):
.\cmm.ps1

# Or run Vite + Electron manually:
npm run dev
```

---

## 🏛️ Project Architecture

```
RenegadeCMM/
├── src/
│   ├── main/                 # Electron main process (lifecycle, IPC, window management)
│   │   ├── index.ts          # Main process entry & HTTP API server bridge
│   │   └── preload.ts        # Context bridge exposing safe IPC methods
│   ├── services/             # Core backend services
│   │   ├── civitaiClient.ts  # CivitAI REST API client & proxy
│   │   ├── downloadManager.ts# Multi-threaded chunked downloader with speed limits
│   │   ├── libraryScanner.ts # SQLite local model indexer & SHA256 hasher
│   │   ├── nodeResolverService.ts # 4-Tier custom node resolver & Git installer
│   │   ├── workflowScanner.ts# In-memory & disk JSON/PNG workflow metadata parser
│   │   ├── backupService.ts  # SQLite & config backup creator (via adm-zip)
│   │   └── imageCacheService.ts # Local preview image caching
│   ├── components/           # React UI tabs & components
│   │   ├── BrowseTab.tsx     # CivitAI model browser with filters & tag selector
│   │   ├── LibraryTab.tsx    # Local models manager, duplicate inspector & updates
│   │   ├── WorkflowsTab.tsx  # Interactive visual node map & dependency matrix
│   │   ├── DownloadsTab.tsx  # Live download queue with speed graphs
│   │   ├── SettingsTab.tsx   # ComfyUI paths, auto-sorter & API bridge configuration
│   │   └── NodeResolutionCard.tsx # 1-click custom node installer UI
│   ├── types/                # TypeScript interfaces and shared type definitions
│   └── utils/                # Web bridge, logger, formatters, and helpers
├── tests/                    # Vitest unit and integration test suite
├── docs/                     # Technical documentation & API references
│   └── APISecurity.md        # API key / token encryption & storage security
├── ROADMAP.md                # Product milestones and development roadmap
└── CHANGELOG.md              # Historical log of notable changes
```

---

## 📐 Code Style & Guidelines

- **TypeScript**: Strict mode is enabled. Avoid `any` where possible and define clear interfaces in `src/types/`.
- **Styling**: Use curated, harmonious dark-mode palettes, smooth gradients, and glassmorphism styling consistent with the existing UI.
- **Security**:
  - The HTTP API Bridge (`127.0.0.1:5174`) is strictly bound to localhost. Never expose internal filesystem routes to external origins.
  - Process termination in `cmm.sh` / `cmm.ps1` must always verify process names to prevent closing external web browsers.
- **Archive Operations**: For internal application backups and database archives, use `adm-zip`.

---

## 🧪 Testing & Verification

All contributions must pass the test suite and TypeScript build without errors:

```bash
# Run automated Vitest test suite:
npm test

# Run build verification (TypeScript + Vite bundling):
npm run build
```

When implementing new features or resolving bugs, please add corresponding unit or integration tests in `tests/`.

---

## 📝 Commit Message Conventions

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

- Preserves LiteGraph canvas coordinates and bezier wiring
- Adds 1-click node installation and dependency status badges
```

---

## 📄 License

By contributing to **Renegade Core Model Manager**, you agree that your contributions will be licensed under the **GNU General Public License v3.0 (GPL-3.0)**.
