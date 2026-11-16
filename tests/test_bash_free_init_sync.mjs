import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parsePorcelainZ, parseDiffNameStatusZ, changesOutsideMemory, formatGitChanges,
} from '../skills/lean-context-memory/scripts/lacc-git-parity.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function execute(cwd, bin, args = []) {
  const result = spawnSync(bin, args, { cwd, encoding: 'utf8',
    windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never', PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}
function git(root, ...args) {
  const r = execute(root, 'git', args);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function node(root, ...args) { return execute(root, process.execPath, [cli, ...args]); }
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-bf2c-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'LACC');
  git(root, 'config', 'user.email', 'fixture@example.test');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', path.join(root, 'no-hooks'));
  git(root, 'config', 'core.fsmonitor', 'false');
  const source = path.join(root, 'src', 'a.ts');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, 'export const a = true;\n');
  git(root, 'add', 'src/a.ts');
  git(root, 'commit', '-qm', 'baseline');
  return { root, commit: git(root, 'rev-parse', 'HEAD') };
}
function state(root, commit) {
  const file = path.join(root, 'memory/ACTIVE_STATE.md');
  fs.writeFileSync(file, '# State\n- **Last Synced Commit**: ' + '\x60' + commit +
    '\x60\n');
}
test('Git porcelain -z handles spaces, tabs and rename pair as one path', () => {
  const records = Buffer.from(' M src/a b.ts\0R  src/new.ts\0src/old.ts\0' +
    '?? src/tabs\tname.ts\0');
  assert.deepEqual(parsePorcelainZ(records), [
    { status: ' M', path: 'src/a b.ts', previous: null },
    { status: 'R ', path: 'src/new.ts', previous: 'src/old.ts' },
    { status: '??', path: 'src/tabs\tname.ts', previous: null },
  ]);
  assert.match(formatGitChanges(parsePorcelainZ(records), 'Working-tree drift'),
    /tabs\\tname\.ts/);
});
test('committed rename status -z retains previous and new names', () => {
  assert.deepEqual(parseDiffNameStatusZ(Buffer.from('M\0src/a.ts\0' +
    'R100\0src/old.ts\0src/new.ts\0')), [
    { status: 'M', path: 'src/a.ts', previous: null },
    { status: 'R100', path: 'src/new.ts', previous: 'src/old.ts' },
  ]);
  assert.equal(changesOutsideMemory([
    { status: 'M', path: 'memory/topics/a.md', previous: null },
    { status: 'R100', path: 'src/fact.ts',
      previous: 'memory/topics/fact.ts' },
    { status: 'M', path: 'src/a.ts', previous: null },
  ]).length, 2);
});
test('malformed or non-NUL-terminated Git records fail closed', () => {
  for (const input of [' M a.ts', 'R  new.ts\0', '?? \0'])
    assert.throws(() => parsePorcelainZ(Buffer.from(input)));
  for (const input of ['M\0a.ts', 'R100\0a.ts\0', 'wat\0a.ts\0'])
    assert.throws(() => parseDiffNameStatusZ(Buffer.from(input)));
});
test('Node initialization preflights instruction destinations and preserves existing facts', t => {
  const { root } = fixture(t);
  const original = '# Existing team rules\nDo not edit tests automatically.\n';
  fs.writeFileSync(path.join(root, 'AGENTS.md'), original);
  const first = node(root, 'init', '.', '--agent', 'all');
  assert.equal(first.status, 0, first.stderr);
  const parsed = JSON.parse(first.stdout);
  assert.equal(parsed.created_templates, 7);
  const topic = path.join(root, 'memory/topics/architecture.md');
  fs.appendFileSync(topic, '\nUser note: leave this unchanged.\n');
  const before = fs.readFileSync(topic);
  const twice = node(root, 'init', '.', '--agent', 'all');
  assert.equal(twice.status, 0, twice.stderr);
  assert.equal(JSON.parse(twice.stdout).created_templates, 0);
  assert.deepEqual(fs.readFileSync(topic), before);
  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'),
    /Do not edit tests automatically/);
  assert.ok(fs.existsSync(path.join(root, '.roo/rules/lean-context-memory.md')));
});
test('invalid instruction markers do not create memory or alter user files', t => {
  const { root } = fixture(t);
  const damaged = 'custom\n<!-- LEAN-CONTEXT-MEMORY:START -->\n';
  fs.writeFileSync(path.join(root, 'AGENTS.md'), damaged);
  const result = node(root, 'init', '.', '--agent', 'all');
  assert.equal(result.status, 2);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), damaged);
  assert.equal(fs.existsSync(path.join(root, 'memory')), false);
});
test('non-file memory destination blocks bootstrap before any instructions write', t => {
  const { root } = fixture(t);
  fs.mkdirSync(path.join(root, 'memory/topics/architecture.md'), { recursive: true });
  const result = node(root, 'init', '.', '--agent', 'all');
  assert.equal(result.status, 2, result.stderr);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'memory/.bootstrap.json')), false);
});
test('sync with a checked baseline reports committed drift and dirty paths', t => {
  const { root, commit } = fixture(t);
  assert.equal(node(root, 'init', '.', '--agent', 'codex').status, 0);
  state(root, commit);
  fs.writeFileSync(path.join(root, 'src/a.ts'), 'changed\n');
  git(root, 'add', 'src/a.ts');
  git(root, 'commit', '-qm', 'updated source');
  const committed = node(root, 'sync', '.', '--strict');
  assert.equal(committed.status, 1, committed.stderr + committed.stdout);
  assert.match(committed.stdout, /Committed drift: 1 paths/);
  assert.match(committed.stdout, /src\/a\.ts/);
  fs.writeFileSync(path.join(root, 'src/another file.ts'), 'untracked\n');
  const dirty = node(root, 'sync', '.', '--strict');
  assert.equal(dirty.status, 1, dirty.stderr + dirty.stdout);
  assert.match(dirty.stdout, /another file\.ts/);
});
test('sync refuses checkpoint stamp when sources are dirty and leaves state intact', t => {
  const { root, commit } = fixture(t);
  assert.equal(node(root, 'init', '.', '--agent', 'codex').status, 0);
  state(root, commit);
  fs.writeFileSync(path.join(root, 'src/a.ts'), 'changed\n');
  const before = fs.readFileSync(path.join(root, 'memory/ACTIVE_STATE.md'));
  const result = node(root, 'sync', '.', '--stamp');
  assert.equal(result.status, 1, result.stderr + result.stdout);
  assert.deepEqual(fs.readFileSync(path.join(root, 'memory/ACTIVE_STATE.md')), before);
});
test('Node sync caps disclosed paths without suppressing total drift count', t => {
  const { root, commit } = fixture(t);
  assert.equal(node(root, 'init', '.', '--agent', 'codex').status, 0);
  state(root, commit);
  for (let i = 0; i < 45; i++)
    fs.writeFileSync(path.join(root, 'src/new' + i + '.ts'), 'x\n');
  const result = node(root, 'sync', '.');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Working-tree drift: 45 paths/);
  assert.match(result.stdout, /27 paths omitted/);
});
