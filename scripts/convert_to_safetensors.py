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
Pickle (.ckpt, .pt, .bin) to SafeTensors Converter Architecture
Dynamically identifies model architecture, safely introspects nested tensor object graphs,
resolves memory sharing, preserves tensor dtype fidelity and metadata headers, and exports
standardized SafeTensors models.
"""

import sys
import os
import json
import time
import gc
import datetime
import pickle

# Safely import the bytecode safety opcode scanner
try:
    from scan_pickle_safety import scan_model_file
except ImportError:
    try:
        from scripts.scan_pickle_safety import scan_model_file
    except ImportError:
        scan_model_file = None

IGNORE_NON_WEIGHT_KEYS = {
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
    "hparams",
    "hyper_parameters",
}


class ResilientUnpickler(pickle.Unpickler):
    """
    Fallback unpickler for custom model packages and missing third-party classes.
    Creates dynamic stub objects instead of raising ModuleNotFoundError or AttributeError.
    """
    def find_class(self, module, name):
        try:
            return super().find_class(module, name)
        except Exception:
            stub = type(name, (object,), {"__module__": module, "__qualname__": name})
            return stub


def load_pytorch_archive(file_path):
    """
    Safely loads a PyTorch checkpoint archive using tiered deserialization strategies:
    1. weights_only=True (fast, secure against code execution)
    2. weights_only=False (standard PyTorch loader for complex object trees)
    3. ResilientUnpickler fallback (prevents failure on missing custom dependencies)
    """
    import torch

    # Strategy 1: weights_only=True
    try:
        return torch.load(file_path, map_location="cpu", weights_only=True)
    except Exception:
        pass

    # Strategy 2: weights_only=False
    try:
        return torch.load(file_path, map_location="cpu", weights_only=False)
    except Exception:
        pass

    # Strategy 3: ResilientUnpickler
    try:
        with open(file_path, "rb") as f:
            unpickler = ResilientUnpickler(f)
            return unpickler.load()
    except Exception as err:
        raise RuntimeError(f"Failed to deserialize PyTorch checkpoint archive: {str(err)}")


def extract_tensors(obj, prefix="", visited=None):
    """
    Generic dynamic archive introspection.
    Traverses arbitrary nested object graphs, collections, PyTorch modules, and custom class instances
    without hardcoded assumptions about checkpoint/LoRA dictionary wrapper keys.
    """
    if visited is None:
        visited = set()

    obj_id = id(obj)
    if obj_id in visited:
        return {}
    visited.add(obj_id)

    tensors = {}
    import torch

    # 1. Direct Tensor instance
    if isinstance(obj, torch.Tensor):
        key = prefix if prefix else "weight"
        tensors[key] = obj.detach().to("cpu")
        return tensors

    # 2. Dictionary / State Dict Container
    if isinstance(obj, dict):
        # Check if root dictionary has an exclusive state_dict or model wrapper
        if not prefix:
            for wrapper in ["state_dict", "model", "module", "ema", "transformer", "network"]:
                if wrapper in obj and isinstance(obj[wrapper], dict) and len(obj[wrapper]) > 0:
                    # Check if wrapper contains actual tensors
                    sub_sample = next(iter(obj[wrapper].values()), None)
                    if isinstance(sub_sample, (torch.Tensor, dict)):
                        # If this is the only major container or non-optimizer container, unpack it cleanly
                        sibling_weight_keys = [
                            k for k, v in obj.items()
                            if k != wrapper and str(k) not in IGNORE_NON_WEIGHT_KEYS and isinstance(v, (torch.Tensor, dict))
                        ]
                        if not sibling_weight_keys:
                            sub_res = extract_tensors(obj[wrapper], prefix="", visited=visited)
                            if sub_res:
                                return sub_res

        for k, v in obj.items():
            k_str = str(k)
            if not prefix and k_str in IGNORE_NON_WEIGHT_KEYS:
                continue

            sub_prefix = f"{prefix}.{k_str}" if prefix else k_str

            if isinstance(v, torch.Tensor):
                tensors[sub_prefix] = v.detach().to("cpu")
            elif isinstance(v, (dict, list, tuple, set)):
                tensors.update(extract_tensors(v, prefix=sub_prefix, visited=visited))
            elif hasattr(v, "named_parameters") and callable(v.named_parameters):
                try:
                    for p_name, p_val in v.named_parameters(recurse=True):
                        if isinstance(p_val, torch.Tensor):
                            t_key = f"{sub_prefix}.{p_name}" if sub_prefix else p_name
                            tensors[t_key] = p_val.detach().to("cpu")
                    for b_name, b_val in v.named_buffers(recurse=True):
                        if isinstance(b_val, torch.Tensor):
                            t_key = f"{sub_prefix}.{b_name}" if sub_prefix else b_name
                            tensors[t_key] = b_val.detach().to("cpu")
                except Exception as err:
                    sys.stderr.write(f"Warning: Failed extracting named parameters for {sub_prefix}: {err}\n")
            elif hasattr(v, "state_dict") and callable(v.state_dict):
                try:
                    tensors.update(extract_tensors(v.state_dict(), prefix=sub_prefix, visited=visited))
                except Exception as err:
                    sys.stderr.write(f"Warning: Failed extracting state_dict for {sub_prefix}: {err}\n")
            elif hasattr(v, "__dict__"):
                tensors.update(extract_tensors(v.__dict__, prefix=sub_prefix, visited=visited))

        return tensors

    # 3. PyTorch Module instance
    if hasattr(obj, "named_parameters") and callable(obj.named_parameters):
        try:
            for p_name, p_val in obj.named_parameters(recurse=True):
                if isinstance(p_val, torch.Tensor):
                    t_key = f"{prefix}.{p_name}" if prefix else p_name
                    tensors[t_key] = p_val.detach().to("cpu")
            for b_name, b_val in obj.named_buffers(recurse=True):
                if isinstance(b_val, torch.Tensor):
                    t_key = f"{prefix}.{b_name}" if prefix else b_name
                    tensors[t_key] = b_val.detach().to("cpu")
            if tensors:
                return tensors
        except Exception:
            pass

    # 4. Object with state_dict callable
    if hasattr(obj, "state_dict") and callable(obj.state_dict):
        try:
            return extract_tensors(obj.state_dict(), prefix=prefix, visited=visited)
        except Exception:
            pass

    # 5. Lists & Tuples
    if isinstance(obj, (list, tuple)):
        for idx, item in enumerate(obj):
            sub_prefix = f"{prefix}.{idx}" if prefix else str(idx)
            tensors.update(extract_tensors(item, prefix=sub_prefix, visited=visited))
        return tensors

    # 6. Generic Python Objects (__dict__ or __slots__)
    if hasattr(obj, "__dict__"):
        try:
            return extract_tensors(obj.__dict__, prefix=prefix, visited=visited)
        except Exception:
            pass

    if hasattr(obj, "__slots__"):
        try:
            slots_dict = {s: getattr(obj, s) for s in obj.__slots__ if hasattr(obj, s)}
            return extract_tensors(slots_dict, prefix=prefix, visited=visited)
        except Exception:
            pass

    return tensors


def detect_model_profile(tensors):
    """
    Dedicated Modular Conversion Profiles:
    1. Monolithic Checkpoints (SD 1.5, SDXL, SD 2.x, Pony, Illustrious)
    2. LoRAs / LoCons / DoRAs (preserving lora_unet_*, lora_te_*)
    3. Standalone DiT / Diffusion Models (Flux, Wan 2.1, Hunyuan Video, Anima, CogVideoX, SD3)
    4. Text Encoders & CLIP / T5 Modules
    5. VAEs & Autoencoders
    6. Raw PyTorch State-Dicts & Arbitrary Tensors
    """
    keys = list(tensors.keys())
    keys_lower = [k.lower() for k in keys]

    # Profile 1: LoRA / LyCORIS / DoRA / LoCon
    lora_indicators = ["lora_up", "lora_down", "lora_linear", "lora_mid", "dora_scale", "hada_w1", "lokr_w1", "lora_te", "lora_unet"]
    if any(any(ind in k for ind in lora_indicators) for k in keys_lower):
        if any("double_blocks" in k or "single_blocks" in k for k in keys_lower):
            return "lora", "flux_lora"
        if any("wan_transformer" in k for k in keys_lower):
            return "lora", "wan_lora"
        if any("hunyuan" in k for k in keys_lower):
            return "lora", "hunyuan_lora"
        if any("input_blocks" in k and "13" in k for k in keys_lower):
            return "lora", "sdxl_lora"
        return "lora", "sd_lora"

    # Profile 2: Standalone DiT / Diffusion Models (Flux, Wan, Hunyuan, Anima, CogVideoX, SD3)
    # Flux
    if any("double_blocks" in k or "single_blocks" in k for k in keys_lower):
        if any("img_in" in k or "txt_in" in k or "vector_in" in k or "time_in" in k or "guidance_in" in k for k in keys_lower):
            return "diffusion_model", "flux.1-dev"
        return "diffusion_model", "flux-transformer"

    # Wan Video (Wan 2.1)
    if any("wan_transformer" in k or "head.modulation" in k for k in keys_lower) or (
        any("patch_embedding" in k for k in keys_lower) and any("blocks." in k for k in keys_lower)
    ):
        return "diffusion_model", "wan2.1"

    # Hunyuan Video
    if any("hunyuan" in k for k in keys_lower) or (
        any("double_blocks" in k for k in keys_lower) and any("txt_in" in k for k in keys_lower)
    ):
        return "diffusion_model", "hunyuan-video"

    # Anima
    if any("anima" in k for k in keys_lower) or (
        any("transformer_blocks" in k for k in keys_lower) and any("linear_in" in k for k in keys_lower) and any("linear_out" in k for k in keys_lower)
    ):
        return "diffusion_model", "anima"

    # CogVideoX
    if any("cogvideox" in k for k in keys_lower) or (
        any("transformer_blocks" in k for k in keys_lower) and any("patch_embed" in k for k in keys_lower)
    ):
        return "diffusion_model", "cogvideox"

    # SD3 / SD3.5
    if any("joint_blocks" in k for k in keys_lower):
        return "diffusion_model", "sd3"

    # PixArt
    if any("pixart" in k for k in keys_lower) or (
        any("adaln" in k for k in keys_lower) and any("transformer_blocks" in k for k in keys_lower)
    ):
        return "diffusion_model", "pixart"

    # Lumina / Chroma
    if any("lumina" in k or "nextdit" in k or "chroma" in k for k in keys_lower):
        return "diffusion_model", "lumina"

    # Generic DiT
    if any("transformer_blocks" in k for k in keys_lower) and not any("model.diffusion_model" in k for k in keys_lower):
        return "diffusion_model", "generic_dit"

    # Profile 3: Monolithic Checkpoints (SD 1.5, SDXL, SD 2.x, Pony, Illustrious)
    if any("model.diffusion_model" in k or "diffusion_model" in k for k in keys_lower):
        if any("conditioner.embedders.1.model" in k or "label_emb.0.0" in k or "embedders.0" in k for k in keys_lower):
            return "checkpoint", "sdxl"
        if any("cond_stage_model.transformer.text_model" in k for k in keys_lower):
            return "checkpoint", "sd15"
        if any("cond_stage_model.model" in k for k in keys_lower):
            return "checkpoint", "sd2"
        return "checkpoint", "stable_diffusion"

    # Profile 4: VAEs & Autoencoders
    if any("encoder.conv_in" in k or "decoder.conv_out" in k or "quant_conv" in k or "taesd" in k for k in keys_lower):
        return "vae", "vae"

    # Profile 5: Text Encoders & CLIP / T5 Modules
    if any("text_model.encoder" in k or "transformer.text_model" in k or "shared.weight" in k or "model.embed_tokens" in k for k in keys_lower):
        if any("encoder.block." in k for k in keys_lower):
            return "text_encoder", "t5_xxl"
        if any("text_model.encoder" in k for k in keys_lower):
            return "text_encoder", "clip_vit_l"
        return "text_encoder", "text_encoder"

    # Profile 6: ControlNet
    if any("control_model" in k or "zero_convs" in k for k in keys_lower):
        return "controlnet", "controlnet"

    # Textual Inversion / Embedding
    if any("string_to_param" in k or "emb_params" in k for k in keys_lower) or len(keys) <= 4:
        return "embedding", "textual_inversion"

    # Profile 7: Raw PyTorch State-Dicts & Arbitrary Tensors
    return "raw_tensors", "generic_pytorch"


def resolve_shared_storage(tensors):
    """
    SafeTensors forbids saving multiple tensors that reference overlapping memory chunks.
    Ensures each tensor owns independent contiguous storage without needlessly cloning
    all tensors in memory.
    """
    seen_ptrs = set()
    clean = {}

    for k, t in tensors.items():
        try:
            storage = t.untyped_storage() if hasattr(t, "untyped_storage") else t.storage()
            ptr = storage.data_ptr()
            if ptr in seen_ptrs:
                # Storage is shared with an earlier tensor: make an independent contiguous copy
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

    # Load state dict with resilient multi-tier unpickling
    try:
        raw_loaded = load_pytorch_archive(input_path)
    except Exception as load_err:
        print(json.dumps({"success": False, "error": f"Failed to load PyTorch checkpoint: {str(load_err)}"}))
        sys.exit(1)

    # Generic Dynamic Archive Introspection
    extracted = extract_tensors(raw_loaded)
    del raw_loaded
    gc.collect()

    if not extracted or len(extracted) == 0:
        print(json.dumps({"success": False, "error": "No valid tensor weights found in model archive."}))
        sys.exit(1)

    # Detect model profile and architecture
    model_type, architecture = detect_model_profile(extracted)

    # Collect tensor dtype summary to preserve fidelity in header
    dtypes_found = sorted(list({str(t.dtype).replace("torch.", "") for t in extracted.values()}))

    # Handle memory sharing cleanly without duplicating non-shared tensors
    clean_dict = resolve_shared_storage(extracted)
    del extracted
    gc.collect()

    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    base_name = os.path.splitext(os.path.basename(output_path))[0]
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    metadata = {
        "format": "pt",
        "converted_by": "RenegadeCMM v1.7.0",
        "modelspec.architecture": architecture,
        "modelspec.type": model_type,
        "modelspec.title": base_name,
        "modelspec.tensor_count": str(len(clean_dict)),
        "modelspec.dtypes": ", ".join(dtypes_found),
        "modelspec.date": now_iso,
    }

    # Save as safetensors with fallback clone if storage error occurs
    try:
        save_file(clean_dict, output_path, metadata=metadata)
    except Exception as save_err:
        try:
            # Full clone retry
            cloned = {k: v.clone().contiguous() for k, v in clean_dict.items()}
            save_file(cloned, output_path, metadata=metadata)
            del cloned
        except Exception as final_err:
            print(json.dumps({"success": False, "error": f"SafeTensors serialization failed: {str(final_err)}"}))
            sys.exit(1)

    del clean_dict
    gc.collect()

    elapsed = time.time() - start_time
    output_size = os.path.getsize(output_path)

    result = {
        "success": True,
        "sourcePath": input_path,
        "targetPath": output_path,
        "tensorCount": int(metadata["modelspec.tensor_count"]),
        "targetSize": output_size,
        "modelType": model_type,
        "architecture": architecture,
        "dtypes": dtypes_found,
        "timeTakenMs": int(elapsed * 1000),
    }
    print(json.dumps(result))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--"]
    if len(args) < 2:
        print(json.dumps({"success": False, "error": "Usage: convert_to_safetensors.py <input_path> <output_path>"}))
        sys.exit(1)

    convert(args[0], args[1])
