#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed. Install Node.js and npm first."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

ELECTRON_BIN="$SCRIPT_DIR/node_modules/.bin/electron"

if [[ ! -x "$ELECTRON_BIN" ]]; then
  echo "Electron binary not found. Reinstalling dependencies..."
  npm install
fi

if [[ "$(uname -s)" == "Linux" ]]; then
  # Some Linux setups fail on Electron's chrome-sandbox permissions inside node_modules.
  "$ELECTRON_BIN" . --no-sandbox
else
  "$ELECTRON_BIN" .
fi
