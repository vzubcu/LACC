#!/usr/bin/env bash
# Initializes the Two-Tiered CRUD Memory structure AND auto-injects enforcement rules
# into AGENTS.md (and CLAUDE.md if present) idempotently.
# Usage: ./init-memory.sh [target_project_dir]

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="${1:-$(pwd)}"
MEM_DIR="$PROJECT_DIR/memory"

mkdir -p "$MEM_DIR/topics"

# 1. Copy memory templates if they don't exist
for tpl in MEMORY_INDEX.md ACTIVE_STATE.md; do
  if [ ! -f "$MEM_DIR/$tpl" ]; then
    cp "$SKILL_DIR/templates/$tpl" "$MEM_DIR/$tpl"
    echo "[+] Created $MEM_DIR/$tpl"
  else
    echo "[=] Exists  $MEM_DIR/$tpl (kept existing)"
  fi
done

for topic in architecture.md db-and-api.md gotchas.md; do
  if [ ! -f "$MEM_DIR/topics/$topic" ]; then
    cp "$SKILL_DIR/templates/topics/$topic" "$MEM_DIR/topics/$topic"
    echo "[+] Created $MEM_DIR/topics/$topic"
  else
    echo "[=] Exists  $MEM_DIR/topics/$topic (kept existing)"
  fi
done

# Stamp current git HEAD into ACTIVE_STATE.md if still UNSYNCED
if git -C "$PROJECT_DIR" rev-parse --short HEAD >/dev/null 2>&1; then
  CUR_HASH=$(git -C "$PROJECT_DIR" rev-parse --short HEAD)
  if grep -q "UNSYNCED" "$MEM_DIR/ACTIVE_STATE.md" 2>/dev/null; then
    sed -i.bak "s/UNSYNCED/$CUR_HASH/" "$MEM_DIR/ACTIVE_STATE.md" && rm -f "$MEM_DIR/ACTIVE_STATE.md.bak"
  fi
fi

# 2. Auto-inject protocol block into AGENTS.md (and CLAUDE.md if it exists)
MARKER_START="<!-- LEAN-CONTEXT-MEMORY:START -->"
MARKER_END="<!-- LEAN-CONTEXT-MEMORY:END -->"

read -r -d '' AGENT_BLOCK << 'EOF' || true
<!-- LEAN-CONTEXT-MEMORY:START -->
## Context, Token & Memory Protocol (`lean-context-memory`)
- **Always-On Skill**: Enforce the `lean-context-memory` skill on ALL coding, debugging, exploration, and shell tasks.
- **Caveman & Ponytail**: Zero fluff/narration in responses. Follow YAGNI ladder (Native -> StdLib -> Existing -> Minimal Code).
- **Surgical Context & Graphify**: Never read full files >150 lines first; run `ast-skeleton.sh` and `dep-graph.sh` (1-hop blast radius). Filter noisy commands (`git status -s`, `git diff -U2`, `ctx-slice.sh` 60/40 truncation). Keep >5KB outputs in `/tmp`.
- **Session Start (Memory Read & Drift Check)**:
  1. Read `memory/MEMORY_INDEX.md` and `memory/ACTIVE_STATE.md`.
  2. Run `sync-memory.sh` (or check `git status -s` / `git diff --name-status` against `Last Synced Commit`). If external changes occurred, update `memory/` first.
  3. Lazy-load `memory/topics/*.md` ONLY when the task touches that domain.
- **Definition of Done (Mandatory Auto-Sync on Code Changes)**:
  - Any task that modifies code/schemas/configs MUST update `memory/ACTIVE_STATE.md` (including `Last Synced Commit`) before finishing.
  - If routes, module boundaries, DB schemas, API contracts, or critical gotchas changed, update the corresponding entry in `memory/MEMORY_INDEX.md` or `memory/topics/*.md` IN-PLACE (CRUD, never append-only).
<!-- LEAN-CONTEXT-MEMORY:END -->
EOF

inject_into_file() {
  local target_file="$1"
  if [ ! -f "$target_file" ]; then
    printf "# Agent Instructions

%s
" "$AGENT_BLOCK" > "$target_file"
    echo "[+] Created $target_file with lean-context-memory rules"
  elif grep -q "$MARKER_START" "$target_file"; then
    # Replace existing block between markers
    python3 - "$target_file" "$AGENT_BLOCK" << 'PYEOF'
import sys, re
path, block = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    content = f.read()
pattern = re.compile(r"<!-- LEAN-CONTEXT-MEMORY:START -->.*?<!-- LEAN-CONTEXT-MEMORY:END -->", re.DOTALL)
new_content = pattern.sub(block, content)
with open(path, "w", encoding="utf-8") as f:
    f.write(new_content)
PYEOF
    echo "[~] Updated lean-context-memory block in $target_file"
  else
    printf "

%s
" "$AGENT_BLOCK" >> "$target_file"
    echo "[+] Appended lean-context-memory block to $target_file"
  fi
}

inject_into_file "$PROJECT_DIR/AGENTS.md"

if [ -f "$PROJECT_DIR/CLAUDE.md" ]; then
  inject_into_file "$PROJECT_DIR/CLAUDE.md"
fi

echo "[OK] Lean Context Memory initialized at $MEM_DIR and linked in AGENTS.md"
echo "[NEXT] Agent must now scan project manifests and populate memory/MEMORY_INDEX.md."
