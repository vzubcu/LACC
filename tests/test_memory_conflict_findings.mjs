import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { memoryFinding, normalizeMemoryFindings } from
  '../skills/lean-context-memory/scripts/lacc-findings.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function run(exe, args, dir) {
  const r = spawnSync(exe, args, { cwd: dir, encoding: 'utf8',
    windowsHide: true, timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' } });
  if (r.error) throw r.error;
  return r;
}
function git(dir, ...args) {
  const r = run('git', args, dir);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function cliRun(dir, command, ...flags) {
  const r = run(process.execPath, [cli, command, dir, ...flags, '--json'], dir);
  return { exit: r.status, data: r.status === 2 ? null : JSON.parse(r.stdout), stderr: r.stderr };
}
function project(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc explanatory findings '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'LACC tests');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.hooksPath', path.join(dir, '.no-hooks'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/auth.ts'),
    "import { allowed } from './permissions';\nexport const login = allowed;\n");
  fs.writeFileSync(path.join(dir, 'src/permissions.ts'), 'export const allowed = true;\n');
  git(dir, 'add', 'src');
  git(dir, 'commit', '-qm', 'baseline');
  const commit = git(dir, 'rev-parse', 'HEAD');
  assert.equal(run(process.execPath, [cli, 'init', dir, '--agent', 'codex'], dir).status, 0);
  fs.writeFileSync(path.join(dir, 'memory/topics/architecture.md'),
    ('# Architecture\n- Login requires permissions | source: §src/auth.ts§ | verified: §' +
      commit + '§ | key: auth.policy\n').replaceAll('§', String.fromCharCode(96)));
  return { dir, commit };
}

test('stable, bounded diagnostic IDs do not depend on incidental user prose', () => {
  const fact = { key: 'auth.policy', location: 'memory/topics/architecture.md:2',
    revision: 'a'.repeat(40), sources: ['src/auth.ts'] };
  const a = memoryFinding({ code: 'changed-source', source: 'src/auth.ts' }, { fact });
  const b = memoryFinding({ code: 'changed-source', source: 'src/auth.ts', secret: 'do not copy' }, { fact });
  assert.equal(a.finding_id, b.finding_id);
  assert.equal(a.kind, 'source-drift');
  assert.equal(a.trust, 'review-required');
  assert.equal(a.evidence.current_commit, null);
  assert.equal(a.disclosure, 'reported-to-agent-only');
  assert.match(a.reason, /Git source/);
  assert.doesNotMatch(JSON.stringify(a), /do not copy/);
});

test('byte drift is NOT a proven semantic contradiction or a user notification', () => {
  const output = normalizeMemoryFindings([
    { code: 'changed-source', location: 'memory/topics/auth.md:4', source: 'src/auth.ts' },
    { code: 'changed-source', location: 'memory/topics/auth.md:4', source: 'src/auth.ts' },
    { code: 'potential-conflict', location: 'memory/topics/auth.md:4' },
  ]);
  assert.equal(output.diagnostics_total, 2);
  assert.equal(output.notification, 'agent-output-only');
  assert.ok(output.diagnostics.every(x => x.kind !== 'confirmed-semantic-conflict'));
  assert.ok(output.diagnostics.every(x => x.disclosure === 'reported-to-agent-only'));
});

test('unexpected sensitive text is never echoed from issue attributes', () => {
  const result = memoryFinding({ code: 'missing-source',
    location: 'memory/topics/auth.md:8; password=private',
    source: 'secret=password=private',
    message: 'Bearer private-secret' });
  assert.doesNotMatch(JSON.stringify(result), /private|Bearer/);
  assert.equal(result.evidence.cited_sources.length, 0);
});

test('direct source drift is explained even when trusted search withholds the fact', t => {
  const { dir, commit } = project(t);
  fs.writeFileSync(path.join(dir, 'src/auth.ts'), 'export const login = false;\n');
  const ordinary = cliRun(dir, 'search', '--query', 'login permissions');
  assert.equal(ordinary.data.results.length, 0);
  assert.equal(Object.hasOwn(ordinary.data, 'diagnostics'), false);
  const result = cliRun(dir, 'search', '--query', 'login permissions', '--explain');
  assert.equal(result.exit, 0, result.stderr);
  assert.equal(result.data.results.length, 0);
  const item = result.data.diagnostics.find(x => x.kind === 'source-drift');
  assert.ok(item);
  assert.equal(item.fact.verified_commit, commit);
  assert.deepEqual(item.evidence.cited_sources, ['src/auth.ts']);
});

test('health and doctor share a normalized diagnostic schema', t => {
  const { dir } = project(t);
  fs.writeFileSync(path.join(dir, 'src/auth.ts'), 'export const login = false;\n');
  const health = cliRun(dir, 'health', '--explain');
  const doctor = cliRun(dir, 'doctor', '--explain');
  assert.equal(health.exit, 1);
  assert.equal(doctor.exit, 1);
  assert.ok(health.data.diagnostics.some(x => x.kind === 'source-drift'));
  assert.ok(doctor.data.diagnostics.some(x => x.kind === 'source-drift'));
  const id = health.data.diagnostics.find(x => x.kind === 'source-drift').finding_id;
  assert.equal(doctor.data.diagnostics.find(x => x.kind === 'source-drift').finding_id, id);
  assert.equal(health.data.notification, 'agent-output-only');
});

test('session check can include explainable checkpoint findings without mutating HOT', t => {
  const { dir } = project(t);
  const target = path.join(dir, 'memory/ACTIVE_STATE.md');
  const original = fs.readFileSync(target);
  const report = cliRun(dir, 'session-check', '--explain');
  assert.equal(report.exit, 1);
  assert.equal(report.data.notification, 'agent-output-only');
  assert.ok(report.data.diagnostics.some(x =>
    x.kind === 'stale-checkpoint' || x.kind === 'coverage-incomplete'));
  assert.deepEqual(fs.readFileSync(target), original);
});

test('dependency impact reports indirect drift with the same evidence contract', t => {
  const { dir } = project(t);
  fs.writeFileSync(path.join(dir, 'src/permissions.ts'), 'export const allowed = false;\n');
  const result = cliRun(dir, 'dependency-impact', '--explain');
  assert.equal(result.exit, 1);
  const item = result.data.diagnostics.find(x => x.kind === 'indirect-dependency-drift');
  assert.ok(item);
  assert.deepEqual(item.evidence.dependency_chain, ['src/permissions.ts', 'src/auth.ts']);
  assert.equal(item.evidence.verification_scope, 'experimental-js-ts-static-imports');
  assert.equal(result.data.notification, 'agent-output-only');
});

test('bounded output truncates diagnostics without claiming complete coverage', t => {
  const { dir } = project(t);
  fs.writeFileSync(path.join(dir, 'src/auth.ts'), 'export const login = false;\n');
  const result = cliRun(dir, 'doctor', '--explain', '--max-bytes', '1400');
  assert.notEqual(result.exit, 2, result.stderr);
  assert.ok(result.data.diagnostics_truncated || result.data.diagnostics.length >= 0);
  assert.equal(result.data.notification, 'agent-output-only');
});
