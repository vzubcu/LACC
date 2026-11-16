import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'lean-context-memory');
const cli = path.join(rootPath, 'scripts/lacc.mjs');
const exec = (bin, args, cwd, env) => {
  const timeout = bin === process.execPath ? 30000 : 15000;
  if (process.env.LACC_TEST_DEBUG === '1') {
    console.error('[LACC TEST] start', bin, args.join(' '));
  }
  const result = spawnSync(bin, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024,
    env: { ...(env ?? process.env), GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  if (process.env.LACC_TEST_DEBUG === '1') {
    console.error('[LACC TEST] end', bin,
      'status=' + result.status, 'signal=' + result.signal, 'error=' + (result.error?.message ?? 'none'));
  }
  if (result.error) {
    throw new Error('Subprocess failed: ' + bin + ' ' + args.join(' ') +
      '; ' + result.error.message + '; timeout=' + timeout + 'ms' +
      '; stderr=' + (result.stderr ?? ''));
  }
  return result;
};
const git = (cwd, ...args) => { const r = exec('git', args, cwd); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const run = (cwd, ...args) => exec(process.execPath, [cli, args[0], cwd, ...args.slice(1)], cwd);
const record = (cwd, text, source = 'src/tenant.ts', commit = git(cwd, 'rev-parse', 'HEAD')) =>
  `- ${text} | source: \`${source}\` | verified: \`${commit}\` | key: auth.tenant.isolation\n`;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc node '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'fixture@example.test');
  git(dir, 'config', 'user.name', 'Fixture');
  // Ignore host-level signing, hooks and filesystem monitor settings in fixtures.
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'core.hooksPath', path.join(dir, '.lacc-no-hooks'));
  git(dir, 'config', 'core.fsmonitor', 'false');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/tenant.ts'), 'export const isolated = true;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'initial');
  const initial = run(dir, 'init', '--agent', 'claude'); assert.equal(initial.status, 0, initial.stderr);
  fs.writeFileSync(path.join(dir, 'memory/topics/architecture.md'), '# Architecture\n' + record(dir, 'Tenant isolation is mandatory'));
  return dir;
}
test('Node works with Git but no Python or Bash on PATH (including Windows)', t => {
  const dir = fixture(t);
  let isolatedBin;
  if (process.platform === 'win32') {
    // Use the installed Windows git.exe itself. Do not create a symlink requiring
    // Windows Developer Mode or administrator rights.
    const located = exec('where.exe', ['git.exe'], dir);
    assert.equal(located.status, 0, 'Git for Windows must be discoverable: ' + located.stderr);
    const candidates = located.stdout.split(/\r?\n/).map(s => s.trim())
      .filter(s => s.toLowerCase().endsWith('git.exe') && fs.existsSync(s));
    assert.ok(candidates.length, 'No real git.exe returned by where.exe');
    // Prefer Git\cmd: it is the supported Windows command-line entry point.
    candidates.sort((a, b) =>
      Number(/[/\\]cmd[/\\]git\.exe$/i.test(b)) - Number(/[/\\]cmd[/\\]git\.exe$/i.test(a)));
    let found = false;
    for (const candidate of candidates) {
      const bin = path.dirname(candidate);
      const clean = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
      clean.Path = bin;
      // Probe candidates directly: a broken shim must not prevent trying
      // another installed git.exe from the Windows PATH.
      const probe = spawnSync('git', ['--version'], {
        cwd: dir, env: clean, encoding: 'utf8', windowsHide: true, timeout: 15000,
      });
      if (!probe.error && probe.status === 0 && /^git version /i.test(probe.stdout.trim())) {
        isolatedBin = bin;
        found = true;
        break;
      }
    }
    assert.ok(found, 'git.exe could not run with only its own directory on PATH');
  } else {
    // Preserve the Linux/macOS test: only a real Git binary is exposed on PATH.
    const toolsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc bins '));
    t.after(() => fs.rmSync(toolsDir, { recursive: true, force: true }));
    const found = exec('which', ['git'], dir);
    assert.equal(found.status, 0, found.stderr);
    fs.symlinkSync(found.stdout.trim(), path.join(toolsDir, 'git'));
    isolatedBin = toolsDir;
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  env[process.platform === 'win32' ? 'Path' : 'PATH'] = isolatedBin;
  const probe = exec(process.execPath, [cli, 'capabilities'], dir, env);
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(JSON.parse(probe.stdout).strict_git_evidence, true);
  const res = exec(process.execPath, [cli, 'search', dir, '--query', 'tenant isolation', '--json'], dir, env);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout).results.length, 1);
});
test('Node fails closed when Git cannot be launched from PATH', t => {
  const dir = fixture(t);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-no-git '));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path'));
  env[process.platform === 'win32' ? 'Path' : 'PATH'] = empty;
  const search = exec(process.execPath,
    [cli, 'search', dir, '--query', 'tenant isolation', '--json'], dir, env);
  assert.equal(search.status, 0, search.stderr);
  const payload = JSON.parse(search.stdout);
  assert.equal(payload.results.length, 0);
  assert.ok(payload.stats.skipped_untrusted >= 1);

  const health = exec(process.execPath, [cli, 'health', dir, '--json'], dir, env);
  assert.equal(health.status, 1, health.stderr);
  const audit = JSON.parse(health.stdout);
  assert.ok(audit.findings.some(row => row.code === 'unavailable-commit'),
    'Missing Git cannot produce a healthy provenance check');
});

test('init, idempotence, read and discovered modules', t => {
  const dir = fixture(t), before = fs.readFileSync(path.join(dir,'memory/topics/architecture.md'));
  assert.match(fs.readFileSync(path.join(dir,'CLAUDE.md'),'utf8'), /@AGENTS.md/);
  assert.equal(run(dir,'init','--agent','claude').status,0);
  assert.deepEqual(fs.readFileSync(path.join(dir,'memory/topics/architecture.md')),before);
  const read=run(dir,'read','--max-bytes','512'); assert.equal(read.status,0,read.stderr);
  assert.ok(Buffer.byteLength(read.stdout) <=512);
});
test('healthy fact, changed worktree, index-only change, and assume-unchanged', t => {
  const dir=fixture(t);
  const ok=JSON.parse(run(dir,'health','--json').stdout); assert.equal(ok.status,'healthy');
  let found=JSON.parse(run(dir,'search','--query','tenant isolation','--json').stdout);assert.equal(found.results.length,1);
  fs.writeFileSync(path.join(dir,'src/tenant.ts'),'changed\n');
  found=JSON.parse(run(dir,'search','--query','tenant isolation','--json').stdout);assert.equal(found.results.length,0);
  let checked=JSON.parse(run(dir,'doctor','--json').stdout);assert.equal(checked.counts['changed-source'],1);
  fs.writeFileSync(path.join(dir,'src/tenant.ts'),'export const isolated = true;\n');
  git(dir,'update-index','--assume-unchanged','src/tenant.ts');
  try {fs.writeFileSync(path.join(dir,'src/tenant.ts'),'changed\n');assert.equal(JSON.parse(run(dir,'search','--query','tenant isolation','--json').stdout).results.length,0);}
  finally {git(dir,'update-index','--no-assume-unchanged','src/tenant.ts');}
  fs.writeFileSync(path.join(dir,'src/tenant.ts'),'staged\n');git(dir,'add','src/tenant.ts');
  fs.writeFileSync(path.join(dir,'src/tenant.ts'),'export const isolated = true;\n');
  assert.equal(JSON.parse(run(dir,'search','--query','tenant isolation','--json').stdout).results.length,0);
});
test('conflicting keyed facts require review and never self-heal', t => {
  const dir=fixture(t);
  const file=path.join(dir,'memory/topics/architecture.md');
  fs.appendFileSync(file,record(dir,'Tenant isolation may be disabled'));
  const doctor=JSON.parse(run(dir,'doctor','--json').stdout);
  assert.equal(doctor.counts['potential-conflict'],1);
  const search=JSON.parse(run(dir,'search','--query','tenant isolation','--json').stdout);
  assert.equal(search.results.length,0);
  const review=JSON.parse(run(dir,'search','--query','tenant isolation','--include-review','--json').stdout);
  assert.equal(review.results.length,2);
  assert.ok(review.results.every(x=>x.review_required));
});
test('sync stamps UNSYNCED only if working tree is clean and health passes', t=> {
 const dir=fixture(t);
 assert.equal(run(dir,'sync','--strict').status,1);
 const stamp=run(dir,'sync','--stamp'); assert.equal(stamp.status,0,stamp.stderr);
 assert.match(fs.readFileSync(path.join(dir,'memory/ACTIVE_STATE.md'),'utf8'),/[a-f0-9]{40}/);
 fs.writeFileSync(path.join(dir,'src/tenant.ts'),'changed\n');
 assert.equal(run(dir,'sync','--stamp').status,1);
});
test('unsafe topic symlinks fail and do not expose content', t => {
  const dir=fixture(t), target=path.join(dir,'untrusted.md');
  fs.writeFileSync(target,'private secret');
  try {
    fs.symlinkSync(target, path.join(dir, 'memory/topics/link.md'), 'file');
  } catch (error) {
    if (process.platform !== 'win32' ||
        !['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(error.code)) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code))
        return t.skip('file symlink unavailable');
      throw error;
    }
    const external = path.join(dir, 'untrusted-dir');
    fs.mkdirSync(external);
    fs.writeFileSync(path.join(external, 'secret.md'), 'private secret');
    try {
      fs.symlinkSync(external, path.join(dir, 'memory/topics/linked-dir'),
        'junction');
    } catch (junctionError) {
      if (['EPERM', 'EACCES', 'ENOTSUP', 'EINVAL'].includes(junctionError.code))
        return t.skip('Windows symlink and junction unavailable');
      throw junctionError;
    }
  }
  const result = run(dir, 'search', '--query', 'tenant isolation', '--json');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /symlink/);
  assert.doesNotMatch(result.stdout + result.stderr, /private secret/);
});
