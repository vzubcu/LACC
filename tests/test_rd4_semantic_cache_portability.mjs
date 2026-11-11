import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createParseCache } from
  '../skills/lean-context-memory/scripts/lacc-parse-cache.mjs';
import { extractJsTsImports } from
  '../skills/lean-context-memory/scripts/lacc-dependencies.mjs';

const cli=path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function run(bin,args,cwd) {
  const r=spawnSync(bin,args,{cwd,encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
  if(r.error)throw r.error;
  return r;
}
function git(root,...args) {
  const r=run('git',args,root);
  assert.equal(r.status,0,r.stderr);return r.stdout.trim();
}
function lacc(root,cmd,...args) {
  const r=run(process.execPath,[cli,cmd,root,...args,'--json'],root);
  return {status:r.status,stderr:r.stderr,
    data:r.status===2?null:JSON.parse(r.stdout)};
}
function setup(t,{alias=true}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lacc-rd4-portable-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  git(root,'init','-q');
  git(root,'config','user.name','Fixture');
  git(root,'config','user.email','fixture@example.test');
  git(root,'config','commit.gpgsign','false');
  git(root,'config','core.hooksPath',path.join(root,'.no-hooks'));
  git(root,'config','core.fsmonitor','false');
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.writeFileSync(path.join(root,'src/auth.ts'),
    alias?"import { allowed } from '@/permissions';\nexport const auth=allowed;\n":
      "import { allowed } from './permissions';\nexport const auth=allowed;\n");
  fs.writeFileSync(path.join(root,'src/permissions.ts'),'export const allowed=true;\n');
  if(alias)fs.writeFileSync(path.join(root,'tsconfig.json'),
    JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@/permissions':['src/permissions']}}})+'\n');
  git(root,'add','src',...(alias?['tsconfig.json']:[]));
  git(root,'commit','-qm','baseline');
  const sha=git(root,'rev-parse','HEAD');
  const initialized=lacc(root,'init','--agent','codex');
  assert.equal(initialized.status,0,initialized.stderr);
  const q=String.fromCharCode(96),note=path.join(root,'memory/topics/architecture.md');
  fs.writeFileSync(note,'# Architecture\n- Auth requires permissions | source: '+q+
    'src/auth.ts'+q+' | verified: '+q+sha+q+' | key: auth.permissions\n');
  return {root,sha,note};
}
function issues(result,code) {
  return result.data.results.flatMap(x=>x.issues).filter(x=>x.code===code);
}
test('literal tsconfig alias is opt-in and never upgraded to semantic proof',t=>{
  const {root,note}=setup(t);
  const original=fs.readFileSync(note);
  fs.writeFileSync(path.join(root,'src/permissions.ts'),'export const allowed=false;\n');
  const baseline=lacc(root,'dependency-impact');
  assert.equal(baseline.status,1,baseline.stderr);
  assert.ok(issues(baseline,'dependency-coverage-incomplete').length);
  const hinted=lacc(root,'dependency-impact','--semantic','--explain');
  assert.equal(hinted.status,1,hinted.stderr);
  assert.ok(issues(hinted,'dependency-changed').some(x=>
    x.chain.join(' -> ')==='src/permissions.ts -> src/auth.ts'));
  assert.equal(hinted.data.stats.semanticProof,false);
  assert.equal(hinted.data.stats.semanticHints,'js-ts-literal-path-aliases-only');
  const find=hinted.data.diagnostics.find(x=>x.kind==='indirect-dependency-drift');
  assert.ok(find);
  assert.equal(find.evidence.trace.semantics,'not-evaluated');
  assert.deepEqual(fs.readFileSync(note),original);
  assert.ok(!fs.existsSync(path.join(root,'memory/analysis-cache')));
});
test('tsconfig changes are tracked as source configuration dependency',t=>{
  const {root}=setup(t);
  fs.writeFileSync(path.join(root,'tsconfig.json'),
    JSON.stringify({compilerOptions:{baseUrl:'.',paths:{'@/permissions':['src/permissions']}},
      compileOnSave:true})+'\n');
  const result=lacc(root,'dependency-impact','--semantic','--explain');
  assert.equal(result.status,1,result.stderr);
  assert.ok(issues(result,'dependency-changed').some(x=>
    x.chain.join(' -> ')==='tsconfig.json -> src/auth.ts'));
});
test('unsupported alias wildcard/extends is incomplete, never a false clean',t=>{
  const {root}=setup(t);
  fs.writeFileSync(path.join(root,'tsconfig.json'),
    JSON.stringify({extends:'./base.json',compilerOptions:{
      paths:{'@/permissions':['src/*.ts']}}})+'\n');
  const result=lacc(root,'dependency-impact','--semantic');
  assert.equal(result.status,1);
  assert.ok(issues(result,'dependency-coverage-incomplete').some(x=>
    String(x.dependency).includes('alias-')));
});
test('cache is opt-in, private, deterministic and cross-invocation',t=>{
  const {root,note}=setup(t,{alias:false});
  const before=fs.readFileSync(note);
  const first=lacc(root,'dependency-impact','--cache');
  assert.notEqual(first.status,2,first.stderr);
  assert.ok(first.data.stats.parseCache.writes>=1);
  const dir=path.join(root,'memory/analysis-cache');
  assert.ok(fs.existsSync(dir));
  assert.ok(fs.existsSync(path.join(dir,'.gitignore')));
  const files=fs.readdirSync(dir).filter(x=>x.endsWith('.json'));
  assert.ok(files.length);
  const second=lacc(root,'dependency-impact','--cache');
  assert.notEqual(second.status,2,second.stderr);
  assert.ok(second.data.stats.parseCache.revalidated>=1);
  assert.deepEqual(fs.readFileSync(note),before);
  assert.equal(git(root,'check-ignore','memory/analysis-cache/'+files[0])
    .includes('memory/analysis-cache'),true);
});
test('cache cannot hide changed dependencies, even with forged valid checksum',t=>{
  const {root}=setup(t,{alias:false});
  lacc(root,'dependency-impact','--cache');
  const folder=path.join(root,'memory/analysis-cache');
  const names=fs.readdirSync(folder).filter(x=>x.endsWith('.json'));
  assert.ok(names.length);
  for(const name of names) {
    const file=path.join(folder,name),old=JSON.parse(fs.readFileSync(file,'utf8'));
    const poisoned={...old,parsed:{imports:[],unknown:[]}};
    const payload={schema:1,key:poisoned.key,parsed:poisoned.parsed};
    poisoned.checksum=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    fs.writeFileSync(file,JSON.stringify(poisoned));
  }
  fs.writeFileSync(path.join(root,'src/permissions.ts'),'export const allowed=false;\n');
  const after=lacc(root,'dependency-impact','--cache');
  assert.equal(after.status,1,after.stderr);
  assert.ok(issues(after,'dependency-changed').some(x=>
    x.dependency==='src/permissions.ts'));
  assert.ok(after.data.stats.parseCache.rejected>=1);
});
test('standalone cache rejects symlinks, corrupt data and never changes source',t=>{
  const {root}=setup(t,{alias:false});
  const input=Buffer.from("import './permissions';\n");
  const cache=createParseCache(root,{enabled:true});
  const a=cache.parse('js-ts-static','2',input,()=>extractJsTsImports(input));
  assert.deepEqual(a.imports,['./permissions']);
  const repeat=cache.parse('js-ts-static','2',input,()=>{throw Error('unexpected reparse')});
  assert.deepEqual(repeat,a);
  assert.equal(cache.stats.hits,1);
  assert.throws(()=>cache.parse('../unsafe','2',input,()=>a),/parser cache/);
});
test('semantic and cache flags are explicit and never silently ignored',t=>{
  const {root}=setup(t);
  assert.equal(lacc(root,'search','--query','auth','--semantic').status,2);
  assert.equal(lacc(root,'session-check','--cache').status,2);
  assert.equal(lacc(root,'health','--deps','--cache').status,2);
  assert.notEqual(lacc(root,'search','--query','auth','--deps','--semantic').status,2);
  assert.ok(!fs.existsSync(path.join(root,'memory/analysis-cache')));
});
test('Windows Linux macOS path portability: POSIX Git paths and no platform-specific binary',t=>{
  const {root}=setup(t,{alias:false});
  const changed=path.join(root,'src','permissions.ts');
  fs.writeFileSync(changed,'export const allowed=false;\n');
  const result=lacc(root,'dependency-impact','--cache');
  assert.equal(result.status,1,result.stderr);
  assert.ok(issues(result,'dependency-changed').some(x=>
    x.chain.join(' -> ')==='src/permissions.ts -> src/auth.ts'));
  assert.ok(['darwin','win32','linux'].includes(process.platform));
  // On a real macOS runner, this exercises native Node/Git and case-sensitive
  // Git source paths without Bash/WSL/Docker, without claiming prior PASS.
});
