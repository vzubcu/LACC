import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function run(bin, args, cwd) {
  const r = spawnSync(bin, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  if (r.error) throw r.error;
  return r;
}
function git(dir, ...args) {
  const r = run('git', args, dir);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function cliRun(dir, command, ...args) {
  const r = run(process.execPath, [cli, command, dir, ...args], dir);
  return { status: r.status, result: r.status === 2 ? null : JSON.parse(r.stdout),
    stderr: r.stderr };
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc canonical cas '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'Fixture');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.hooksPath', path.join(dir, '.disabled-hooks'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/feature.ts'), 'export const enabled = true;\n');
  git(dir, 'add', 'src/feature.ts');
  git(dir, 'commit', '-qm', 'source');
  const init = run(process.execPath, [cli, 'init', dir, '--agent', 'codex'], dir);
  assert.equal(init.status, 0, init.stderr);
  fs.mkdirSync(path.join(dir, '.lacc-proposals'));
  const target = 'memory/topics/architecture.md';
  const candidate = '.lacc-proposals/architecture.md';
  const original = fs.readFileSync(path.join(dir, target));
  const next = '# Architecture\n- New hypothesis requires review\n';
  fs.writeFileSync(path.join(dir, candidate), next);
  return { dir, target, candidate, original, next };
}
function preview(p) {
  return cliRun(p.dir, 'canonical-preview', '--file', p.target,
    '--content-file', p.candidate);
}
function apply(p, expect, ...flags) {
  return cliRun(p.dir, 'canonical-apply', '--file', p.target,
    '--content-file', p.candidate, '--expect', expect, ...flags);
}
test('preview is read-only, apply requires reviewed confirmation', t => {
  const p = fixture(t);
  const plan = preview(p);
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(plan.result.status, 'preview');
  assert.deepEqual(fs.readFileSync(path.join(p.dir, p.target)), p.original);
  assert.equal(apply(p, plan.result.expect).status, 2);
  assert.deepEqual(fs.readFileSync(path.join(p.dir, p.target)), p.original);
});
test('reviewed CAS writes once, keeps exact rollback bytes, rejects stale replay', t => {
  const p = fixture(t);
  const plan = preview(p);
  const changed = apply(p, plan.result.expect, '--reviewed');
  assert.equal(changed.status, 0, changed.stderr);
  assert.equal(changed.result.status, 'applied');
  assert.equal(fs.readFileSync(path.join(p.dir, p.target), 'utf8'), p.next);
  assert.deepEqual(fs.readFileSync(path.join(p.dir, changed.result.rollback_copy)), p.original);
  assert.equal(fs.readFileSync(path.join(p.dir, 'memory/archive/.gitignore'), 'utf8'),
    '*\n!.gitignore\n');
  assert.equal(apply(p, plan.result.expect, '--reviewed').status, 2);
});
test('parallel stale proposals refuse overwriting another writer', t => {
  const p = fixture(t), first = preview(p);
  fs.writeFileSync(path.join(p.dir, p.target), '# Other agent wrote first\n');
  assert.equal(apply(p, first.result.expect, '--reviewed').status, 2);
  assert.equal(fs.readFileSync(path.join(p.dir, p.target), 'utf8'),
    '# Other agent wrote first\n');
});
test('proposal content or Git HEAD changes invalidate earlier preview', t => {
  const p = fixture(t), first = preview(p);
  fs.appendFileSync(path.join(p.dir, p.candidate), 'Another new note\n');
  assert.equal(apply(p, first.result.expect, '--reviewed').status, 2);
  fs.writeFileSync(path.join(p.dir, p.candidate), p.next);
  fs.appendFileSync(path.join(p.dir, 'src/feature.ts'), 'export const other = true;\n');
  git(p.dir, 'add', 'src/feature.ts');
  git(p.dir, 'commit', '-qm', 'new head');
  assert.equal(apply(p, first.result.expect, '--reviewed').status, 2);
});
test('exclusive per-file lock blocks competing writer without stealing lock', t => {
  const p = fixture(t), plan = preview(p);
  const lockRoot = path.join(p.dir, 'memory/.lacc-locks');
  // Deliberately avoid guessing the hash: create lock through derived SHA256.
   const id = createHash('sha256').update(p.target).digest('hex');
  fs.mkdirSync(lockRoot);
  fs.mkdirSync(path.join(lockRoot, id + '.lock'));
  assert.equal(apply(p, plan.result.expect, '--reviewed').status, 2);
  assert.equal(fs.existsSync(path.join(lockRoot, id + '.lock')), true);
  assert.deepEqual(fs.readFileSync(path.join(p.dir, p.target)), p.original);
});
test('unsafe destinations, oversize HOT proposal and symlink are refused', t => {
  const p = fixture(t);
  const out = cliRun(p.dir, 'canonical-preview', '--file', '../outside.md',
    '--content-file', p.candidate);
  assert.equal(out.status, 2);
  const huge = 'memory/ACTIVE_STATE.md';
  fs.writeFileSync(path.join(p.dir, p.candidate), 'x'.repeat(2049));
  assert.equal(cliRun(p.dir, 'canonical-preview', '--file', huge,
    '--content-file', p.candidate).status, 2);
  const symlink = path.join(p.dir, '.lacc-proposals/link.md');
  let contentFile = '.lacc-proposals/link.md';
  try {
    fs.symlinkSync(path.join(p.dir, p.target), symlink, 'file');
  } catch (error) {
    // NTFS normally needs Developer Mode for file symlinks. A junction
    // exercises the same unsafe linked parent check without dropping it.
    if (process.platform !== 'win32' ||
        !['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code))
        return t.skip('file symlink unavailable');
      throw error;
    }
    try {
      fs.symlinkSync(path.join(p.dir, 'memory/topics'),
        path.join(p.dir, '.lacc-proposals/linked-topics'), 'junction');
      contentFile = '.lacc-proposals/linked-topics/architecture.md';
    } catch (junctionError) {
      if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(junctionError.code))
        return t.skip('Windows file symlink and directory junction unavailable');
      throw junctionError;
    }
  }
  assert.equal(cliRun(p.dir, 'canonical-preview', '--file', p.target,
    '--content-file', contentFile).status, 2);
});
