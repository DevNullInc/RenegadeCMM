#!/usr/bin/env bash
# ==============================================================================
#   Renegade Core Model Manager (CMM) - Linux Launcher Script
#   Copyright (C) 2025-2026 TheStygianRenegade / /dev/null Inc
#   Licensed under GNU General Public License v3.0 (GPL-3.0)
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.cmm.pid"
INSTALLED_FILE="$SCRIPT_DIR/.installed"
ACTION="${1:-start}"
PORT=5173
API_PORT=5174
HEADLESS=false
CLEAN_ASSETS=false

# Auto-configure GCC 13 C++ runtime and NVM environment if present
if [ -d "/opt/gcc-13/lib64" ]; then
  export LD_LIBRARY_PATH="/opt/gcc-13/lib64:${LD_LIBRARY_PATH:-}"
fi

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  \. "$NVM_DIR/nvm.sh" 2>/dev/null || true
fi

if [ -d "$HOME/.local/bin" ]; then
  export PATH="$HOME/.local/bin:$PATH"
fi

# Color formatting
C_RESET="\033[0m"
C_RED="\033[1;31m"
C_GREEN="\033[1;32m"
C_YELLOW="\033[1;33m"
C_BLUE="\033[1;34m"
C_MAGENTA="\033[1;35m"
C_CYAN="\033[1;36m"
C_GRAY="\033[0;90m"

write_status() {
  local icon="$1"
  local msg="$2"
  local color="$3"
  printf "  ${color}[%s]${C_RESET} %s\n" "$icon" "$msg"
}

# Parse custom flags (--port, --api-port, --bridge-port, --headless, --no-window)
REMAINING_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port|-p)
      PORT="$2"
      shift 2
      ;;
    --api-port|--bridge-port)
      API_PORT="$2"
      shift 2
      ;;
    --headless|--no-window)
      HEADLESS=true
      shift
      ;;
    --clean-assets)
      CLEAN_ASSETS=true
      shift
      ;;
    *)
      REMAINING_ARGS+=("$1")
      shift
      ;;
  esac
done

if [ ${#REMAINING_ARGS[@]} -gt 0 ]; then
  ACTION="${REMAINING_ARGS[0]}"
  CLI_ARGS=("${REMAINING_ARGS[@]:1}")
else
  ACTION="start"
  CLI_ARGS=()
fi

# Port Bounds & Injection Validation
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
  write_status "!!" "Invalid Port ($PORT). Must be between 1024 and 65535." "$C_RED"
  exit 1
fi
if ! [[ "$API_PORT" =~ ^[0-9]+$ ]] || [ "$API_PORT" -lt 1024 ] || [ "$API_PORT" -gt 65535 ]; then
  write_status "!!" "Invalid ApiPort ($API_PORT). Must be between 1024 and 65535." "$C_RED"
  exit 1
fi

ensure_python_environment() {
  local force_install="${1:-false}"
  local venv_dir="$SCRIPT_DIR/.venv"
  local venv_py="$venv_dir/bin/python"
  local venv_pip="$venv_dir/bin/pip"
  local req_file="$SCRIPT_DIR/requirements.txt"

  if [ ! -x "$venv_py" ]; then
    local sys_py=""
    for cand in python3 python; do
      if command -v "$cand" >/dev/null 2>&1; then
        if "$cand" --version 2>&1 | grep -q 'Python 3'; then
          sys_py="$cand"
          break
        fi
      fi
    done

    if [ -n "$sys_py" ]; then
      write_status ">>" "Creating Python virtual environment (.venv) using $sys_py..." "$C_CYAN"
      if "$sys_py" -m venv "$venv_dir" >/dev/null 2>&1; then
        write_status "ok" "Python virtual environment created (.venv)." "$C_GREEN"
      else
        write_status "!" "Failed to create .venv virtual environment." "$C_YELLOW"
      fi
    else
      write_status "!" "Python 3 runtime not detected on system PATH." "$C_YELLOW"
      echo -e "      ${C_GRAY}(Optional: Python with torch/safetensors is only needed for Pickle -> SafeTensors conversion).${C_RESET}"
      return 0
    fi
  fi

  if [ -x "$venv_py" ]; then
    local needs_install="$force_install"
    if [ "$needs_install" != "true" ]; then
      if ! "$venv_py" -c "import torch, safetensors; print('READY')" 2>/dev/null | grep -q "READY"; then
        needs_install="true"
      fi
    fi

    if [ "$needs_install" = "true" ] && [ -f "$req_file" ]; then
      write_status ">>" "Installing/updating Python dependencies in .venv (torch, safetensors)..." "$C_CYAN"
      if "$venv_py" -m pip install -r "$req_file" --quiet; then
        write_status "ok" "Python dependencies (torch, safetensors) verified in .venv." "$C_GREEN"
      else
        write_status "!" "Some Python dependencies could not be installed in .venv." "$C_YELLOW"
      fi
    else
      write_status "ok" "Python environment (.venv) verified with torch & safetensors." "$C_GREEN"
    fi
  fi
}

ensure_node_installed() {
  local force_install="${1:-false}"

  # First-run watchdog: once the environment is proven (node + node_modules present),
  # later launches flat-skip the entire provisioning block unless force_install is true.
  if [ "$force_install" != "true" ] && [ -f "$INSTALLED_FILE" ]; then
    if [ -d "$SCRIPT_DIR/node_modules" ]; then
      return 0
    fi
    rm -f "$INSTALLED_FILE"
  fi

  echo ""
  write_status ">>" "Starting Environment Verification & Dependency Setup..." "$C_CYAN"
  write_status ".." "[1/3] Checking Node.js runtime and environment..." "$C_GRAY"

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    write_status "!" "Node.js runtime was not detected on this system." "$C_YELLOW"
    echo ""
    echo -e "  ${C_YELLOW}Renegade Core Model Manager requires Node.js (v20+ or v22 LTS recommended).${C_RESET}"
    echo -e "  Please install Node.js: https://nodejs.org/ or install via NVM: https://github.com/nvm-sh/nvm"
    echo ""
    exit 1
  fi

  local node_ver
  node_ver=$(node -v 2>/dev/null || echo "unknown")
  local npm_ver
  npm_ver=$(npm -v 2>/dev/null || echo "unknown")
  write_status "ok" "Node.js runtime verified ($node_ver, npm $npm_ver)." "$C_GREEN"

  if [ "$force_install" = "true" ] || [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    write_status ">>" "[2/3] Installing project dependencies (npm install)..." "$C_CYAN"
    echo -e "      ${C_GRAY}Downloading packages & compiling native modules (please wait)...${C_RESET}"
    (cd "$SCRIPT_DIR" && npm install)
    write_status "ok" "Dependencies installed successfully." "$C_GREEN"
  else
    write_status "ok" "[2/3] Project dependencies (node_modules) verified." "$C_GREEN"
  fi

  write_status ".." "[3/3] Checking Python runtime and .venv environment..." "$C_GRAY"
  ensure_python_environment "$force_install"

  write_status "ok" "Environment verification completed." "$C_GREEN"
  echo ""

  # Stamp the completed setup so every later launch skips installer work.
  touch "$INSTALLED_FILE"
}

install_dependencies() {
  ensure_node_installed true
  write_status ">>" "Building project assets..." "$C_CYAN"
  (cd "$SCRIPT_DIR" && npm run build)
  write_status "ok" "Build completed successfully." "$C_GREEN"
  echo ""
  write_status "ok" "Renegade Core Model Manager setup & installation complete!" "$C_GREEN"
  echo -e "  Run ${C_GREEN}./cmm.sh start${C_RESET} to launch the application."
  echo ""
}

is_safe_to_kill() {
  local target_pid="$1"
  if [ -z "$target_pid" ] || ! kill -0 "$target_pid" 2>/dev/null; then
    return 1
  fi

  # Never kill current process, parent, or system init
  if [ "$target_pid" -le 1 ] || [ "$target_pid" -eq "$$" ]; then
    return 1
  fi

  local comm=""
  local cmdline=""
  comm=$(ps -p "$target_pid" -o comm= 2>/dev/null | tr '[:upper:]' '[:lower:]' | xargs)
  cmdline=$(ps -p "$target_pid" -o args= 2>/dev/null | tr '[:upper:]' '[:lower:]')

  # 1. Protected Process Blacklist (Never kill web browsers, user shells, terminal emulators, or desktop systems)
  case "$comm" in
    *firefox*|*chrome*|*chromium*|*brave*|*opera*|*edge*|*msedge*|*safari*|*vivaldi*|*zen*|*tor*|*waterfox*|*librewolf*|*epiphany*|*midori*|*qutebrowser*)
      return 1
      ;;
    *bash*|*zsh*|*sh*|*fish*|*csh*|*tcsh*|*gnome*|*kde*|*systemd*|*init*|*xorg*|*wayland*|*dbus*|*pipewire*|*pulseaudio*|*tmux*|*screen*|*alacritty*|*kitty*|*wezterm*|*konsole*)
      return 1
      ;;
  esac

  if echo "$cmdline" | grep -qE "(firefox|chrome|chromium|brave|opera|msedge|zen-browser|vivaldi|waterfox|librewolf|tor-browser)"; then
    return 1
  fi

  # Check /proc/$pid/exe link if available on Linux
  if [ -L "/proc/$target_pid/exe" ]; then
    local exe_path=""
    exe_path=$(readlink -f "/proc/$target_pid/exe" 2>/dev/null | tr '[:upper:]' '[:lower:]' || true)
    if echo "$exe_path" | grep -qE "(firefox|chrome|chromium|brave|opera|msedge|zen|vivaldi|librewolf|waterfox|tor)"; then
      return 1
    fi
  fi

  # 2. Must be an Electron or Node/Vite process associated with this project
  if echo "$cmdline" | grep -qF "$SCRIPT_DIR" || echo "$cmdline" | grep -qE "electron|vite|civitai-manager"; then
    case "$comm" in
      *electron*|*node*|*npm*|*cmm*|*civitai*)
        return 0
        ;;
    esac
  fi

  return 1
}

get_running_pids() {
  local pids=()
  local seen=()

  # 1. Read stored PID file (with strict safety verification)
  if [ -f "$PID_FILE" ]; then
    while read -r pid; do
      if [[ "$pid" =~ ^[0-9]+$ ]] && is_safe_to_kill "$pid"; then
        if [[ ! " ${seen[*]} " =~ " ${pid} " ]]; then
          pids+=("$pid")
          seen+=("$pid")
        fi
      fi
    done < "$PID_FILE"
  fi

  # 2. Check ports ($PORT and $API_PORT) ONLY in TCP LISTEN state
  for p in "$PORT" "$API_PORT"; do
    if command -v lsof >/dev/null 2>&1; then
      for port_pid in $(lsof -sTCP:LISTEN -ti :"$p" 2>/dev/null || true); do
        if [[ ! " ${seen[*]} " =~ " ${port_pid} " ]] && is_safe_to_kill "$port_pid"; then
          pids+=("$port_pid")
          seen+=("$port_pid")
        fi
      done
    elif command -v ss >/dev/null 2>&1; then
      for port_pid in $(ss -lptn "sport = :$p" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2); do
        if [[ ! " ${seen[*]} " =~ " ${port_pid} " ]] && is_safe_to_kill "$port_pid"; then
          pids+=("$port_pid")
          seen+=("$port_pid")
        fi
      done
    fi
  done

  # 3. Check workspace Electron & Vite processes
  for proc_pid in $(pgrep -f "electron.*$SCRIPT_DIR" 2>/dev/null || true); do
    if [[ ! " ${seen[*]} " =~ " ${proc_pid} " ]] && is_safe_to_kill "$proc_pid"; then
      pids+=("$proc_pid")
      seen+=("$proc_pid")
    fi
  done
  for proc_pid in $(pgrep -f "node.*vite.*$PORT" 2>/dev/null || true); do
    if [[ ! " ${seen[*]} " =~ " ${proc_pid} " ]] && is_safe_to_kill "$proc_pid"; then
      pids+=("$proc_pid")
      seen+=("$proc_pid")
    fi
  done

  echo "${pids[@]}"
}

stop_app() {
  local pids
  read -r -a pids <<< "$(get_running_pids)"

  if [ ${#pids[@]} -eq 0 ]; then
    write_status "!" "No running Renegade Core Model Manager processes found." "$C_YELLOW"
    rm -f "$PID_FILE" 2>/dev/null || true
    clean_assets
    return 0
  fi

  write_status "x" "Stopping ${#pids[@]} process(es)..." "$C_RED"
  for pid in "${pids[@]}"; do
    if is_safe_to_kill "$pid"; then
      kill "$pid" 2>/dev/null || true
      sleep 0.5
      if kill -0 "$pid" 2>/dev/null && is_safe_to_kill "$pid"; then
        kill -9 "$pid" 2>/dev/null || true
      fi
      write_status "ok" "Terminated PID $pid" "$C_GRAY"
    fi
  done

  rm -f "$PID_FILE" 2>/dev/null || true
  write_status "ok" "Application stopped." "$C_GREEN"
  clean_assets
}

# Janitor: prune stale hashed renderer bundles from dist/assets once the app is idle.
# Only `index-*.js` / `index-*.css` are considered; anything referenced by dist/index.html
# plus the single newest js/css pair is kept. Non-destructive, missing files are not errors.
clean_assets() {
  local assets_dir="$SCRIPT_DIR/dist/assets"
  local index_html="$SCRIPT_DIR/dist/index.html"
  if [ ! -d "$assets_dir" ]; then
    write_status "!" "No dist/assets directory found; nothing to clean." "$C_GRAY"
    return 0
  fi

  local keep=""
  if [ -f "$index_html" ]; then
    keep="$(grep -aoE '(src|href)="[^"]*assets/[^"]+"' "$index_html" 2>/dev/null | sed -E 's/^(src|href)="//; s/"$//' | sed -E 's#.*assets/##' | sort -u || true)"
  fi

  # Always retain the single most recently-generated js and css pair as a safety net.
  local newest_js newest_css
  newest_js="$(ls -t "$assets_dir"/index-*.js 2>/dev/null | head -n1 || true)"
  newest_css="$(ls -t "$assets_dir"/index-*.css 2>/dev/null | head -n1 || true)"
  if [ -n "$newest_js" ]; then keep="$keep
$(basename "$newest_js")"; fi
  if [ -n "$newest_css" ]; then keep="$keep
$(basename "$newest_css")"; fi
  keep="$(printf '%s\n' "$keep" | grep -v '^$' | sed 's/\.\/assets\///' | sort -u)"

  local removed=0
  local f
  for f in "$assets_dir"/index-*.js "$assets_dir"/index-*.css; do
    [ -f "$f" ] || continue
    local name
    name="$(basename "$f")"
    if printf '%s\n' "$keep" | grep -qx "$name"; then
      continue
    fi
    if rm -f "$f" 2>/dev/null; then
      removed=$((removed + 1))
    fi
  done

  if [ "$removed" -gt 0 ]; then
    write_status "ok" "Pruned $removed orphaned asset(s) from dist/assets." "$C_GREEN"
  else
    write_status "ok" "No orphaned dist assets to prune." "$C_GRAY"
  fi
}

start_app() {
  ensure_node_installed

  local existing
  read -r -a existing <<< "$(get_running_pids)"

  if [ ${#existing[@]} -gt 0 ]; then
    # Try bringing existing GUI window to focus if wmctrl/xdotool is available
    if command -v wmctrl >/dev/null 2>&1 && wmctrl -a "RenegadeCMM" 2>/dev/null; then
      write_status "ok" "Renegade Core Model Manager is already running. Active window brought to front." "$C_GREEN"
      return 0
    elif command -v xdotool >/dev/null 2>&1 && xdotool search --name "RenegadeCMM" windowactivate 2>/dev/null; then
      write_status "ok" "Renegade Core Model Manager is already running. Active window brought to front." "$C_GREEN"
      return 0
    fi

    write_status "!" "Port $PORT/$API_PORT is in use or orphaned process found. Cleaning up..." "$C_YELLOW"
    stop_app
    sleep 1
  fi

  cd "$SCRIPT_DIR"

  # Check for Git development updates
  check_git_updates

  # 1. Build project
  write_status ">>" "Building project..." "$C_CYAN"
  
  write_status ">>" "Building renderer with Vite..." "$C_GRAY"
  if ! npx vite build --base ./ --emptyOutDir false; then
    write_status "!!" "Renderer build failed!" "$C_RED"
    exit 1
  fi
  write_status "ok" "Renderer built successfully." "$C_GREEN"

  write_status ">>" "Building Electron main process with TypeScript..." "$C_GRAY"
  if ! npx tsc --project tsconfig.main.json; then
    write_status "!!" "TypeScript main process compilation failed!" "$C_RED"
    exit 1
  fi
  write_status "ok" "TypeScript compilation succeeded." "$C_GREEN"

  if [ ! -f "$SCRIPT_DIR/dist/main/index.js" ]; then
    write_status "!!" "Main entry point NOT FOUND: dist/main/index.js" "$C_RED"
    exit 1
  fi

  # 2. Start Vite server in background
  write_status ">>" "Starting Vite dev server on port $PORT..." "$C_CYAN"
  export PORT="$PORT"
  export API_PORT="$API_PORT"
  export VITE_DEV_SERVER_URL="http://127.0.0.1:$PORT"
  
  npx vite --port "$PORT" --host 127.0.0.1 >/dev/null 2>&1 &
  VITE_PID=$!
  sleep 2

  # 3. Launch Electron app
  local ELECTRON_CMD=()
  if [ -f "$SCRIPT_DIR/node_modules/electron/dist/electron" ]; then
    ELECTRON_CMD=("$SCRIPT_DIR/node_modules/electron/dist/electron")
  else
    ELECTRON_CMD=("npx" "electron")
  fi

  local ELECTRON_PID=""
  if [ "$HEADLESS" = true ]; then
    write_status ">>" "Starting Electron in headless background mode..." "$C_MAGENTA"
    export HEADLESS="true"
    "${ELECTRON_CMD[@]}" . --headless >/dev/null 2>&1 &
    ELECTRON_PID=$!
  else
    write_status ">>" "Launching Electron desktop app window..." "$C_MAGENTA"
    export HEADLESS="false"
    "${ELECTRON_CMD[@]}" . >/dev/null 2>&1 &
    ELECTRON_PID=$!
  fi

  # Store PIDs
  {
    echo "$VITE_PID"
    if [ -n "$ELECTRON_PID" ]; then
      echo "$ELECTRON_PID"
    fi
  } > "$PID_FILE"

  echo ""
  write_status "ok" "Renegade Core Model Manager is running!" "$C_GREEN"
  echo ""
  echo -e "    ${C_GRAY}Web / Browser UI : http://127.0.0.1:$PORT${C_RESET}"
  echo -e "    ${C_GRAY}HTTP API Bridge  : http://127.0.0.1:$API_PORT${C_RESET}"
  if [ "$HEADLESS" = true ]; then
    echo -e "    ${C_GRAY}Mode             : Headless / Background${C_RESET}"
  else
    echo -e "    ${C_GRAY}Electron App     : PID $ELECTRON_PID${C_RESET}"
  fi
  echo -e "    ${C_GRAY}PID file         : $PID_FILE${C_RESET}"
  echo ""
  echo -e "    ${C_GRAY}Use  ./cmm.sh stop     to shut down${C_RESET}"
  echo -e "    ${C_GRAY}Use  ./cmm.sh restart  to restart${C_RESET}"
  echo ""
}

show_status() {
  local pids
  read -r -a pids <<< "$(get_running_pids)"

  if [ ${#pids[@]} -eq 0 ]; then
    write_status "-" "Renegade Core Model Manager is not running." "$C_YELLOW"
  else
    write_status "+" "Renegade Core Model Manager is running (${#pids[@]} processes):" "$C_GREEN"
    for pid in "${pids[@]}"; do
      local pname
      pname=$(ps -p "$pid" -o comm= 2>/dev/null || echo "process")
      echo -e "      ${C_GRAY}PID $pid  -  $pname${C_RESET}"
    done
    echo ""
    echo -e "      ${C_GRAY}Web UI:      http://127.0.0.1:$PORT${C_RESET}"
    echo -e "      ${C_GRAY}HTTP Bridge: http://127.0.0.1:$API_PORT${C_RESET}"
  fi
}

invoke_package() {
  ensure_node_installed
  cd "$SCRIPT_DIR"

  write_status ">>" "Building production assets..." "$C_CYAN"
  npx vite build --base ./ --emptyOutDir false
  npx tsc --project tsconfig.main.json

  write_status ">>" "Packaging standalone Linux binary with electron-builder..." "$C_CYAN"
  npx electron-builder --linux

  write_status "ok" "Standalone Linux application packaged successfully!" "$C_GREEN"
  echo ""
  echo -e "  ${C_GREEN}Release Binaries in ./release/${C_RESET}"
  if [ -d "$SCRIPT_DIR/release" ]; then
    find "$SCRIPT_DIR/release" -maxdepth 2 \( -name "*.zip" -o -name "*.tar.gz" -o -name "*.AppImage" -o -name "linux-unpacked" \) | while read -r file; do
      local size
      size=$(du -sh "$file" | cut -f1)
      echo -e "    ${C_CYAN}- $(basename "$file")  ($size)${C_RESET}"
    done
  fi
  echo ""
}

check_git_updates() {
  # Check if release mode is forced or configured in src/version.ts
  if [ "$CMM_RELEASE_BUILD" = "true" ] || [ "$NODE_ENV" = "production" ]; then
    return 0
  fi
  if [ -f "$SCRIPT_DIR/src/version.ts" ] && grep -q "IS_DEV_BUILD: false" "$SCRIPT_DIR/src/version.ts"; then
    return 0
  fi

  if [ -d "$SCRIPT_DIR/.git" ] && command -v git >/dev/null 2>&1; then
    local local_sha=""
    local_sha=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || true)
    local remote_sha=""
    if command -v timeout >/dev/null 2>&1; then
      remote_sha=$(timeout 2 git -C "$SCRIPT_DIR" ls-remote --heads origin main 2>/dev/null | awk '{print substr($1, 1, 7)}' || true)
    else
      remote_sha=$(git -C "$SCRIPT_DIR" ls-remote --heads origin main 2>/dev/null | awk '{print substr($1, 1, 7)}' || true)
    fi

    if [ -n "$remote_sha" ] && [ -n "$local_sha" ] && [ "$remote_sha" != "$local_sha" ]; then
      echo ""
      write_status "!" "DEVELOPMENT UPDATE: Newer commit available on GitHub ($remote_sha)!" "$C_YELLOW"
      echo -e "      ${C_GRAY}Current Local Commit : ${C_CYAN}$local_sha${C_RESET}"
      echo -e "      ${C_GRAY}Latest Remote Commit : ${C_GREEN}$remote_sha${C_RESET} ${C_GRAY}(main branch)${C_RESET}"
      echo -e "      ${C_YELLOW}Note: You are running an active development version (not a tagged release).${C_RESET}"
      echo -e "      ${C_YELLOW}Run  ./cmm.sh update  or  git pull  to update your development copy.${C_RESET}"
      echo ""
    fi
  fi
}

update_app() {
  if [ ! -d "$SCRIPT_DIR/.git" ] || ! command -v git >/dev/null 2>&1; then
    write_status "!!" "This installation is not a Git clone. Cannot update automatically." "$C_RED"
    echo -e "  ${C_YELLOW}To update standalone builds, download the latest development release from GitHub.${C_RESET}"
    exit 1
  fi

  write_status ">>" "Pulling latest development updates from GitHub (git pull origin main)..." "$C_CYAN"
  git -C "$SCRIPT_DIR" pull origin main
  write_status "ok" "Git repository updated successfully." "$C_GREEN"

  ensure_node_installed
  write_status ">>" "Rebuilding application..." "$C_CYAN"
  (cd "$SCRIPT_DIR" && npm run build)
  write_status "ok" "Update and rebuild complete! Run ./cmm.sh start to launch." "$C_GREEN"
}

# Print Banner
echo ""
echo -e "  ${C_MAGENTA}+-------------------------------------+${C_RESET}"
echo -e "  ${C_MAGENTA}|     Renegade Core Model Manager     |${C_RESET}"
echo -e "  ${C_MAGENTA}+-------------------------------------+${C_RESET}"
echo ""

# Dispatch Command
case "$ACTION" in
  install|setup|init)
    install_dependencies
    ;;
  start)
    if [ "$CLEAN_ASSETS" = "true" ]; then
      clean_assets
    fi
    start_app
    ;;
  stop)
    stop_app
    ;;
  clean-assets)
    clean_assets
    ;;
  restart)
    write_status ">>" "Restarting application..." "$C_CYAN"
    stop_app
    sleep 1
    start_app
    ;;
  status)
    show_status
    ;;
  update|pull)
    update_app
    ;;
  package|publish|dist)
    invoke_package
    ;;
  help|--help|-h)
    echo "Usage: ./cmm.sh <command> [options]"
    echo ""
    echo "App Management Commands:"
    echo "  install / setup          Verify runtime, install npm & Python .venv dependencies, build project"
    echo "  start                    Start the desktop app and Vite web server (default)"
    echo "  stop                     Stop all running CMM processes"
    echo "  restart                  Restart the application"
    echo "  clean-assets             Prune orphaned hashed bundles from dist/assets"
    echo "  update                   Pull latest development commits and rebuild"
    echo "  status                   Show running process status & endpoints"
    echo "  package / dist           Package standalone Linux binaries (.zip, .tar.gz)"
    echo ""
    echo "CLI Commands:"
    echo "  scan                     Scan ComfyUI model directories"
    echo "  download                 Download model from CivitAI"
    echo "  check-updates            Check installed models for new versions"
    echo "  export                   Export model database & configuration"
    echo "  hf check <repo_id>       Inspect Hugging Face model repository"
    echo "  hf whoami                Check Hugging Face CLI login status"
    echo "  workflows                Scan workflows for referenced models"
    echo ""
    echo "Options:"
    echo "  --port, -p <port>        Custom web port (default: 5173)"
    echo "  --headless, --no-window  Run in background without Electron GUI window"
    echo ""
    ;;
  *)
    ensure_node_installed
    node "$SCRIPT_DIR/bin/cmm.js" "$ACTION" "${CLI_ARGS[@]}"
    ;;
esac
