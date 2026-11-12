#!/usr/bin/env node
// RD-5/CR-5 local-only validation. NO hosted CI and NO release certification.
// Run from a native Windows/Linux/macOS checkout; outputs go outside the repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseNodeTestSummary } from './consolidated_reporter.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flags = process.argv.slice(2);
const allowed = new Set(['--node-only', '--installer']);
if (flags.some(flag => !allowed.has(flag))) {
  console.error('Usage: node tests/run_consolidated.mjs [--node-only] [--installer]');
  process.exitCode = 2;
} else {
  run();
}

function exec(bin, args, timeout = 15000) {
  const r = spawnSync(bin, args, {
    cwd: root, encoding: 'utf8', windowsHide: true,
    timeout, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
      PYTHONDONTWRITEBYTECODE: '1' },
  });
  return {
    code: r.status, signal: r.signal ?? null,
    error: r.error?.code ?? r.error?.message ?? null,
    stdout: r.stdout ?? '', stderr: r.stderr ?? '',
  };
}
function commandVersion(bin, args) {
  const r = exec(bin, args);
  return r.code === 0 && !r.error ? (r.stdout || r.stderr).trim().split(/\r?\n/)[0] : null;
}
function git(...args) {
  const r = exec('git', args);
  if (r.code !== 0 || r.error) throw Error('Git unavailable: ' + args[0]);
  return r.stdout.trim();
}
function fsCaseSensitive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-case-check-'));
  try {
    fs.writeFileSync(path.join(dir, 'MixedCaseTest'), 'fixture');
    return !fs.existsSync(path.join(dir, 'mixedcasetest'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
function bashPrerequisite() {
  // Probe execution, not presence on PATH: Windows WSL launchers may exist
  // but refuse execution (Bash/E_ACCESSDENIED). No shell is used by spawnSync.
  const result = exec('bash', ['-c', 'printf LACC_BASH_OK'], 6000);
  return {
    status: !result.error && result.code === 0 && result.stdout === 'LACC_BASH_OK'
      ? 'AVAILABLE' : 'BLOCKED',
    error_code: result.error ?? null,
    exit_code: result.code,
    reason: result.error || result.code !== 0 || result.stdout !== 'LACC_BASH_OK'
      ? 'bash-execution-unavailable' : null,
  };
}
function installerNodeSupported(version) {
  const parts = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  if (!parts) return false;
  const major = Number(parts[1]), minor = Number(parts[2]);
  return major > 22 || (major === 22 && minor >= 20);
}
function pythonCandidate() {
  const commands = process.env.LACC_PYTHON
    ? [[process.env.LACC_PYTHON, []]]
    : process.platform === 'win32'
      ? [['py', ['-3']], ['python', []], ['python3', []]]
      : [['python3', []], ['python', []]];
  for (const [bin, prefix] of commands) {
    const version = commandVersion(bin, [...prefix, '--version']);
    const match = version?.match(/Python (\d+)\.(\d+)/);
    if (match && (Number(match[1]) > 3 ||
        (Number(match[1]) === 3 && Number(match[2]) >= 9)))
      return { bin, prefix, version };
  }
  return null;
}
function pythonUnitSummary(output) {
  const count = output.match(/Ran (\d+) tests? in [\d.]+s/);
  const skipped = output.match(/skipped=(\d+)/);
  return { tests: count ? Number(count[1]) : null,
    skipped: skipped ? Number(skipped[1]) : 0 };
}
function run() {
  let head;
  try { head = git('rev-parse', '--verify', 'HEAD'); }
  catch (error) { console.error(error.message); process.exitCode = 2; return; }
  const before = git('status', '--porcelain=v1', '--untracked-files=all');
  if (before) {
    console.error('BLOCKED: checkout is not clean. Do not run release validation with unknown changes.');
    process.exitCode = 2;
    return;
  }
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-validation-'));
  const node = commandVersion(process.execPath, ['--version']);
  const py = flags.includes('--node-only') ? null : pythonCandidate();
  const bash = bashPrerequisite();
  const baseline = {
    schema: 1, scope: 'one-local-native-host',
    head, branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    platform: process.platform, arch: process.arch, os_release: os.release(),
    node, git: commandVersion('git', ['--version']),
    python: py?.version ?? null,
    bash_prerequisite: bash,
    filesystem_case_sensitive: fsCaseSensitive(),
    repo_status_before: 'clean',
    started_at: new Date().toISOString(),
    suite_results: [],
    host_answer_checks: { codex: 'UNVERIFIED', claude: 'UNVERIFIED',
      gemini: 'UNVERIFIED', roo: 'UNVERIFIED' },
    host_delivery: 'not-observed',
    cross_platform_acceptance: 'UNVERIFIED',
    installer_check: 'NOT_RUN',
    token_savings: 'NOT_MEASURED',
    release_eligible: false,
  };
  const suites = fs.readdirSync(path.join(root, 'tests'))
    .filter(name => /^test_[a-z0-9_-]+\.mjs$/i.test(name) &&
      !(flags.includes('--node-only') && name === 'test_node_python_parity.mjs'))
    .sort((a, b) => a.localeCompare(b, 'en'));
  if (!suites.length) {
    console.error('No Node test suites found. Aborting without a PASS claim.');
    process.exitCode = 2;
    return;
  }
  function executeSuite(label, bin, args, timeout = 300000) {
    const started = Date.now();
    const res = exec(bin, args, timeout);
    const combined = res.stdout + '\n' + res.stderr;
    const tap = label.endsWith('.mjs') ? parseNodeTestSummary(combined) : null;
    const pyUnit = label === 'python-unittest' ? pythonUnitSummary(combined) : null;
    const status = res.error || res.code !== 0 ? 'FAIL'
      : tap && (!tap.complete || tap.failed !== 0 || tap.skipped !== 0 || tap.todo !== 0) ? 'INCOMPLETE'
      : pyUnit && (pyUnit.tests === null || pyUnit.tests < 1 || pyUnit.skipped !== 0)
        ? 'INCOMPLETE' : 'PASS';
    const reason = res.error ?? (res.code !== 0 ? 'nonzero-exit' :
      tap?.incomplete_reason ?? (pyUnit?.skipped ? 'python-unittest-skipped' :
        status === 'INCOMPLETE' ? 'incomplete-python-summary' : null));
    fs.writeFileSync(path.join(output, label.replace(/[^a-z0-9_.-]/gi, '_') + '.log'),
      '$ ' + [bin, ...args].join(' ') + '\n' + res.stdout + '\n' + res.stderr, { mode: 0o600 });
    baseline.suite_results.push({
      suite: label, status, exit_code: res.code, signal: res.signal,
      error: res.error, status_reason: reason, duration_ms: Date.now() - started,
      ...tap, ...pyUnit,
    });
    process.stdout.write(label + ': ' + status + ' (exit=' + res.code +
      (reason ? ', reason=' + reason : '') + ')\n');
  }
  for (const file of suites) executeSuite(file, process.execPath,
    ['--test', '--test-reporter=tap', 'tests/' + file]);
  if (flags.includes('--node-only')) baseline.suite_results.push({
    suite: 'test_node_python_parity.mjs', status: 'UNVERIFIED',
    reason: 'explicit node-only run',
  });
  if (py) executeSuite('python-unittest', py.bin,
    [...py.prefix, '-m', 'unittest', 'discover', '-s', 'tests', '-v']);
  else baseline.suite_results.push({
    suite: 'python-unittest', status: 'UNVERIFIED',
    reason: flags.includes('--node-only') ? 'explicit node-only run' : 'Python 3.9+ not found',
  });
  if (flags.includes('--installer')) {
    if (!py || bash.status !== 'AVAILABLE' || !installerNodeSupported(node)) {
      const reasons = [
        !py ? 'Python 3.9+ unavailable' : null,
        bash.status !== 'AVAILABLE' ? 'Bash execution blocked/unavailable' : null,
        !installerNodeSupported(node) ? 'Node 22.20+ required' : null,
      ].filter(Boolean);
      baseline.installer_check = 'UNVERIFIED: ' + reasons.join('; ');
      baseline.suite_results.push({
        suite: 'installer-smoke', status: 'UNVERIFIED',
        reason: baseline.installer_check,
      });
      process.stdout.write('installer-smoke: UNVERIFIED (' + reasons.join('; ') + ')\n');
    } else {
      executeSuite('installer-smoke', py.bin, [...py.prefix, 'tests/install_smoke.py'], 300000);
      baseline.installer_check = baseline.suite_results.at(-1).status;
    }
  }
  baseline.repo_status_after = git('status', '--porcelain=v1', '--untracked-files=all')
    ? 'DIRTY_AFTER_TESTS' : 'clean';
  baseline.finished_at = new Date().toISOString();
  baseline.local_suite_status = baseline.suite_results.every(row => row.status === 'PASS') &&
    baseline.repo_status_after === 'clean' ? 'PASS' : 'INCOMPLETE_OR_FAIL';
  // Always false. No single-machine run proves OS/host response parity.
  baseline.release_eligible = false;
  const report = JSON.stringify(baseline, null, 2) + '\n';
  fs.writeFileSync(path.join(output, 'report.json'), report, { mode: 0o600 });
  const rows = baseline.suite_results.map(row =>
    '| ' + row.suite + ' | ' + row.status + ' | ' +
    (row.exit_code ?? '-') + ' | ' +
    (row.skipped ?? '-') + ' |').join('\n');
  fs.writeFileSync(path.join(output, 'report.md'),
    '# LACC local validation — not a release certificate\n\n' +
    'Commit: \x60' + head + '\x60; platform: ' + process.platform +
    '; Node: ' + node + '\n\n' +
    '| Suite | Status | Exit | Skipped |\n|---|---|---|---|\n' + rows +
    '\n\nHost answers: UNVERIFIED. Cross-OS acceptance: UNVERIFIED. ' +
    'No claim of user delivery or token savings.\n', { mode: 0o600 });
  process.stdout.write('Local report: ' + output + '\n');
  process.stdout.write('Local suite status: ' + baseline.local_suite_status +
    '; overall release gate: UNVERIFIED\n');
  if (baseline.local_suite_status !== 'PASS') process.exitCode = 1;
}
