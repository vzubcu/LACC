import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aggregate = path.join(root, 'tests/aggregate_consolidated.mjs');
const runner = path.join(root, 'tests/run_consolidated.mjs');
function exec(args) {
  const r = spawnSync(process.execPath, args, {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000,
  });
  if (r.error) throw r.error;
  return r;
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc aggregate safety '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function report(osName, sha = 'a'.repeat(40)) {
  const suites = fs.readdirSync(path.join(root, 'tests'))
    .filter(x => /^test_[a-z0-9_-]+\.mjs$/i.test(x))
    .map(suite => ({
      suite, status: 'PASS', exit_code: 0,
      tests: 1, passed: 1, failed: 0, skipped: 0,
    }));
  suites.push({ suite: 'python-unittest', status: 'PASS', exit_code: 0 });
  return {
    schema: 1, scope: 'one-local-native-host', platform: osName, head: sha,
    branch: 'develop', node: 'v22.20.0', repo_status_before: 'clean',
    repo_status_after: 'clean', suite_results: suites,
    installer_check: 'PASS', host_answer_checks: {
      codex: 'UNVERIFIED', claude: 'UNVERIFIED', gemini: 'UNVERIFIED',
      roo: 'UNVERIFIED',
    },
  };
}
test('runner rejects unrecognized flags before starting any suite', () => {
  const result = exec([runner, '--unexpected']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});
test('no reports never become passing release evidence', () => {
  const r = exec([aggregate]);
  assert.equal(r.status, 1);
  const data = JSON.parse(r.stdout);
  assert.equal(data.release_gate, 'NOT_PASSED');
  assert.equal(data.platforms.darwin, 'UNVERIFIED');
  assert.equal(data.host_delivery, 'not-observed');
});
test('malformed, symlink and oversized evidence files fail closed', t => {
  const dir = fixture(t), bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{"schema":1, "platform":"linux"}');
  const tooLarge = path.join(dir, 'large.json');
  fs.writeFileSync(tooLarge, 'x'.repeat(1024 * 1024 + 1));
  const linked = path.join(dir, 'link.json');
  try {
    fs.symlinkSync(bad, linked);
    const r = exec([aggregate, bad, tooLarge, linked]);
    assert.equal(r.status, 1);
    const data = JSON.parse(r.stdout);
    assert.equal(data.issues.length, 3);
    assert.equal(data.release_gate, 'NOT_PASSED');
  } catch (e) {
    if (process.platform !== 'win32' || !['EPERM', 'EACCES'].includes(e.code))
      throw e;
    const r = exec([aggregate, bad, tooLarge]);
    assert.equal(r.status, 1);
  }
});
test('missing macOS and mismatched commit cannot be accepted', t => {
  const dir = fixture(t);
  const a = path.join(dir, 'win.json'), b = path.join(dir, 'linux.json');
  fs.writeFileSync(a, JSON.stringify(report('win32')));
  fs.writeFileSync(b, JSON.stringify(report('linux', 'b'.repeat(40))));
  const r = exec([aggregate, a, b]);
  assert.equal(r.status, 1);
  const data = JSON.parse(r.stdout);
  assert.ok(data.issues.some(x => x.includes('Different commit SHAs')));
  assert.ok(data.issues.some(x => x.includes('Missing native darwin')));
  assert.equal(data.release_gate, 'NOT_PASSED');
});
test('even fabricated three-platform passing JSON is never real-agent acceptance', t => {
  const dir = fixture(t);
  const paths = ['win32', 'linux', 'darwin'].map(p => {
    const dest = path.join(dir, p + '.json');
    fs.writeFileSync(dest, JSON.stringify(report(p)));
    return dest;
  });
  const r = exec([aggregate, ...paths]);
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.equal(data.cross_os_automated_evidence,
    'REPORTED_PASS_REQUIRES_INDEPENDENT_REVIEW');
  assert.equal(data.host_agent_responses, 'UNVERIFIED');
  assert.equal(data.release_gate, 'NOT_PASSED');
  assert.equal(data.host_delivery, 'not-observed');
});
