import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  'install_smoke.mjs');
function exec(args, cwd) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd, encoding: 'utf8', timeout: 12000, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never' },
  });
}
test('installer help has no npx, Bash, Python, network or filesystem side effects', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-installer-help-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = exec(['--help'], root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /opt-in network install/i);
  assert.deepEqual(fs.readdirSync(root), []);
});
test('installer fails closed for unsupported flags and missing source', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-installer-args-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const args of [['--unknown'], ['--source'],
    ['--source', '--copy-only'], ['--copy-only', '--unknown']]) {
    const result = exec(args, root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /FAIL/);
    assert.deepEqual(fs.readdirSync(root), []);
  }
});
test('installer prerequisite cannot be reported as a passing smoke check', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-installer-prereq-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major > 22 || major === 22 && minor >= 20) {
    // An actual pinned installer requires explicit network consent. Help
    // and bad-argument contracts are exercised above without installing.
    return;
  }
  const result = exec(['--copy-only'], root);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  assert.match(result.stdout, /UNVERIFIED/);
  assert.doesNotMatch(result.stdout, /PASS:/);
  assert.deepEqual(fs.readdirSync(root), []);
});
