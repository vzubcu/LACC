"""Preview exact deduplication or explicit selected-fact revalidation; writes require --apply --expect."""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from memory_common import fact_lines, fact_record, git, local_file, source_matches, topic_files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for command in ('compact', 'revalidate'):
        p = sub.add_parser(command)
        p.add_argument('project_dir', nargs='?', default='.')
        mode = p.add_mutually_exclusive_group()
        mode.add_argument('--dry-run', action='store_true', help='Default: preview only')
        mode.add_argument('--apply', action='store_true')
        p.add_argument('--expect', help='Digest printed by the preview')
        if command == 'revalidate':
            p.add_argument('--topic', required=True)
            p.add_argument('--line', type=int, action='append', required=True)
            p.add_argument('--reviewed', action='store_true', help='Acknowledge that selected facts were semantically checked')
    args = parser.parse_args()
    root = Path(args.project_dir).resolve()
    try:
        originals = {path: path.read_text(encoding='utf-8') for path in topic_files(root)}
        head_result = git(root, 'rev-parse', '--verify', 'HEAD')
        head = head_result.stdout.decode().strip() if head_result.returncode == 0 else ''
        fingerprint = hashlib.sha256()
        selection = {'command': args.command, 'topic': getattr(args, 'topic', None),
                     'lines': sorted(set(getattr(args, 'line', [])))}
        fingerprint.update(json.dumps(selection, sort_keys=True).encode())
        fingerprint.update(head.encode())
        for path, text in originals.items():
            fingerprint.update(path.relative_to(root).as_posix().encode() + b'\0' + text.encode() + b'\0')
        digest = fingerprint.hexdigest()
        if args.apply and args.expect != digest:
            raise ValueError('missing or changed preview digest; rerun without --apply')
        proposed = dict(originals)
        reviewed_sources = set()
        if args.command == 'compact':
            for path, text in originals.items():
                seen = set()
                remove = set()
                for number, line in fact_lines(text):
                    try:
                        fact_record(line)
                    except ValueError:
                        continue
                    # Different evidence or review state is never merged automatically.
                    record = line.strip()
                    if record in seen:
                        remove.add(number)
                    seen.add(record)
                proposed[path] = ''.join(line for n, line in enumerate(text.splitlines(keepends=True), 1) if n not in remove)
        else:
            if not args.reviewed or not head:
                raise ValueError('revalidate requires Git history and explicit --reviewed acknowledgement')
            path = local_file(root, 'memory/topics/' + args.topic)
            if path not in originals:
                raise ValueError('missing or unsafe selected topic')
            lines = originals[path].splitlines(keepends=True)
            eligible = dict(fact_lines(originals[path]))
            for number in set(args.line):
                if number not in eligible:
                    raise ValueError('selected line is not a durable fact')
                fact, data, sources = fact_record(eligible[number])
                for source in sources:
                    dest = local_file(root, source)
                    if dest is None or not dest.is_file() or git(root, 'ls-files', '--error-unmatch', '--', source).returncode:
                        raise ValueError('missing, unsafe or untracked source: ' + source)
                    if not source_matches(root, source, head):
                        raise ValueError('source must be committed before revalidation: ' + source)
                    reviewed_sources.add(source)
                lines[number - 1] = fact + ' | source: ' + data['source'] + ' | verified: `' + head + '`\n'
            proposed[path] = ''.join(lines)
        print('Plan: ' + digest)
        changed = {path: text for path, text in proposed.items() if text != originals[path]}
        diff = ''.join(''.join(difflib.unified_diff(originals[path].splitlines(True), text.splitlines(True),
                          fromfile=path.relative_to(root).as_posix(), tofile=path.relative_to(root).as_posix()))
                       for path, text in changed.items())
        preview = diff.encode()
        print(preview[:6000].decode('utf-8', errors='ignore'), end='')
        if len(preview) > 6000:
            print('\n[TRUNCATED diff; narrow the selected topic or inspect local changes.]')
        if args.apply:
            # Check every input again before writing any file.
            for path, text in originals.items():
                if local_file(root, path.relative_to(root).as_posix()) is None or path.read_text(encoding='utf-8') != text:
                    raise ValueError('memory changed during planning; no write applied')
            def verify_sources():
                current = git(root, 'rev-parse', '--verify', 'HEAD')
                current_head = current.stdout.decode().strip() if current.returncode == 0 else ''
                if current_head != head:
                    raise ValueError('HEAD changed during planning; no evidence update applied')
                if any(not source_matches(root, name, head) for name in reviewed_sources):
                    raise ValueError('source changed during planning; no evidence update applied')
            verify_sources()
            for path, text in changed.items():
                fd, name = tempfile.mkstemp(prefix='.memory-', dir=path.parent)
                try:
                    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                        stream.write(text)
                    verify_sources()
                    os.replace(name, path)
                finally:
                    if os.path.exists(name):
                        os.unlink(name)
            print(f'Applied {len(changed)} file changes; semantic verification remains the reviewer\'s responsibility.')
        else:
            print(f'Preview only: {len(changed)} files. Apply with --apply --expect {digest}')
        return 0
    except (OSError, UnicodeError, ValueError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
