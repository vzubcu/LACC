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
  const result = spawnSync(bin, args, { cwd, windowsHide: true, timeout: 30000, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}
function git(root, ...args) {
  const r = run('git', args, root);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function cmd(root, verb, ...flags) {
  const r = run(process.execPath, [cli, verb, root, ...flags], root);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr,
    data: r.status === 2 ? null : JSON.parse(r.stdout) };
}
function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc migration '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  git(dir, 'config', 'user.name', 'Fixture');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'source.ts'), 'export const value=1;\n');
  git(dir, 'add', 'source.ts');
  git(dir, 'commit', '-qm', 'source');
  assert.equal(run(process.execPath, [cli, 'init', dir, '--agent', 'codex'], dir).status, 0);
  const file = path.join(dir, 'memory/topics/architecture.md');
  fs.writeFileSync(file, '# Architecture\nLegacy important note without provenance\n');
  return { dir, file };
}
test('legacy audit reports notes and does not modify the original', t => {
  const p = project(t), before = fs.readFileSync(p.file);
  const r = cmd(p.dir, 'migration-audit');
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.data.counts['legacy-note']);
  assert.ok(/^[a-f0-9]{64}$/.test(r.data.snapshot.digest));
  assert.deepEqual(fs.readFileSync(p.file), before);
});
test('snapshot requires reviewed digest and preserves exact bytes', t => {
  const p = project(t), before = fs.readFileSync(p.file);
  const preview = cmd(p.dir, 'migration-backup');
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(preview.data.status, 'preview');
  const digest = preview.data.expected_digest;
  const wrong = cmd(p.dir, 'migration-backup', '--apply', '--expect', '0'.repeat(64));
  assert.equal(wrong.status, 2);
  assert.equal(fs.existsSync(path.join(p.dir, 'memory/archive/lacc-snapshots', digest)), false);
  const actual = cmd(p.dir, 'migration-backup', '--apply', '--expect', digest);
  assert.equal(actual.status, 0, actual.stderr);
  assert.equal(actual.data.status, 'backed-up');
  assert.deepEqual(fs.readFileSync(p.file), before);
  const file = path.join(p.dir, 'memory/archive/lacc-snapshots', digest,
    'files/memory/topics/architecture.md');
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(cmd(p.dir, 'migration-backup', '--apply', '--expect', digest).data.status, 'existing');
  const verified = cmd(p.dir, 'migration-inspect', '--snapshot', digest);
  assert.equal(verified.status, 0);
  assert.equal(verified.data.status, 'verified');
  fs.appendFileSync(file, 'tampered');
  assert.equal(cmd(p.dir, 'migration-inspect', '--snapshot', digest).status, 2);
});
test('changed project after preview rejects old digest', t => {
  const p = project(t), preview = cmd(p.dir, 'migration-backup');
  fs.appendFileSync(p.file, '\nNew unpublished note\n');
  assert.equal(cmd(p.dir, 'migration-backup', '--apply',
    '--expect', preview.data.expected_digest).status, 2);
});
test('snapshot refuses symlinked source to prevent unintended disclosure', t => {
  const p = project(t);
  const target = path.join(p.dir, 'secret.md');
  fs.writeFileSync(target, 'private');
  try { fs.symlinkSync(target, path.join(p.dir, 'memory/topics/leak.md')); }
  catch { t.skip('symlink creation not permitted'); return; }
  const result = cmd(p.dir, 'migration-backup');
  assert.equal(result.status, 2);
});
