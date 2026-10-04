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
Pickle Opcode Safety Scanner & YOLO Detector
Performs bytecode-level opcode disassembly (zero code execution) on PyTorch (.pt, .pth, .ckpt, .bin)
pickle streams using native pickletools. Discovers dangerous execution sinks (os.system, subprocess,
eval, exec) and detects YOLO/Ultralytics layer class hierarchies that must remain as .pt.
"""

import sys
import os
import io
import json
import zipfile
import pickletools

DANGEROUS_MODULES = {
    "os",
    "posix",
    "nt",
    "subprocess",
    "shutil",
    "socket",
    "pty",
    "commands",
    "ctypes",
    "codecs",
    "importlib",
    "requests",
    "urllib",
    "urllib.request",
    "http.client",
    "httplib",
    "multiprocessing",
    "threading",
    "pdb",
    "webbrowser",
    "tempfile",
}

DANGEROUS_FUNCTIONS = {
    "system",
    "popen",
    "spawn",
    "spawnl",
    "spawnle",
    "spawnlp",
    "spawnlpe",
    "spawnv",
    "spawnve",
    "spawnvp",
    "spawnvpe",
    "exec",
    "execl",
    "execle",
    "execlp",
    "execlpe",
    "execv",
    "execve",
    "execvp",
    "execvpe",
    "eval",
    "compile",
    "__import__",
    "open",
    "remove",
    "unlink",
    "rmdir",
    "rmtree",
    "kill",
    "fork",
    "Popen",
    "call",
    "check_call",
    "check_output",
    "run",
    "decode",
    "import_module",
    "loads",
    "load",
    "urlopen",
    "get",
    "post",
}

DANGEROUS_EXACT_GLOBALS = {
    ("os", "system"),
    ("os", "popen"),
    ("os", "remove"),
    ("os", "unlink"),
    ("posix", "system"),
    ("nt", "system"),
    ("subprocess", "Popen"),
    ("subprocess", "call"),
    ("subprocess", "check_call"),
    ("subprocess", "check_output"),
    ("subprocess", "run"),
    ("builtins", "eval"),
    ("builtins", "exec"),
    ("builtins", "compile"),
    ("builtins", "__import__"),
    ("builtins", "open"),
    ("__builtin__", "eval"),
    ("__builtin__", "exec"),
    ("__builtin__", "compile"),
    ("__builtin__", "__import__"),
    ("__builtin__", "open"),
    ("codecs", "decode"),
    ("importlib", "import_module"),
    ("pickle", "loads"),
    ("pickle", "load"),
    ("_pickle", "loads"),
    ("socket", "socket"),
    ("requests", "get"),
    ("requests", "post"),
    ("urllib.request", "urlopen"),
    ("urllib", "urlopen"),
}

YOLO_IDENTIFIER_TOKENS = {
    "ultralytics",
    "detectionmodel",
    "segmentationmodel",
    "posemodel",
    "classificationmodel",
    "obbmodel",
    "worldmodel",
    "yolomodel",
    "c2f",
    "c3",
    "c3k2",
    "sppf",
    "spp",
    "dfl",
    "proto",
    "detect",
    "segment",
    "pose",
    "classify",
    "obb",
    "bottleneck",
    "conv",
    "concat",
    "darknet",
    "yolov5",
    "yolov7",
    "yolov8",
    "yolov9",
    "yolov10",
    "yolo11",
    "yolo12",
}

def extract_pickle_streams_from_file(file_path):
    """
    Extracts raw pickle byte streams from either a PyTorch ZIP container (.pt, .ckpt)
    or a standalone raw pickle file. Returns a list of (stream_name, bytes_data).
    """
    if not os.path.exists(file_path):
        return []

    streams = []

    # 1. Try treating as PyTorch Zip archive
    if zipfile.is_zipfile(file_path):
        try:
            with zipfile.ZipFile(file_path, "r") as zf:
                for name in zf.namelist():
                    # PyTorch saves model metadata & class hierarchy in data.pkl / *.pkl / pkl files
                    if name.endswith(".pkl") or name.endswith("/data.pkl") or name == "data.pkl" or name.endswith("pickle"):
                        try:
                            data = zf.read(name)
                            streams.append((name, data))
                        except Exception:
                            pass
        except Exception:
            pass

    # 2. If not a zip or no pkl entries found in zip, treat as raw file stream
    if not streams:
        try:
            with open(file_path, "rb") as f:
                header = f.read(1024 * 1024 * 32) # Read up to first 32MB for opcode scanning
                streams.append((os.path.basename(file_path), header))
        except Exception:
            pass

    return streams

def scan_pickle_stream(stream_bytes):
    """
    Safely disassembles a pickle byte stream using pickletools.genops.
    Zero Python code is executed.
    Returns:
      total_opcodes, dangerous_globals, safe_globals, yolo_layers, strings_found
    """
    dangerous_globals = []
    safe_globals = []
    yolo_layers = []
    strings_found = []
    total_opcodes = 0

    stack = []
    memo = {}

    try:
        ops = pickletools.genops(io.BytesIO(stream_bytes))
        for op, arg, pos in ops:
            total_opcodes += 1
            op_name = op.name

            # Protocol 0/1/2 GLOBAL opcode: arg is "module class_or_function"
            if op_name == "GLOBAL":
                if isinstance(arg, str):
                    parts = arg.strip().split()
                    if len(parts) >= 2:
                        mod, name = parts[0], parts[1]
                    elif len(parts) == 1:
                        mod, name = parts[0], ""
                    else:
                        mod, name = "", ""
                    
                    full_id = f"{mod}.{name}" if name else mod
                    
                    if (mod, name) in DANGEROUS_EXACT_GLOBALS or (mod in DANGEROUS_MODULES and name in DANGEROUS_FUNCTIONS):
                        dangerous_globals.append(full_id)
                    else:
                        safe_globals.append(full_id)
                        
                    mod_lower = mod.lower()
                    name_lower = name.lower()
                    if any(t in mod_lower or t in name_lower for t in YOLO_IDENTIFIER_TOKENS):
                        yolo_layers.append(full_id)

            # Protocol 4+ STACK_GLOBAL: pops name then module from stack
            elif op_name == "STACK_GLOBAL":
                if len(stack) >= 2:
                    name_val = str(stack.pop())
                    mod_val = str(stack.pop())
                    full_id = f"{mod_val}.{name_val}"
                    
                    if (mod_val, name_val) in DANGEROUS_EXACT_GLOBALS or (mod_val in DANGEROUS_MODULES and name_val in DANGEROUS_FUNCTIONS):
                        dangerous_globals.append(full_id)
                    else:
                        safe_globals.append(full_id)
                        
                    mod_lower = mod_val.lower()
                    name_lower = name_val.lower()
                    if any(t in mod_lower or t in name_lower for t in YOLO_IDENTIFIER_TOKENS):
                        yolo_layers.append(full_id)
                stack.append("STACK_GLOBAL_RESULT")

            # Collect string literals pushed onto stack
            elif op_name in ("SHORT_BINUNICODE", "BINUNICODE", "UNICODE", "BINBYTES", "SHORT_BINBYTES", "STRING"):
                if isinstance(arg, str):
                    strings_found.append(arg)
                    stack.append(arg)
                    arg_lower = arg.lower()
                    if any(t in arg_lower for t in YOLO_IDENTIFIER_TOKENS):
                        yolo_layers.append(arg)
                else:
                    stack.append(str(arg))

            elif op_name in ("PUT", "BINPUT", "LONG_BINPUT", "MEMOIZE"):
                if stack:
                    memo[arg] = stack[-1]

            elif op_name in ("GET", "BINGET", "LONG_BINGET"):
                if arg in memo:
                    stack.append(memo[arg])
                else:
                    stack.append("MEMO_VAL")

            elif op_name in ("MARK", "EMPTY_DICT", "EMPTY_LIST", "EMPTY_SET", "EMPTY_TUPLE"):
                stack.append("CONTAINER")

            elif op_name in ("POP", "POP_MARK"):
                if stack:
                    stack.pop()

    except Exception:
        # Partial stream or EOF reached during opcode generation
        pass

    return total_opcodes, dangerous_globals, safe_globals, yolo_layers, strings_found

def scan_model_file(file_path):
    """
    Comprehensive scan of a PyTorch / pickle model file on disk.
    """
    if not os.path.exists(file_path):
        return {
            "filePath": file_path,
            "isSafe": False,
            "isYolo": False,
            "hasPythonCode": False,
            "requiresPythonRuntime": False,
            "dangerousGlobals": [],
            "safeGlobals": [],
            "yoloLayers": [],
            "totalOpcodes": 0,
            "recommendation": "not_pickle",
            "details": f"File not found on disk: {file_path}",
        }

    streams = extract_pickle_streams_from_file(file_path)
    if not streams:
        return {
            "filePath": file_path,
            "isSafe": True,
            "isYolo": False,
            "hasPythonCode": False,
            "requiresPythonRuntime": False,
            "dangerousGlobals": [],
            "safeGlobals": [],
            "yoloLayers": [],
            "totalOpcodes": 0,
            "recommendation": "safe_convert",
            "details": "No pickle streams found in file container.",
        }

    all_dangerous = []
    all_safe = []
    all_yolo = []
    total_ops_combined = 0

    for stream_name, stream_bytes in streams:
        ops_cnt, dang, safe, yolo, strs = scan_pickle_stream(stream_bytes)
        total_ops_combined += ops_cnt
        all_dangerous.extend(dang)
        all_safe.extend(safe)
        all_yolo.extend(yolo)

    all_dangerous = list(dict.fromkeys(all_dangerous))
    all_safe = list(dict.fromkeys(all_safe))
    all_yolo = list(dict.fromkeys(all_yolo))

    has_dangerous = len(all_dangerous) > 0
    is_yolo = len(all_yolo) > 0
    has_python_code = len(all_safe) > 0 or len(all_yolo) > 0

    if has_dangerous:
        return {
            "filePath": file_path,
            "isSafe": False,
            "isYolo": is_yolo,
            "hasPythonCode": True,
            "requiresPythonRuntime": True,
            "dangerousGlobals": all_dangerous,
            "safeGlobals": all_safe,
            "yoloLayers": all_yolo,
            "totalOpcodes": total_ops_combined,
            "recommendation": "quarantine_dangerous",
            "details": f"DANGEROUS EXECUTION SINKS DETECTED: Model bytecode contains unhinged globals: {', '.join(all_dangerous)}",
        }

    if is_yolo:
        return {
            "filePath": file_path,
            "isSafe": True,
            "isYolo": True,
            "architecture": "YOLO / Ultralytics",
            "hasPythonCode": True,
            "requiresPythonRuntime": True,
            "dangerousGlobals": [],
            "safeGlobals": all_safe,
            "yoloLayers": all_yolo,
            "totalOpcodes": total_ops_combined,
            "recommendation": "preserve_yolo_pt",
            "details": f"Safe YOLO/Ultralytics detector architecture detected ({len(all_yolo)} layer references). Preserved as .pt to maintain bounding box & segmentation detector functionality.",
        }

    return {
        "filePath": file_path,
        "isSafe": True,
        "isYolo": False,
        "hasPythonCode": has_python_code,
        "requiresPythonRuntime": False,
        "dangerousGlobals": [],
        "safeGlobals": all_safe,
        "yoloLayers": [],
        "totalOpcodes": total_ops_combined,
        "recommendation": "safe_convert",
        "details": f"Pickle opcode stream verified clean ({total_ops_combined} opcodes, 0 dangerous globals). Safe for SafeTensors conversion.",
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scan_pickle_safety.py <file_path>"}))
        sys.exit(1)

    result = scan_model_file(sys.argv[1])
    print(json.dumps(result))

