#!/bin/bash
# Start the Security+ quiz. Used by the Mac and Linux launchers.
set -e
cd "$(dirname "$0")"

open_file() {
  if [[ "$(uname)" == "Darwin" ]]; then
    open ./index.html
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open ./index.html >/dev/null 2>&1 || true
  else
    echo "Open this file in your browser:"
    echo "  $(pwd)/index.html"
  fi
}

if command -v node >/dev/null 2>&1; then
  exec node ./serve.js
fi

echo "Node.js was not found. Opening the quiz in your browser."
open_file
