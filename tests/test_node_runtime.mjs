import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'lean-context-memory');
const cli = path.join(rootPath, 'scripts/lacc.mjs');
const exec = (bin, args, cwd, env) => spawnSync(bin, args, { cwd, env, encoding: 'utf8', windowsHide: true });
const git = (cwd, ...args) => { const r = exec('git', args, cwd); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
const run = (cwd, ...args) => exec(process.execPath, [cli, args[0], cwd, ...args.slice(1)], cwd);
const record = (cwd, text, source = 'src/tenant.ts', commit = git(cwd, 'rev-parse', 'HEAD')) =>
  `- ${text} | source: \`${source}\` | verified: \`${commit}\` | key: auth.tenant.isolation\n`;
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc node '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-q'); git(dir, 'config', 'user.email', 'fixture@example.test'); git(dir, 'config', 'user.name', 'Fixture');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src/tenant.ts'), 'export const isolated = true;\n');
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'initial');
  const initial = run(dir, 'init', '--agent', 'claude'); assert.equal(initial.status, 0, initial.stderr);
  fs.writeFileSync(path.join(dir, 'memory/topics/architecture.md'), '# Architecture\n' + record(dir, 'Tenant isolation is mandatory'));
  return dir;
}
test('Node works without python and bash on the PATH, with Git available', t => {
  const dir = fixture(t);
  const toolsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc bins '));
  t.after(() => fs.rmSync(toolsDir, { recursive: true, force: true }));
  if (process.platform === 'win32') { t.skip('Windows executable shims use .exe extension'); return; }
  const bin = exec('which', ['git'], dir).stdout.trim();
  fs.symlinkSync(bin, path.join(toolsDir, 'git'));
  const env = { ...process.env, PATH: toolsDir };
  const res = exec(process.execPath, [cli, 'search', dir, '--query', 'tenant isolation', '--json'], dir, env);
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout).results.length, 1);
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
  try {fs.symlinkSync(target,path.join(dir,'memory/topics/link.md'));}
  catch { t.skip('symlinks unavailable'); return; }
  const result=run(dir,'search','--query','tenant isolation','--json');assert.equal(result.status,2);assert.match(result.stderr,/symlink/);
});
