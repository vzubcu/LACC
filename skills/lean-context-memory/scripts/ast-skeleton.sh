#!/usr/bin/env bash
# Skeleton-First AST / Signature Extractor
# Extracts structural definitions with line numbers across TS/JS, PHP, C#, Python, Dart, Go, Rust.
# Usage: ./ast-skeleton.sh <file_path>

set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <file_path>" >&2
  exit 1
fi

TOTAL=$(wc -l < "$FILE" | tr -d ' ')
echo "=== SKELETON: $FILE ($TOTAL lines) ==="

PATTERN='^(\s*)(export\s+|default\s+|async\s+|public\s+|protected\s+|private\s+|static\s+|abstract\s+|final\s+|override\s+)*(class|interface|type|enum|function|def|fn|struct|trait|impl|namespace|module|Route::|@[A-Za-z]+)'

if command -v rg >/dev/null 2>&1; then
  rg -n "$PATTERN" "$FILE" || echo "(No standard top-level signatures matched)"
else
  grep -En "$PATTERN" "$FILE" || echo "(No standard top-level signatures matched)"
fi
