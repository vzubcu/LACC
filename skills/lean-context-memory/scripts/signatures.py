"""Python AST definitions; heuristic declarations for other languages, with output limits."""
import argparse
import ast
from pathlib import Path
import re
import sys


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('file', type=Path)
    p.add_argument('--limit', type=int, default=80)
    p.add_argument('--max-bytes', type=int, default=5000)
    args = p.parse_args()
    if args.limit < 1 or args.max_bytes < 512:
        p.error('positive limit and max-bytes >=512 required')
    try:
        if args.file.stat().st_size > 1024 * 1024:
            raise ValueError('file exceeds 1 MiB; inspect targeted ranges')
        text = args.file.read_text(encoding='utf-8')
        lines = text.splitlines()
        if args.file.suffix == '.py':
            tree = ast.parse(text)
            numbers = sorted(node.lineno for node in ast.walk(tree)
                             if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)))
            kind = 'Python AST definition starts (multiline signatures need targeted reads)'
        else:
            pattern = re.compile(r'^\s*(?:(?:export|default|async|public|protected|private|static|abstract|final|override)\s+)*(?:class|interface|type|enum|function|fn|struct|trait|impl|namespace|module|func)\b')
            numbers = [n for n, line in enumerate(lines, 1) if pattern.search(line)]
            kind = 'Heuristic declaration candidates; methods and dynamic definitions may be missing'
        output = kind + '\n'
        shown = 0
        for number in numbers[:args.limit]:
            line = f'{number}: {lines[number-1].strip()}\n'
            if len((output + line).encode()) > args.max_bytes - 100:
                break
            output += line
            shown += 1
        output += f'Coverage: {shown}/{len(numbers)} declarations' + ('; TRUNCATED\n' if shown < len(numbers) else '\n')
        print(output, end='')
        return 0
    except (OSError, UnicodeError, ValueError, SyntaxError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
