import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');

function execute(bin, args, cwd) {
  const r = spawnSync(bin, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  if (r.error) throw r.error;
  return r;
}
function git(dir, ...args) {
  const r = execute('git', args, dir);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function node(dir, command, ...args) {
  const r = execute(process.execPath, [cli, command, dir, ...args], dir);
  return { ...r, report: JSON.parse(r.stdout) };
}
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc start gate '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  git(dir, 'config', 'user.name', 'Fixture');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.hooksPath', path.join(dir, '.disabled-hooks'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/auth.ts'), 'export const enabled = true;\n');
  git(dir, 'add', 'src/auth.ts'); git(dir, 'commit', '-qm', 'source');
  const head = git(dir, 'rev-parse', 'HEAD');
  const initialized = execute(process.execPath, [cli, 'init', dir, '--agent', 'codex'], dir);
  assert.equal(initialized.status, 0, initialized.stderr);
  fs.writeFileSync(path.join(dir, 'memory/topics/architecture.md'),
    ('# Architecture\n- Auth enabled | source: §src/auth.ts§ | verified: §' + head + '§\n')
      .replaceAll('§', String.fromCharCode(96)));
  return dir;
}
test('session-check is read-only and flags UNSYNCED checkpoint', t => {
  const dir = setup(t);
  const file = path.join(dir, 'memory/ACTIVE_STATE.md');
  const before = fs.readFileSync(file);
  const result = node(dir, 'session-check', '--json');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.report.status, 'review');
  assert.ok(result.report.counts['unverified-checkpoint']);
  assert.deepEqual(fs.readFileSync(file), before);
});
test('session-check healthy after review-stamp, then detects dirty source', t => {
  const dir = setup(t);
  const stamp = execute(process.execPath, [cli, 'sync', dir, '--stamp'], dir);
  assert.equal(stamp.status, 0, stamp.stderr);
  let checked = node(dir, 'session-check', '--json');
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(checked.report.status, 'healthy');
  fs.writeFileSync(path.join(dir, 'src/auth.ts'), 'export const enabled = false;\n');
  checked = node(dir, 'session-check', '--json');
  assert.equal(checked.status, 1);
  assert.ok(checked.report.counts['changed-source']);
});
test('session-check marks oversized topic as incomplete', t => {
  const dir = setup(t);
  fs.writeFileSync(path.join(dir, 'memory/topics/gotchas.md'), '# Gotchas\n' + 'x'.repeat(1048577));
  const checked = node(dir, 'session-check', '--json');
  assert.equal(checked.status, 1);
  assert.equal(checked.report.status, 'incomplete');
  assert.equal(checked.report.scan_incomplete, true);
});
test('session-check fails closed without available git', t => {
  const dir = setup(t);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc nogit '));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  env[process.platform === 'win32' ? 'Path' : 'PATH'] = empty;
  const r = spawnSync(process.execPath, [cli, 'session-check', dir, '--json'], {
    cwd: dir, env, encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  assert.equal(r.status, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.ok(report.counts['unavailable-commit']);
});
