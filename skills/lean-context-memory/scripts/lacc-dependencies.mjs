// RD-2 lightweight JS/TS scanner, reused by reverse impact and --deps.
// Static relative file references only: NOT a compiler or package resolver.
import fs from 'node:fs';
import path from 'node:path';
import { git, localPath } from './lacc-core.mjs';

export const JS_TS_SCANNER = Object.freeze({
  id: 'js-ts-static',
  version: '2',
  languages: Object.freeze(['javascript', 'typescript']),
  scope: 'bounded-static-relative-imports',
  maxFileBytes: 128 * 1024,
});
const EXT = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx', '/index.mjs', '/index.cjs'];

export function jsTsLanguage(source) {
  if (/\.(?:ts|tsx|mts|cts)$/i.test(source)) return 'typescript';
  if (/\.(?:js|jsx|mjs|cjs)$/i.test(source)) return 'javascript';
  return null;
}

export function extractJsTsImports(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const imports = new Set(), unknown = [];
  // Keep the existing bounded, conservative parser rather than duplicating
  // divergent logic between forward --deps and reverse impact.
  for (const [i, line] of text.split(/\r\n|\n|\r/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    const re = /(?:\b(?:import|export)\s+(?:[^"'\x60]{0,250}?\bfrom\s*)?|(?:\brequire\s*\(\s*))(['"])([^'"\r\n]+)\1/g;
    let found = false, m;
    while ((m = re.exec(trimmed)) !== null) {
      found = true;
      imports.add(m[2]);
    }
    if (!found && (/\bimport\s*\(/.test(trimmed) ||
      /\brequire\s*\(/.test(trimmed) || /\bimport\s+(?!type\b)/.test(trimmed) ||
      /\bexport\b.*\bfrom\b/.test(trimmed))) unknown.push(i + 1);
  }
  return { imports: [...imports].sort(), unknown };
}

export function createJsTsScanner(root, revision, { parseCache = null, semantic = false } = {}) {
  const cache = new Map();
  let historicalLookups = 0;
  const MAX_HISTORICAL_LOOKUPS = 256;
  const read = (source, version) => {
    const key = version + ':' + source;
    if (cache.has(key)) return cache.get(key);
    let result = null;
    if (version === 'old') {
      if (++historicalLookups > MAX_HISTORICAL_LOOKUPS)
        throw Error('historical-lookup-budget');
      const r = git(root, ['show', revision + ':' + source]);
      if (r.ok) result = r.stdout;
      else if (r.error) throw Error('Git unavailable while reading historical imports');
    } else {
      try {
        const file = localPath(root, source);
        const st = fs.statSync(file);
        if (st.isFile() && st.size <= JS_TS_SCANNER.maxFileBytes)
          result = fs.readFileSync(file);
      } catch (err) {
        if (err.message?.includes('unsafe')) throw err;
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
      }
    }
    cache.set(key, result);
    return result;
  };
  const resolve = (from, spec, version) => {
    if (!spec.startsWith('./') && !spec.startsWith('../'))
      return { unresolved: 'external-or-alias:' + spec };
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
    if (base === '..' || base.startsWith('../') || base.startsWith('/') ||
        base.startsWith('memory/')) return { unresolved: 'unsafe-relative-import' };
    for (const suffix of EXT) {
      const candidate = base + suffix;
      try {
        localPath(root, candidate);
        const bytes = read(candidate, version);
        if (bytes) return { path: candidate };
      } catch (err) {
        if (err.message?.includes('unsafe')) return { unresolved: 'unsafe-import-path' };
        return { unresolved: 'import-lookup-failed' };
      }
    }
    return { unresolved: 'unresolved-import:' + spec };
  };
  function resolveAlias(from,spec,version) {
    const unknown=[];
    let directory=path.posix.dirname(from), config=null;
    for(let tries=0;tries<12;tries++){
      for(const name of ['tsconfig.json','jsconfig.json']){
        const candidate=directory==='.'?name:directory+'/'+name;
        try { if(read(candidate,version)) {config=candidate;break;} }
        catch {unknown.push('alias-config-unreadable');}
      }
      if(config || directory==='.')break;
      directory=path.posix.dirname(directory);
    }
    if(!config)return {unknown:['alias-config-not-found']};
    let options;
    try {
      const data=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(read(config,version)));
      if(!data || typeof data!=='object' || Array.isArray(data))throw Error('invalid config');
      options=data.compilerOptions;
      if(data.extends)unknown.push('tsconfig-extends-not-evaluated');
    }catch {return {config,unknown:['alias-config-invalid']};}
    if(!options || typeof options!=='object' || Array.isArray(options)||
        !options.paths || typeof options.paths!=='object' ||
        Array.isArray(options.paths))return {config,unknown:['alias-paths-not-configured',...unknown]};
    const targets=options.paths[spec];
    if(!Array.isArray(targets) || targets.length!==1 ||
        typeof targets[0]!=='string' || /[*?{}$%]/.test(spec+targets[0]))
      return {config,unknown:['alias-nonliteral-or-ambiguous',...unknown]};
    const baseUrl=options.baseUrl ?? '.';
    if(typeof baseUrl!=='string'||/[*?{}$%]/.test(baseUrl))
      return {config,unknown:['alias-baseurl-unresolved',...unknown]};
    const rootDir=path.posix.dirname(config);
    const target=path.posix.normalize(path.posix.join(rootDir,baseUrl,targets[0]));
    if(target==='..'||target.startsWith('../')||target.startsWith('/')||
       target==='memory'||target.startsWith('memory/'))
      return {config,unknown:['alias-target-unsafe',...unknown]};
    const relative=path.posix.relative(path.posix.dirname(from),target);
    const specifier=relative.startsWith('.')?relative:'./'+relative;
    const dep=resolve(from,specifier,version);
    if(dep.path)return {config,dep:dep.path,unknown};
    return {config,unknown:['alias-target-unresolved',...unknown]};
  }
  return {
    descriptor: JS_TS_SCANNER,
    scan(source) {
      if (!jsTsLanguage(source)) return {
        edges: [], unknown: ['unsupported-language'], bytes: 0,
      };
      const edges = new Map(), unknown = [];
      const insert=(path,kind='import',confidence='heuristic')=>
        edges.set(kind+'\0'+path,{path,kind,confidence});
      let count = 0;
      for (const version of ['old', 'current']) {
        let bytes;
        try { bytes = read(source, version); }
        catch (error) { unknown.push(version + ':source-unreadable'); continue; }
        if (!bytes) { unknown.push(version + ':source-unavailable'); continue; }
        if (bytes.length > JS_TS_SCANNER.maxFileBytes) {
          unknown.push(version + ':file-budget');
          continue;
        }
        count += bytes.length;
        let parsed;
        try { parsed = parseCache
          ? parseCache.parse(JS_TS_SCANNER.id,JS_TS_SCANNER.version,bytes,
            () => extractJsTsImports(bytes))
          : extractJsTsImports(bytes); }
        catch { unknown.push(version + ':invalid-utf8'); continue; }
        if (parsed.unknown.length) unknown.push(version + ':dynamic-or-unresolved-syntax');
        for (const spec of parsed.imports) {
          if (!spec.startsWith('./') && !spec.startsWith('../') && semantic) {
            const alias = resolveAlias(source,spec,version);
            if(alias.config)insert(alias.config,'configuration');
            if(alias.dep)insert(alias.dep);
            for(const reason of alias.unknown)unknown.push(version+':'+reason);
            continue;
          }
          const dep = resolve(source, spec, version);
          if (dep.path) insert(dep.path);
          else unknown.push(version + ':' + dep.unresolved);
        }
      }
      return { edges: [...edges.values()].sort((a,b)=>a.path.localeCompare(b.path)||a.kind.localeCompare(b.kind)), unknown: [...new Set(unknown)].sort(), bytes: count };
    },
  };
}
