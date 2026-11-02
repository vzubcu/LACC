"""Read the hot index/checkpoint or explicitly selected topics under a UTF-8 byte budget."""
import argparse
import codecs
from pathlib import Path
import sys
from memory_common import budgets, local_file


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('project_dir', nargs='?', default='.')
    p.add_argument('--topic', action='append', default=[], help='Path relative to memory/topics; repeatable')
    p.add_argument('--max-bytes', type=int)
    args = p.parse_args()
    root = Path(args.project_dir).resolve()
    try:
        budget = budgets(root)['load_bytes']
        if args.max_bytes is not None:
            if args.max_bytes < 512:
                raise ValueError('max-bytes must be >=512')
            budget = min(budget, args.max_bytes)
        names = ['memory/topics/' + name for name in args.topic] if args.topic else ['memory/MEMORY_INDEX.md', 'memory/ACTIVE_STATE.md']
        output = bytearray()
        truncated = False
        # Validate all paths before returning a partial successful answer.
        paths = []
        for name in dict.fromkeys(names):
            path = local_file(root, name)
            if path is None or not path.is_file():
                raise ValueError('missing or unsafe memory path: ' + name)
            paths.append((name, path))
        room = budget - 120
        for name, path in paths:
            header = ('## ' + name + '\n').encode()
            if len(output) + len(header) >= room:
                truncated = True
                break
            output.extend(header)
            with path.open('rb') as stream:
                data = stream.read(room - len(output) + 1)
            remaining = room - len(output)
            if len(data) > remaining:
                output.extend(data[:remaining])
                truncated = True
                break
            output.extend(data)
            output.extend(b'\n')
        text = codecs.getincrementaldecoder('utf-8')().decode(bytes(output), final=not truncated)
        if truncated:
            text += '\n[TRUNCATED: memory load budget reached; inspect a narrower topic/range before relying on omitted facts.]\n'
        else:
            text += '\n[Memory selection complete; other topics were not loaded.]\n'
        sys.stdout.write(text)
        return 0
    except (OSError, ValueError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
