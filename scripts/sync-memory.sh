#!/usr/bin/env bash
# Detects code changes (git drift) since memory/ACTIVE_STATE.md was last synchronized.
# Usage:
#   ./sync-memory.sh [project_dir]          -> Check drift between code and memory
#   ./sync-memory.sh [project_dir] --stamp  -> Stamp current git HEAD into ACTIVE_STATE.md after updating memory

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
ACTION="${2:-check}"
STATE_FILE="$PROJECT_DIR/memory/ACTIVE_STATE.md"

if [ ! -f "$STATE_FILE" ]; then
  echo "[!] $STATE_FILE not found. Run init-memory.sh first." >&2
  exit 1
fi

if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[i] Not a git repository. Checking file modification times vs $STATE_FILE..."
  find "$PROJECT_DIR" -maxdepth 3 -newer "$STATE_FILE" -not -path '*/.*' -not -path '*/memory/*' -not -path '*/node_modules/*' -not -path '*/vendor/*' | head -n 30
  exit 0
fi

CUR_HEAD=$(git -C "$PROJECT_DIR" rev-parse --short HEAD 2>/dev/null || echo "NONE")

if [ "$ACTION" = "--stamp" ]; then
  if grep -q "Last Synced Commit" "$STATE_FILE"; then
    sed -i.bak -E "s/(\*\*Last Synced Commit\*\*: \`).*(\`)/$CUR_HEAD/" "$STATE_FILE" && rm -f "$STATE_FILE.bak"
    echo "[OK] Stamped Last Synced Commit: $CUR_HEAD in $STATE_FILE"
  fi
  exit 0
fi

SYNCED_HASH=$(grep "Last Synced Commit" "$STATE_FILE" | sed -E 's/.*`([^`]+)`.*//' || echo "UNSYNCED")

echo "=== MEMORY DRIFT CHECK (Synced: $SYNCED_HASH | Current HEAD: $CUR_HEAD) ==="

if [ "$SYNCED_HASH" != "UNSYNCED" ] && [ "$SYNCED_HASH" != "NONE" ] && [ "$SYNCED_HASH" != "$CUR_HEAD" ]; then
  echo "--- [Committed changes since $SYNCED_HASH] ---"
  git -C "$PROJECT_DIR" diff --name-status "$SYNCED_HASH"..HEAD -- . ':!memory/*' | head -n 40 || true
fi

echo "--- [Uncommitted working tree changes (excluding memory/)] ---"
DIRTY=$(git -C "$PROJECT_DIR" status -s -- . ':!memory/*' | head -n 40)
if [ -n "$DIRTY" ]; then
  echo "$DIRTY"
  echo ""
  echo "[ACTION REQUIRED] Code changes detected. Update affected edges in memory/ and run: sync-memory.sh . --stamp"
else
  if [ "$SYNCED_HASH" = "$CUR_HEAD" ]; then
    echo "[OK] Memory is 100% in sync with git state."
  else
    echo "[ACTION REQUIRED] Commits occurred since last memory sync. Review files above, update memory/, and run: sync-memory.sh . --stamp"
  fi
fi
