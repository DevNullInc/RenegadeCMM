# Renegade Core Model Manager — Development Changelog

This document serves as the active, rolling changelog for unreleased features, improvements, architectural updates, and bug fixes during active development cycles.

**Lifecycle Policy**:
1. All incremental changes, fixes, and features are logged here in real-time under **Unreleased (Active Cycle)**.
2. When creating a new official version release/build, the contents of this file are promoted into the permanent [CHANGELOG.md](../CHANGELOG.md) / Release Notes, and this file is reset/cleared for the next cycle.

---

## [Unreleased] - Active Development Cycle (Target: v1.7.0)

### Smart Collections, Trigger Hub & Semantic Search (Phase 4)
- **LoRA Trigger Word & Prompt Injector**:
  - One-click copy and direct ComfyUI node injection of trained trigger words and recommended LoRA strength weights.
- **Custom Collections & Smart Playlists**:
  - Group models by project, art style, or architecture (*"Flux Realism Setup"*, *"SDXL Inpainting Kit"*, *"Anime Style LoRAs"*).
- **Local Semantic Search**:
  - Embed local model descriptions and prompt tags with a lightweight embedded vector index for natural language queries.

### Pickle-to-SafeTensors Converter Architecture Overhaul
- **Generic Dynamic Archive Introspection (`scripts/convert_to_safetensors.py` & `modelConverter.ts`)**:
  - Support arbitrary nested state dict hierarchies, standalone DiT transformers, VAEs, and text encoders.
  - Modular conversion profiles preserving original tensor metadata and layer precision.
  - Chunked streaming conversion for large models (> 10GB) to prevent host CPU memory exhaustion.

### Ongoing Bug Fixes & Refactoring
- *No active branch changes staged.*
