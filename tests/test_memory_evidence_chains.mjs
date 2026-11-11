import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { explainMemoryEvidence } from
  '../skills/lean-context-memory/scripts/lacc-evidence-chain.mjs';
import { memoryFinding } from
  '../skills/lean-context-memory/scripts/lacc-findings.mjs';

const REV = 'a'.repeat(40), HEAD = 'b'.repeat(40);
const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function step(from, to, { adapter = 'js-ts-static', kind = 'import',
  language = 'typescript', confidence = 'heuristic', revision = REV } = {}) {
  return { from, to, kind, language, adapter, adapter_version: '2',
    confidence, revision, evidence_source: from };
}
const fact = { location: 'memory/topics/architecture.md:2', key: 'auth.policy',
  revision: REV, sources: ['src/auth.ts'] };
function issue() {
  return {
    code: 'dependency-changed', source: 'src/auth.ts',
    dependency: 'src/permissions.ts', reason: 'changed-source',
    chain: ['src/permissions.ts', 'src/auth.ts'],
    evidence_edges: [step('src/auth.ts', 'src/permissions.ts')],
  };
}
function trace(incident = issue()) {
  return memoryFinding(incident, { fact }).evidence.trace;
}
function command(bin, args, root) {
  const r = spawnSync(bin, args, {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never' },
  });
  if (r.error) throw r.error;
  return r;
}
function git(root, ...args) {
  const r = command('git', args, root);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
function run(root, cmd, ...args) {
  const r = command(process.execPath, [cli, cmd, root, ...args, '--json'], root);
  return { status: r.status, stderr: r.stderr,
    data: r.status === 2 ? null : JSON.parse(r.stdout) };
}
function fixture(t, files = {
  'src/auth.ts': "import { allowed } from './permissions';\nexport const login = allowed;\n",
  'src/permissions.ts': 'export const allowed = true;\n',
}, cited = 'src/auth.ts') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc evidence trace '));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  git(root,'init','-q');
  git(root,'config','user.email','test@example.test');
  git(root,'config','user.name','Test');
  git(root,'config','commit.gpgsign','false');
  git(root,'config','core.fsmonitor','false');
  git(root,'config','core.hooksPath',path.join(root,'.no-hooks'));
  for (const [name, content] of Object.entries(files)) {
    const dest=path.join(root,name);
    fs.mkdirSync(path.dirname(dest), { recursive:true });
    fs.writeFileSync(dest,content);
  }
  git(root,'add','-A');
  git(root,'commit','-qm','baseline');
  const commit=git(root,'rev-parse','HEAD');
  const init=command(process.execPath,[cli,'init',root,'--agent','codex'],root);
  assert.equal(init.status,0,init.stderr);
  const q=String.fromCharCode(96);
  fs.writeFileSync(path.join(root,'memory/topics/architecture.md'),
    '# Architecture\n- Login policy requires review | source: '+q+cited+q+
    ' | verified: '+q+commit+q+' | key: auth.policy\n');
  return {root,commit};
}

test('structured evidence for indirect JS/TS drift cites exact inspected edges', () => {
  const report=memoryFinding(issue(),{fact});
  assert.equal(report.kind,'indirect-dependency-drift');
  assert.equal(report.evidence.trace.status,'static-dependency-evidence');
  assert.equal(report.evidence.trace.baseline_commit,REV);
  assert.equal(report.evidence.trace.current_commit,null);
  assert.equal(report.evidence.trace.change_reason,'changed-source');
  assert.deepEqual(report.evidence.trace.hops.map(h => [h.dependency,h.dependent]),
    [['src/permissions.ts','src/auth.ts']]);
  assert.equal(report.evidence.trace.hops[0].adapter,'js-ts-static');
  assert.equal(report.evidence.trace.hops[0].adapter_version,'2');
  assert.equal(report.evidence.trace.hops[0].evidence_source,'src/auth.ts');
  assert.equal(report.evidence.trace.fact_link.memory_location,fact.location);
  assert.match(report.evidence.trace.explanation,/Semantic impact is unverified/);
  assert.equal(report.disclosure,'reported-to-agent-only');
});

test('historical evidence must be consistent with the fact verified revision', () => {
  const tampered=issue();
  tampered.evidence_edges=[step('src/auth.ts','src/permissions.ts',
    {revision:HEAD})];
  const result=trace(tampered);
  assert.equal(result.status,'partial');
  assert.ok(result.limitations.includes('inconsistent-or-unverified-dependency-edge'));
  assert.deepEqual(result.hops,[]);
});

test('forged chain, missing edges or unsafe values never become trusted evidence', () => {
  for(const broken of [
    {...issue(), chain:['src/permissions.ts','src/not-cited.ts']},
    {...issue(), evidence_edges:[]},
    {...issue(), evidence_edges:[{...step('src/auth.ts','src/permissions.ts'),
      adapter:'token=private'}]},
    {...issue(), evidence_edges:[{...step('src/auth.ts','src/permissions.ts'),
      from:'src/other.ts'}]},
    {...issue(), evidence_edges:[{...step('src/auth.ts','src/permissions.ts'),
      evidence_source:'C:/secrets.txt'}]},
  ]) {
    const got=trace(broken);
    assert.equal(got.status,'partial');
    assert.deepEqual(got.hops,[]);
    assert.doesNotMatch(JSON.stringify(got), /token=private|C:\/secrets/);
  }
});
test('static trace supports .NET MSBuild and Python/PHP provenance without pretending semantics', () => {
  for (const [adapter,kind,language] of [
    ['dotnet-static','project-reference','csharp'],
    ['php-static','configuration','php'],
    ['python-static','import','python'],
  ]) {
    const report=memoryFinding({
      ...issue(), evidence_edges:[step('src/auth.ts','src/permissions.ts',{
        adapter,kind,language,
      })],
    },{fact});
    assert.equal(report.evidence.trace.status,'static-dependency-evidence');
    assert.equal(report.evidence.trace.hops[0].relationship,kind);
    assert.equal(report.evidence.trace.hops[0].adapter,adapter);
    assert.equal(report.evidence.trace.semantics,'not-evaluated');
  }
});
test('direct changed cited source produces truthful Git evidence, no dependency hops', () => {
  const result=memoryFinding({
    code:'changed-source', source:'src/auth.ts',
  },{fact});
  assert.equal(result.evidence.trace.status,'direct-git-evidence');
  assert.equal(result.evidence.trace.changed_file,'src/auth.ts');
  assert.deepEqual(result.evidence.trace.hops,[]);
  assert.equal(result.evidence.trace.fact_link.baseline_commit,REV);
  assert.equal(result.evidence.trace.current_commit,null);
});
test('unknown current Git evidence is explicit and never invented', () => {
  const report=memoryFinding({
    ...issue(), reason:'unverified-random-value',
  },{fact});
  assert.equal(report.evidence.trace.status,'partial');
  assert.ok(report.evidence.trace.limitations.includes('git-change-reason-not-confirmed'));
  assert.equal(report.evidence.trace.current_commit,null);
});

test('real CLI reverse impact emits Git revision, per-hop adapter and cited memory link', t => {
  const {root,commit}=fixture(t);
  fs.writeFileSync(path.join(root,'src/permissions.ts'),'export const allowed = false;\n');
  const out=run(root,'dependency-impact','--explain');
  assert.equal(out.status,1,out.stderr);
  const incident=out.data.diagnostics.find(d=>d.kind==='indirect-dependency-drift');
  assert.ok(incident);
  assert.equal(incident.evidence.trace.status,'static-dependency-evidence');
  assert.equal(incident.evidence.trace.baseline_commit,commit);
  assert.equal(incident.evidence.trace.hops[0].baseline_commit,commit);
  assert.equal(incident.evidence.trace.hops[0].adapter,'js-ts-static');
  assert.equal(incident.evidence.trace.fact_link.cited_source,'src/auth.ts');
  assert.equal(out.data.notification,'agent-output-only');
});
test('non-explain impact retains legacy issue shape and does not persist analysis', t => {
  const {root}=fixture(t);
  const memory=path.join(root,'memory/topics/architecture.md');
  const previous=fs.readFileSync(memory);
  fs.writeFileSync(path.join(root,'src/permissions.ts'),'export const allowed = false;\n');
  const old=run(root,'dependency-impact');
  assert.equal(old.status,1,old.stderr);
  assert.equal(Object.hasOwn(old.data,'diagnostics'),false);
  const impacted=old.data.results.find(x=>x.sources.includes('src/auth.ts'));
  assert.ok(impacted.issues.some(x=>x.code==='dependency-changed'));
  assert.ok(impacted.issues.every(x=>!Object.hasOwn(x,'evidence_edges')));
  assert.deepEqual(fs.readFileSync(memory),previous);
});
test('search and session-check reuse evidence only when --deps --explain is enabled', t => {
  const {root}=fixture(t);
  fs.writeFileSync(path.join(root,'src/permissions.ts'),'export const allowed = false;\n');
  const search=run(root,'search','--query','login policy','--deps','--explain');
  assert.equal(search.status,0,search.stderr);
  const item=search.data.diagnostics.find(x=>x.kind==='indirect-dependency-drift');
  assert.ok(item);
  assert.equal(item.evidence.trace.status,'static-dependency-evidence');
  const session=run(root,'session-check','--deps','--explain');
  assert.equal(session.status,1);
  const match=session.data.diagnostics.find(x=>x.kind==='indirect-dependency-drift');
  assert.ok(match);
  assert.equal(match.evidence.trace.hops[0].dependency,'src/permissions.ts');
});
