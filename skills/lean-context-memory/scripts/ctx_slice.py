"""Bounded head/tail output; stdin spools privately and is deleted unless --keep."""
import argparse
from collections import deque
import os
import signal
from pathlib import Path
import sys
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', nargs='?', default='-')
    parser.add_argument('max_lines', nargs='?', type=int, default=100)
    parser.add_argument('--keep', action='store_true', help='Keep a private random stdin log and print its path')
    args = parser.parse_args()
    if args.max_lines < 1:
        parser.error('max_lines must be a positive integer')
    def interrupted(signum, _frame):
        raise SystemExit(128 + signum)
    signal.signal(signal.SIGTERM, interrupted)
    temporary = None
    try:
        if args.file == '-':
            fd, name = tempfile.mkstemp(prefix='lean-context-', suffix='.log')
            temporary = Path(name)
            with os.fdopen(fd, 'wb') as stream:
                while True:
                    chunk = sys.stdin.buffer.read(65536)
                    if not chunk:
                        break
                    stream.write(chunk)
            source = temporary
        else:
            source = Path(args.file)
        head_count = max(1, args.max_lines * 60 // 100)
        tail_count = args.max_lines - head_count
        first, tail, count = [], deque(maxlen=tail_count), 0
        with source.open(encoding='utf-8', errors='replace') as stream:
            for line in stream:
                count += 1
                if count <= args.max_lines:
                    first.append(line)
                tail.append(line)
        if count <= args.max_lines:
            sys.stdout.write(''.join(first))
        else:
            sys.stdout.write(''.join(first[:head_count]))
            print(f'\n[TRUNCATED: {count - args.max_lines} of {count} lines omitted]')
            sys.stdout.write(''.join(tail))
        if temporary and args.keep:
            print(f'\nFull output saved to {temporary}', file=sys.stderr)
        return 0
    except OSError as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 2
    finally:
        if temporary and not args.keep:
            temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    sys.exit(main())
