#!/bin/bash
# CC Orchestrator - Installation Script
# Installs the cc-agent CLI and its dependencies.
# Uses only official package managers. No third-party scripts.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

INSTALL_DIR="${CC_ORCHESTRATOR_HOME:-$HOME/.cc-orchestrator}"
REPO_URL="https://github.com/Narcis13/cc-master.git"

info() { echo -e "${BLUE}[info]${NC} $1"; }
success() { echo -e "${GREEN}[ok]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; }

# -------------------------------------------------------------------
# Platform detection
# -------------------------------------------------------------------
detect_platform() {
  case "$(uname -s)" in
    Linux*)   PLATFORM="linux" ;;
    Darwin*)  PLATFORM="macos" ;;
    CYGWIN*|MINGW*|MSYS*)
      error "Windows is not directly supported."
      echo ""
      echo "Please use WSL (Windows Subsystem for Linux):"
      echo "  1. Install WSL: wsl --install"
      echo "  2. Open a WSL terminal"
      echo "  3. Re-run this script inside WSL"
      exit 1
      ;;
    *)
      error "Unsupported platform: $(uname -s)"
      exit 1
      ;;
  esac

  info "Platform: $PLATFORM ($(uname -m))"
}

# -------------------------------------------------------------------
# Detect package manager (Linux only)
# -------------------------------------------------------------------
detect_linux_pkg_manager() {
  if command -v apt-get &>/dev/null; then
    PKG_MANAGER="apt"
  elif command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"
  elif command -v yum &>/dev/null; then
    PKG_MANAGER="yum"
  elif command -v pacman &>/dev/null; then
    PKG_MANAGER="pacman"
  elif command -v apk &>/dev/null; then
    PKG_MANAGER="apk"
  elif command -v zypper &>/dev/null; then
    PKG_MANAGER="zypper"
  else
    PKG_MANAGER=""
  fi
}

# -------------------------------------------------------------------
# Check and install tmux
# -------------------------------------------------------------------
check_tmux() {
  if command -v tmux &>/dev/null; then
    success "tmux: $(tmux -V)"
    return 0
  fi

  warn "tmux not found. Installing..."

  if [ "$PLATFORM" = "macos" ]; then
    if ! command -v brew &>/dev/null; then
      error "Homebrew not found. Install it from https://brew.sh then re-run this script."
      exit 1
    fi
    brew install tmux
  elif [ "$PLATFORM" = "linux" ]; then
    detect_linux_pkg_manager
    case "$PKG_MANAGER" in
      apt)     sudo apt-get update && sudo apt-get install -y tmux ;;
      dnf)     sudo dnf install -y tmux ;;
      yum)     sudo yum install -y tmux ;;
      pacman)  sudo pacman -S --noconfirm tmux ;;
      apk)     sudo apk add tmux ;;
      zypper)  sudo zypper install -y tmux ;;
      *)
        error "No supported package manager found. Install tmux manually:"
        echo "  https://github.com/tmux/tmux/wiki/Installing"
        exit 1
        ;;
    esac
  fi

  if command -v tmux &>/dev/null; then
    success "tmux installed: $(tmux -V)"
  else
    error "tmux installation failed."
    exit 1
  fi
}

# -------------------------------------------------------------------
# Check and install Bun
# -------------------------------------------------------------------
check_bun() {
  if command -v bun &>/dev/null; then
    success "bun: $(bun --version)"
    return 0
  fi

  warn "Bun not found. Installing via official installer..."
  echo ""
  info "Bun install page: https://bun.sh"
  echo ""

  # Official Bun installer from bun.sh
  curl -fsSL https://bun.sh/install | bash

  # Source the updated profile so bun is on PATH
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if command -v bun &>/dev/null; then
    success "bun installed: $(bun --version)"
  else
    error "Bun installation failed. Install manually from https://bun.sh"
    exit 1
  fi
}

# -------------------------------------------------------------------
# Check for Claude Code CLI
# -------------------------------------------------------------------
check_claude_code() {
  if command -v claude &>/dev/null; then
    success "Claude Code CLI: found"
    return 0
  fi

  warn "Claude Code CLI not found."
  echo ""
  echo "The Claude Code CLI is the coding agent that cc-orchestrator controls."
  echo ""
  echo "Install it with npm:"
  echo "  npm install -g @anthropic-ai/claude-code"
  echo ""
  echo "Then authenticate with your Anthropic API key."
  echo ""
  echo "More info: https://docs.anthropic.com/en/docs/claude-code"
  echo ""

  read -p "Do you want to install it now with npm? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v npm &>/dev/null; then
      npm install -g @anthropic-ai/claude-code
      if command -v claude &>/dev/null; then
        success "Claude Code CLI installed"
        echo ""
        warn "You still need to set your ANTHROPIC_API_KEY environment variable"
      else
        error "Claude Code CLI installation failed."
        exit 1
      fi
    else
      error "npm not found. Install Node.js first: https://nodejs.org"
      exit 1
    fi
  else
    warn "Skipping Claude Code CLI install. You'll need it before using cc-agent."
  fi
}

# -------------------------------------------------------------------
# Install cc-orchestrator
# -------------------------------------------------------------------
install_orchestrator() {
  if [ -d "$INSTALL_DIR" ]; then
    info "Updating existing installation at $INSTALL_DIR"
    cd "$INSTALL_DIR"
    git pull --ff-only origin main
  else
    info "Cloning cc-orchestrator to $INSTALL_DIR"
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi

  info "Installing dependencies..."
  bun install

  # Add to PATH
  local BIN_DIR="$INSTALL_DIR/bin"
  local PATH_LINE="export PATH=\"$BIN_DIR:\$PATH\""

  if command -v cc-agent &>/dev/null; then
    success "cc-agent already on PATH"
  else
    # Detect shell profile
    local SHELL_PROFILE=""
    if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "$(which zsh 2>/dev/null)" ]; then
      SHELL_PROFILE="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
      SHELL_PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.bash_profile" ]; then
      SHELL_PROFILE="$HOME/.bash_profile"
    fi

    if [ -n "$SHELL_PROFILE" ]; then
      # Check if already in profile
      if grep -q "cc-orchestrator/bin" "$SHELL_PROFILE" 2>/dev/null; then
        info "PATH entry already in $SHELL_PROFILE"
      else
        echo "" >> "$SHELL_PROFILE"
        echo "# cc-orchestrator" >> "$SHELL_PROFILE"
        echo "$PATH_LINE" >> "$SHELL_PROFILE"
        success "Added to PATH in $SHELL_PROFILE"
      fi
    else
      warn "Could not detect shell profile."
      echo ""
      echo "Add this line to your shell profile manually:"
      echo "  $PATH_LINE"
    fi

    # Make it available in current session
    export PATH="$BIN_DIR:$PATH"
  fi
}

# -------------------------------------------------------------------
# Verify installation
# -------------------------------------------------------------------
verify() {
  echo ""
  info "Running health check..."
  echo ""

  if command -v cc-agent &>/dev/null; then
    cc-agent health
  elif [ -f "$INSTALL_DIR/bin/cc-agent" ]; then
    "$INSTALL_DIR/bin/cc-agent" health
  else
    error "cc-agent binary not found after installation."
    exit 1
  fi

  echo ""
  success "Installation complete!"
  echo ""
  echo "Quick start:"
  echo "  cc-agent start \"Review this codebase for issues\" --map"
  echo "  cc-agent jobs --json"
  echo "  cc-agent capture <jobId>"
  echo ""

  if ! command -v claude &>/dev/null; then
    warn "Reminder: Install the Claude Code CLI before using cc-agent:"
    echo "  npm install -g @anthropic-ai/claude-code"
  fi
}

# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------
main() {
  echo ""
  echo "========================================="
  echo "  CC Orchestrator - Setup"
  echo "========================================="
  echo ""

  detect_platform
  echo ""

  check_tmux
  check_bun
  check_claude_code

  echo ""
  install_orchestrator

  verify
}

main "$@"
