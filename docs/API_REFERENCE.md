# 🔌 Renegade Core Model Manager (CMM) — Local API Reference

This document provides complete documentation and code examples for developers building **ComfyUI Custom Nodes**, scripts, and local extensions that integrate with Renegade Core Model Manager via its native HTTP API bridge.

---

## 🔒 Security & Localhost Isolation

For the protection of the user's local filesystem and machine security, CMM's HTTP Server Bridge is strictly isolated:

- **Binding Address:** `127.0.0.1:<port>` (Default port: **`5174`**).
- **Settings Toggle:** The API Bridge can be switched **ON** or **OFF** at any time inside the app's **Settings tab** under _Localhost HTTP API Bridge_.
- **Custom Port Selection:** The port can be customized in Settings or on launch to avoid port collisions (e.g. `./cmm.sh start --api-port 5175`, `.\cmm.ps1 start -ApiPort 5175`, or setting `API_PORT=5175`).
- **Localhost Only:** Any incoming socket whose remote IP address is not `127.0.0.1` or `::1` is immediately rejected with HTTP 403 Forbidden.
- **CSRF & Origin Protection:** Non-local web origins attempting cross-origin requests from external browser pages are blocked.
- **No Cloud/Remote Exposure:** The API is never exposed to the local network (LAN) or public internet.

---

## 🚀 Quick Start for ComfyUI Node Developers (Python)

When building ComfyUI custom nodes, allow the user to optionally specify a port (or full URL) while automatically falling back to the default `5174`:

```python
import requests
from typing import Dict, Any, Optional, List

class CMMClient:
    """
    Client helper for ComfyUI custom nodes connecting to Renegade Core Model Manager.
    Automatically defaults to port 5174 if no port or base_url is provided.
    """
    def __init__(self, port: int = 5174, base_url: Optional[str] = None):
        if base_url:
            self.base_url = base_url.rstrip("/")
        else:
            self.base_url = f"http://127.0.0.1:{port or 5174}"

    def is_online(self) -> bool:
        """Verify if Renegade Core Model Manager is running and the API Bridge is reachable."""
        try:
            res = requests.get(f"{self.base_url}/api/health", timeout=1.5)
            return res.status_code == 200 and res.json().get("status") == "ok"
        except requests.RequestException:
            return False

    def parse_workflow(self, workflow_data: Dict[str, Any], name: str = "workflow.json") -> Dict[str, Any]:
        """Inspect a raw workflow or prompt dictionary directly in-memory to detect missing models & nodes."""
        res = requests.post(f"{self.base_url}/api/workflows", json={"workflow": workflow_data, "name": name})
        res.raise_for_status()
        return res.json()

    def resolve_missing_node(self, node_type: str) -> Dict[str, Any]:
        """Query 4-tier resolution engine (Local -> SQLite Cache -> GitHub Search API) for missing custom node."""
        res = requests.post(f"{self.base_url}/api/nodes/resolve", json={"nodeType": node_type})
        res.raise_for_status()
        return res.json()

    def clone_custom_node(self, git_url: str, folder_name: Optional[str] = None) -> Dict[str, Any]:
        """Clone a missing custom node Git repository into custom_nodes/."""
        res = requests.post(f"{self.base_url}/api/nodes/clone", json={"gitUrl": git_url, "folderName": folder_name})
        res.raise_for_status()
        return res.json()

    def install_node_dependencies(self, folder_path: str) -> Dict[str, Any]:
        """Execute pip install on requirements.txt using ComfyUI's embedded Python binary."""
        res = requests.post(f"{self.base_url}/api/nodes/install-deps", json={"folderPath": folder_path})
        res.raise_for_status()
        return res.json()

    def download_model(self, file_name: str, model_type: str, model_version_id: int, base_model: str = "SDXL 1.0", creator: Optional[str] = None) -> Dict[str, Any]:
        """Trigger an automatic model download into the user's configured folder structure."""
        payload = {
            "fileName": file_name if "." in file_name else f"{file_name}.safetensors",
            "modelType": model_type,
            "baseModel": base_model,
            "creator": creator,
            "modelVersionId": model_version_id
        }
        res = requests.post(f"{self.base_url}/api/add-download", json=payload)
        res.raise_for_status()
        return res.json()

    def search_huggingface(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search Hugging Face Hub repositories for models."""
        res = requests.post(f"{self.base_url}/api/hf/search", json={"query": query, "limit": limit})
        res.raise_for_status()
        return res.json()

    def inspect_gguf(self, file_path: str) -> Dict[str, Any]:
        """Inspect zero-memory binary metadata and quantization for a local GGUF file."""
        res = requests.post(f"{self.base_url}/api/inspect-gguf", json={"filePath": file_path})
        res.raise_for_status()
        return res.json()

# Example Usage:
# 1. Initialize client:
cmm = CMMClient()

if cmm.is_online():
    # 2. Inspect active workflow for missing models/nodes
    analysis = cmm.parse_workflow(workflow_dict)
    print("Referenced Models:", len(analysis.get("models", [])))
    print("Referenced Node Types:", len(analysis.get("nodeTypes", [])))

    # 3. Search Hugging Face Hub for FLUX GGUF models
    hf_models = cmm.search_huggingface("FLUX.1-dev GGUF", limit=5)
    print("HF Repos Found:", len(hf_models))
```

---

## 📑 API Endpoints Reference

### 1. Health & Server Status

#### `GET /api/health` or `GET /health`

Returns live heartbeat status and process uptime.

- **Response `200 OK`:**

```json
{
  "status": "ok",
  "uptime": 364.21,
  "pid": 285391
}
```

#### `GET /api/status`

Checks if CMM is running, whether the API Bridge is enabled, and returns the active port.

- **Response `200 OK` (When Enabled):**

```json
{
  "status": "online",
  "enabled": true,
  "name": "Renegade Core Model Manager",
  "version": "1.5.0",
  "port": 5174,
  "host": "127.0.0.1",
  "localhostOnly": true
}
```

_(When disabled via Settings toggle, external API endpoints return `503 Service Unavailable` with `{"error": "Local API Bridge is disabled in Settings."}`)_

---

### 2. Workflow Inspection & In-Memory Parsing

#### `POST /api/workflows` or `POST /api/workflow/parse`

Extracts all referenced checkpoints, LoRAs, UNETs, VAEs, CLIP models, custom node classes, and spatial LiteGraph canvas layout directly from **in-memory raw JSON** or scanned disk folders.

##### Direct Raw JSON In-Memory Payload (Recommended for Custom Nodes)

- **Request Body (Direct Workflow JSON / ComfyUI Canvas Format):**

```json
{
  "workflow": {
    "nodes": [
      {
        "id": 4,
        "type": "CheckpointLoaderSimple",
        "widgets_values": ["flux1-dev.safetensors"],
        "pos": [100, 150],
        "size": [220, 120]
      },
      {
        "id": 10,
        "type": "ImpactWildcardProcessor",
        "widgets_values": ["cinematic photo of __prompt__"]
      }
    ],
    "links": []
  },
  "name": "active_canvas.json"
}
```

_Or pass the ComfyUI API Execution Prompt dictionary:_

```json
{
  "prompt": {
    "3": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": { "ckpt_name": "sd_xl_base_1.0.safetensors" }
    },
    "4": {
      "class_type": "KSampler",
      "inputs": { "model": ["3", 0] }
    }
  }
}
```

- **Response `200 OK`:**

```json
{
  "fileName": "active_canvas.json",
  "fileType": "json",
  "modelCount": 1,
  "models": [
    {
      "nodeId": "4",
      "nodeType": "CheckpointLoaderSimple",
      "inputName": "widget_0",
      "modelName": "flux1-dev.safetensors",
      "isInstalled": true,
      "localPath": "/home/user/ComfyUI/models/checkpoints/flux1-dev.safetensors"
    }
  ],
  "nodeTypes": ["CheckpointLoaderSimple", "ImpactWildcardProcessor"],
  "canvasGraph": {
    "nodes": [
      {
        "id": 4,
        "type": "CheckpointLoaderSimple",
        "pos": [100, 150],
        "size": [220, 120]
      },
      {
        "id": 10,
        "type": "ImpactWildcardProcessor",
        "pos": [340, 150],
        "size": [220, 120]
      }
    ],
    "links": []
  }
}
```

##### Disk Folder Scanning

- **Request Body:**

```json
{
  "folderPaths": ["/path/to/ComfyUI/workflows"]
}
```

---

### 3. Custom Node Dependency Resolution (4-Tier Engine)

#### `GET /api/nodes/resolve?nodeType=<name>` or `POST /api/nodes/resolve`

Resolves a missing node class name across local files, SQLite registry caches, and GitHub fallback.

- **Request Body:**

```json
{
  "nodeType": "ImpactWildcardProcessor"
}
```

- **Response `200 OK` (When Installed Locally or Matched):**

```json
{
  "nodeType": "ImpactWildcardProcessor",
  "isInstalled": true,
  "installedFolder": "ComfyUI-Impact-Pack",
  "registryMatch": {
    "author": "ltdrdata",
    "title": "ComfyUI Impact Pack",
    "gitUrl": "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git",
    "description": "Comprehensive tools for detector, wildcards, and inpainting"
  },
  "githubCandidates": []
}
```

#### `POST /api/nodes/search-github`

Performs rate-limited scoped search on GitHub for ComfyUI custom node repositories.

- **Request Body:**

```json
{
  "query": "ComfyUI-LTXTricks",
  "limit": 3
}
```

- **Response `200 OK`:**

```json
{
  "query": "ComfyUI-LTXTricks",
  "candidates": [
    {
      "repoName": "ComfyUI-LTXTricks",
      "author": "user123",
      "fullName": "user123/ComfyUI-LTXTricks",
      "gitUrl": "https://github.com/user123/ComfyUI-LTXTricks.git",
      "description": "Custom nodes for LTX Video enhancements",
      "stars": 420,
      "topics": ["comfyui", "ltx-video", "diffusion"],
      "updatedAt": "2026-08-20T12:00:00Z"
    }
  ]
}
```

#### `POST /api/nodes/clone`

Clones a custom node repository into `custom_nodes/` and checks for install requirements.

- **Request Body:**

```json
{
  "gitUrl": "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git",
  "folderName": "ComfyUI-Impact-Pack"
}
```

- **Response `200 OK`:**

```json
{
  "success": true,
  "folderName": "ComfyUI-Impact-Pack",
  "installedPath": "/home/user/ComfyUI/custom_nodes/ComfyUI-Impact-Pack",
  "hasRequirements": true,
  "hasInstallScript": false
}
```

#### `POST /api/nodes/install-deps`

Runs `pip install -r requirements.txt` or `python install.py` using ComfyUI's specific Python runtime.

- **Request Body:**

```json
{
  "folderPath": "/home/user/ComfyUI/custom_nodes/ComfyUI-Impact-Pack"
}
```

- **Response `200 OK`:**

```json
{
  "success": true,
  "pythonBinary": "/home/user/ComfyUI/venv/bin/python",
  "output": "Successfully installed dependencies"
}
```

#### `GET /api/nodes/installed`

Returns all detected custom node packages in `custom_nodes/` with git remotes and branch metadata.

- **Response `200 OK`:**

```json
[
  {
    "folderName": "ComfyUI-Impact-Pack",
    "folderPath": "/home/user/ComfyUI/custom_nodes/ComfyUI-Impact-Pack",
    "gitUrl": "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git",
    "gitBranch": "main",
    "hasRequirements": true,
    "hasInstallScript": false
  }
]
```

---

### 4. Local Library & Model Queries

#### `GET /api/local-models`

Returns all indexed models from SQLite with matching metadata, duplicates status, and file paths.

- **Response `200 OK`:**

```json
[
  {
    "id": 1,
    "filePath": "/home/user/ComfyUI/models/checkpoints/flux1-dev.safetensors",
    "fileName": "flux1-dev.safetensors",
    "fileSize": 23800000000,
    "modifiedAt": 1718000000,
    "sha256": "4b7b...",
    "civitaiModelId": 618692,
    "civitaiVersionId": 691639,
    "previewUrl": "https://image.civitai.com/...",
    "modelType": "Checkpoint",
    "isMatched": true,
    "isDuplicate": false
  }
]
```

#### `POST /api/scan-library`

Initiates an asynchronous background scan of a specified directory or configured ComfyUI root.

- **Request Body:**

```json
{
  "rootPath": "/path/to/ComfyUI/models"
}
```

#### `GET /api/get-scan-status`

Returns current scanning state.

- **Response `200 OK`:**

```json
{
  "isScanning": false,
  "progress": 100,
  "currentFile": "",
  "processed": 420,
  "total": 420
}
```

#### `POST /api/cancel-scan`

Cancels any active library scan.

#### `POST /api/clear-library`

Clears local SQLite model table and model image cache.

#### `POST /api/match-unidentified-models`

Attempts hash-based automatic CivitAI metadata lookup for unmatched local files.

---

### 5. CivitAI Queries & Downloads

#### `POST /api/search-models`

Proxy search for CivitAI models.

- **Request Body:**

```json
{
  "query": "realism",
  "types": ["LORA"],
  "baseModels": ["Flux.1 D"],
  "limit": 20
}
```

#### `GET /api/model/:id`

Fetches CivitAI model details by model ID.

#### `GET /api/version/:id`

Fetches CivitAI version details and download URLs.

#### `GET /api/enums`

Fetches valid model types and base model categories.

#### `POST /api/add-download`

Queues a model for automatic download and subfolder routing.

- **Request Body:**

```json
{
  "fileName": "realism_lora_v2.safetensors",
  "modelType": "LORA",
  "baseModel": "Flux.1 D",
  "creator": "ByteDance",
  "modelVersionId": 678910,
  "targetRoot": "/path/to/ComfyUI/models"
}
```

- **Response `200 OK`:**

```json
{
  "id": "dl-uuid-12345",
  "fileName": "realism_lora_v2.safetensors",
  "status": "pending",
  "progress": 0,
  "targetFolder": "loras",
  "computedPath": "/path/to/ComfyUI/models/loras/realism_lora_v2.safetensors"
}
```

#### `GET /api/downloads`

Returns the list of all download tasks with real-time speed, bytes downloaded, and status.

#### `POST /api/pause-download`

- **Body:** `{ "id": "<task-id>" }`

#### `POST /api/resume-download`

- **Body:** `{ "id": "<task-id>" }`

#### `POST /api/cancel-download`

- **Body:** `{ "id": "<task-id>" }`

#### `POST /api/force-complete-download`

- **Body:** `{ "id": "<task-id>" }`

---

### 6. Hugging Face Integration

#### `POST /api/hf/search`

Searches the Hugging Face Hub for repositories matching a query string.

- **Request Body:**

```json
{
  "query": "FLUX.1-dev GGUF",
  "limit": 20
}
```

- **Response `200 OK`:**

```json
[
  {
    "id": "city96/FLUX.1-dev-gguf",
    "author": "city96",
    "description": "GGUF quantizations for FLUX.1-dev",
    "downloads": 48210,
    "likes": 612,
    "pipeline_tag": "text-to-image",
    "tags": ["flux", "gguf", "diffusers"],
    "lastModified": "2026-08-15T12:00:00.000Z"
  }
]
```

#### `POST /api/hf/check`

Inspects a Hugging Face repository and returns file lists, sizes, and `.safetensors` model metadata.

- **Request Body:**

```json
{
  "repoId": "black-forest-labs/FLUX.1-dev"
}
```

#### `GET /api/hf/whoami`

Returns Hugging Face login authorization state.

#### `POST /api/hf/validate-token`

Validates a Hugging Face User Access Token.

- **Request Body:**

```json
{
  "token": "hf_..."
}
```

---

### 7. GGUF Binary Header Inspection

#### `POST /api/inspect-gguf`

Performs zero-memory binary inspection on local `.gguf` and `.bin` files by reading only the first 128KB header buffer from disk. Extracts little-endian magic, version, architecture, tensor counts, and maps quantization levels.

- **Request Body:**

```json
{
  "filePath": "/home/user/ComfyUI/models/unet/flux1-dev-Q4_K_M.gguf"
}
```

- **Response `200 OK`:**

```json
{
  "valid": true,
  "version": 3,
  "architecture": "flux",
  "tensorCount": 384,
  "kvCount": 24,
  "quantization": "Q4_K_M",
  "recommendedFolder": "models/unet",
  "fileType": 12
}
```

---

### 8. Configuration & Backups

#### `GET /api/config`

Retrieves app configuration, folder paths, and sorting preferences (credentials redacted with boolean flags `has_civitai_api_key`, `has_huggingface_token`).

#### `POST /api/save-config`

Updates application configuration parameters.

#### `GET /api/export-backup-zip`

Exports a timestamped `.zip` containing model metadata and sanitized settings (API credentials excluded).

#### `POST /api/import-backup-zip`

Restores database and configuration from an uploaded backup `.zip` payload.

---

### 9. Webhooks & Integrations

#### `POST /api/webhooks/test`

Dispatches a test event (`ping`, `on_download_complete`, `on_update_available`) to verify custom webhook URLs.

- **Request Body:**

```json
{
  "url": "http://127.0.0.1:8080/cmm/webhook",
  "event": "ping"
}
```

---

## 🧩 Recommended ComfyUI Custom Node Class Architecture

For clarity and consistent UX across ComfyUI workflows, use the action-oriented verb-noun naming convention:

| Node Class Name          | Display Title                  | Category          | Function / Purpose                                        |
| ------------------------ | ------------------------------ | ----------------- | --------------------------------------------------------- |
| `CMMStatus`              | **CMM: Status & Heartbeat**    | `CivitAI/Manager` | Verifies connection, API port, and database uptime        |
| `CMMInspectWorkflow`     | **CMM: Inspect Workflow**      | `CivitAI/Manager` | Scans in-memory graph for missing models and custom nodes |
| `CMMResolveNode`         | **CMM: Resolve Node**          | `CivitAI/Manager` | 4-tier query to find install repos for missing node types |
| `CMMDownloadModel`       | **CMM: Download Model**        | `CivitAI/Manager` | Enqueues model download into auto-sorted folders          |
| `CMMSearchCivitAI`       | **CMM: Search CivitAI**        | `CivitAI/Manager` | Queries CivitAI catalog by query, type, and base model    |
| `CMMSearchHuggingFace`   | **CMM: Search Hugging Face**   | `CivitAI/Manager` | Searches Hugging Face Hub model repositories by query     |
| `CMMCheckHuggingFace`    | **CMM: Check Hugging Face**    | `CivitAI/Manager` | Queries Hugging Face model repository files & metadata    |
| `CMMInspectGGUF`         | **CMM: Inspect GGUF**          | `CivitAI/Manager` | Inspects local GGUF header for architecture & quant level |
| `CMMRawRequest`          | **CMM: Raw API Request**       | `CivitAI/Manager` | Low-level generic HTTP caller for advanced scripting      |

### Standard `__init__.py` Registration Template

```python
from .nodes import (
    CMMStatus,
    CMMInspectWorkflow,
    CMMResolveNode,
    CMMDownloadModel,
    CMMSearchCivitAI,
    CMMSearchHuggingFace,
    CMMCheckHuggingFace,
    CMMInspectGGUF,
    CMMRawRequest,
)

NODE_CLASS_MAPPINGS = {
    "CMMStatus": CMMStatus,
    "CMMInspectWorkflow": CMMInspectWorkflow,
    "CMMResolveNode": CMMResolveNode,
    "CMMDownloadModel": CMMDownloadModel,
    "CMMSearchCivitAI": CMMSearchCivitAI,
    "CMMSearchHuggingFace": CMMSearchHuggingFace,
    "CMMCheckHuggingFace": CMMCheckHuggingFace,
    "CMMInspectGGUF": CMMInspectGGUF,
    "CMMRawRequest": CMMRawRequest,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CMMStatus": "CMM: Status & Heartbeat",
    "CMMInspectWorkflow": "CMM: Inspect Workflow",
    "CMMResolveNode": "CMM: Resolve Node",
    "CMMDownloadModel": "CMM: Download Model",
    "CMMSearchCivitAI": "CMM: Search CivitAI",
    "CMMSearchHuggingFace": "CMM: Search Hugging Face",
    "CMMCheckHuggingFace": "CMM: Check Hugging Face",
    "CMMInspectGGUF": "CMM: Inspect GGUF",
    "CMMRawRequest": "CMM: Raw API Request",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
```
