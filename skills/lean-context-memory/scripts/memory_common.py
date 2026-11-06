"""Shared local-path, configuration and fact-record validation."""
import json
import os
from pathlib import Path
import re
import subprocess

DEFAULTS = {'topic_bytes': None, 'topics_total_bytes': None, 'load_bytes': 8192}
INDEX_MAX_LINES = 60
INDEX_MAX_BYTES = 4096
STATE_MAX_LINES = 30
STATE_MAX_BYTES = 2048
COMMIT = re.compile(r'[0-9a-fA-F]{7,40}\Z')
KEY = re.compile(r'[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*\Z')



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



def split_fact_fields(line):
    """Split metadata separators outside inline backtick code spans."""
    fields = []
    position = start = 0
    fence = 0
    while position < len(line):
        if line[position] == '\x60':
            end = position
            while end < len(line) and line[end] == '\x60':
                end += 1
            width = end - position
            if fence == 0:
                fence = width
            elif fence == width:
                fence = 0
            position = end
            continue
        if not fence and line.startswith(' | ', position):
            fields.append(line[start:position])
            position += 3
            start = position
            continue
        position += 1
    fields.append(line[start:])
    return fields


def topic_content_lines(text):
    """Yield only content outside fenced Markdown examples, with original line numbers."""
    fence = None
    for number, line in enumerate(text.splitlines(keepends=True), 1):
        marker = re.match(r'^\s*(\x60{3,}|~{3,})', line)
        if marker:
            value = marker[1]
            if fence is None:
                fence = value
            elif value[0] == fence[0] and len(value) >= len(fence):
                fence = None
            continue
        if fence is None:
            yield number, line

def fact_record(line):
    if not re.match(r'^\s*-\s+\S', line):
        raise ValueError('selected line is not a fact bullet')
    pieces = split_fact_fields(line.rstrip('\r\n'))
    data = {}
    for piece in pieces[1:]:
        key, sep, value = piece.partition(':')
        key = key.strip()
        if not sep or key in data or key not in {'source', 'verified', 'state', 'key'}:
            raise ValueError('invalid or duplicate fact metadata')
        data[key] = value.strip()
    if not re.fullmatch(r'`[^`]+`(?:\s*,\s*`[^`]+`)*', data.get('source', '')) or not COMMIT.fullmatch(data.get('verified', '').strip('`')):
        raise ValueError('fact requires real source paths and a checked commit')
    if data.get('state', 'confirmed') not in {'confirmed', 'review'}:
        raise ValueError('invalid fact state')
    if 'key' in data and (len(data['key']) > 96 or not KEY.fullmatch(data['key'])):
        raise ValueError('invalid fact key; use a lower-case dotted identifier, max 96 chars')
    return pieces[0], data, re.findall(r'`([^`]+)`', data['source'])



def fact_lines(text):
    for number, line in topic_content_lines(text):
        if re.match(r'^\s*-\s+', line):
            yield number, line


def conflict_keys(records):
    """Return ambiguous identity keys with differing assertions; never claim contradiction.

    records: (key, fact_text, location). Same assertion repeated at a new
    source is a duplicate, not evidence of a semantic conflict.
    """
    groups = {}
    for key, fact, location in records:
        if key:
            groups.setdefault(key, []).append((' '.join(fact.casefold().split()), location))
    return {
        key: sorted(location for _, location in entries)
        for key, entries in groups.items()
        if len({fact for fact, _ in entries}) > 1
    }


def batch_source_statuses(root, references):
    """Check Git index + normalized worktree bytes for many (commit, source) pairs.

    One index inventory and one ls-tree query per bounded revision/path batch
    replace the per-fact ls-files/diff/rev-parse calls. Worktree hashes are
    still calculated with git hash-object --path, so attributes/filters and
    assume-unchanged cannot hide a source change.
    """
    references = sorted(set(references))
    if not references:
        return {}
    index = git(root, 'ls-files', '--stage', '-z')
    if index.returncode:
        raise ValueError('Git index inventory failed')
    indexed = {}
    for item in index.stdout.split(b'\0'):
        if not item:
            continue
        try:
            details, name = item.split(b'\t', 1)
            mode, oid, stage = details.decode('ascii').split()
        except ValueError as exc:
            raise ValueError('invalid Git index inventory') from exc
        key = os.fsdecode(name)
        if key in indexed:
            indexed[key] = None  # unmerged: multiple stages
        elif stage != '0':
            indexed[key] = None
        else:
            indexed[key] = (mode, oid)

    by_revision = {}
    for revision, source in references:
        by_revision.setdefault(revision, set()).add(source)
    historical = {}
    for revision, names in sorted(by_revision.items()):
        # Bound argv on Windows too; no shell interpolation or wildcard expansion.
        batch, size = [], 0
        groups = []
        for name in sorted(names):
            cost = len(os.fsencode(name)) + 1
            if batch and (len(batch) >= 128 or size + cost > 12000):
                groups.append(batch)
                batch, size = [], 0
            batch.append(name)
            size += cost
        if batch:
            groups.append(batch)
        for group in groups:
            result = git(root, 'ls-tree', '-r', '-z', '--full-tree',
                         revision, '--', *group)
            if result.returncode:
                raise ValueError('Git historical source lookup failed')
            for item in result.stdout.split(b'\0'):
                if not item:
                    continue
                try:
                    details, name = item.split(b'\t', 1)
                    mode, kind, oid = details.decode('ascii').split()
                except ValueError as exc:
                    raise ValueError('invalid Git historical tree response') from exc
                if kind == 'blob':
                    historical[(revision, os.fsdecode(name))] = (mode, oid)

    checked = {}
    worktree_hashes = {}
    for revision, source in references:
        if source not in indexed:
            checked[(revision, source)] = 'untracked-source'
            continue
        expected = historical.get((revision, source))
        if indexed[source] is None or expected is None or indexed[source] != expected:
            checked[(revision, source)] = 'changed-source'
            continue
        if source not in worktree_hashes:
            dest = local_file(root, source)
            if dest is None or not dest.is_file():
                raise ValueError('unsafe or missing source during batch verification')
            with dest.open('rb') as stream:
                result = subprocess.run(
                    ['git', '-C', str(root), 'hash-object',
                     '--path=' + source, '--stdin'],
                    stdin=stream, capture_output=True)
            if result.returncode:
                raise ValueError('Git worktree source hashing failed')
            worktree_hashes[source] = result.stdout.decode('ascii').strip()
        checked[(revision, source)] = (
            None if worktree_hashes[source] == expected[1] else 'changed-source'
        )
    return checked
