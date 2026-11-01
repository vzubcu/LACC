#!/usr/bin/env bash
# Graphify 1-Hop Dependency & Blast-Radius Extractor
# Builds an instant 1-hop subgraph (Outbound Imports + Inbound Callers) for a file or symbol
# without loading entire files into the LLM context.
# Usage: ./dep-graph.sh <file_path> [symbol_name]

set -euo pipefail

FILE="${1:-}"
SYMBOL="${2:-}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <file_path> [symbol_name]" >&2
  exit 1
fi

BASENAME=$(basename "$FILE")
STEM="${BASENAME%.*}"

echo "=== 1-HOP GRAPH SUBGRAPH FOR: $FILE ==="

echo ""
echo "--- [OUTBOUND EDGES: What $BASENAME imports/uses] ---"
OUT_PATTERN='^(\s*)(import\s+.*from|import\s+|require\(|use\s+[A-Za-z0-9_\]+|using\s+[A-Za-z0-9_.]+|from\s+[A-Za-z0-9_.]+\s+import|include(_once)?|require(_once)?)'
if command -v rg >/dev/null 2>&1; then
  rg -n "$OUT_PATTERN" "$FILE" | head -n 30 || echo "(No outbound imports matched)"
else
  grep -En "$OUT_PATTERN" "$FILE" | head -n 30 || echo "(No outbound imports matched)"
fi

echo ""
echo "--- [INBOUND EDGES (BLAST RADIUS): Files importing/referencing '$STEM'] ---"
if command -v rg >/dev/null 2>&1; then
  rg -n --glob "!$BASENAME" --glob "!.git/*" --glob "!node_modules/*" --glob "!vendor/*" --glob "!dist/*" --glob "!build/*" --glob "!bin/*" --glob "!obj/*" "\b${STEM}\b" . | head -n 35 || echo "(No inbound file references found)"
else
  grep -rn --exclude="$BASENAME" --exclude-dir={.git,node_modules,vendor,dist,build,bin,obj} "\b${STEM}\b" . | head -n 35 || echo "(No inbound file references found)"
fi

if [ -n "$SYMBOL" ]; then
  echo ""
  echo "--- [SYMBOL CALLERS: 1-Hop references to '$SYMBOL'] ---"
  if command -v rg >/dev/null 2>&1; then
    rg -n --glob "!.git/*" --glob "!node_modules/*" --glob "!vendor/*" --glob "!dist/*" --glob "!build/*" --glob "!bin/*" --glob "!obj/*" "\b${SYMBOL}\b" . | head -n 35 || echo "(No callers found for $SYMBOL)"
  else
    grep -rn --exclude-dir={.git,node_modules,vendor,dist,build,bin,obj} "\b${SYMBOL}\b" . | head -n 35 || echo "(No callers found for $SYMBOL)"
  fi
fi
