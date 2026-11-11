import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { disclosureContract, disclosureGuidance, DISCLOSURE_AGENT_RULES } from
  '../skills/lean-context-memory/scripts/lacc-disclosure.mjs';
import { normalizeMemoryFindings } from
  '../skills/lean-context-memory/scripts/lacc-findings.mjs';
import { emitLimited } from '../skills/lean-context-memory/scripts/lacc-core.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');

function execute(program, args, cwd) {
  const res = spawnSync(program, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  if (res.error) throw res.error;
  return res;
}
function git(cwd, ...args) {
  const out = execute('git', args, cwd);
  assert.equal(out.status, 0, out.stderr);
  return out.stdout.trim();
}
function cliRun(root, command, ...args) {
  const out = execute(process.execPath, [cli, command, root, ...args], root);
  return { ...out, data: out.status === 2 ? null : JSON.parse(out.stdout) };
}
function tmp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc disclosure bridge '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test('host-neutral CR-3 contract lists explicit bridges without claiming delivery', () => {
  const contract = disclosureContract();
  assert.equal(contract.schema, 1);
  assert.equal(contract.status, 'guidance-only');
  assert.equal(contract.user_delivery, 'not-observed');
  assert.equal(contract.verified_delivery, false);
  assert.equal(contract.no_automatic_notification, true);
  assert.equal(contract.no_host_event_tracking, true);
  assert.deepEqual(contract.supported_instruction_bridges.map(x => x.host),
    ['codex', 'claude', 'gemini', 'roo']);
  assert.ok(contract.supported_instruction_bridges.every(x =>
    x.delivery_confirmation === 'not-integrated'));
});
test('findings have actionable guidance without pretending user saw warnings', () => {
  const report = normalizeMemoryFindings([
    { code: 'changed-source', location: 'memory/topics/auth.md:2', source: 'src/auth.ts' },
    { code: 'potential-conflict', location: 'memory/topics/auth.md:2' },
  ]);
  assert.equal(report.notification, 'agent-output-only');
  assert.equal(report.disclosure_protocol.status, 'agent-guidance-only');
  assert.equal(report.disclosure_protocol.user_delivery, 'not-observed');
  assert.equal(report.disclosure_protocol.delivery_confirmed, false);
  assert.equal(report.disclosure_protocol.candidates_before_output_budget, 2);
  assert.equal(report.disclosure_protocol.relevance, 'agent-must-evaluate-current-task');
  assert.ok(report.disclosure_protocol.instruction.includes('relevant findings'));
  assert.ok(report.diagnostics.every(x => x.disclosure === 'reported-to-agent-only'));
});
test('no emitted findings never means repository globally clean or that user was notified', () => {
  const value = disclosureGuidance([], { truncated: true });
  assert.equal(value.candidates_before_output_budget, 0);
  assert.equal(value.candidates_incomplete, true);
  assert.equal(value.user_delivery, 'not-observed');
  assert.match(value.instruction, /does not prove a complete scan/);
});
test('low output budgets preserve truthful non-delivery state', () => {
  const report = normalizeMemoryFindings([]);
  const bounded = JSON.parse(emitLimited(report, 512));
  assert.equal(bounded.disclosure_protocol.user_delivery, 'not-observed');
  assert.equal(bounded.disclosure_protocol.delivery_confirmed, false);
  assert.equal(bounded.disclosure_protocol.details_truncated, true);
  assert.equal(bounded.output_truncated, true);
});

test('disclosure contract CLI introspection has no project or external service dependency', t => {
  const root = tmp(t);
  const result = cliRun(root, 'disclosure-contract');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.data.schema, 1);
  assert.equal(result.data.supported_instruction_bridges.length, 4);
  assert.equal(result.data.verified_delivery, false);
});
test('init creates and updates shared and native host disclosure instructions idempotently', t => {
  const root = tmp(t);
  const own = '# Team instructions\n\nProject rules remain intact.\n';
  fs.writeFileSync(path.join(root, 'AGENTS.md'), own);
  const first = cliRun(root, 'init', '--agent', 'all');
  assert.equal(first.status, 0, first.stderr);
  const paths = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md',
    '.roo/rules/lean-context-memory.md'];
  const snapshots = new Map(paths.map(x => [x,
    fs.readFileSync(path.join(root, x), 'utf8')]));
  const agents = snapshots.get('AGENTS.md');
  assert.ok(agents.startsWith(own.trim()));
  for (const rule of DISCLOSURE_AGENT_RULES)
    assert.ok(agents.includes(rule));
  assert.match(agents, /before relying on materially affected memory/i);
  assert.match(agents, /cannot|Do not say a user was notified/i);
  assert.match(snapshots.get('CLAUDE.md'), /@AGENTS\.md/);
  assert.match(snapshots.get('CLAUDE.md'), /CR-3 disclosure rules/);
  assert.match(snapshots.get('GEMINI.md'), /AGENTS\.md CR-3/);
  assert.match(snapshots.get('.roo/rules/lean-context-memory.md'), /AGENTS\.md CR-3/);
  const second = cliRun(root, 'init', '--agent', 'all');
  assert.equal(second.status, 0, second.stderr);
  for (const [file, before] of snapshots)
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), before);
  assert.equal((agents.match(/LEAN-CONTEXT-MEMORY:START/g) ?? []).length, 1);
});
test('normal CLI search remains unchanged unless --explain is requested', t => {
  const root = tmp(t);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.test');
  git(root, 'config', 'commit.gpgsign', 'false');
  git(root, 'config', 'core.hooksPath', path.join(root, '.no-hooks'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/auth.ts'), 'export const allowed = true;\n');
  git(root, 'add', 'src');
  git(root, 'commit', '-qm', 'baseline');
  const baseline = git(root, 'rev-parse', 'HEAD');
  assert.equal(cliRun(root, 'init', '--agent', 'codex').status, 0);
  const q = String.fromCharCode(96);
  const memory = path.join(root, 'memory/topics/architecture.md');
  fs.writeFileSync(memory,
    '# Architecture\n- Login policy requires source check | source: ' + q +
    'src/auth.ts' + q + ' | verified: ' + q + baseline + q +
    ' | key: login.policy\n');
  const untouched = fs.readFileSync(memory);
  fs.writeFileSync(path.join(root, 'src/auth.ts'), 'export const allowed = false;\n');
  const old = cliRun(root, 'search', '--query', 'login policy', '--json');
  assert.equal(old.status, 0, old.stderr);
  assert.equal(Object.hasOwn(old.data, 'disclosure_protocol'), false);
  assert.equal(old.data.results.length, 0);
  const explained = cliRun(root, 'search', '--query', 'login policy',
    '--json', '--explain');
  assert.equal(explained.status, 0, explained.stderr);
  assert.ok(explained.data.diagnostics.some(x => x.kind === 'source-drift'));
  assert.equal(explained.data.disclosure_protocol.user_delivery, 'not-observed');
  assert.equal(explained.data.disclosure_protocol.delivery_confirmed, false);
  assert.equal(explained.data.results.length, 0);
  assert.deepEqual(fs.readFileSync(memory), untouched);
});
