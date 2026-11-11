import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { groupDisclosureFindings, buildDisclosureSummary, markDisclosureSeen } from
  '../skills/lean-context-memory/scripts/lacc-disclosure-ux.mjs';
import { normalizeMemoryFindings } from
  '../skills/lean-context-memory/scripts/lacc-findings.mjs';

const cli=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
const REV='a'.repeat(40);
function finding(code, location, source, dependency=null) {
  return normalizeMemoryFindings([{
    code, location, source, ...(dependency?{dependency}:{}),
  }]).diagnostics[0];
}
function exec(bin,args,cwd) {
  const r=spawnSync(bin,args,{cwd,encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
  if(r.error)throw r.error;
  return r;
}
function git(root,...args) {
  const r=exec('git',args,root);assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
}
function cliRun(root,command,...args) {
  const r=exec(process.execPath,[cli,command,root,...args],root);
  return {...r,data:r.status===2?null:JSON.parse(r.stdout)};
}
function project(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lacc cr4 ux '));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  git(root,'init','-q');
  git(root,'config','user.email','fixture@example.test');
  git(root,'config','user.name','Fixture');
  git(root,'config','commit.gpgsign','false');
  git(root,'config','core.hooksPath',path.join(root,'.no-hooks'));
  git(root,'config','core.fsmonitor','false');
  fs.mkdirSync(path.join(root,'src'));
  fs.writeFileSync(path.join(root,'src/permissions.ts'),'export const allowed=true;\n');
  git(root,'add','src');
  git(root,'commit','-qm','baseline');
  const sha=git(root,'rev-parse','HEAD');
  const init=cliRun(root,'init','--agent','codex');
  assert.equal(init.status,0,init.stderr);
  const q=String.fromCharCode(96);
  const note=path.join(root,'memory/topics/architecture.md');
  fs.writeFileSync(note,'# Architecture\n- Permissions are active | source: '+q+
    'src/permissions.ts'+q+' | verified: '+q+sha+q+' | key: auth.permissions\n');
  fs.writeFileSync(path.join(root,'src/permissions.ts'),
    'export const allowed=false;\n');
  return {root,sha,note};
}
test('groups duplicate warnings from a common source and does not omit review status',()=>{
  const a=finding('changed-source','memory/topics/auth.md:2','src/auth.ts');
  const b=finding('changed-source','memory/topics/auth.md:4','src/auth.ts');
  const c=finding('dependency-coverage-incomplete','memory/topics/auth.md:2',
    'src/auth.ts');
  const result=groupDisclosureFindings([a,b,c],{task:'task_auth'});
  assert.equal(result.total_findings,3);
  assert.equal(result.total_groups,1);
  assert.equal(result.results[0].findings,3);
  assert.equal(result.results[0].new_findings,3);
  assert.ok(result.results[0].kinds.includes('coverage-incomplete'));
  assert.equal(result.user_delivery,'not-observed');
  assert.equal(result.unresolved_findings,undefined);
});
test('stable priority and IDs, brief and detailed output, secret-free focus',()=>{
  const a=finding('pending-review','memory/topics/other.md:1','src/a.ts');
  const b=finding('changed-source','memory/topics/auth.md:2','src/auth.ts');
  const short=groupDisclosureFindings([a,b],{task:'secure_work'});
  const reversed=groupDisclosureFindings([b,a],{task:'secure_work'});
  assert.deepEqual(short.results.map(x=>x.group_id),
    reversed.results.map(x=>x.group_id));
  assert.equal(short.results[0].kinds[0],'source-drift');
  assert.ok(short.results.every(x=>!Object.hasOwn(x,'details')));
  const detail=groupDisclosureFindings([a,b],{task:'secure_work',detail:true});
  assert.ok(detail.results.some(x=>x.details[0]?.recommended_action));
  assert.equal(detail.mode,'detail');
  assert.equal(detail.user_delivery,'not-observed');
});
test('seen markers remain review-required, are task scoped, and never imply user delivery',()=>{
  const a=finding('changed-source','memory/topics/auth.md:2','src/auth.ts');
  const reader=({task,id,gitHead})=>task==='task_a' && id===a.finding_id &&
    gitHead===REV;
  const seen=groupDisclosureFindings([a],{
    task:'task_a',gitHead:REV,markerReader:reader,
  });
  const newTask=groupDisclosureFindings([a],{
    task:'task_b',gitHead:REV,markerReader:reader,
  });
  assert.equal(seen.status,'review-required');
  assert.equal(seen.seen_markers,1);
  assert.equal(seen.total_findings,1);
  assert.equal(seen.results[0].new_findings,0);
  assert.equal(newTask.new_findings,1);
  assert.equal(seen.user_delivery,'not-observed');
});
test('invalid identifiers, oversized results and unsafe scopes fail closed',()=>{
  const f=finding('changed-source','memory/topics/auth.md:2','src/auth.ts');
  assert.throws(()=>groupDisclosureFindings([f],{task:'../escape'}),/task/);
  assert.throws(()=>groupDisclosureFindings([f],{task:'a',maxGroups:100}),/limit/);
  assert.throws(()=>groupDisclosureFindings(Array(41).fill(f),{task:'a'}),/bounded/);
  assert.throws(()=>groupDisclosureFindings([{...f,finding_id:'attacker'}],{task:'a'}),/finding ID/);
});
test('CLI read-only summary groups findings, then explicit agent-seen marker is private',t=>{
  const {root,sha,note}=project(t);
  const unchanged=fs.readFileSync(note);
  const before=cliRun(root,'disclosure-summary','--task','task-auth','--json');
  assert.equal(before.status,1,before.stderr);
  assert.equal(before.data.user_delivery,'not-observed');
  assert.ok(before.data.total_findings>0);
  const group=before.data.results.find(g=>g.kinds.includes('source-drift'));
  assert.ok(group);
  const id=group.sample_ids[0];
  assert.equal(before.data.new_findings,before.data.total_findings);
  assert.ok(!fs.existsSync(path.join(root,'memory/disclosures')));
  const result=cliRun(root,'disclosure-mark-seen','--task','task-auth',
    '--id',id,'--expect-head',sha,'--json');
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.data.marker,'agent-seen-only');
  assert.equal(result.data.finding_trust,'review-required');
  assert.equal(result.data.suppressed,false);
  assert.equal(result.data.user_delivery,'not-observed');
  const after=cliRun(root,'disclosure-summary','--task','task-auth','--json','--detail');
  assert.equal(after.status,1);
  assert.equal(after.data.seen_markers,1);
  assert.equal(after.data.unresolved_findings,before.data.unresolved_findings);
  assert.equal(after.data.user_delivery,'not-observed');
  assert.equal(after.data.mode,'detail');
  const independent=cliRun(root,'disclosure-summary','--task','other-task','--json');
  assert.equal(independent.status,1);
  assert.equal(independent.data.seen_markers,0);
  assert.deepEqual(fs.readFileSync(note),unchanged);
  assert.equal(git(root,'check-ignore','memory/disclosures/task-auth/'+
    fs.readdirSync(path.join(root,'memory/disclosures/task-auth'))[0])
    .includes('memory/disclosures'),true);
});
test('marker is idempotent and stale Git HEAD is rejected',t=>{
  const {root,sha}=project(t);
  const report=cliRun(root,'disclosure-summary','--task','reviewer','--json');
  const id=report.data.results.find(g=>g.kinds.includes('source-drift')).sample_ids[0];
  const first=cliRun(root,'disclosure-mark-seen','--task','reviewer','--id',id,
    '--expect-head',sha,'--json');
  const twice=cliRun(root,'disclosure-mark-seen','--task','reviewer','--id',id,
    '--expect-head',sha,'--json');
  assert.equal(first.data.status,'created');
  assert.equal(twice.data.status,'existing');
  const wrong=cliRun(root,'disclosure-mark-seen','--task','reviewer',
    '--id',id,'--expect-head','b'.repeat(40),'--json');
  assert.equal(wrong.status,2);
  assert.match(wrong.stderr,/HEAD mismatch/);
  const invalid=cliRun(root,'disclosure-mark-seen','--task','reviewer',
    '--id','f'.repeat(24),'--expect-head',sha,'--json');
  assert.equal(invalid.status,2);
  assert.match(invalid.stderr,/not present/);
});
test('tampered private agent-seen receipt fails closed without erasing review',t=>{
  const {root,sha,note}=project(t);
  const report=cliRun(root,'disclosure-summary','--task','guarded','--json');
  const id=report.data.results.find(g=>g.kinds.includes('source-drift')).sample_ids[0];
  const created=cliRun(root,'disclosure-mark-seen','--task','guarded',
    '--id',id,'--expect-head',sha,'--json');
  assert.equal(created.status,0,created.stderr);
  const folder=path.join(root,'memory/disclosures/guarded');
  const [file]=fs.readdirSync(folder).filter(x=>x.endsWith('.json'));
  const dest=path.join(folder,file);
  const original=fs.readFileSync(note);
  const tampered=JSON.parse(fs.readFileSync(dest,'utf8'));
  tampered.user_delivery='confirmed';
  fs.writeFileSync(dest,JSON.stringify(tampered));
  const unsafe=cliRun(root,'disclosure-summary','--task','guarded','--json');
  assert.equal(unsafe.status,2);
  assert.match(unsafe.stderr,/invalid disclosure agent-seen marker/);
  assert.deepEqual(fs.readFileSync(note),original);
});
test('expired marker is not trusted; future epoch permits new explicit marker',t=>{
  const {root,sha}=project(t);
  const raw=JSON.parse(cliRun(root,'session-check','--explain','--json').stdout);
  const id=raw.diagnostics.find(x=>x.kind==='source-drift')?.finding_id;
  assert.ok(id);
  const now=Date.UTC(2026,10,11);
  const first=JSON.parse(markDisclosureSeen(root,raw,{task:'expiration',id,
    expectedHead:sha,now,maxBytes:4096}));
  assert.equal(first.status,'created');
  const old=JSON.parse(buildDisclosureSummary(root,raw,{task:'expiration',now:now+1000}));
  assert.equal(old.seen_markers,1);
  const later=now+8*24*3600*1000;
  const stale=JSON.parse(buildDisclosureSummary(root,raw,{task:'expiration',now:later}));
  assert.equal(stale.seen_markers,0);
  const renewed=JSON.parse(markDisclosureSeen(root,raw,{task:'expiration',id,
    expectedHead:sha,now:later,maxBytes:4096}));
  assert.equal(renewed.status,'created');
});
test('bounded summary never certifies completeness when diagnostics truncated',t=>{
  const {root}=project(t);
  const raw=JSON.parse(cliRun(root,'session-check','--explain','--json').stdout);
  raw.diagnostics_truncated=true;
  const output=JSON.parse(buildDisclosureSummary(root,raw,{
    task:'task_bounded',maxBytes:512,detail:true,
  }));
  assert.equal(output.status,'incomplete');
  assert.equal(output.scan_incomplete,true);
  assert.equal(output.user_delivery,'not-observed');
  assert.equal(output.unresolved_findings,raw.diagnostics.length);
});
test('no Git evidence means summaries cannot claim a reviewed or delivered issue',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lacc cr4 no git '));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const diag=finding('changed-source','memory/topics/a.md:2','src/a.ts');
  const payload={status:'incomplete',diagnostics:[diag],diagnostics_total:1};
  const summary=JSON.parse(buildDisclosureSummary(root,payload,{task:'non_git'}));
  assert.equal(summary.git_head,null);
  assert.equal(summary.status,'incomplete');
  assert.equal(summary.seen_markers,0);
  assert.equal(summary.user_delivery,'not-observed');
});
