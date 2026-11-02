#!/usr/bin/env bash
# Compatibility name; bounded definitions rather than a multi-language AST.
set -euo pipefail
exec python3 "$(dirname "$0")/signatures.py" "$@"
