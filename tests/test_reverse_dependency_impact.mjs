import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function cmd(bin, args, cwd) {
  const r = spawnSync(bin, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  if (r.error) throw r.error;
  return r;
}
function git(root, ...args) {
  const r = cmd('git', args, root);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function lacc(root, command, ...args) {
  const r = cmd(process.execPath, [cli, command, root, ...args, '--json'], root);
  return { status: r.status, data: r.status === 2 ? null : JSON.parse(r.stdout),
    stderr: r.stderr };
}
function fixture(t, files = {
  'src/auth.ts': "import { allowed } from './permissions';\nexport const login = allowed;\n",
  'src/permissions.ts': 'export const allowed = true;\n',
  'src/unrelated.ts': 'export const count = 1;\n',
}, source = 'src/auth.ts') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc reverse graph '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'LACC reverse fixture');
  git(root, 'config', 'user.email', 'fixture@example.test');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', path.join(root, '.no-hooks'));
  git(root, 'config', 'core.fsmonitor', 'false');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  git(root, 'add', 'src');
  git(root, 'commit', '-qm', 'source baseline');
  const commit = git(root, 'rev-parse', 'HEAD');
  const init = cmd(process.execPath, [cli, 'init', root, '--agent', 'codex'], root);
  assert.equal(init.status, 0, init.stderr);
  const quote = String.fromCharCode(96);
  fs.writeFileSync(path.join(root, 'memory/topics/architecture.md'),
    '# Architecture\n- Login requires permissions | source: ' + quote + source +
    quote + ' | verified: ' + quote + commit + quote + '\n');
  return { root, commit };
}
const affected = report => report.data.results[0].issues;

test('unchanged cited source with changed dependency is found by reverse impact', t => {
  const { root, commit } = fixture(t);
  const clean = lacc(root, 'dependency-impact');
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.data.status, 'clear-within-scanned-scope');
  assert.equal(clean.data.results.length, 0);
  fs.writeFileSync(path.join(root, 'src/permissions.ts'), 'export const allowed = false;\n');
  const report = lacc(root, 'dependency-impact');
  assert.equal(report.status, 1, report.stderr);
  assert.equal(report.data.status, 'review');
  const issue = affected(report).find(x => x.code === 'dependency-changed');
  assert.deepEqual(issue.chain, ['src/permissions.ts', 'src/auth.ts']);
  assert.equal(report.data.results[0].verified, commit);
  assert.equal(issue.source, 'src/auth.ts');
  assert.equal(issue.dependency, 'src/permissions.ts');
  const normal = lacc(root, 'search', '--query', 'login permissions');
  assert.equal(normal.data.results.length, 1);
  const strict = lacc(root, 'search', '--query', 'login permissions', '--deps');
  assert.equal(strict.data.results.length, 0);
  const reviewed = lacc(root, 'search', '--query', 'login permissions', '--deps', '--include-review');
  assert.ok(reviewed.data.results[0].dependency_issues.some(x =>
    x.code === 'dependency-changed' && x.chain.join(' -> ') === 'src/permissions.ts -> src/auth.ts'));
});
test('reverse walk reaches a fact through nested and cyclic imports without looping', t => {
  const { root } = fixture(t, {
    'src/auth.ts': "import './middleware';\n",
    'src/middleware.ts': "import './permissions';\n",
    'src/permissions.ts': "import './middleware';\nexport const allowed = true;\n",
  });
  fs.writeFileSync(path.join(root, 'src/permissions.ts'),
    "import './middleware';\nexport const allowed = false;\n");
  const result = lacc(root, 'dependency-impact');
  assert.equal(result.status, 1);
  assert.ok(affected(result).some(x =>
    x.code === 'dependency-changed' &&
    x.chain.join(' -> ') === 'src/permissions.ts -> src/middleware.ts -> src/auth.ts'));
});
test('staged-only changes trigger reverse impact even when worktree matches baseline', t => {
  const { root } = fixture(t);
  const dep = path.join(root, 'src/permissions.ts');
  fs.writeFileSync(dep, 'export const allowed = false;\n');
  git(root, 'add', 'src/permissions.ts');
  fs.writeFileSync(dep, 'export const allowed = true;\n');
  const result = lacc(root, 'dependency-impact');
  assert.equal(result.status, 1);
  assert.ok(affected(result).some(x => x.code === 'dependency-changed'));
});
test('assume-unchanged does not hide an actual dependency change', t => {
  const { root } = fixture(t);
  git(root, 'update-index', '--assume-unchanged', 'src/permissions.ts');
  try {
    fs.writeFileSync(path.join(root, 'src/permissions.ts'), 'export const allowed = false;\n');
    const result = lacc(root, 'dependency-impact');
    assert.equal(result.status, 1);
    assert.ok(affected(result).some(x => x.code === 'dependency-changed'));
  } finally {
    git(root, 'update-index', '--no-assume-unchanged', 'src/permissions.ts');
  }
});
test('historical import edges flag a deleted or renamed dependency', t => {
  const { root } = fixture(t, {
    'src/auth.ts': "import './legacy';\n",
    'src/legacy.ts': 'export const allow = true;\n',
  });
  git(root, 'mv', 'src/legacy.ts', 'src/modern.ts');
  const result = lacc(root, 'dependency-impact');
  assert.equal(result.status, 1);
  assert.ok(affected(result).some(x =>
    x.code === 'dependency-changed' && x.dependency === 'src/legacy.ts'));
});
test('unrelated changes do not flag a clean, statically resolved source', t => {
  const { root } = fixture(t);
  fs.writeFileSync(path.join(root, 'src/unrelated.ts'), 'export const count = 2;\n');
  const result = lacc(root, 'dependency-impact');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.data.results.length, 0);
});
test('aliases, dynamic imports and non-JS projects explicitly report coverage gaps', t => {
  for (const [name, files, source] of [
    ['alias', { 'src/auth.ts': "import { allowed } from '@/permissions';\n" }, 'src/auth.ts'],
    ['dynamic', { 'src/auth.ts': "const load = import(getModule());\n" }, 'src/auth.ts'],
    ['csharp', { 'src/Auth.cs': 'namespace App { class Auth {} }\n' }, 'src/Auth.cs'],
  ]) {
    awaitSubtest(t, name, files, source);
  }
});
function awaitSubtest(t, name, files, source) {
  const project = fixture(t, files, source);
  const result = lacc(project.root, 'dependency-impact');
  assert.equal(result.status, 1, name + ': ' + result.stderr);
  assert.equal(result.data.status, 'incomplete');
  assert.ok(affected(result).some(x => x.code === 'dependency-coverage-incomplete'), name);
}
test('all opt-in impact commands are read-only for the project files', t => {
  const { root } = fixture(t);
  const file = path.join(root, 'memory/topics/architecture.md');
  const before = fs.readFileSync(file);
  assert.equal(lacc(root, 'dependency-impact').status, 0);
  assert.equal(lacc(root, 'search', '--query', 'login permissions', '--deps').status, 0);
  assert.deepEqual(fs.readFileSync(file), before);
});
