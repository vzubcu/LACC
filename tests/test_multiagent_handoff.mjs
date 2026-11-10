import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function exec(bin, args, cwd) {
  const result = spawnSync(bin, args, { cwd, windowsHide: true,
    timeout: 30000, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}
function git(dir, ...args) {
  const r = exec('git', args, dir);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function command(dir, cmd, ...args) {
  const r = exec(process.execPath, [cli, cmd, dir, ...args], dir);
  return { code: r.status, result: r.status === 2 ? null : JSON.parse(r.stdout), stderr: r.stderr };
}
function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc handoff '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'LACC fixture');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'readme.txt'), 'fixture\n');
  git(dir, 'add', 'readme.txt');
  git(dir, 'commit', '-qm', 'initial');
  const head = git(dir, 'rev-parse', 'HEAD');
  assert.equal(exec(process.execPath, [cli, 'init', dir, '--agent', 'codex'], dir).status, 0);
  return { dir, head };
}
test('handoff create/read/list is unverified, immutable and idempotent', t => {
  const p = project(t);
  const args = ['--task', 'auth-fix', '--actor', 'claude', '--message',
    'Review token rotation against current code', '--expect-head', p.head];
  const first = command(p.dir, 'handoff-publish', ...args);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.result.status, 'created');
  const second = command(p.dir, 'handoff-publish', ...args);
  assert.equal(second.result.status, 'existing');
  assert.equal(first.result.id, second.result.id);
  const listed = command(p.dir, 'handoff-list', '--task', 'auth-fix');
  assert.equal(listed.code, 0);
  assert.equal(listed.result.total, 1);
  const read = command(p.dir, 'handoff-read', '--task', 'auth-fix', '--id', first.result.id);
  assert.equal(read.code, 1, 'reading a handoff cannot mean verified provenance');
  assert.equal(read.result.trust, 'unverified-proposal');
  assert.equal(read.result.message, 'Review token rotation against current code');
});
test('outdated expected HEAD blocks writes before creating handoffs', t => {
  const p = project(t);
  assert.equal(command(p.dir, 'handoff-publish', '--task', 'auth-fix', '--actor', 'codex',
    '--message', 'Check', '--expect-head', '0'.repeat(40)).code, 2);
  assert.equal(fs.existsSync(path.join(p.dir, 'memory/handoffs/auth-fix')), false);
});
test('invalid identifiers and message overflow are rejected', t => {
  const p = project(t);
  assert.equal(command(p.dir, 'handoff-publish', '--task', '../escape', '--actor', 'a',
    '--message', 'hello', '--expect-head', p.head).code, 2);
  assert.equal(command(p.dir, 'handoff-publish', '--task', 'valid', '--actor', 'a',
    '--message', 'x'.repeat(4097), '--expect-head', p.head).code, 2);
});
test('tampering with a handoff cannot turn it into trusted memory', t => {
  const p = project(t);
  const made = command(p.dir, 'handoff-publish', '--task', 'auth-fix', '--actor', 'gemini',
    '--message', 'Unverified observation', '--expect-head', p.head);
  const file = path.join(p.dir, 'memory/handoffs/auth-fix', made.result.id + '.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.trust = 'verified';
  fs.writeFileSync(file, JSON.stringify(data));
  assert.equal(command(p.dir, 'handoff-read', '--task', 'auth-fix', '--id', made.result.id).code, 2);
});
