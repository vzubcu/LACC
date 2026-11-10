import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function exec(bin, args, dir) {
  const r = spawnSync(bin, args, { cwd: dir, encoding: 'utf8',
    windowsHide: true, timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.error) throw r.error;
  return r;
}
function git(dir, ...args) {
  const r = exec('git', args, dir);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function command(dir, op, ...flags) {
  const r = exec(process.execPath, [cli, op, dir, ...flags], dir);
  return { code: r.status, payload: r.status === 2 ? null : JSON.parse(r.stdout), stderr: r.stderr };
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc transaction '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  git(dir, 'config', 'user.name', 'Fixture');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'source\n');
  git(dir, 'add', 'app.txt'); git(dir, 'commit', '-qm', 'initial');
  assert.equal(exec(process.execPath, [cli, 'init', dir, '--agent', 'codex'], dir).status, 0);
  const paths = ['memory/topics/architecture.md', 'memory/topics/decisions.md'];
  const before = paths.map(name => fs.readFileSync(path.join(dir, name)));
  fs.mkdirSync(path.join(dir, '.lacc-proposals'), { recursive: true });
  const candidates = paths.map((name, i) => {
    const file = '.lacc-proposals/' + (i ? 'decisions' : 'architecture') + '.md';
    fs.writeFileSync(path.join(dir, file), '# Reviewed topic\n- Legacy notes preserved as review candidates\n');
    return { target: name, proposal: file };
  });
  const plan = '.lacc-proposals/migration.json';
  fs.writeFileSync(path.join(dir, plan), JSON.stringify({ schema: 1, files: candidates }));
  return { dir, paths, before, plan };
}
const preview = x => command(x.dir, 'migration-plan', '--plan', x.plan);
const apply = (x, digest, ...extra) =>
  command(x.dir, 'migration-apply', '--plan', x.plan, '--expect', digest, ...extra);
test('plan is read-only and apply needs reviewed exact digest', t => {
  const p = fixture(t);
  const plan = preview(p);
  assert.equal(plan.code, 0, plan.stderr);
  assert.equal(plan.payload.files.length, 2);
  assert.equal(apply(p, plan.payload.expect).code, 2);
  p.paths.forEach((name, i) => assert.deepEqual(fs.readFileSync(path.join(p.dir, name)), p.before[i]));
});
test('reviewed multi-file migration creates journal and rollback copies', t => {
  const p = fixture(t), plan = preview(p);
  const changed = apply(p, plan.payload.expect, '--reviewed');
  assert.equal(changed.code, 0, changed.stderr);
  assert.equal(changed.payload.status, 'applied');
  assert.equal(command(p.dir, 'migration-transaction-inspect',
    '--id', changed.payload.transaction).payload.status, 'complete');
  p.paths.forEach((name, i) => {
    assert.match(fs.readFileSync(path.join(p.dir, name), 'utf8'), /Legacy notes preserved/);
    const copy = path.join(p.dir, 'memory/archive/lacc-transactions',
      changed.payload.transaction, 'before', name);
    assert.deepEqual(fs.readFileSync(copy), p.before[i]);
  });
  assert.equal(apply(p, plan.payload.expect, '--reviewed').code, 2);
  assert.equal(command(p.dir, 'migration-recover', '--id',
    changed.payload.transaction, '--reviewed').code, 2,
    'complete transactions require a separate reviewed restore');
});
test('stale target or changed proposal rejects without overwriting memory', t => {
  const p = fixture(t), plan = preview(p);
  fs.writeFileSync(path.join(p.dir, p.paths[0]), '# other agent wrote\n');
  assert.equal(apply(p, plan.payload.expect, '--reviewed').code, 2);
  assert.equal(fs.readFileSync(path.join(p.dir, p.paths[0]), 'utf8'), '# other agent wrote\n');
  const next = preview(p);
  fs.appendFileSync(path.join(p.dir, '.lacc-proposals/decisions.md'), 'changed\n');
  assert.equal(apply(p, next.payload.expect, '--reviewed').code, 2);
});
test('snapshot restore is previewed and requires explicit approval', t => {
  const p = fixture(t);
  const copy = command(p.dir, 'migration-backup');
  assert.equal(copy.code, 0, copy.stderr);
  const saved = command(p.dir, 'migration-backup', '--apply', '--expect', copy.payload.expected_digest);
  assert.equal(saved.code, 0, saved.stderr);
  const plan = preview(p);
  assert.equal(apply(p, plan.payload.expect, '--reviewed').code, 0);
  const restoration = command(p.dir, 'migration-restore-preview', '--snapshot', copy.payload.expected_digest);
  assert.equal(restoration.code, 0, restoration.stderr);
  const restored = command(p.dir, 'migration-restore-apply', '--snapshot',
    copy.payload.expected_digest, '--expect', restoration.payload.expect, '--reviewed');
  assert.equal(restored.code, 0, restored.stderr);
  p.paths.forEach((name, i) => assert.deepEqual(fs.readFileSync(path.join(p.dir, name)), p.before[i]));
});
test('unknown external edits block recover and invalid plan paths are refused', t => {
  const p = fixture(t);
  fs.writeFileSync(path.join(p.dir, p.plan), JSON.stringify({ schema: 1,
    files: [{ target: '../outside.md', proposal: '.lacc-proposals/architecture.md' }] }));
  assert.equal(preview(p).code, 2);
});
