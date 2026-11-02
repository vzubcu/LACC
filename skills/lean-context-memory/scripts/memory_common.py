"""Shared local-path, configuration and fact-record validation."""
import json
import os
from pathlib import Path
import re
import subprocess

DEFAULTS = {'topic_bytes': None, 'topics_total_bytes': None, 'load_bytes': 8192}
COMMIT = re.compile(r'[0-9a-fA-F]{7,40}\Z')


def git(root, *args):
    return subprocess.run(['git', '--literal-pathspecs', '-C', str(root), *args], capture_output=True)


def local_file(root, name):
    path = Path(name)
    if path.is_absolute() or '..' in path.parts or any(ord(c) < 32 for c in name):
        return None
    dest = root / path
    if not dest.resolve().is_relative_to(root):
        return None
    if any(p.is_symlink() for p in [dest, *dest.parents] if p != root and p.is_relative_to(root)):
        return None
    return dest


def budgets(root):
    path = local_file(root, 'memory/.memory-budget.json')
    if path is None:
        raise ValueError('config must be a regular local file')
    if not path.exists():
        return DEFAULTS.copy()
    config = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(config, dict) or set(config) - DEFAULTS.keys():
        raise ValueError('config allows only topic_bytes, topics_total_bytes and load_bytes')
    for key, value in config.items():
        if value is None and key != 'load_bytes':
            continue
        if type(value) is not int or value < (512 if key == 'load_bytes' else 1):
            raise ValueError('config budgets must be positive integers; load_bytes >=512')
    return DEFAULTS | config


def source_matches(root, source, revision):
    """Check actual normalized bytes and index, even with assume-unchanged set."""
    dest = local_file(root, source)
    if dest is None or not dest.is_file():
        return False
    name = dest.relative_to(root).as_posix()
    expected = git(root, 'rev-parse', '--verify', revision + ':' + name)
    if expected.returncode:
        return False
    with dest.open('rb') as stream:
        actual = subprocess.run(['git', '-C', str(root), 'hash-object', '--path=' + name, '--stdin'],
                                stdin=stream, capture_output=True)
    indexed = git(root, 'diff', '--cached', '--quiet', revision, '--', name)
    if actual.returncode or indexed.returncode > 1:
        raise ValueError('Git source verification failed: ' + name)
    return actual.stdout.strip() == expected.stdout.strip() and indexed.returncode == 0


def topic_files(root):
    directory = local_file(root, 'memory/topics')
    if directory is None or not directory.is_dir():
        raise ValueError('missing or unsafe memory/topics')
    result = []
    def failed(exc):
        raise exc
    for parent, folders, files in os.walk(directory, followlinks=False, onerror=failed):
        if any((Path(parent)/name).is_symlink() for name in folders):
            raise ValueError('unsafe topic directory')
        for name in files:
            if name.endswith('.md'):
                path = Path(parent)/name
                if local_file(root, path.relative_to(root).as_posix()) is None:
                    raise ValueError('unsafe topic file')
                result.append(path)
    return sorted(result)


def fact_record(line):
    if not re.match(r'^\s*-\s+\S', line):
        raise ValueError('selected line is not a fact bullet')
    pieces = line.rstrip('\r\n').split(' | ')
    data = {}
    for piece in pieces[1:]:
        key, sep, value = piece.partition(':')
        key = key.strip()
        if not sep or key in data or key not in {'source', 'verified', 'state'}:
            raise ValueError('invalid or duplicate fact metadata')
        data[key] = value.strip()
    if not re.fullmatch(r'`[^`]+`(?:\s*,\s*`[^`]+`)*', data.get('source', '')) or not COMMIT.fullmatch(data.get('verified', '').strip('`')):
        raise ValueError('fact requires real source paths and a checked commit')
    if data.get('state', 'confirmed') not in {'confirmed', 'review'}:
        raise ValueError('invalid fact state')
    return pieces[0], data, re.findall(r'`([^`]+)`', data['source'])


def fact_lines(text):
    fence = None
    for number, line in enumerate(text.splitlines(keepends=True), 1):
        marker = re.match(r'^\s*(`{3,}|~{3,})', line)
        if marker:
            value = marker[1]
            if fence is None:
                fence = value
            elif value[0] == fence[0] and len(value) >= len(fence):
                fence = None
        elif fence is None and re.match(r'^\s*-\s+', line):
            yield number, line
