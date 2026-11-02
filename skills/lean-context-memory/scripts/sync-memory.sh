#!/usr/bin/env bash
# --stamp requires clean sources and a passing structural memory check.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 - "$SCRIPT_DIR" "$@" <<'PY'
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

script_dir = Path(sys.argv[1])
args = sys.argv[2:]
stamp = "--stamp" in args
strict = "--strict" in args or stamp
args = [a for a in args if a not in {"--stamp", "--strict"}]
if len(args) > 1 or any(a.startswith("--") for a in args):
    print("Usage: bash sync-memory.sh [project_dir] [--strict | --stamp]", file=sys.stderr)
    sys.exit(2)
root = Path(args[0] if args else ".").resolve()
state = root / "memory/ACTIVE_STATE.md"
if not state.is_file() or state.is_symlink() or (root / "memory").is_symlink():
    print("ERROR: missing or unsafe ACTIVE_STATE.md; initialize memory first.", file=sys.stderr)
    sys.exit(2)
try:
    text = state.read_text(encoding="utf-8")
except (OSError, UnicodeError) as exc:
    print(f"ERROR: cannot read state: {exc}", file=sys.stderr)
    sys.exit(2)

def git(*items):
    return subprocess.run(["git", "-C", str(root), *items], capture_output=True)

def display(label, items):
    print(f"{label}: {len(items)} paths")
    for item in items[:18]:
        print("- " + item.replace("\n", "\\n"))
    if len(items) > 18:
        print(f"... {len(items) - 18} paths omitted; inspect full Git diff/status locally.")

pattern = r"(?m)^- \*\*Last Synced Commit\*\*: \x60([^\x60]+)\x60[ \t]*$"
match = re.findall(pattern, text)
if len(match) != 1:
    print("REVIEW: exactly one Last Synced Commit field is required.")
    sys.exit(1 if strict else 0)
synced = match[0]
head = git("rev-parse", "--verify", "HEAD")
if head.returncode:
    print("REVIEW: no Git commit history; source freshness remains unverified.")
    if not stamp:
        hints = []
        for path in root.rglob("*"):
            rel = path.relative_to(root)
            if any(p.startswith(".") or p in {"memory", "node_modules", "vendor", "dist", "build"} for p in rel.parts):
                continue
            if path.is_file() and not path.is_symlink() and path.stat().st_mtime > state.stat().st_mtime:
                hints.append(rel.as_posix())
        display("Modification-time hints only", sorted(hints))
    sys.exit(1 if strict else 0)
head = head.stdout.decode().strip()
valid = bool(re.fullmatch(r"[0-9a-fA-F]{7,40}", synced)) and git("rev-parse", "--verify", synced + "^{commit}").returncode == 0
paths = ["--", ".", ":(exclude)memory/**"]
dirty = git("status", "--porcelain=v1", "--untracked-files=all", *paths)
if dirty.returncode:
    print("ERROR: Git status failed.", file=sys.stderr)
    sys.exit(2)
dirty_lines = dirty.stdout.decode("utf-8", errors="backslashreplace").splitlines()
manifest = root / 'memory/.bootstrap.json'
try:
    generated = json.loads(manifest.read_text()) if manifest.is_file() and not manifest.is_symlink() else {}
    if not isinstance(generated, dict):
        raise ValueError('bootstrap metadata must be an object')
except (OSError, ValueError):
    generated = {}
allowed = {'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.roo/rules/lean-context-memory.md'}
def bootstrap_only(line):
    name = line[3:]
    path = root / name
    try:
        return (line.startswith('?? ') and name in allowed and not path.is_symlink()
                and not any(parent.is_symlink() for parent in path.parents if parent.is_relative_to(root) and parent != root)
                and hashlib.sha256(path.read_bytes()).hexdigest() == generated.get(name))
    except OSError:
        return False
dirty_lines = [line for line in dirty_lines if not bootstrap_only(line)]
changes = []
if valid:
    diff = git("diff", "--name-status", synced, head, *paths)
    if diff.returncode:
        print("ERROR: Git diff failed.", file=sys.stderr)
        sys.exit(2)
    changes = diff.stdout.decode("utf-8", errors="backslashreplace").splitlines()
else:
    print(f"REVIEW: checkpoint {synced!r} is unavailable or unverified.")
display("Committed drift", changes)
display("Working-tree drift", dirty_lines)
if stamp and dirty_lines:
    print("REVIEW: source changes are uncommitted; leave checkpoint pending.")
    sys.exit(1)
if strict:
    health = subprocess.run([sys.executable, str(script_dir / "memory-health.py"), str(root)])
    if health.returncode:
        sys.exit(health.returncode)
if stamp:
    updated = re.sub(pattern, lambda _: f"- **Last Synced Commit**: {chr(96)}{head}{chr(96)}", text)
    if len(updated.splitlines()) > 30 or len(updated.encode("utf-8")) > 2048:
        print("REVIEW: stamped checkpoint would exceed its budget.")
        sys.exit(1)
    state.write_text(updated, encoding="utf-8")
    print("STAMPED: commit recorded after structural checks; semantic review remains the agent's responsibility.")
    sys.exit(0)
if not valid or changes or dirty_lines:
    print("REVIEW: inspect affected facts, update evidence, then --stamp when sources are clean.")
    sys.exit(1 if strict else 0)
print("NO SOURCE DRIFT detected; this is not proof of semantic completeness.")
PY
