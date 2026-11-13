import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyPinnedInstallerFailure, resolveWindowsSystemProxy } from './installer_smoke_support.mjs';

const runner = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  'install_smoke.mjs');
function exec(args, cwd, timeout = 12000) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd, encoding: 'utf8', timeout, windowsHide: true,
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


test('npm proxy/auth/registry errors are UNVERIFIED prerequisites, not LACC failures', () => {
  const cases = [
    ['npm error code E407\nnpm error 407 Proxy Authentication Required', 'npm-proxy-auth-required'],
    ['npm error code E401', 'npm-registry-auth-required'],
    ['npm error code E403', 'npm-registry-access-denied'],
    ['npm error code ENOTFOUND', 'npm-network-unavailable'],
    ['npm error code SELF_SIGNED_CERT_IN_CHAIN', 'npm-registry-tls-untrusted'],
  ];
  for (const [stderr, expected] of cases)
    assert.equal(classifyPinnedInstallerFailure({ stderr }), expected);
  assert.equal(classifyPinnedInstallerFailure({ stderr: 'TypeError: missing method' }), null);
});
test('Windows proxy auto-discovery is opt-in and does not expose credentials', () => {
  let called = 0;
  const good = () => {
    called++;
    return { status: 0, stdout: 'http://proxy.example.test:3128' };
  };
  const accepted = resolveWindowsSystemProxy({ platform: 'win32',
    env: {}, spawn: good });
  assert.equal(accepted.status, 'discovered');
  assert.equal(accepted.proxyUrl, 'http://proxy.example.test:3128');
  assert.equal(called, 1);
  assert.equal(resolveWindowsSystemProxy({ platform: 'win32',
    env: { HTTPS_PROXY: 'http://managed.example.test:8080' }, spawn: good }).status,
    'already-configured');
  assert.equal(called, 1, 'do not bypass explicit user proxy');
  assert.equal(resolveWindowsSystemProxy({ platform: 'linux',
    env: {}, spawn: good }).status, 'not-windows');
  assert.equal(called, 1);
  const sensitive = resolveWindowsSystemProxy({ platform: 'win32',
    env: {}, spawn: () => ({ status: 0, stdout: 'http://user:secret@corp.test:8080' }) });
  assert.equal(sensitive.status, 'proxy-unsupported');
  assert.equal(sensitive.proxyUrl, undefined);
  const pacUnavailable = resolveWindowsSystemProxy({ platform: 'win32',
    env: {}, spawn: () => ({ status: 1, stderr: 'confidential error' }) });
  assert.equal(pacUnavailable.status, 'discovery-unavailable');
  assert.equal(resolveWindowsSystemProxy({ platform: 'win32', env: {},
    spawn: () => ({ status: 0, stdout: 'DIRECT' }) }).status, 'direct');
});
test('offline-local checks copies, agents and CLI without npm/network or false installer PASS', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-installer-offline-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = exec(['--offline-local'], root, 120000);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS: offline local-copy fixture/);
  assert.match(result.stdout, /external pinned installer NOT_VERIFIED/);
  assert.doesNotMatch(result.stdout, /PASS: copy mode/);
  assert.deepEqual(fs.readdirSync(root), []);
});
test('offline-local and Windows proxy flags are mutually exclusive', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-installer-flags-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = exec(['--offline-local', '--windows-system-proxy'], root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot use/);
  assert.deepEqual(fs.readdirSync(root), []);
});

test('real installer subprocess E407 is UNVERIFIED without exposing npm output or using network', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-installer-e407-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Explicit fake Node npm entrypoint: the actual external installer is not
  // downloaded or invoked, and no user or system npm config is modified.
  const fake = path.join(root, 'npx-cli.js');
  fs.writeFileSync(fake,
    'process.stderr.write("npm error code E407\\n' +
    'npm error 407 Proxy Authentication Required\\n' +
    'confidential URL: http://user:secret@proxy.test:8080\\n"); process.exitCode = 1;\n');
  const result = spawnSync(process.execPath,
    [runner, '--copy-only'], { cwd: root, encoding: 'utf8',
      windowsHide: true, timeout: 12000,
      env: { ...process.env, LACC_NPX_CLI: fake } });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stderr, /UNVERIFIED: pinned installer prerequisite blocked: npm-proxy-auth-required/);
  assert.doesNotMatch(result.stderr + result.stdout, /secret|user@|confidential URL/);
  assert.doesNotMatch(result.stderr + result.stdout, /^FAIL:/m);
});
