#!/usr/bin/env bash
# 60/40 Middle-Out Truncation Helper for Lean Context Memory
# Usage:
#   ./ctx-slice.sh <file_path> [max_lines=100]
#   <command> 2>&1 | ./ctx-slice.sh - [max_lines=100]

set -euo pipefail

TARGET="${1:--}"
MAX_LINES="${2:-100}"

if [ "$TARGET" = "-" ]; then
  TMP_FILE="/tmp/agent_ctx_$$.log"
  cat > "$TMP_FILE"
  TARGET="$TMP_FILE"
  SAVED_NOTE="(Full output saved to $TMP_FILE)"
else
  SAVED_NOTE="(Source: $TARGET)"
fi

if [ ! -f "$TARGET" ]; then
  echo "Error: File '$TARGET' not found." >&2
  exit 1
fi

TOTAL_LINES=$(wc -l < "$TARGET" | tr -d ' ')

if [ "$TOTAL_LINES" -le "$MAX_LINES" ]; then
  cat "$TARGET"
  exit 0
fi

HEAD_LINES=$(( MAX_LINES * 60 / 100 ))
TAIL_LINES=$(( MAX_LINES - HEAD_LINES ))
OMITTED=$(( TOTAL_LINES - HEAD_LINES - TAIL_LINES ))

head -n "$HEAD_LINES" "$TARGET"
echo ""
echo "=== [60/40 TRUNCATION: $OMITTED lines omitted out of $TOTAL_LINES total $SAVED_NOTE] ==="
echo ""
tail -n "$TAIL_LINES" "$TARGET"
