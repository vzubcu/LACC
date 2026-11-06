#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${PYTHON:-}" ]]; then PYTHON_BIN="$PYTHON"
elif command -v python3 >/dev/null 2>&1; then PYTHON_BIN=python3
elif command -v python >/dev/null 2>&1; then PYTHON_BIN=python
else echo "ERROR: Python 3.9+ is required" >&2; exit 2
fi
exec "$PYTHON_BIN" "$(dirname "$0")/ctx_slice.py" "$@"
