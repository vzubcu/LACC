import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');

function execute(cwd, bin, args) {
  const r = spawnSync(bin, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  assert.equal(r.error, undefined, r.error?.message);
  return r;
}
function git(dir, ...args) {
  const r = execute(dir, 'git', args);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function node(dir, ...args) {
  return execute(dir, process.execPath, [cli, ...args]);
}
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc ml1 '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'LACC');
  git(root, 'config', 'user.email', 'fixture@example.test');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', path.join(root, 'no-hooks'));
  git(root, 'config', 'core.fsmonitor', 'false');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/service.ts'), 'export const enabled = true;\n');
  git(root, 'add', 'src/service.ts');
  git(root, 'commit', '-qm', 'fixture baseline');
  const head = git(root, 'rev-parse', 'HEAD');
  const init = node(root, 'init', '.', '--agent', 'claude');
  assert.equal(init.status, 0, init.stderr);
  return { root, head };
}
function populate(root, head) {
  const fact = '- Service enabled | source: ' +
    '`src/service.ts` | verified: `' + head + '`\n';
  fs.writeFileSync(path.join(root, 'memory/topics/architecture.md'), '# Architecture\n' + fact);
  fs.writeFileSync(path.join(root, 'memory/topics/gotchas.md'), '# Gotchas\n' + fact);
  const state = path.join(root, 'memory/ACTIVE_STATE.md');
  const original = fs.readFileSync(state, 'utf8');
  const updated = original
    .replace('- [ ] Populate and verify memory; do not stamp supplied or unverified hashes.',
      '- [ ] Verify tests for the changed service.')
    .replace('[Task-local uncertainties only; do not promote guesses into durable topics.]',
      '- Private diagnostic phrase must not appear in the report.');
  fs.writeFileSync(state, updated);
  assert.equal(node(root, 'sync', '.', '--stamp').status, 0);
}
test('ML-1 Claude bridge is idempotent and retains user instructions', t => {
  const { root } = setup(t);
  const agents = path.join(root, 'AGENTS.md');
  const claude = path.join(root, 'CLAUDE.md');
  assert.match(fs.readFileSync(agents, 'utf8'), /At task end, run task-end-review/);
  assert.match(fs.readFileSync(claude, 'utf8'), /@AGENTS.md/);
  fs.appendFileSync(agents, '\nKeep original team instructions.\n');
  const second = node(root, 'init', '.', '--agent', 'claude');
  assert.equal(second.status, 0, second.stderr);
  const text = fs.readFileSync(agents, 'utf8');
  assert.match(text, /Keep original team instructions/);
  assert.equal(text.split('At task end, run task-end-review').length - 1, 1);
});
test('ML-1 inventory is read-only, bounded, and never certifies semantic review', t => {
  const { root, head } = setup(t);
  populate(root, head);
  const files = [
    'memory/ACTIVE_STATE.md', 'memory/topics/architecture.md',
    'memory/topics/gotchas.md', 'AGENTS.md', 'CLAUDE.md',
  ];
  const before = files.map(name => fs.readFileSync(path.join(root, name)));
  const status = git(root, 'status', '--porcelain=v1');
  const result = node(root, 'task-end-review', '.', '--json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema, 'lacc.task-end-review.v1');
  assert.equal(report.status, 'agent-review-required');
  assert.equal(report.agent_reconciliation_required, true);
  assert.equal(report.automatic_fact_promotion, false);
  assert.equal(report.memory_mutated, false);
  assert.equal(report.head, head);
  assert.equal(report.freshness.status, 'healthy');
  assert.equal(report.hot.hypotheses_count, 1);
  assert.equal(report.hot.pending_checks_count, 1);
  assert.equal(report.exact_duplicates.groups, 1);
  assert.doesNotMatch(result.stdout, /Private diagnostic phrase/);
  assert.match(result.stdout, /If the user forbids file edits/);
  assert.deepEqual(files.map(name => fs.readFileSync(path.join(root, name))), before);
  assert.equal(git(root, 'status', '--porcelain=v1'), status);
});
test('ML-1 emits evidence-review-required for changed cited source, without writes', t => {
  const { root, head } = setup(t);
  populate(root, head);
  fs.writeFileSync(path.join(root, 'src/service.ts'), 'export const enabled = false;\n');
  const before = fs.readFileSync(path.join(root, 'memory/topics/architecture.md'));
  const result = node(root, 'task-end-review', '.', '--json');
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'evidence-review-required');
  assert.ok(report.freshness.findings > 0);
  assert.equal(report.memory_mutated, false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'memory/topics/architecture.md')), before);
});
test('ML-1 preserves UNSYNCED checkpoint and explicitly warns before first review', t => {
  const { root } = setup(t);
  const result = node(root, 'task-end-review', '.', '--json');
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'evidence-review-required');
  assert.equal(report.freshness.status, 'review');
  assert.equal(report.automatic_fact_promotion, false);
  assert.match(fs.readFileSync(path.join(root, 'memory/ACTIVE_STATE.md'), 'utf8'), /UNSYNCED/);
});
test('ML-1 refuses unsafe HOT content without echoing it', t => {
  const { root } = setup(t);
  const state = path.join(root, 'memory/ACTIVE_STATE.md');
  fs.writeFileSync(state, '# Active State\nPRIVATE_SECRET\n' + 'x'.repeat(2049));
  const result = node(root, 'task-end-review', '.', '--json');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /safe HOT byte limit/);
  assert.doesNotMatch(result.stderr + result.stdout, /PRIVATE_SECRET/);
});
