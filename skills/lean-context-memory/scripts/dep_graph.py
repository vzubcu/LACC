"""Bounded reference candidates, not a resolved call graph; expand with literal --signal."""
import argparse
import fnmatch
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('file')
    p.add_argument('symbol', nargs='?')
    p.add_argument('--signal', action='append', default=[])
    p.add_argument('--exclude', action='append', default=[], help='Additional project-relative glob')
    p.add_argument('--limit', type=int, default=40)
    p.add_argument('--max-bytes', type=int, default=5000)
    p.add_argument('--max-files', type=int, default=5000)
    p.add_argument('--scan-bytes', type=int, default=16 * 1024 * 1024)
    args = p.parse_args()
    if min(args.limit, args.max_files, args.scan_bytes) < 1 or args.max_bytes < 512:
        p.error('positive limits and max-bytes >=512 required')
    if any(not value or '\n' in value for value in args.signal):
        p.error('signals must be non-empty single-line literals')
    root = Path.cwd().resolve()
    target = Path(args.file)
    target = target if target.is_absolute() else root / target
    if not target.is_file() or any(x.is_symlink() for x in (target, *target.parents) if x != root) or not target.resolve().is_relative_to(root):
        p.error('target must be a regular file inside the project directory')
    target = target.resolve()
    names, inventory = [], 'walk'
    commands = [(['rg', '--files', '--hidden', '-0', '-g', '!.git/**'], 'rg (respects ignore files)')] if shutil.which('rg') else []
    commands += [(['git', 'ls-files', '-co', '--exclude-standard', '-z'], 'git (respects ignore files)')]
    for command, label in commands:
        result = subprocess.run(command, capture_output=True)
        if result.returncode == 0 or command[0] == 'rg' and result.returncode == 1:
            names = [root / os.fsdecode(n) for n in result.stdout.split(b'\0') if n]
            inventory = label
            break
    if inventory == 'walk':
        for directory, folders, files in os.walk(root, followlinks=False):
            folders[:] = [name for name in folders if name not in {'.git', 'node_modules', '__pycache__'}]
            names.extend(Path(directory) / name for name in files)
    paths, excluded = [], 0
    for path in sorted(set(names + [target])):
        rel = path.relative_to(root)
        ignored = any(part in {'.git', 'node_modules', '__pycache__'} for part in rel.parts)
        ignored |= rel.parts[0] in {'memory', 'vendor', 'dist', '.superpowers'}
        ignored |= any(fnmatch.fnmatch(rel.as_posix(), glob) for glob in args.exclude)
        if ignored and path != target:
            excluded += 1
        else:
            paths.append(path)
    paths.sort(key=lambda path: (path != target, path.as_posix()))
    symbol = re.compile(r'(?<!\w)' + re.escape(args.symbol) + r'(?!\w)') if args.symbol else None
    imports = re.compile(r'\b(?:import|from|require|use|using|include|export)\b')
    target_name = target.with_suffix('')
    dotted = target.relative_to(root).with_suffix('').as_posix().replace('/', '.')
    matches = []
    scanned = skipped = consumed = total_matches = 0
    budget_hit = False

    def add(rank, kind, path, number, line):
        nonlocal total_matches
        total_matches += 1
        name = path.relative_to(root).as_posix().replace('\n', '\\n')
        matches.append((rank, name, number, f'{kind} {name}:{number}: {line.strip()}'))
        matches.sort()
        del matches[args.limit:]

    for path in paths:
        if scanned >= args.max_files:
            budget_hit = True
            break
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            skipped += 1
            continue
        try:
            size = path.stat().st_size
            if size > 1024 * 1024:
                skipped += 1
                continue
            if consumed + size > args.scan_bytes:
                budget_hit = True
                continue
            raw = path.read_bytes()
            consumed += len(raw)
            if b'\0' in raw:
                skipped += 1
                continue
            text = raw.decode('utf-8')
        except (OSError, UnicodeError):
            skipped += 1
            continue
        scanned += 1
        for number, line in enumerate(text.splitlines(), 1):
            kind, rank = None, 1
            if path == target and imports.search(line):
                kind, rank = 'OUTBOUND', 0
            elif imports.search(line):
                qualified = '.' in dotted and bool(re.search(r'(?<![\w.])' + re.escape(dotted) + r'(?![\w.])', line))
                if target.suffix == '.py' and '.' not in dotted:
                    qualified |= bool(re.match(r'\s*(?:from\s+' + re.escape(dotted) + r'\s+import\b|import\s+' + re.escape(dotted) + r'(?:\s|,|$))', line))
                for name in re.findall(r'[\x22\x27]([^\x22\x27]+)[\x22\x27]', line):
                    if name.startswith('.'):
                        dest = (path.parent / name).resolve()
                        qualified |= dest.with_suffix('') == target_name or dest / 'index' == target_name
                if qualified:
                    kind, rank = 'REFERENCE', 0
            if kind is None and symbol and symbol.search(line):
                kind = 'SYMBOL'
            if kind is None and any(value in line for value in args.signal):
                kind = 'SIGNAL'
            if kind:
                add(rank, kind, path, number, line)
    header = 'Heuristic references; imports/text matches are not a resolved call graph.\n'
    header += f'Inventory: {inventory}; scanned {scanned} files/{consumed} bytes; excluded {excluded}; skipped {skipped} oversized/binary/unsafe files.\n'
    if args.signal:
        header += 'Evidence-triggered expansion: literal signals.\n'
    output, shown = header, 0
    for _, _, _, line in matches:
        if len((output + line + '\n').encode()) > args.max_bytes - 220:
            break
        output += line + '\n'
        shown += 1
    output += f'Coverage: {shown}/{total_matches} unique references shown; '
    output += 'TRUNCATED, incomplete.' if shown < total_matches else 'no display truncation; implicit/dynamic coupling may be missing.'
    if budget_hit:
        output += ' Scan budget reached; incomplete.'
    if skipped or excluded:
        output += ' Skipped/excluded paths make search incomplete.'
    print(output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
