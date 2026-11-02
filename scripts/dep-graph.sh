#!/usr/bin/env bash
# Bounded textual references; explicit signals support adaptive exploration.
set -euo pipefail
python3 - "$@" <<'PY'
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess

parser = argparse.ArgumentParser(description="Heuristic references; --signal expands by literal contract/event name.")
parser.add_argument("file")
parser.add_argument("symbol", nargs="?")
parser.add_argument("--signal", action="append", default=[])
parser.add_argument("--limit", type=int, default=40)
parser.add_argument("--max-bytes", type=int, default=5000)
args = parser.parse_args()
if args.limit < 1 or args.max_bytes < 512:
    parser.error("--limit must be positive and --max-bytes must be >=512")
if any(not s or "\n" in s for s in args.signal):
    parser.error("signals must be non-empty single-line literals")
root = Path.cwd().resolve()
target = Path(args.file)
if not target.is_absolute():
    target = root / target
if not target.is_file() or target.is_symlink() or not target.resolve().is_relative_to(root):
    parser.error("target must be a regular file inside the project directory")
target = target.resolve()
skip = {".git", "node_modules", "vendor", "dist", "build", "bin", "obj", "memory", ".superpowers", "__pycache__"}
paths, inventory = [], "walk"
if shutil.which("rg"):
    result = subprocess.run(["rg", "--files", "--hidden", "-0", "-g", "!.git/**"], capture_output=True)
    if result.returncode in (0, 1):
        paths = [root / os.fsdecode(n) for n in result.stdout.split(b"\0") if n]
        inventory = "rg (respects ignore files)"
if inventory == "walk":
    result = subprocess.run(["git", "ls-files", "-co", "--exclude-standard", "-z"], capture_output=True)
    if result.returncode == 0:
        paths = [root / os.fsdecode(n) for n in result.stdout.split(b"\0") if n]
        inventory = "git (respects ignore files)"
    else:
        paths = [p for p in root.rglob("*") if p.is_file()]
paths = [p for p in sorted(set(paths + [target])) if not any(part in skip for part in p.relative_to(root).parts)]
inbound = re.compile(r"(?<!\w)" + re.escape(target.stem) + r"(?!\w)")
symbol = re.compile(r"(?<!\w)" + re.escape(args.symbol) + r"(?!\w)") if args.symbol else None
imports = re.compile(r"^\s*(?:import\b|from\s+\S+\s+import\b|(?:const|let|var)\s+.*require\s*\(|require\s*\(|use\s+|using\s+|include(?:_once)?\b)")
matches, seen = [], set()
skipped = scanned = 0

def add(kind, path, number, line):
    key = (path, number)
    if key not in seen:
        seen.add(key)
        name = path.relative_to(root).as_posix().replace("\n", "\\n")
        matches.append(f"{kind} {name}:{number}: {line.strip()}")

for path in paths:
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        skipped += 1
        continue
    try:
        if path.stat().st_size > 1024 * 1024:
            skipped += 1
            continue
        text = path.read_text(encoding="utf-8")
        if "\0" in text:
            skipped += 1
            continue
    except (OSError, UnicodeError):
        skipped += 1
        continue
    scanned += 1
    for number, line in enumerate(text.splitlines(), 1):
        if path == target and imports.search(line):
            add("OUTBOUND", path, number, line)
        elif path != target and inbound.search(line):
            add("REFERENCE", path, number, line)
        if symbol and symbol.search(line):
            add("SYMBOL", path, number, line)
        if any(s in line for s in args.signal):
            add("SIGNAL", path, number, line)
header = "Heuristic references; imports/text matches are not a resolved call graph.\n"
header += f"Inventory: {inventory}; scanned {scanned} files; skipped {skipped} oversized/binary/unsafe files.\n"
if args.signal:
    header += "Evidence-triggered expansion: literal signals; verify candidate contracts before deeper traversal.\n"
lines = []
room = args.max_bytes - len(header.encode("utf-8")) - 240
for item in matches[:args.limit]:
    size = len((item + "\n").encode("utf-8"))
    if size > room:
        break
    lines.append(item)
    room -= size
footer = f"Coverage: {len(lines)}/{len(matches)} unique references shown; "
footer += "TRUNCATED, incomplete." if len(lines) < len(matches) else "no display truncation; implicit/dynamic coupling may be missing."
if skipped:
    footer += " Skipped files make search incomplete."
print(header + "\n".join(lines) + ("\n" if lines else "") + footer)
PY
