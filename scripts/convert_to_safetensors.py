#!/usr/bin/env python3
# Renegade Core Model Manager (RenegadeCMM)
# Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
#
# Licensed under the Business Source License 1.1 (BUSL-1.1).
# Single-user evaluation model with fully functional features.
# Commercial enterprise license required for organizations with > 5 persons.
# Inquiries: licensing@renegadeinc.net
# Converts to GNU General Public License v3.0 or later (GPL-3.0-or-later) after 4 years.
# See LICENSE for full terms and conditions.
"""
Pickle (.ckpt, .pt, .bin) to SafeTensors Converter
Dynamically identifies model architecture, safely extracts nested tensor state dicts,
resolves memory sharing, and exports standardized SafeTensors models.
"""

import sys
import os
import json
import time

# Safely import the bytecode safety opcode scanner
try:
    from scan_pickle_safety import scan_model_file
except ImportError:
    try:
        from scripts.scan_pickle_safety import scan_model_file
    except ImportError:
        scan_model_file = None

IGNORE_KEYS = {
    "optimizer_states",
    "lr_schedulers",
    "optimizer",
    "param_groups",
    "opt_state",
    "step",
    "global_step",
    "epoch",
    "loss",
    "metrics",
    "callbacks",
    "loops",
}

def extract_tensors(obj, prefix="", visited=None):
    """
    Recursively extracts all PyTorch tensors from nested dicts, lists, or custom containers.
    """
    if visited is None:
        visited = set()

    obj_id = id(obj)
    if obj_id in visited:
        return {}
    visited.add(obj_id)

    tensors = {}
    import torch

    if isinstance(obj, torch.Tensor):
        key = prefix if prefix else "weight"
        tensors[key] = obj.detach().to("cpu").contiguous()
        return tensors

    if isinstance(obj, dict):
        # Check for wrapped state_dict or model containers first
        for container_key in ["state_dict", "model", "module", "ema", "transformer", "network"]:
            if container_key in obj and isinstance(obj[container_key], dict) and not prefix:
                sub_res = extract_tensors(obj[container_key], prefix="", visited=visited)
                if sub_res:
                    tensors.update(sub_res)

        if not tensors:
            for k, v in obj.items():
                k_str = str(k)
                if k_str in IGNORE_KEYS and not prefix:
                    continue
                sub_prefix = f"{prefix}.{k_str}" if prefix else k_str
                if isinstance(v, torch.Tensor):
                    tensors[sub_prefix] = v.detach().to("cpu").contiguous()
                elif isinstance(v, (dict, list, tuple)):
                    tensors.update(extract_tensors(v, prefix=sub_prefix, visited=visited))
                elif hasattr(v, "state_dict") and callable(v.state_dict):
                    try:
                        tensors.update(extract_tensors(v.state_dict(), prefix=sub_prefix, visited=visited))
                    except Exception:
                        pass
        return tensors

    if isinstance(obj, (list, tuple)):
        for idx, item in enumerate(obj):
            sub_prefix = f"{prefix}.{idx}" if prefix else str(idx)
            tensors.update(extract_tensors(item, prefix=sub_prefix, visited=visited))
        return tensors

    if hasattr(obj, "state_dict") and callable(obj.state_dict):
        try:
            return extract_tensors(obj.state_dict(), prefix=prefix, visited=visited)
        except Exception:
            pass

    if hasattr(obj, "__dict__"):
        try:
            return extract_tensors(obj.__dict__, prefix=prefix, visited=visited)
        except Exception:
            pass

    return tensors

def detect_model_profile(tensors):
    """
    Analyzes tensor keys and shapes to deduce the exact model type and architecture.
    """
    keys = list(tensors.keys())
    keys_lower = [k.lower() for k in keys]

    # 1. LoRA / LyCORIS / DoRA
    lora_indicators = ["lora_up", "lora_down", "lora_linear", "lora_mid", "dora_scale", "hada_w1", "lokr_w1"]
    if any(any(ind in k for ind in lora_indicators) for k in keys_lower):
        if any("double_blocks" in k or "single_blocks" in k for k in keys_lower):
            return "lora", "flux_lora"
        if any("input_blocks" in k and "13" in k for k in keys_lower):
            return "lora", "sdxl_lora"
        return "lora", "sd_lora"

    # 2. Diffusion Transformers (Flux, Wan, Hunyuan, SD3)
    if any("double_blocks" in k or "single_blocks" in k for k in keys_lower):
        if any("img_in" in k or "txt_in" in k or "vector_in" in k for k in keys_lower):
            return "dit", "flux"
        return "dit", "transformer"

    if any("joint_blocks" in k for k in keys_lower):
        return "dit", "sd3"

    if any("wan_transformer" in k or "patch_embedding" in k for k in keys_lower):
        return "dit", "wan"

    if any("hunyuan" in k for k in keys_lower):
        return "dit", "hunyuan"

    # 3. Checkpoints (SDXL vs SD 1.5 vs SD 2.x)
    if any("model.diffusion_model" in k or "diffusion_model" in k for k in keys_lower):
        if any("conditioner.embedders.1.model" in k or "label_emb.0.0" in k for k in keys_lower):
            return "checkpoint", "sdxl"
        if any("cond_stage_model.transformer.text_model" in k for k in keys_lower):
            return "checkpoint", "sd15"
        if any("cond_stage_model.model" in k for k in keys_lower):
            return "checkpoint", "sd2"
        return "checkpoint", "stable_diffusion"

    # 4. ControlNet
    if any("control_model" in k or "zero_convs" in k for k in keys_lower):
        return "controlnet", "controlnet"

    # 5. VAE
    if any("encoder.conv_in" in k or "decoder.conv_out" in k or "quant_conv" in k for k in keys_lower):
        return "vae", "vae"

    # 6. Text Encoders / CLIP
    if any("text_model.encoder" in k or "transformer.text_model" in k or "shared.weight" in k for k in keys_lower):
        return "text_encoder", "clip_or_t5"

    # 7. Textual Inversion / Embedding
    if any("string_to_param" in k or "emb_params" in k for k in keys_lower) or len(keys) <= 4:
        return "embedding", "textual_inversion"

    return "checkpoint", "generic"

def resolve_shared_storage(tensors):
    """
    SafeTensors forbids saving multiple tensors that reference overlapping memory chunks.
    Ensures each tensor owns independent contiguous storage.
    """
    seen_ptrs = set()
    clean = {}
    for k, t in tensors.items():
        try:
            storage = t.untyped_storage() if hasattr(t, "untyped_storage") else t.storage()
            ptr = storage.data_ptr()
            if ptr in seen_ptrs:
                clean[k] = t.clone().contiguous()
            else:
                seen_ptrs.add(ptr)
                clean[k] = t.contiguous()
        except Exception:
            clean[k] = t.clone().contiguous()
    return clean

def convert(input_path, output_path):
    if not os.path.exists(input_path):
        print(json.dumps({"success": False, "error": f"Source file not found: {input_path}"}))
        sys.exit(1)

    try:
        import torch
    except ImportError:
        print(json.dumps({"success": False, "error": "PyTorch is required for conversion. Please install torch."}))
        sys.exit(1)

    try:
        from safetensors.torch import save_file
    except ImportError:
        print(json.dumps({"success": False, "error": "safetensors is required for conversion. Please install safetensors."}))
        sys.exit(1)

    start_time = time.time()

    # Bytecode Opcode Safety Check (Zero Code Execution)
    if scan_model_file is not None:
        scan_res = scan_model_file(input_path)
        if not scan_res.get("isSafe", True):
            dang = scan_res.get("dangerousGlobals", [])
            print(json.dumps({
                "success": False,
                "error": f"SECURITY BAN: Model bytecode contains dangerous executable sinks: {', '.join(dang)}",
                "scanResult": scan_res
            }))
            sys.exit(1)

        if scan_res.get("isYolo", False):
            print(json.dumps({
                "success": False,
                "skipped": True,
                "isYolo": True,
                "error": "YOLO/Ultralytics detector model detected. Conversion to SafeTensors is blocked to preserve bounding box and segmentation functionality.",
                "scanResult": scan_res
            }))
            sys.exit(0)

    # Load state dict (try weights_only=True first for security against arbitrary code execution)
    raw_loaded = None
    try:
        raw_loaded = torch.load(input_path, map_location="cpu", weights_only=True)
    except Exception:
        try:
            raw_loaded = torch.load(input_path, map_location="cpu", weights_only=False)
        except Exception as load_err:
            print(json.dumps({"success": False, "error": f"Failed to load PyTorch checkpoint: {str(load_err)}"}))
            sys.exit(1)

    # Extract all tensors recursively
    extracted = extract_tensors(raw_loaded)

    if not extracted or len(extracted) == 0:
        print(json.dumps({"success": False, "error": "No valid tensor weights found in model file."}))
        sys.exit(1)

    # Detect model type and architecture
    model_type, architecture = detect_model_profile(extracted)

    # Handle memory sharing
    clean_dict = resolve_shared_storage(extracted)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    base_name = os.path.splitext(os.path.basename(output_path))[0]
    metadata = {
        "format": "pt",
        "converted_by": "RenegadeCMM",
        "modelspec.architecture": architecture,
        "modelspec.type": model_type,
        "modelspec.title": base_name,
    }

    # Save as safetensors with fallback clone if storage error occurs
    try:
        save_file(clean_dict, output_path, metadata=metadata)
    except Exception as save_err:
        try:
            # Full clone retry
            cloned = {k: v.clone().contiguous() for k, v in clean_dict.items()}
            save_file(cloned, output_path, metadata=metadata)
        except Exception as final_err:
            print(json.dumps({"success": False, "error": f"SafeTensors serialization failed: {str(final_err)}"}))
            sys.exit(1)

    elapsed = time.time() - start_time
    output_size = os.path.getsize(output_path)

    result = {
        "success": True,
        "sourcePath": input_path,
        "targetPath": output_path,
        "tensorCount": len(clean_dict),
        "targetSize": output_size,
        "modelType": model_type,
        "architecture": architecture,
        "timeTakenMs": int(elapsed * 1000),
    }
    print(json.dumps(result))

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: convert_to_safetensors.py <input_path> <output_path>"}))
        sys.exit(1)

    convert(sys.argv[1], sys.argv[2])


