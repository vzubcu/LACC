#!/usr/bin/env bash
# Shared memory protocol with thin native instruction bridges for coding agents.
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
python3 - "$SKILL_DIR" "$@" <<'PY'
import argparse
from pathlib import Path
import re
import shutil
import shlex
import sys

skill = Path(sys.argv[1]).resolve()
parser = argparse.ArgumentParser(description="Initialize shared memory and agent-native instruction bridges.")
parser.add_argument("project_dir", nargs="?", default=".")
parser.add_argument("--agent", choices=["auto", "codex", "claude", "gemini", "roo", "all"], default="auto")
args = parser.parse_args(sys.argv[2:])
root = Path(args.project_dir).resolve()
if not root.is_dir():
    parser.error("project directory must exist")

start = "<!-- LEAN-CONTEXT-MEMORY:START -->"
end = "<!-- LEAN-CONTEXT-MEMORY:END -->"

def markdown_code(value):
    width = max((len(run) for run in re.findall(r"\x60+", value)), default=0) + 1
    fence = chr(96) * width
    return fence + " " + value + " " + fence

skill_reference = markdown_code((skill / "SKILL.md").as_posix())
sync_command = markdown_code("bash " + shlex.quote((skill / "scripts/sync-memory.sh").as_posix()))
health_command = markdown_code("python3 " + shlex.quote((skill / "scripts/memory-health.py").as_posix()))
common = f"""{start}
## Context, Token & Memory Protocol (lean-context-memory v2.3)
- Read the shared skill at {skill_reference} when needed; the protocol is agent-neutral.
- Keep exact errors, required checks and source-backed project knowledge; use the host's native read/search/edit/terminal tools.
- Start with 1-hop references; expand on named contract/event/schema/test evidence using the dependency helper.
- Read the index/checkpoint once; run {sync_command}; lazy-load relevant topics.
- Durable topic facts require source paths and a checked commit; unconfirmed claims/progress stay in ACTIVE_STATE.md.
- Replace contradicted facts and remove proven obsolete entries or exact duplicates; age or budget alone does not justify deletion.
- Budgets: index 60 lines; checkpoint 30 lines/2048 bytes; topics 4096 bytes each/16384 total, configurable.
- Preserve security/data-integrity invariants; after changes update affected memory and run {health_command}.
- Stamp only after semantic checks and structural validation pass with clean sources; pending work never advances Last Synced Commit.
- Report unresolved checks and incomplete search coverage; provider-reported usage, not bytes, establishes token consumption.
{end}"""
bridge = f"""{start}
## Shared context and memory
Read the marked lean-context-memory block in project-root `AGENTS.md` once per session.
If it is already loaded, reuse it; use the same `memory/` files and the host's native tools.
The memory workflow does not require Codex or a usage collector.
{end}"""
native = {"claude": "CLAUDE.md", "gemini": "GEMINI.md", "roo": ".roo/rules/lean-context-memory.md"}
targets = {"AGENTS.md": common}
for agent, name in native.items():
    if args.agent in {agent, "all"} or (root / name).exists() or (root / name).is_symlink():
        targets[name] = bridge
templates = ["MEMORY_INDEX.md", "ACTIVE_STATE.md", "topics/architecture.md", "topics/db-and-api.md", "topics/gotchas.md"]
pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)

def safe_file(name):
    dest = root / name
    if not dest.resolve().is_relative_to(root):
        raise ValueError(f"destination escapes project root: {name}")
    cursor = root
    parts = dest.relative_to(root).parts
    for number, part in enumerate(parts):
        cursor = cursor / part
        if cursor.is_symlink():
            raise ValueError(f"refusing symlink destination: {name}")
        if number < len(parts) - 1 and cursor.exists() and not cursor.is_dir():
            raise ValueError(f"destination parent is not a directory: {name}")
    if dest.exists() and not dest.is_file():
        raise ValueError(f"destination is not a file: {name}")
    return dest

try:
    # Preflight every destination and existing instruction block before any writes.
    memory = [(safe_file("memory/" + name), skill / "templates" / name) for name in templates]
    updates = []
    for name, block in targets.items():
        path = safe_file(name)
        text = path.read_text(encoding="utf-8") if path.exists() else "# Agent Instructions\n"
        if text.count(start) != text.count(end) or text.count(start) > 1:
            raise ValueError(f"ambiguous protocol markers: {name}")
        if start in text:
            if not pattern.search(text):
                raise ValueError(f"invalid protocol marker order: {name}")
            updated = pattern.sub(lambda _: block, text)
        else:
            updated = text.rstrip("\n") + "\n\n" + block + "\n"
        updates.append((path, updated))
    for dest, source in memory:
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
            print("[+] Created " + dest.relative_to(root).as_posix())
    for path, updated in updates:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(updated, encoding="utf-8")
        print("[OK] Linked " + path.relative_to(root).as_posix())
except (OSError, UnicodeError, ValueError) as exc:
    print(f"ERROR: {exc}", file=sys.stderr)
    sys.exit(2)
print("[NEXT] Populate and verify shared memory; templates remain UNSYNCED until reviewed.")
PY
