# 🚀 Pull Request

## 📝 Summary

Provide a concise description of the changes introduced by this pull request:

- What does this PR accomplish?
- What problem does it solve, or what feature does it add?
- Closes or relates to issue: #

---

## 🏷️ Type of Change

Select all that apply:

- [ ] 🐛 **Bug fix**: Non-breaking change fixing an issue
- [ ] ✨ **New feature**: Non-breaking enhancement to functionality
- [ ] ⚡ **Performance improvement**: Optimization without functional changes
- [ ] 🧹 **Refactoring**: Code cleanup without behavioral changes
- [ ] 🔒 **Security hardening**: Enhancing validation, encryption, or sanitation
- [ ] 📚 **Documentation**: Updates to README, guides, or docstrings
- [ ] 🔧 **Build / Tooling**: Changes to scripts, CI workflows, or dependencies

---

## 🎯 Affected Components

Select the subsystems affected by this change:

- [ ] **Electron Main Process & IPC** (`src/main/`)
- [ ] **Frontend UI & React Components** (`src/components/`, `src/App.tsx`)
- [ ] **Model Clients & Networking** (`civitaiClient.ts`, `huggingfaceClient.ts`, `downloadManager.ts`)
- [ ] **Library & Workflow Scanners** (`libraryScanner.ts`, `workflowScanner.ts`, `nodeResolverService.ts`)
- [ ] **Database & Storage Engine** (`src/db/`, `secureStorage.ts`)
- [ ] **CLI Tooling & Launchers** (`src/cli/`, `bin/cmm.js`, launcher scripts)
- [ ] **Build Configuration & Packaging** (`package.json`, `electron-builder.json`, `vite.config.ts`)

---

## 🧪 Testing & Verification

Describe the testing performed to verify these changes:

### Automated Tests

- [ ] Unit & integration tests executed: `npm run test` (Vitest)
- [ ] Full production build verified: `npm run build` (TypeScript + Vite)

### Manual Verification

Describe manual test steps and observed results:

1.
2.
3.

---

## 📋 Quality & Compliance Checklist

Please ensure all criteria are met before requesting review:

- [ ] My code adheres to the project's code style, TypeScript conventions, and architecture.
- [ ] Any newly created source files include the standard **GNU GPL-3.0-or-later** header notice.
- [ ] No secrets, API keys, or private tokens are logged, stored in plaintext, or committed.
- [ ] Documentation (`README.md`, `CHANGELOG.md`, `FEATURES.md`, etc.) has been updated if applicable.
- [ ] Markdown files pass formatting and lint checks (`npx markdownlint-cli`).
- [ ] I understand and agree that my contributions are licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)** without additional restrictions.
