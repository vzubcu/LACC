import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function run(bin, args, cwd) {
  const r = spawnSync(bin, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (r.error) throw r.error;
  return r;
}
function git(dir, ...args) {
  const r = run('git', args, dir);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function call(dir, name, ...args) {
  const r = run(process.execPath, [cli, name, dir, ...args, '--json'], dir);
  return { code: r.status, output: r.status === 2 ? null : JSON.parse(r.stdout), stderr: r.stderr };
}
function setup(t, auth = "import { allowed } from './permissions';\nexport const canLogin = allowed;\n") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc deps '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  git(dir, 'config', 'user.name', 'Fixture');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/auth.ts'), auth);
  fs.writeFileSync(path.join(dir, 'src/permissions.ts'), 'export const allowed = true;\n');
  fs.writeFileSync(path.join(dir, 'src/unrelated.ts'), 'export const a = 1;\n');
  git(dir, 'add', 'src');
  git(dir, 'commit', '-qm', 'base');
  const rev = git(dir, 'rev-parse', 'HEAD');
  assert.equal(run(process.execPath, [cli, 'init', dir, '--agent', 'codex'], dir).status, 0);
  fs.writeFileSync(path.join(dir, 'memory/topics/architecture.md'),
    ('# Architecture\n- Login requires permission | source: §src/auth.ts§ | verified: §' + rev + '§\n')
      .replaceAll('§', String.fromCharCode(96)));
  return dir;
}
test('unchanged cited file with changed imported dependency requires review in opt-in mode', t => {
  const dir = setup(t);
  let r = call(dir, 'search', '--query', 'login permission', '--deps');
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.output.results.length, 1);
  fs.writeFileSync(path.join(dir, 'src/permissions.ts'), 'export const allowed = false;\n');
  const defaultSearch = call(dir, 'search', '--query', 'login permission');
  assert.equal(defaultSearch.output.results.length, 1, 'direct-only check unchanged for compatibility');
  r = call(dir, 'search', '--query', 'login permission', '--deps');
  assert.equal(r.output.results.length, 0);
  const review = call(dir, 'search', '--query', 'login permission', '--deps', '--include-review');
  assert.equal(review.output.results.length, 1);
  assert.equal(review.output.results[0].review_required, true);
  assert.ok(review.output.results[0].dependency_issues.some(x =>
    x.code === 'dependency-changed' && x.dependency === 'src/permissions.ts'));
});
test('unrelated changes do not invalidate a fully locally resolved dependency', t => {
  const dir = setup(t);
  fs.writeFileSync(path.join(dir, 'src/unrelated.ts'), 'export const a = 2;\n');
  const r = call(dir, 'search', '--query', 'login permission', '--deps');
  assert.equal(r.output.results.length, 1);
});
test('unresolvable path aliases require review rather than claiming complete coverage', t => {
  const dir = setup(t, "import { allowed } from '@/permissions';\nexport const canLogin = allowed;\n");
  const ready = call(dir, 'search', '--query', 'login permission', '--deps');
  assert.equal(ready.output.results.length, 0);
  const review = call(dir, 'search', '--query', 'login permission', '--deps', '--include-review');
  assert.ok(review.output.results[0].dependency_issues.some(x =>
    x.code === 'dependency-coverage-incomplete'));
});
test('oversized dependency triggers incomplete review, no file mutation', t => {
  const dir = setup(t);
  const dep = path.join(dir, 'src/permissions.ts');
  const old = fs.readFileSync(dep);
  fs.writeFileSync(dep, ' '.repeat(128 * 1024 + 1));
  const result = call(dir, 'search', '--query', 'login permission', '--deps', '--include-review');
  assert.ok(result.output.results[0].dependency_issues.some(x =>
    x.code === 'dependency-coverage-incomplete'));
  assert.notDeepEqual(fs.readFileSync(dep), old);
});
