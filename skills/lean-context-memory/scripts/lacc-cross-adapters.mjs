// RD-3: conservative, portable .NET, PHP/Composer and Python adapters.
// No compiler, Composer, Python interpreter, network, package installation or code execution.
// Each adapter returns local file edges plus explicit coverage gaps.
import fs from 'node:fs';
import path from 'node:path';
import { git, localPath } from './lacc-core.mjs';

export const CROSS_ADAPTERS = Object.freeze([
  Object.freeze({ id:'dotnet-static', version:'1', languages:['csharp'], scope:'msbuild-project-and-manifest-edges' }),
  Object.freeze({ id:'php-static', version:'1', languages:['php'], scope:'php-literal-includes-and-composer-manifests' }),
  Object.freeze({ id:'python-static', version:'1', languages:['python'], scope:'python-relative-and-local-absolute-imports' }),
]);
export function languageForSource(source) {
  if (/\.(?:cs|csproj|fsproj|vbproj|props|targets)$/i.test(source)) return 'csharp';
  if (/\.php$/i.test(source) || /(?:^|\/)composer\.json$/i.test(source)) return 'php';
  if (/\.py$/i.test(source) || /(?:^|\/)pyproject\.toml$/i.test(source)) return 'python';
  return null;
}
const MAX_BYTES = 128 * 1024;
const MAX_HISTORICAL_LOOKUPS = 256;
const MAX_DIRECTORY_ITEMS = 64;
const DEC = new TextDecoder('utf8', { fatal:true });
const GIT_PATTERN = /^[a-f0-9]{40}$/;
function safeName(name) {
  return typeof name === 'string' && name.length <= 512 &&
    !name.startsWith('/') && !name.includes('\\') && !name.includes('\0') &&
    !/(?:^|\/)\.\.?(?:\/|$)/.test(name) && !name.includes('//') &&
    !/^[a-z]:/i.test(name) && !/%(?:2e|2f|5c)/i.test(name);
}
function resolveRelative(from, rel) {
  if (typeof rel !== 'string' || rel.includes('\0') || rel.startsWith('/') ||
      /^[a-z]:/i.test(rel) || rel.startsWith('\\\\')) return null;
  const adjusted = rel.replaceAll('\\','/');
  if (/[$*?{}%]/.test(adjusted)) return null;
  const dest = path.posix.normalize(path.posix.join(path.posix.dirname(from), adjusted));
  return safeName(dest) ? dest : null;
}
function parentFolders(source) {
  const out = [], start = path.posix.dirname(source);
  let dir = start;
  for (let i=0; i<12; i++) {
    out.push(dir);
    if (dir === '.') break;
    dir = path.posix.dirname(dir);
  }
  return out;
}
function join(dir, name) { return dir === '.' ? name : dir + '/' + name; }
function edge(path, kind='import', confidence='heuristic') { return { path, kind, confidence }; }

export function createCrossLanguageScanner(root, revision) {
  if (!GIT_PATTERN.test(revision)) throw Error('full checked Git revision required');
  let oldLookups=0;
  const cache=new Map(), folderCache=new Map();
  function read(source, version) {
    if (!safeName(source)) throw Error('unsafe adapter source');
    const k=version+'\0'+source;
    if (cache.has(k)) return cache.get(k);
    let bytes=null;
    if(version==='old') {
      if (++oldLookups > MAX_HISTORICAL_LOOKUPS) throw Error('historical-lookup-budget');
      const r=git(root,['show',revision+':'+source]);
      if(r.error) throw Error('historical-git-error');
      if(r.ok) bytes=r.stdout;
    } else {
      const f=localPath(root,source);
      try {
        const st=fs.statSync(f);
        if(st.isFile()) {
          if(st.size>MAX_BYTES) throw Error('adapter-file-budget');
          bytes=fs.readFileSync(f);
        }
      } catch(e) {
        if(e.code!=='ENOENT' && e.code!=='ENOTDIR') throw e;
      }
    }
    if(bytes && bytes.length>MAX_BYTES) throw Error('adapter-file-budget');
    cache.set(k,bytes);
    return bytes;
  }
  function available(source, version) {
    try { return Boolean(read(source,version)); }
    catch(e) { if(e.message==='adapter-file-budget' || e.message==='historical-lookup-budget') throw e; return false; }
  }
  function nearestManifest(source, names, version) {
    for(const folder of parentFolders(source)) {
      for(const name of names) {
        const candidate=join(folder,name);
        if(available(candidate,version)) return candidate;
      }
    }
    return null;
  }
  function nearestCsproj(source,version, unknown) {
    for(const folder of parentFolders(source)) {
      const key=version+'\0'+folder;
      let names=folderCache.get(key);
      if(!names) {
        // In the historical version the current directory listing is only a
        // candidate set. Missing historical-only projects require review.
        const abs=folder==='.'?root:localPath(root,folder);
        try {
          const reader=fs.opendirSync(abs);
          const entries=[];
          try {
            for(let i=0; i<=MAX_DIRECTORY_ITEMS; i++) {
              const entry=reader.readSync();
              if(!entry) break;
              entries.push(entry);
            }
          } finally {reader.closeSync();}
          if(entries.length>MAX_DIRECTORY_ITEMS) unknown.push('project-discovery-budget');
          names=entries.slice(0,MAX_DIRECTORY_ITEMS)
            .filter(item=>item.isFile() && /\.(?:csproj|fsproj|vbproj)$/i.test(item.name))
            .map(item=>item.name).sort();
        } catch(e) {
          if(e.code!=='ENOENT' && e.code!=='ENOTDIR') unknown.push('project-discovery-failed');
          names=[];
        }
        folderCache.set(key,names);
      }
      const projects=names.filter(name=>available(join(folder,name),version));
      if(projects.length===1) return join(folder,projects[0]);
      if(projects.length>1) {unknown.push('ambiguous-owning-project');return null;}
    }
    unknown.push('owning-project-unresolved');
    return null;
  }
  function phpComposer(source,version,unknown) {
    const composer=nearestManifest(source,['composer.json'],version);
    if(!composer){ unknown.push('composer-manifest-unavailable-or-not-used'); return null; }
    try {
      const raw=read(composer,version);
      const data=JSON.parse(DEC.decode(raw));
      if(!data || typeof data!=='object' || Array.isArray(data))
        throw Error('invalid composer');
      // Do not use PSR-4 mappings to invent a file-level symbol link.
      if(data.autoload?.['psr-4'] || data['autoload-dev']?.['psr-4'])
        unknown.push('psr4-class-resolution-not-evaluated');
      if(data.require || data['require-dev'])
        unknown.push('composer-package-resolution-not-evaluated');
    } catch { unknown.push('composer-parse-or-resolution-incomplete'); }
    return composer;
  }
  function pythonProject(source,version,unknown) {
    const p=nearestManifest(source,['pyproject.toml'],version);
    if(!p){ unknown.push('python-project-layout-unverified'); return null; }
    unknown.push('python-dependencies-and-build-backend-not-evaluated');
    return p;
  }
  function pythonModule(source, spec, version) {
    if(!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(spec)) return null;
    const bits=spec.split('.');
    const tries=[];
    for(const folder of parentFolders(source)) {
      tries.push(join(folder,bits.join('/')+'.py'));
      tries.push(join(folder,bits.join('/')+'/__init__.py'));
    }
    tries.push(bits.join('/')+'.py', bits.join('/')+'/__init__.py');
    for(const candidate of [...new Set(tries)]) {
      if(safeName(candidate) && available(candidate,version)) return candidate;
    }
    return null;
  }
  function pythonRelative(source,spec,version) {
    const dots=(spec.match(/^\.+/)??[''])[0].length;
    if(!dots) return pythonModule(source,spec,version);
    let folder=path.posix.dirname(source);
    for(let i=1;i<dots;i++) {
      if(folder==='.') return null;
      folder=path.posix.dirname(folder);
    }
    const rest=spec.slice(dots);
    const target=join(folder,rest.replaceAll('.','/'));
    for(const candidate of [target+'.py',target+'/__init__.py']) {
      if(safeName(candidate) && available(candidate,version)) return candidate;
    }
    return null;
  }
  function parsePython(source,text,version,edges,unknown) {
    if (/\b(?:importlib|__import__|exec\s*\(|eval\s*\()/u.test(text))
      unknown.push('python-dynamic-import-or-execution');
    for(const line of text.split(/\r?\n/)) {
      const clean=line.split('#')[0].trim();
      if(!clean) continue;
      const from=clean.match(/^from\s+([.\w]+)\s+import\s+(.+)$/);
      if(from) {
        const spec=from[1], imports=from[2].trim();
        if(imports.startsWith('(') || imports.includes('\\')) {
          unknown.push('python-multiline-import-not-resolved');continue;
        }
        const imported=imports.split(',').map(x=>x.trim().split(/\s+as\s+/)[0]);
        const direct=pythonRelative(source,spec,version);
        if(direct) edges.push(edge(direct)); else unknown.push('python-module-unresolved');
        // "from . import permissions" and "from pkg import permissions"
        // can refer to a submodule. Include it if safely resolved.
        for(const name of imported.filter(x=>/^[A-Za-z_]\w*$/.test(x))) {
          const prefix=spec==='.'?'.'+name:spec.endsWith('.')?spec+name:spec+'.'+name;
          const sub=pythonRelative(source,prefix,version);
          if(sub) edges.push(edge(sub));
        }
        continue;
      }
      const imp=clean.match(/^import\s+(.+)$/);
      if(imp) {
        for(const raw of imp[1].split(',')) {
          const spec=raw.trim().split(/\s+as\s+/)[0];
          const dep=pythonModule(source,spec,version);
          if(dep) edges.push(edge(dep));
          else unknown.push('python-module-external-or-unresolved');
        }
      }
    }
    // Pure import AST cannot prove Python runtime side effects or namespace
    // package resolution, so never claim semantic completeness.
    unknown.push('python-runtime-resolution-not-evaluated');
  }
  function parsePhp(source,text,version,edges,unknown) {
    if(/(?:\b(?:eval|class_alias|call_user_func)\s*\(|\b(?:spl_autoload_register|fn_register_hooks)\s*\()/i.test(text))
      unknown.push('php-runtime-autoload-or-hooks');
    // Static include/require is safe to extract. Anything else stays unknown.
    const include=/\b(?:require|require_once|include|include_once)\s*(?:\(\s*)?(?:(__DIR__\s*\.\s*)?(['"])([^'"\r\n]+)\2)/g;
    let m;
    while((m=include.exec(text))) {
      const value=m[1] && m[3].startsWith('/') ? m[3].slice(1) : m[3];
      const dest=resolveRelative(source,value);
      if(!dest){unknown.push('php-unsafe-or-dynamic-include');continue;}
      if(available(dest,version)) edges.push(edge(dest));
      else unknown.push('php-include-unresolved');
    }
    if(/\b(?:require|include)(?:_once)?\s*(?:\(\s*)?(?:\$|\w+\s*\()/m.test(text))
      unknown.push('php-dynamic-include');
    const composer=phpComposer(source,version,unknown);
    if(composer) edges.push(edge(composer,'configuration'));
    unknown.push('php-symbol-and-framework-hooks-unresolved');
  }
  function parseDotnet(source,text,version,edges,unknown) {
    if (/\.(?:cs|fs|vb)$/i.test(source)) {
      const owner=nearestCsproj(source,version,unknown);
      if(owner) edges.push(edge(owner,'configuration'));
      unknown.push('dotnet-symbol-and-di-resolution-not-evaluated');
      return;
    }
    if (/\.(?:csproj|fsproj|vbproj|props|targets)$/i.test(source)) {
      // Extract safe literal XML attributes. MSBuild Condition, macros and
      // implicit imports require an MSBuild evaluator, which is NOT run.
      for(const tag of text.matchAll(/<(ProjectReference|Import)\b([^<>]{0,4096})>/gi)) {
        const kind=tag[1].toLowerCase()==='projectreference'?'project-reference':'configuration';
        const att=tag[2].match(/\b(?:Include|Project)\s*=\s*(["'])([^"']+)\1/i);
        if(!att){unknown.push('msbuild-reference-unresolved');continue;}
        const dest=resolveRelative(source,att[2]);
        if(dest && available(dest,version)) edges.push(edge(dest,kind));
        else unknown.push('msbuild-reference-unresolved');
        if(/\bCondition\s*=/i.test(tag[2])) unknown.push('msbuild-conditional-evaluation-unavailable');
      }
      if(/<PackageReference\b/i.test(text)) unknown.push('nuget-package-dependencies-not-evaluated');
      if(/\$\(|@\(|\*\*/.test(text)) unknown.push('msbuild-properties-globs-not-evaluated');
      for(const base of ['Directory.Build.props','Directory.Build.targets','Directory.Packages.props']) {
        const manifest=nearestManifest(source,[base],version);
        if(manifest && manifest!==source) edges.push(edge(manifest,'configuration'));
      }
      unknown.push('msbuild-implicit-project-evaluation-not-available');
    }
  }
  function scan(source) {
    const language=languageForSource(source);
    if(!language) return { edges:[], unknown:['unsupported-language'], bytes:0, language:null };
    let bytes=0;
    const edges=[], unknown=[];
    for(const version of ['old','current']) {
      let raw;
      try{raw=read(source,version);}
      catch(e){unknown.push(version+':'+String(e.message).slice(0,60));continue;}
      if(!raw) {unknown.push(version+':source-unavailable');continue;}
      bytes+=raw.length;
      let text;
      try{text=DEC.decode(raw);}catch{unknown.push(version+':invalid-utf8');continue;}
      try {
        if(language==='csharp') parseDotnet(source,text,version,edges,unknown);
        if(language==='php') {
          if(/(?:^|\/)composer\.json$/i.test(source)) {
            try { JSON.parse(text); } catch { unknown.push('composer-json-invalid'); }
            unknown.push('composer-autoload-resolution-not-evaluated');
          } else parsePhp(source,text,version,edges,unknown);
        }
        if(language==='python') {
          if(/(?:^|\/)pyproject\.toml$/i.test(source))
            unknown.push('pyproject-build-backend-and-dependencies-not-evaluated');
          else {
            parsePython(source,text,version,edges,unknown);
            const p=pythonProject(source,version,unknown);
            if(p)edges.push(edge(p,'configuration'));
          }
        }
      } catch(e) {unknown.push(version+':adapter-resolution-failed');}
    }
    const unique=new Map();
    for(const item of edges) unique.set(item.kind+'\0'+item.path,item);
    return { edges:[...unique.values()].sort((a,b)=>a.path.localeCompare(b.path)||a.kind.localeCompare(b.kind)),
      unknown:[...new Set(unknown)].sort(), bytes, language };
  }
  return { scan };
}
