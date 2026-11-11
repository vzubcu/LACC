import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const LIMITS = Object.freeze({ indexLines: 60, indexBytes: 4096, stateLines: 30, stateBytes: 2048, scanBytes: 16 * 1048576, topicBytes: 1048576, candidateCount: 200 });
export const defaults = Object.freeze({ topic_bytes: null, topics_total_bytes: null, load_bytes: 8192 });
const commitPattern = /^[a-f\d]{7,40}$/i;
const keyPattern = /^[a-z][a-z\d_-]*(?:\.[a-z][a-z\d_-]*)*$/;
const STOP = new Set('a an and are as at be by for from how in into is of on or the to what where with si sau din in la cu pe pentru care este'.split(' '));
export const utf8 = value => Buffer.byteLength(value, 'utf8');
export const lines = value => value.split(/\r\n|\n|\r/);
export const sha256 = async value => (await import('node:crypto')).createHash('sha256').update(value).digest('hex');

export function localPath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative) || relative.startsWith('\\\\') || /[\x00-\x1f]/.test(relative)) throw Error('unsafe path: ' + relative);
  const parts = relative.replaceAll('\\', '/').split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw Error('unsafe path: ' + relative);
  const dest = path.resolve(root, ...parts);
  if (dest !== root && !dest.startsWith(root + path.sep)) throw Error('path escapes project');
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    try { if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('unsafe symlink: ' + relative); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  return dest;
}

export function privateStore(root, relative) {
  // Prevent accidental git add -A of untrusted handoffs or private backups.
  // This does not protect against git add -f or explicitly tracked old files.
  const directory = localPath(root, relative);
  fs.mkdirSync(directory, { recursive: true });
  const ignored = localPath(root, relative + '/.gitignore');
  const expected = '*\n!.gitignore\n';
  if (!fs.existsSync(ignored))
    fs.writeFileSync(ignored, expected, { flag: 'wx', mode: 0o600 });
  else {
    const contents = fs.readFileSync(ignored, 'utf8');
    if (!contents.split(/\r?\n/).includes('*'))
      throw Error('private directory must ignore contents: ' + relative);
  }
  return directory;
}

export function git(root, args, options = {}) {
  // Git may wait for an interactive helper, hook, or filesystem service on Windows.
  // Never let a memory read/verification command block the agent indefinitely.
  const timeout = options.timeout ?? 30000;
  const result = spawnSync('git', ['--literal-pathspecs', '-C', root, ...args], {
    encoding: null, maxBuffer: 32 * 1048576, windowsHide: true,
    timeout, ...options,
    env: { ...process.env, ...options.env,
           GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  if (result.error?.code === 'ETIMEDOUT') {
    throw new Error('Git command timed out after ' + timeout + 'ms: ' + args[0] +
                    '. Check Git for Windows and the working tree; evidence was not verified.');
  }
  return { ok: result.status === 0, status: result.status, stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.alloc(0), error: result.error };
}
export const gitText = result => result.stdout.toString('utf8').trim();
export function isGit(root) { return git(root, ['rev-parse', '--is-inside-work-tree']).ok; }
export function checkedCommit(root, rev, cache = new Map()) {
  if (!cache.has(rev)) cache.set(rev, commitPattern.test(rev) && git(root, ['rev-parse', '--verify', rev + '^{commit}']).ok);
  return cache.get(rev);
}

export function budget(root) {
  const file = localPath(root, 'memory/.memory-budget.json');
  if (!fs.existsSync(file)) return { ...defaults };
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(k => !(k in defaults))) throw Error('invalid budget keys');
  for (const [key, n] of Object.entries(value)) {
    if (n === null && key !== 'load_bytes') continue;
    if (!Number.isSafeInteger(n) || n < (key === 'load_bytes' ? 512 : 1)) throw Error('invalid budget value for ' + key);
  }
  return { ...defaults, ...value };
}

export function* topicPaths(root) {
  const base = localPath(root, 'memory/topics');
  if (!fs.statSync(base).isDirectory()) throw Error('memory/topics is not a directory');
  function* walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const abs = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error('unsafe topic symlink: ' + abs);
      if (entry.isDirectory()) yield* walk(abs);
      else if (entry.isFile() && entry.name.endsWith('.md')) yield abs;
    }
  }
  yield* walk(base);
}

export function topicLines(text) {
  let fence = null;
  const result = [];
  for (const [i, line] of lines(text).entries()) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      const m = marker[1];
      if (!fence) fence = m;
      else if (m[0] === fence[0] && m.length >= fence.length) fence = null;
      continue;
    }
    if (!fence) result.push([i + 1, line]);
  }
  return result;
}
function splitMetadata(value) {
  const fields = [];
  let start = 0, fence = 0;
  for (let i = 0; i < value.length;) {
    if (value[i] === '`') {
      let end = i;
      while (value[end] === '`') end++;
      const width = end - i;
      if (!fence) fence = width;
      else if (fence === width) fence = 0;
      i = end;
    } else if (!fence && value.startsWith(' | ', i)) { fields.push(value.slice(start, i)); i += 3; start = i; }
    else i++;
  }
  fields.push(value.slice(start));
  return fields;
}
export function parseFact(line) {
  if (!/^\s*-\s+\S/.test(line)) throw Error('selected line is not a fact bullet');
  const [fact, ...parts] = splitMetadata(line);
  const meta = {};
  for (const part of parts) {
    const colon = part.indexOf(':');
    if (colon < 1) throw Error('invalid fact metadata');
    const key = part.slice(0, colon).trim(), value = part.slice(colon + 1).trim();
    if (!['source', 'verified', 'state', 'key'].includes(key) || key in meta) throw Error('invalid or duplicate fact metadata');
    meta[key] = value;
  }
  if (!/^`[^`]+`(?:\s*,\s*`[^`]+`)*$/.test(meta.source ?? '') || !(/^[a-f\d]{7,40}$/i.test(meta.verified ?? '') || /^`[a-f\d]{7,40}`$/i.test(meta.verified ?? ''))) throw Error('fact requires checked source and commit');
  if (meta.state && !['confirmed', 'review'].includes(meta.state)) throw Error('invalid fact state');
  if (meta.key && (meta.key.length > 96 || !keyPattern.test(meta.key))) throw Error('invalid fact key');
  return { fact: fact.trim(), key: meta.key ?? null, state: meta.state ?? 'confirmed', sources: Array.from(meta.source.matchAll(/`([^`]+)`/g), x => x[1]), revision: meta.verified.replaceAll('`', '') };
}
export function conflicts(facts) {
  const map = new Map();
  for (const fact of facts) {
    if (!fact.key) continue;
    if (!map.has(fact.key)) map.set(fact.key, new Map());
    const norm = fact.fact.toLocaleLowerCase('en').trim().replace(/\s+/g, ' ');
    if (!map.get(fact.key).has(norm)) map.get(fact.key).set(norm, []);
    map.get(fact.key).get(norm).push(fact.location);
  }
  return new Map([...map.entries()].filter(([, texts]) => texts.size > 1).map(([key, texts]) => [key, [...texts.values()].flat().sort()]));
}

export function inventory(root, { bounded = true, maximumFacts = Infinity } = {}) {
  let bytes = 0, skipped = 0;
  const facts = [], invalid = [], unsupported = [], files = [];
  for (const file of topicPaths(root)) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const size = fs.statSync(file).size;
    files.push({ path: relative, size });
    if (bounded && (size > LIMITS.topicBytes || size + bytes > LIMITS.scanBytes)) { skipped++; continue; }
    bytes += size;
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file));
    for (const [number, line] of topicLines(decoded)) {
      const location = relative + ':' + number;
      if (/^\s*-\s+/.test(line)) {
        if (facts.length >= maximumFacts) { skipped++; break; }
        try { facts.push({ ...parseFact(line), location }); }
        catch (error) { invalid.push({ code: 'invalid-fact', location, reason: error.message }); }
      } else if (line.trim() && !/^\s*[#>]/.test(line)) unsupported.push({ location });
    }
    if (facts.length >= maximumFacts) break;
  }
  return { facts, invalid, unsupported, files, skipped, bytes, incomplete: skipped > 0 };
}

export function verifySources(root, facts) {
  const result = new Map(), commits = new Map(), working = new Map();
  const inside = isGit(root);
  for (const row of facts) {
    const status = [];
    if (!inside || !checkedCommit(root, row.revision, commits)) {
      result.set(row.location, [{ code: 'unavailable-commit' }]); continue;
    }
    for (const source of row.sources) {
      let dest;
      try { dest = localPath(root, source); }
      catch { status.push({ code: 'unsafe-source', source }); continue; }
      if (!fs.existsSync(dest) || !fs.statSync(dest).isFile()) { status.push({ code: 'missing-source', source }); continue; }
      const key = row.revision + '\0' + source;
      if (!working.has(key)) {
        const args = ['--', source];
        const index = git(root, ['ls-files', '--stage', '-z', ...args]);
        const hist = git(root, ['ls-tree', '-r', '-z', '--full-tree', row.revision, ...args]);
        if (!index.ok || !hist.ok) throw Error('Git provenance command failed');
        const indexEntries = index.stdout.toString('utf8').split('\0').filter(Boolean);
        const histEntries = hist.stdout.toString('utf8').split('\0').filter(Boolean);
        let code = null;
        if (!indexEntries.length) code = 'untracked-source';
        else if (indexEntries.length !== 1 || histEntries.length !== 1) code = 'changed-source';
        else {
          const current = indexEntries[0].split('\t')[0].split(' ');
          const previous = histEntries[0].split('\t')[0].split(' ');
          const staged = current.length === 3 && current[2] === '0' && previous.length === 3 && previous[1] === 'blob' && current[0] === previous[0] && current[1] === previous[2];
          if (!staged) code = 'changed-source';
          else {
            const raw = fs.readFileSync(dest);
            const hash = git(root, ['hash-object', '--path=' + source, '--stdin'], { input: raw });
            if (!hash.ok) throw Error('Git worktree hashing failed');
            if (gitText(hash) !== previous[2]) code = 'changed-source';
          }
        }
        working.set(key, code);
      }
      if (working.get(key)) status.push({ code: working.get(key), source });
    }
    result.set(row.location, status);
  }
  return result;
}

export function words(text) {
  text = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLocaleLowerCase('en');
  return new Set((text.match(/[\p{L}\p{N}]+/gu) ?? []).filter(w => w.length > 1 && !STOP.has(w)));
}
export function relevance(query, row) {
  const q = words(query), fact = words(row.fact), sources = words(row.sources.join(' ')), topic = words(row.location);
  const matches = [...q].filter(w => fact.has(w) || sources.has(w) || topic.has(w));
  if (!matches.length) return 0;
  let score = 10 * matches.length;
  for (const word of q) { if (fact.has(word)) score += 4; if (sources.has(word)) score += 2; if (topic.has(word)) score++; }
  if (row.fact.toLocaleLowerCase('en').includes(query.toLocaleLowerCase('en').trim())) score += 6;
  return score;
}

export function emitLimited(result, maxBytes) {
  const encode = obj => JSON.stringify(obj) + '\n';
  const clone = structuredClone(result);
  for (const field of ['diagnostics', 'results', 'items', 'findings']) {
    if (!Array.isArray(clone[field])) continue;
    while (utf8(encode(clone)) > maxBytes && clone[field].length) {
      clone[field].pop();
      clone.output_truncated = true;
      if (field === 'diagnostics') clone.diagnostics_truncated = true;
      if (clone.stats) clone.stats.output_truncated = true;
    }
  }
  if (utf8(encode(clone)) > maxBytes && clone.disclosure_protocol) {
    // Keep truthful delivery state when the optional CR-3 guidance would
    // otherwise exceed a low token/byte budget.
    clone.disclosure_protocol = {
      schema: 1, status: 'agent-guidance-only',
      user_delivery: 'not-observed', delivery_confirmed: false,
      details_truncated: true,
    };
    clone.output_truncated = true;
  }
  const text = encode(clone);
  if (utf8(text) > maxBytes) throw Error('response metadata exceeds output budget');
  return text;
}

export function checkMemory(root, { sourceDetails = false } = {}) {
  const findings = [], add = (code, location, detail = null) =>
    findings.push(detail ? { code, location, ...detail } : { code, location });
  const limit = budget(root), items = inventory(root, { bounded: false });
  for (const [name, linesMax, bytesMax, prefix] of [
    ['MEMORY_INDEX.md', LIMITS.indexLines, LIMITS.indexBytes, 'index'],
    ['ACTIVE_STATE.md', LIMITS.stateLines, LIMITS.stateBytes, 'state'],
  ]) {
    let raw;
    try { raw = fs.readFileSync(localPath(root, 'memory/' + name)); }
    catch { add('unreadable-memory', name); continue; }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    if ((text ? text.split(/\r\n|\n|\r/).length - (/[\r\n]$/.test(text) ? 1 : 0) : 0) > linesMax) add(prefix + '-lines', name);
    if (raw.length > bytesMax) add(prefix + '-bytes', name);
    if (name === 'MEMORY_INDEX.md') for (const pointer of text.matchAll(/`(topics\/[^`]+\.md)`/g)) {
      try { if (!fs.statSync(localPath(root, 'memory/' + pointer[1])).isFile()) add('missing-topic-pointer', pointer[1]); }
      catch { add('missing-topic-pointer', pointer[1]); }
    }
  }
  for (const record of items.invalid) add('invalid-fact', record.location + ': ' + record.reason);
  for (const record of items.unsupported) add('invalid-fact-format', record.location);
  const found = new Map();
  for (const record of items.facts) {
    if (found.has(record.fact)) add('duplicate-fact', record.location + ' duplicates ' + found.get(record.fact));
    else found.set(record.fact, record.location);
    if (record.state === 'review') add('pending-review', record.location,
      sourceDetails ? { fact: { key: record.key ?? null, location: record.location,
        revision: record.revision, sources: record.sources } } : null);
  }
  for (const [key, locations] of conflicts(items.facts)) add('potential-conflict', 'key=' + key + '; ' + locations.join(', '));
  const statuses = verifySources(root, items.facts);
  for (const row of items.facts) for (const issue of statuses.get(row.location) ?? [])
    add(issue.code, row.location + (issue.source ? ' ' + issue.source : ''),
      sourceDetails ? { source: issue.source, fact: { key: row.key ?? null,
        location: row.location, revision: row.revision, sources: row.sources } } : null);
  if (limit.topic_bytes !== null) for (const item of items.files) if (item.size > limit.topic_bytes) add('topic-budget', item.path);
  if (limit.topics_total_bytes !== null && items.bytes > limit.topics_total_bytes) add('topics-total-budget', String(items.bytes));
  return { status: findings.length ? 'review' : 'healthy', findings_total: findings.length, topics: items.files.length, topic_bytes: items.bytes, findings };
}
