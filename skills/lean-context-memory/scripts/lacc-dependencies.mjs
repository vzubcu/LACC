// Experimental, conservative JS/TS local-import staleness checks.
// This is a bounded heuristic, NOT an authoritative compiler/module resolver.
import fs from 'node:fs';
import path from 'node:path';
import { git, localPath, verifySources } from './lacc-core.mjs';

const LANG = /\.(?:[cm]?[jt]sx?)$/i;
const EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
const DEPTH = 3, MAX_EDGES = 32, MAX_FILE = 128 * 1024, MAX_TOTAL = 1024 * 1024;

function imports(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const edges = [], uncertain = [];
  // Line-oriented extraction. Multiline/templated syntax can be incomplete.
  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//') || line.startsWith('*')) continue;
    const regexp = /(?:\b(?:import|export)\s+(?:[^"'\x60]{0,250}?\bfrom\s*)?|(?:\brequire\s*\(\s*))(['"])([^'"\r\n]+)\1/g;
    let found = false, match;
    while ((match = regexp.exec(line)) !== null) {
      found = true;
      edges.push(match[2]);
    }
    if (!found && (/\bimport\s*\(/.test(line) || /\brequire\s*\(/.test(line) ||
      /\bimport\s+(?!type\b)/.test(line) || /\bexport\b.*\bfrom\b/.test(line))) {
      uncertain.push(i + 1);
    }
  }
  return { edges: [...new Set(edges)], uncertain };
}
function objectAt(root, revision, source) {
  const r = git(root, ['show', revision + ':' + source]);
  return r.ok ? r.stdout : null;
}
function safeCandidate(root, from, spec) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  const rel = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('/') || rel.startsWith('memory/'))
    throw Error('import outside permitted source tree');
  localPath(root, rel);
  return rel;
}
function locate(root, revision, from, spec) {
  const base = safeCandidate(root, from, spec);
  if (!base) return { external: true };
  for (const ext of EXT) {
    const rel = base + ext;
    try {
      const file = localPath(root, rel);
      if ((fs.existsSync(file) && fs.statSync(file).isFile()) ||
          objectAt(root, revision, rel) !== null) return { path: rel };
    } catch (error) {
      if (String(error.message).includes('symlink')) return { unsafe: true };
    }
  }
  return { unresolved: true };
}
export function verifyDependencies(root, facts) {
  const results = new Map();
  for (const fact of facts) {
    const issues = [], queued = fact.sources.map(source => [source, 0]);
    const visited = new Set();
    let edges = 0, total = 0;
    const flag = (code, source, dependency) =>
      issues.push({ code, source, dependency });
    while (queued.length) {
      const [source, depth] = queued.shift();
      if (visited.has(source)) continue;
      visited.add(source);
      if (!LANG.test(source)) {
        flag('dependency-coverage-incomplete', source, 'unsupported-language');
        continue;
      }
      let bytes;
      try {
        const file = localPath(root, source);
        if (!fs.statSync(file).isFile()) throw Error('missing');
        const size = fs.statSync(file).size;
        if (size > MAX_FILE || total + size > MAX_TOTAL) {
          flag('dependency-coverage-incomplete', source, 'byte-budget');
          continue;
        }
        bytes = fs.readFileSync(file);
        total += bytes.length;
      } catch {
        flag('dependency-coverage-incomplete', source, 'unreadable-current-file');
        continue;
      }
      let current, previous;
      try {
        current = imports(bytes);
        const historic = objectAt(root, fact.revision, source);
        if (historic === null || historic.length > MAX_FILE) {
          flag('dependency-coverage-incomplete', source, 'unavailable-historical-source');
          continue;
        }
        previous = imports(historic);
      } catch {
        flag('dependency-coverage-incomplete', source, 'invalid-utf8-or-import-syntax');
        continue;
      }
      if (current.uncertain.length || previous.uncertain.length)
        flag('dependency-coverage-incomplete', source, 'unresolved-import-expression');
      const all = [...new Set([...current.edges, ...previous.edges])];
      if (depth >= DEPTH && all.some(spec => spec.startsWith('.'))) {
        flag('dependency-coverage-incomplete', source, 'depth-limit');
        continue;
      }
      for (const spec of all) {
        if (!spec.startsWith('.')) {
          // External packages and aliases are outside the local graph.
          flag('dependency-coverage-incomplete', source, 'external-or-alias:' + spec);
          continue;
        }
        if (++edges > MAX_EDGES) {
          flag('dependency-coverage-incomplete', source, 'edge-limit');
          break;
        }
        const located = locate(root, fact.revision, source, spec);
        if (located.unsafe) {
          flag('dependency-coverage-incomplete', source, 'unsafe-import:' + spec);
        } else if (located.unresolved || !located.path) {
          flag('dependency-coverage-incomplete', source, 'unresolved-import:' + spec);
        } else {
          const dependency = located.path;
          const synthetic = { location: 'dependency:' + dependency, revision: fact.revision,
            sources: [dependency] };
          const check = verifySources(root, [synthetic]).get(synthetic.location) ?? [];
          if (check.length) flag('dependency-changed', source, dependency);
          queued.push([dependency, depth + 1]);
        }
      }
      if (edges > MAX_EDGES) break;
    }
    results.set(fact.location, { issues,
      scope: 'best-effort-static-relative-JS-TS',
      complete: issues.length === 0 && edges <= MAX_EDGES });
  }
  return results;
}
