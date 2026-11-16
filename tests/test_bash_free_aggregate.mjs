import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'tests/aggregate_bash_free.mjs');
const suites = fs.readdirSync(path.join(root, 'tests'))
  .filter(x => /^test_[a-z0-9_-]+\.mjs$/i.test(x)).sort();
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-bf-matrix-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function report(platform, legacy = false, sha = 'a'.repeat(40)) {
  return {
    schema: 1, scope: 'one-local-native-host', head: sha, branch: 'feature/bf',
    platform, node: 'v22.20.0',
    repo_status_before: 'clean', repo_status_after: 'clean',
    node_core_status: 'PASS', installer_check: legacy ? 'NOT_RUN' : 'PASS',
    suite_results: [
      ...suites.map(suite => ({
        suite, status: 'PASS', exit_code: 0, tests: 2,
        passed: 2, failed: 0, skipped: 0,
      })),
      legacy
        ? { suite: 'python-unittest', status: 'PASS', exit_code: 0,
          tests: 134, skipped: 0 }
        : { suite: 'python-unittest', status: 'UNVERIFIED',
          reason: 'explicit Bash-free core scope' },
    ],
  };
}
function writeFiles(dir, alter = () => {}) {
  const items = [
    ['--windows', 'win32', false], ['--linux', 'linux', false],
    ['--macos', 'darwin', false], ['--linux-legacy', 'linux', true],
    ['--macos-legacy', 'darwin', true],
  ];
  const args = [];
  for (const [flag, platform, legacy] of items) {
    const r = report(platform, legacy);
    alter(flag, r);
    const file = path.join(dir, flag.slice(2) + '.json');
    fs.writeFileSync(file, JSON.stringify(r));
    args.push(flag, file);
  }
  return args;
}
function run(args) {
  const response = spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000,
  });
  assert.equal(response.error, undefined);
  return { code: response.status, data: JSON.parse(response.stdout) };
}
test('no evidence never counts as cross-platform acceptance', () => {
  const r = run([]);
  assert.equal(r.code, 1);
  assert.equal(r.data.release_gate, 'NOT_PASSED');
  assert.equal(r.data.core.darwin, 'UNVERIFIED');
});
test('fabricated five-host PASS reports remain untrusted, not a release pass', t => {
  const dir = fixture(t);
  const r = run(writeFiles(dir));
  assert.equal(r.code, 0);
  assert.equal(r.data.automated_evidence,
    'REPORTED_PASS_PENDING_INDEPENDENT_REVIEW');
  assert.equal(r.data.release_gate, 'NOT_PASSED');
  assert.equal(r.data.host_generated_answers, 'UNVERIFIED');
  assert.equal(r.data.candidate_branch, 'feature/bf');
  assert.ok(r.data.warnings.some(x => x.includes('not develop')));
});
test('Python legacy skips are not accepted on POSIX acceptance machines', t => {
  const dir = fixture(t);
  const r = run(writeFiles(dir, (flag, report) => {
    if (flag === '--linux-legacy') report.suite_results.at(-1).skipped = 3;
  }));
  assert.equal(r.code, 1);
  assert.ok(r.data.issues.some(x => /legacy Python\/Bash/.test(x)));
});
test('Windows does not require a Bash/Python legacy report to pass core gate', t => {
  const dir = fixture(t);
  const r = run(writeFiles(dir));
  assert.equal(r.code, 0);
  assert.equal(r.data.core.win32, 'REPORTED_PASS');
  assert.equal(r.data.legacy_posix.linux, 'REPORTED_PASS');
  assert.equal(r.data.legacy_posix.darwin, 'REPORTED_PASS');
});
test('skipped Node tests, installer failures and mismatched SHAs fail closed', t => {
  const dir = fixture(t);
  for (const fault of [
    (flag, r) => {
      if (flag === '--windows') r.suite_results[0].skipped = 1;
    },
    (flag, r) => {
      if (flag === '--linux') r.installer_check = 'UNVERIFIED';
    },
    (flag, r) => {
      if (flag === '--macos') r.head = 'b'.repeat(40);
    },
  ]) {
    const r = run(writeFiles(dir, fault));
    assert.equal(r.code, 1);
    assert.equal(r.data.release_gate, 'NOT_PASSED');
  }
});
test('dirty or symlinked local report evidence is rejected', t => {
  const dir = fixture(t);
  const args = writeFiles(dir, (flag, r) => {
    if (flag === '--windows') r.repo_status_after = 'DIRTY_AFTER_TESTS';
  });
  assert.equal(run(args).code, 1);
  const original = args[1], alias = path.join(dir, 'linked.json');
  try { fs.symlinkSync(original, alias); }
  catch (e) {
    if (['EPERM','EACCES','ENOTSUP'].includes(e.code)) return;
    throw e;
  }
  args[1] = alias;
  assert.equal(run(args).code, 1);
});
