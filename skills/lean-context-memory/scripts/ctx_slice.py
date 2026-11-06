"""Bounded head/tail output; stdin is streamed and never spooled unless --keep."""
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
    parser.add_argument('--keep', action='store_true', help='Keep private stdin bytes in a random temporary log')
    args = parser.parse_args()
    if args.max_lines < 1:
        parser.error('max_lines must be a positive integer')
    if args.keep and args.file != '-':
        parser.error('--keep is only supported for stdin')

    def interrupted(signum, _frame):
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, interrupted)
    temporary = None
    retained = None
    complete = False
    try:
        if args.keep:
            fd, name = tempfile.mkstemp(prefix='lean-context-', suffix='.log')
            temporary = Path(name)
            retained = os.fdopen(fd, 'wb')
        source = sys.stdin.buffer if args.file == '-' else Path(args.file).open('rb')
        head_count = max(1, args.max_lines * 60 // 100)
        tail_count = args.max_lines - head_count
        first, tail, count = [], deque(maxlen=tail_count), 0
        try:
            for raw in source:
                count += 1
                if retained:
                    retained.write(raw)
                line = raw.decode('utf-8', errors='replace')
                if count <= args.max_lines:
                    first.append(line)
                tail.append(line)
        finally:
            if source is not sys.stdin.buffer:
                source.close()
        if retained:
            retained.close()
            retained = None
        if count <= args.max_lines:
            sys.stdout.write(''.join(first))
        else:
            sys.stdout.write(''.join(first[:head_count]))
            print(f'\n[TRUNCATED: {count - args.max_lines} of {count} lines omitted]')
            sys.stdout.write(''.join(tail))
        complete = True
        if temporary:
            print(f'\nFull output saved to {temporary}', file=sys.stderr)
        return 0
    except OSError as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 2
    finally:
        if retained:
            retained.close()
        if temporary and not complete:
            temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    sys.exit(main())
