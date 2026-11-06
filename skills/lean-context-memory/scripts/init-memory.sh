#!/usr/bin/env bash
# Shared memory protocol with thin native instruction bridges for coding agents.
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON_BIN="${PYTHON:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then PYTHON_BIN=python3
  elif command -v python >/dev/null 2>&1; then PYTHON_BIN=python
  else echo "ERROR: Python 3.9+ is required" >&2; exit 2
  fi
fi
"$PYTHON_BIN" - "$SKILL_DIR" "$PYTHON_BIN" "$@" <<'PY'
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import shlex
import sys

skill = Path(sys.argv[1]).resolve()
python_bin = sys.argv[2]
parser = argparse.ArgumentParser(description="Initialize shared memory and agent-native instruction bridges.")
parser.add_argument("project_dir", nargs="?", default=".")
parser.add_argument("--agent", choices=["auto", "codex", "claude", "gemini", "roo", "all"], default="auto")
args = parser.parse_args(sys.argv[3:])
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
health_command = markdown_code(shlex.quote(python_bin) + " " + shlex.quote((skill / "scripts/memory-health.py").as_posix()))
common = f"""{start}
## Project memory (lean-context-memory v3.2)
- Use `memory/` as the shared fact store; load {skill_reference} for memory maintenance.
- At session start prefer the bundled Node CLI (scripts/lacc.mjs) if Node.js and Git are available; otherwise use the Python/Bash helpers or disclose limited native-agent mode. Run {sync_command} only when Bash/Python are available; read checkpoint/index once, then relevant topics.
- For task-specific memory recall use the read-only memory-search.py helper described in the skill; verify source-backed results against relevant code before acting.
- Keep source paths and checked commits on durable facts; keep hypotheses in ACTIVE_STATE.md.
- Before handoff update affected facts and run {health_command}; stamp only after reviewed evidence and relevant tests pass.
- For unresolved source drift or keyed potential conflicts use memory-doctor.py on demand; its plan is advisory, never an automatic repair.
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
    native_path = root / name
    explicit = args.agent in {agent, "all"}
    auto_existing = args.agent == "auto" and (native_path.exists() or native_path.is_symlink())
    if auto_existing and native_path.is_symlink():
        print("[SKIP] Native instruction symlink preserved: " + name)
        continue
    if explicit or auto_existing:
        targets[name] = f"{start}\n@AGENTS.md\n{end}" if agent == "claude" else bridge
templates = ["MEMORY_INDEX.md", "ACTIVE_STATE.md", "topics/architecture.md", "topics/db-and-api.md", "topics/gotchas.md", "topics/decisions.md", "topics/lessons.md"]
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
    manifest = safe_file('memory/.bootstrap.json')
    generated = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else {}
    if not isinstance(generated, dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in generated.items()):
        raise ValueError('invalid bootstrap metadata')
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
        # Only pristine files first created by bootstrap qualify for suppression.
        original_hash = hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
        created = not path.exists() or generated.get(name) == original_hash
        updates.append((path, updated))
        if created:
            generated[name] = hashlib.sha256(updated.encode("utf-8")).hexdigest()
        else:
            generated.pop(name, None)
    for dest, source in memory:
        if not dest.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
            print("[+] Created " + dest.relative_to(root).as_posix())
    for path, updated in updates:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(updated.encode("utf-8"))
        print("[OK] Linked " + path.relative_to(root).as_posix())
    manifest.write_bytes((json.dumps(generated, indent=2) + '\n').encode("utf-8"))
except (OSError, UnicodeError, ValueError) as exc:
    print(f"ERROR: {exc}", file=sys.stderr)
    sys.exit(2)
print("[NEXT] Populate and verify shared memory; templates remain UNSYNCED until reviewed.")
PY
