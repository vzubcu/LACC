import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Optional local cross-runtime contract checks. These tests are not part of
// the installed skill and never install Python, Git, or any external package.
const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, '../skills/lean-context-memory/scripts');
const nodeCli = path.join(scripts, 'lacc.mjs');
const timeout = 30000;

function call(bin, args, cwd, env = process.env) {
  const run = spawnSync(bin, args, {
    cwd, env: { ...env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
    encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024,
  });
  if (run.error) throw Error(bin + ' ' + args.join(' ') + ': ' + run.error.message);
  return run;
}
function invoke(bin, args, cwd, expected = 0) {
  const r = call(bin, args, cwd);
  assert.equal(r.status, expected, [bin, ...args].join(' ') + '\n' + r.stderr + r.stdout);
  return r;
}
function git(cwd, ...args) { return invoke('git', args, cwd).stdout.trim(); }
function locatePython() {
  const candidates = process.env.LACC_PYTHON
    ? [[process.env.LACC_PYTHON, []]]
    : process.platform === 'win32'
      ? [['python', []], ['py', ['-3']]]
      : [['python3', []], ['python', []]];
  for (const [bin, prefix] of candidates) {
    const probe = spawnSync(bin, [...prefix, '-c',
      'import sys; print(int(sys.version_info >= (3, 9)))'], {
      encoding: 'utf8', windowsHide: true, timeout: 3000,
    });
    if (!probe.error && probe.status === 0 && probe.stdout.trim() === '1')
      return { bin, prefix };
  }
  return null;
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc parity '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.name', 'LACC parity fixture');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.hooksPath', path.join(dir, '.lacc-no-hooks'));
  git(dir, 'config', 'core.fsmonitor', 'false');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/tenant.ts'), 'export const isolation = true;\n');
  git(dir, 'add', 'src/tenant.ts');
  git(dir, 'commit', '-qm', 'checked source');
  const commit = git(dir, 'rev-parse', 'HEAD');
  invoke(process.execPath, [nodeCli, 'init', dir, '--agent', 'codex'], dir);
  const topic = path.join(dir, 'memory/topics/architecture.md');
  const fact = (text, source = 'src/tenant.ts', revision = commit, state = 'confirmed') =>
    '- ' + text + ' | source: ' + String.fromCharCode(96) + source + String.fromCharCode(96) +
    ' | verified: ' + String.fromCharCode(96) + revision + String.fromCharCode(96) +
    ' | state: ' + state + ' | key: auth.tenant.isolation\n';
  fs.writeFileSync(topic, '# Architecture\n' + fact('Tenant isolation is mandatory'));
  return { dir, topic, fact, commit };
}
function jsonCommand(runtime, dir, command, flags = [], expected = 0) {
  const args = runtime.kind === 'node'
    ? [nodeCli, command, dir, ...flags, '--json']
    : [...runtime.prefix,
       path.join(scripts, command === 'search' ? 'memory-search.py' : 'memory-health.py'),
       dir, ...flags, '--json'];
  return JSON.parse(invoke(runtime.bin, args, dir, expected).stdout);
}
function compare(runtime, dir, { found, health, issue }) {
  const n = { kind: 'node', bin: process.execPath };
  for (const subject of [n, runtime]) {
    const search = jsonCommand(subject, dir, 'search', ['--query', 'tenant isolation']);
    assert.equal(search.results.length, found,
      subject.kind + ' should return ' + found + ' trusted facts');
    assert.ok(search.results.every(r => !r.review_required),
      subject.kind + ' returned an untrusted fact without review flag');
    const audit = jsonCommand(subject, dir, 'health', [], health === 'healthy' ? 0 : 1);
    assert.equal(audit.status, health, subject.kind + ' health status diverged');
    if (issue) assert.ok(audit.findings.some(r => r.code === issue),
      subject.kind + ' missing ' + issue + ': ' + JSON.stringify(audit.findings));
  }
}

test('Node and Python agree on the source-trust contract when Python is available', t => {
  const py = locatePython();
  if (!py) { t.skip('Optional CPython 3.9+ unavailable; Node-only tests remain required'); return; }
  const runtime = { ...py, kind: 'python' };

  // Same files, revisions and uncommitted/staged changes for both runtimes.
  const healthy = fixture(t);
  compare(runtime, healthy.dir, { found: 1, health: 'healthy' });

  const dirty = fixture(t);
  fs.writeFileSync(path.join(dirty.dir, 'src/tenant.ts'), 'changed in worktree\n');
  compare(runtime, dirty.dir, { found: 0, health: 'review', issue: 'changed-source' });

  const stagedOnly = fixture(t);
  const source = path.join(stagedOnly.dir, 'src/tenant.ts');
  fs.writeFileSync(source, 'changed in index\n');
  git(stagedOnly.dir, 'add', 'src/tenant.ts');
  fs.writeFileSync(source, 'export const isolation = true;\n');
  compare(runtime, stagedOnly.dir, { found: 0, health: 'review', issue: 'changed-source' });

  const hidden = fixture(t);
  const hiddenSource = path.join(hidden.dir, 'src/tenant.ts');
  git(hidden.dir, 'update-index', '--assume-unchanged', 'src/tenant.ts');
  try {
    fs.writeFileSync(hiddenSource, 'hidden worktree change\n');
    compare(runtime, hidden.dir, { found: 0, health: 'review', issue: 'changed-source' });
  } finally {
    git(hidden.dir, 'update-index', '--no-assume-unchanged', 'src/tenant.ts');
  }

  const missing = fixture(t);
  fs.unlinkSync(path.join(missing.dir, 'src/tenant.ts'));
  compare(runtime, missing.dir, { found: 0, health: 'review', issue: 'missing-source' });

  const unavailable = fixture(t);
  fs.writeFileSync(unavailable.topic, '# Architecture\n' +
    unavailable.fact('Tenant isolation is mandatory', 'src/tenant.ts', 'deadbeef'));
  compare(runtime, unavailable.dir, { found: 0, health: 'review', issue: 'unavailable-commit' });

  const review = fixture(t);
  fs.writeFileSync(review.topic, '# Architecture\n' +
    review.fact('Tenant isolation is mandatory', 'src/tenant.ts', review.commit, 'review'));
  compare(runtime, review.dir, { found: 0, health: 'review', issue: 'pending-review' });

  const conflict = fixture(t);
  fs.appendFileSync(conflict.topic, conflict.fact('Tenant isolation can be disabled'));
  compare(runtime, conflict.dir, { found: 0, health: 'review', issue: 'potential-conflict' });
  for (const subject of [{ kind: 'node', bin: process.execPath }, runtime]) {
    const flagged = jsonCommand(subject, conflict.dir, 'search',
      ['--query', 'tenant isolation', '--include-review']);
    assert.equal(flagged.results.length, 2);
    assert.ok(flagged.results.every(row => row.review_required && row.potential_conflict));
  }

  const invalid = fixture(t);
  fs.writeFileSync(invalid.topic, '# Architecture\n- Tenant isolation has no provenance\n');
  compare(runtime, invalid.dir, { found: 0, health: 'review' });

  const bounded = fixture(t);
  fs.appendFileSync(path.join(bounded.dir, 'memory/ACTIVE_STATE.md'), '\nRésumé 🔒'.repeat(250));
  for (const subject of [{ kind: 'node', bin: process.execPath }, runtime]) {
    const bin = subject.bin;
    const args = subject.kind === 'node'
      ? [nodeCli, 'read', bounded.dir, '--max-bytes', '512']
      : [...runtime.prefix, path.join(scripts, 'memory-read.py'),
         bounded.dir, '--max-bytes', '512'];
    const result = invoke(bin, args, bounded.dir);
    assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= 512,
      subject.kind + ' exceeded UTF-8 read budget');
  }
});
