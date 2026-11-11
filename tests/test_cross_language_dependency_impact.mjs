import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function exec(bin, args, dir) {
  const r=spawnSync(bin,args,{cwd:dir,encoding:'utf8',windowsHide:true,timeout:30000,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
  if(r.error) throw r.error;
  return r;
}
function git(dir,...args) {
  const r=exec('git',args,dir); assert.equal(r.status,0,r.stderr);
  return r.stdout.trim();
}
function lacc(dir,cmd,...args) {
  const r=exec(process.execPath,[cli,cmd,dir,...args,'--json'],dir);
  return {status:r.status,data:r.status===2?null:JSON.parse(r.stdout),stderr:r.stderr};
}
function fixture(t,files,facts) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lacc mixed graph '));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  git(dir,'init','-q');
  git(dir,'config','user.name','LACC test');
  git(dir,'config','user.email','fixture@example.test');
  git(dir,'config','commit.gpgsign','false');
  git(dir,'config','core.fsmonitor','false');
  git(dir,'config','core.hooksPath',path.join(dir,'.disabled-hooks'));
  for(const [name,content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});
    fs.writeFileSync(path.join(dir,name),content);
  }
  git(dir,'add','-A');
  git(dir,'commit','-qm','baseline');
  const revision=git(dir,'rev-parse','HEAD');
  const init=exec(process.execPath,[cli,'init',dir,'--agent','codex'],dir);
  assert.equal(init.status,0,init.stderr);
  const q=String.fromCharCode(96);
  fs.writeFileSync(path.join(dir,'memory/topics/architecture.md'),
    '# Architecture\n'+facts.map((source,i) =>
      '- Depends on contract ' + i + ' | source: '+q+source+q+
      ' | verified: '+q+revision+q+'\n').join(''));
  return {dir,revision};
}
function findIssue(result,target) {
  const row=result.data.results.find(x=>x.sources.includes(target));
  assert.ok(row,'missing fact for '+target);
  const issues=row.issues.filter(x=>x.code==='dependency-changed');
  return issues;
}
test('C# source -> owning csproj -> ProjectReference manifest change', t => {
  const p=fixture(t,{
    'services/Api/Auth.cs':'namespace Api { class Auth {} }\n',
    'services/Api/Api.csproj':'<Project><ItemGroup><ProjectReference Include="../../libs/Domain/Domain.csproj" /></ItemGroup></Project>\n',
    'libs/Domain/Domain.csproj':'<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n',
  },['services/Api/Auth.cs']);
  fs.writeFileSync(path.join(p.dir,'libs/Domain/Domain.csproj'),
    '<Project><PropertyGroup><TargetFramework>net9.0</TargetFramework></PropertyGroup></Project>\n');
  const r=lacc(p.dir,'dependency-impact','--explain');
  assert.equal(r.status,1,r.stderr);
  assert.ok(findIssue(r,'services/Api/Auth.cs').some(x =>
    x.chain.join(' -> ') ===
      'libs/Domain/Domain.csproj -> services/Api/Api.csproj -> services/Api/Auth.cs'));
  assert.ok(r.data.diagnostics.some(x => x.kind==='indirect-dependency-drift' &&
    x.evidence.verification_scope==='experimental-dotnet-static'));
  assert.ok(r.data.results[0].issues.some(x=>x.code==='dependency-coverage-incomplete'),
    'without Roslyn, symbol resolution is incomplete');
});
test('PHP literal __DIR__ include changes invalidate the citing fact', t => {
  const p=fixture(t,{
    'composer.json':'{"autoload":{"psr-4":{"App\\\\":"app/"}}}\n',
    'app/User.php':"<?php\nrequire __DIR__ . '/Permissions.php';\n",
    'app/Permissions.php':'<?php\nfunction allowed() { return true; }\n',
  },['app/User.php']);
  fs.writeFileSync(path.join(p.dir,'app/Permissions.php'),
    '<?php\nfunction allowed() { return false; }\n');
  const r=lacc(p.dir,'dependency-impact','--explain');
  assert.equal(r.status,1,r.stderr);
  assert.ok(findIssue(r,'app/User.php').some(x =>
    x.chain.join(' -> ')==='app/Permissions.php -> app/User.php'));
  assert.ok(r.data.diagnostics.some(x=>x.evidence.verification_scope==='experimental-php-static'));
  assert.ok(r.data.results[0].issues.some(x=>x.code==='dependency-coverage-incomplete'));
});
test('Python relative import changes flag a fact; project manifest is tracked', t => {
  const p=fixture(t,{
    'pyproject.toml':'[project]\nname = "app"\n',
    'pkg/__init__.py':'',
    'pkg/auth.py':'from .permissions import allowed\n',
    'pkg/permissions.py':'allowed = True\n',
  },['pkg/auth.py']);
  fs.writeFileSync(path.join(p.dir,'pkg/permissions.py'),'allowed = False\n');
  const r=lacc(p.dir,'dependency-impact','--explain');
  assert.equal(r.status,1,r.stderr);
  assert.ok(findIssue(r,'pkg/auth.py').some(x =>
    x.chain.join(' -> ')==='pkg/permissions.py -> pkg/auth.py'));
  assert.ok(r.data.diagnostics.some(x=>x.evidence.verification_scope==='experimental-python-static'));
});
test('mixed project analyzes JS, C#, PHP, Python without claiming semantic coverage',t=>{
  const p=fixture(t,{
    'web/main.ts':"import { value } from './config';\n",
    'web/config.ts':'export const value = true;\n',
    'dotnet/Auth.cs':'namespace D { class Auth {} }\n',
    'dotnet/App.csproj':'<Project></Project>\n',
    'app/index.php':"<?php require __DIR__ . '/config.php';\n",
    'app/config.php':'<?php $enabled = true;\n',
    'python/main.py':'from . import config\n',
    'python/config.py':'enabled = True\n',
    'python/__init__.py':'',
  },['web/main.ts','dotnet/Auth.cs','app/index.php','python/main.py']);
  for(const [name,text] of [
    ['web/config.ts','export const value = false;\n'],
    ['app/config.php','<?php $enabled = false;\n'],
    ['python/config.py','enabled = False\n'],
  ]) fs.writeFileSync(path.join(p.dir,name),text);
  const r=lacc(p.dir,'dependency-impact');
  assert.equal(r.status,1,r.stderr);
  assert.ok(findIssue(r,'web/main.ts').length);
  assert.ok(findIssue(r,'app/index.php').length);
  assert.ok(findIssue(r,'python/main.py').length);
  const net=r.data.results.find(x=>x.sources.includes('dotnet/Auth.cs'));
  assert.ok(net.issues.some(x=>x.code==='dependency-coverage-incomplete'));
  assert.notEqual(r.data.status,'clear-within-scanned-scope');
});
test('dynamic PHP include, C# symbol references and Python runtime import stay incomplete',t=>{
  const p=fixture(t,{
    'app/a.php':"<?php require $filename; fn_register_hooks('foo');\n",
    'cs/Auth.cs':'using Company.Permissions; class Auth {}\n',
    'cs/App.csproj':'<Project></Project>\n',
    'py/main.py':'import importlib\nmod=importlib.import_module(name)\n',
  },['app/a.php','cs/Auth.cs','py/main.py']);
  const r=lacc(p.dir,'dependency-impact');
  assert.equal(r.status,1,r.stderr);
  for(const source of ['app/a.php','cs/Auth.cs','py/main.py']){
    const row=r.data.results.find(x=>x.sources.includes(source));
    assert.ok(row.issues.some(x=>x.code==='dependency-coverage-incomplete'),source);
  }
});
test('metadata reports real adapters; no tool invocation or automatic memory edits', t=>{
  const p=fixture(t,{
    'pkg/__init__.py':'',
    'pkg/auth.py':'from .permissions import allowed\n',
    'pkg/permissions.py':'allowed=True\n',
  },['pkg/auth.py']);
  const file=path.join(p.dir,'memory/topics/architecture.md'),before=fs.readFileSync(file);
  const info=lacc(p.dir,'dependency-contract');
  assert.equal(info.status,0,info.stderr);
  for(const id of ['js-ts-static','dotnet-static','php-static','python-static'])
    assert.ok(info.data.registeredAdapters.some(a=>a.id===id),id);
  assert.equal(lacc(p.dir,'dependency-impact').status,1);
  assert.deepEqual(fs.readFileSync(file),before);
});
