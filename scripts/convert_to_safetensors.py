#!/usr/bin/env python3
"""
Renegade Core Model Manager (RenegadeCMM)
Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Pickle (.ckpt, .pt, .bin) to SafeTensors Converter
"""

import sys
import os
import json
import time

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
    
    # Load state dict (try weights_only=True first for security against arbitrary code execution)
    try:
        state_dict = torch.load(input_path, map_location="cpu", weights_only=True)
    except Exception:
        try:
            state_dict = torch.load(input_path, map_location="cpu", weights_only=False)
        except Exception as load_err:
            print(json.dumps({"success": False, "error": f"Failed to load PyTorch checkpoint: {str(load_err)}"}))
            sys.exit(1)

    # Unpack nested state dicts if wrapped
    if isinstance(state_dict, dict):
        if "state_dict" in state_dict and isinstance(state_dict["state_dict"], dict):
            state_dict = state_dict["state_dict"]
        elif "model" in state_dict and isinstance(state_dict["model"], dict):
            state_dict = state_dict["model"]
        elif "module" in state_dict and isinstance(state_dict["module"], dict):
            state_dict = state_dict["module"]

    if not isinstance(state_dict, dict):
        print(json.dumps({"success": False, "error": "Checkpoint does not contain a valid tensor dictionary."}))
        sys.exit(1)

    clean_dict = {}
    for k, v in state_dict.items():
        if isinstance(v, torch.Tensor):
            clean_dict[str(k)] = v.contiguous()

    if len(clean_dict) == 0:
        print(json.dumps({"success": False, "error": "No valid tensor weights found in model file."}))
        sys.exit(1)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    # Save as safetensors
    save_file(clean_dict, output_path, metadata={"format": "pt", "converted_by": "RenegadeCMM"})

    elapsed = time.time() - start_time
    output_size = os.path.getsize(output_path)

    result = {
        "success": True,
        "sourcePath": input_path,
        "targetPath": output_path,
        "tensorCount": len(clean_dict),
        "targetSize": output_size,
        "timeTakenMs": int(elapsed * 1000)
    }
    print(json.dumps(result))

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: convert_to_safetensors.py <input_path> <output_path>"}))
        sys.exit(1)

    convert(sys.argv[1], sys.argv[2])
