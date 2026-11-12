#!/usr/bin/env node
// UR-4 opt-in differential check; isolated fixtures only.
// No Bash, network, or edits to the current checkout. Missing Python/Git => exit 2.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = path.join(repo, 'skills/lean-context-memory/scripts');
const CLI = path.join(scripts, 'lacc.mjs');
const digest = value => createHash('sha256').update(value).digest('hex');

function exec(bin, args, cwd, timeout = 20000) {
  const r = spawnSync(bin, args, {
    cwd, windowsHide: true, timeout, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
      PYTHONDONTWRITEBYTECODE: '1' },
  });
  return { code: r.status, error: r.error?.code ?? null,
    stdout: r.stdout ?? Buffer.alloc(0), stderr: r.stderr ?? Buffer.alloc(0) };
}
function checked(bin, args, cwd) {
  const r = exec(bin, args, cwd);
  if (r.error || r.code !== 0) throw Error('fixture setup unavailable: ' + bin);
  return r.stdout.toString('utf8').trim();
}
function python() {
  const choices = process.env.LACC_PYTHON
    ? [[process.env.LACC_PYTHON, []]]
    : process.platform === 'win32'
      ? [['py', ['-3']], ['python', []], ['python3', []]]
      : [['python3', []], ['python', []]];
  for (const [bin, prefix] of choices) {
    const r = exec(bin, [...prefix, '-c',
      'import sys; print(int(sys.version_info >= (3, 9)))'], repo, 5000);
    if (r.code === 0 && r.stdout.toString('utf8').trim() === '1')
      return { bin, prefix };
  }
  return null;
}
function healthSummary(bytes) {
  const obj = JSON.parse(bytes.toString('utf8'));
  if (!obj || !Array.isArray(obj.findings)) throw Error('invalid health JSON');
  return { status: obj.status, findings_total: obj.findings_total,
    topics: obj.topics, topic_bytes: obj.topic_bytes,
    findings: obj.findings.map(x => [x.code, x.location]).sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))) };
}
function compareCase(name, py, fixture, command, flags = []) {
  const node = exec(process.execPath, [CLI, command, fixture, ...flags], fixture);
  const legacy = exec(py.bin, [...py.prefix,
    path.join(scripts, command === 'health' ? 'memory-health.py' : 'memory-read.py'),
    fixture, ...flags], fixture);
  const evidence = { name, node_exit: node.code, legacy_exit: legacy.code,
    node_error: node.error, legacy_error: legacy.error,
    node_stdout_bytes: node.stdout.length, legacy_stdout_bytes: legacy.stdout.length,
    node_stdout_sha256: digest(node.stdout), legacy_stdout_sha256: digest(legacy.stdout) };
  if (node.error || legacy.error)
    return { ...evidence, status: 'FAIL', reason: 'invocation-error' };
  if (node.code !== legacy.code)
    return { ...evidence, status: 'DIFFERENT', reason: 'exit-status' };
  if (command === 'read')
    return { ...evidence, status: node.stdout.equals(legacy.stdout) ? 'MATCH' : 'DIFFERENT',
      reason: node.stdout.equals(legacy.stdout) ? null : 'stdout-bytes' };
  try {
    const a = healthSummary(node.stdout), b = healthSummary(legacy.stdout);
    return { ...evidence, status: JSON.stringify(a) === JSON.stringify(b) ? 'MATCH' : 'DIFFERENT',
      reason: JSON.stringify(a) === JSON.stringify(b) ? null : 'health-semantic-fields' };
  } catch {
    return { ...evidence, status: 'FAIL', reason: 'invalid-health-json' };
  }
}
function main() {
  const py = python();
  if (!py) {
    process.stdout.write(JSON.stringify({status: 'UNVERIFIED',
      reason: 'Python 3.9+ unavailable; legacy baseline required'}) + '\n');
    process.exitCode = 2;
    return;
  }
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-ur4-fixture-'));
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-ur4-evidence-'));
  try {
    checked('git', ['init', '-q'], fixture);
    checked('git', ['config', 'user.name', 'LACC UR4 fixture'], fixture);
    checked('git', ['config', 'user.email', 'fixture@example.test'], fixture);
    checked('git', ['config', 'commit.gpgsign', 'false'], fixture);
    checked('git', ['config', 'core.hooksPath', path.join(fixture, '.no-hooks')], fixture);
    fs.mkdirSync(path.join(fixture, 'src'));
    fs.writeFileSync(path.join(fixture, 'src/tenant.ts'), 'export const isolated = true;\n');
    checked('git', ['add', 'src/tenant.ts'], fixture);
    checked('git', ['commit', '-qm', 'UR4 fixture'], fixture);
    const commit = checked('git', ['rev-parse', 'HEAD'], fixture);
    const q = String.fromCharCode(96);
    fs.mkdirSync(path.join(fixture, 'memory/topics'), {recursive:true});
    fs.writeFileSync(path.join(fixture, 'memory/ACTIVE_STATE.md'),
      '# State\n- **Last Synced Commit**: ' + q + commit + q + '\n');
    fs.writeFileSync(path.join(fixture, 'memory/MEMORY_INDEX.md'), '# Index\n');
    fs.writeFileSync(path.join(fixture, 'memory/topics/architecture.md'),
      '# Architecture\n- Enforce tenant isolation | source: ' + q +
      'src/tenant.ts' + q + ' | verified: ' + q + commit + q + '\n');
    const cases = [
      compareCase('read-hot', py, fixture, 'read'),
      compareCase('read-topic', py, fixture, 'read', ['--topic','architecture.md']),
      compareCase('health-clean', py, fixture, 'health', ['--json']),
    ];
    fs.writeFileSync(path.join(fixture, 'src/tenant.ts'), 'export const isolated = false;\n');
    cases.push(compareCase('health-dirty', py, fixture, 'health', ['--json']));
    const status = cases.every(c => c.status === 'MATCH') ? 'MATCH' : 'NOT_PARITY';
    const report = { schema: 1, scope: 'isolated Python vs Node comparison only',
      platform: process.platform, node: process.version, python: py.bin,
      status, cases, release_eligible: false,
      limitations: ['No Bash wrappers exercised', 'Partial command coverage only',
        'One host does not prove native multi-OS parity'] };
    fs.writeFileSync(path.join(reportDir, 'report.json'),
      JSON.stringify(report,null,2)+'\n', {mode:0o600});
    process.stdout.write(JSON.stringify({status,
      cases:cases.map(({name,status,reason})=>({name,status,reason})),
      report_dir:reportDir,release_eligible:false},null,2)+'\n');
    if(status !== 'MATCH') process.exitCode=1;
  } catch(error) {
    process.stderr.write('UR-4 baseline could not run: '+error.message+'\n');
    process.exitCode=2;
  } finally { fs.rmSync(fixture,{recursive:true,force:true}); }
}
main();
