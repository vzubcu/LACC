#!/usr/bin/env node
// BF-2b: bounded reference candidates, NOT a resolved/semantic call graph.
// No shell, Python, external packages or project code execution.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const FILE_MAX = 1024 * 1024;
const DEC = new TextDecoder('utf-8', { fatal: true });
const PARTS = new Set(['.git','node_modules','__pycache__','.ssh','.aws','.kube','.gnupg','.secrets']);
const ROOTS = new Set(['memory','vendor','dist','.superpowers']);
const NAMES = new Set(['.env','.npmrc','.netrc','.pypirc','credentials','id_rsa','id_ed25519']);
const IMPORT = /\b(?:import|from|require|use|using|include|export)\b/;
const OUTBOUND = /\b(?:import|require|include)\b|\bfrom\s+\S+\s+import\b|["']\.{1,2}\//;
const QUOTES = /["']([^"']+)["']/g;
const REDACT = /\b(?:password|secret|token|api[_-]?key|private[_-]?key)\s*[:=]/i;
const utf8 = v => Buffer.byteLength(v, 'utf8');
const safeDisplay = text => text.replace(/[\x00-\x1f\x7f-\x9f]/g, '?');
const posix = p => p.split(path.sep).join('/');
const escapeRE = s => s.replace(/[\^$.*+?()[\]{}|\\]/g, '\\$&');
const within = (root, target) => {
  const rel = path.relative(root, target);
  return rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
};
function safeFile(root, candidate) {
  if (!candidate || candidate.includes('\0')) return null;
  const abs = path.resolve(root, candidate);
  if (!within(root, abs)) return null;
  let cursor = root;
  try {
    for (const component of path.relative(root, abs).split(path.sep)) {
      cursor = path.join(cursor, component);
      if (fs.lstatSync(cursor).isSymbolicLink()) return null;
    }
    return fs.statSync(abs).isFile() ? abs : null;
  } catch { return null; }
}
function privatePath(rel) {
  const parts = rel.toLowerCase().split('/');
  const name = parts.at(-1);
  return parts.some(p => !p || p === '..' || PARTS.has(p)) ||
    ROOTS.has(parts[0]) || NAMES.has(name) || name.startsWith('.env.') ||
    /\.(?:pem|key|p12|pfx|kdbx)$/.test(name);
}
function glob(text) {
  if (!text || utf8(text) > 256 || /[\r\n\0]/.test(text))
    throw Error('invalid exclude glob');
  let out = '^';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '*' && text[i + 1] === '*') { out += '.*'; i++; }
    else if (text[i] === '*') out += '[^/]*';
    else if (text[i] === '?') out += '[^/]';
    else out += escapeRE(text[i]);
  }
  return new RegExp(out + '$');
}
function numberFlag(text, name, minimum, maximum) {
  if (!/^[0-9]+$/.test(text ?? '')) throw Error(name + ' requires an integer');
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < minimum || n > maximum)
    throw Error(name + ' must be ' + minimum + '..' + maximum);
  return n;
}
function parse(argv) {
  const result = { positionals: [], signals: [], excludes: [],
    limit: 40, maxBytes: 5000, maxFiles: 5000, scanBytes: 16 * 1024 * 1024 };
  const nums = { '--limit': ['limit',1,500], '--max-bytes': ['maxBytes',512,FILE_MAX],
    '--max-files': ['maxFiles',1,20000],
    '--scan-bytes': ['scanBytes',1,128 * 1024 * 1024] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--signal' || arg === '--exclude') {
      const value = argv[++i];
      if (!value || value.startsWith('--') || /[\r\n\0]/.test(value) ||
          utf8(value) > 256) throw Error(arg + ' needs a bounded single-line literal');
      const group = arg === '--signal' ? result.signals : result.excludes;
      if (group.length >= 16) throw Error('too many ' + arg + ' entries');
      group.push(value);
    } else if (Object.hasOwn(nums, arg)) {
      const [key, min, max] = nums[arg];
      result[key] = numberFlag(argv[++i], arg, min, max);
    } else if (arg.startsWith('--')) throw Error('unknown option: ' + arg);
    else result.positionals.push(arg);
  }
  if (result.positionals.length < 1 || result.positionals.length > 2)
    throw Error('Usage: reference-scan <file> [symbol] [--signal TEXT]');
  result.excludes = result.excludes.map(glob);
  return result;
}
function inventoryGit(root) {
  const r = spawnSync('git', ['ls-files','-co','--exclude-standard','-z'], {
    cwd: root, encoding: 'buffer', windowsHide: true,
    timeout: 12000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  if (r.error || r.status !== 0) return null;
  const files = r.stdout.toString('utf8').split('\0').filter(Boolean);
  return files.some(p => p.includes('\ufffd')) ? null : files;
}
function inventoryWalk(root, max) {
  const stack = [root], files = [];
  let incomplete = false;
  while (stack.length && files.length <= max) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { incomplete = true; continue; }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = posix(path.relative(root, abs));
      if (privatePath(rel) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile()) files.push(rel);
      if (files.length > max) { incomplete = true; break; }
    }
  }
  return { files, incomplete };
}
function findKind(text, rel, target, symbol, signals) {
  const stem = target.replace(/\.[^/.]+$/, '');
  const dotted = stem.replaceAll('/', '.').replace(/\.__init__$/, '');
  if (rel === target && IMPORT.test(text) && OUTBOUND.test(text))
    return { kind: 'OUTBOUND', rank: 0 };
  if (IMPORT.test(text)) {
    let qualified = dotted.includes('.') &&
      new RegExp('(^|[^\\w.])' + escapeRE(dotted) + '(?![\\w.])').test(text);
    if (target.endsWith('.py') && !dotted.includes('.'))
      qualified ||= new RegExp('^\\s*(?:from\\s+' + escapeRE(dotted) +
        '\\s+import\\b|import\\s+' + escapeRE(dotted) + '(?:\\s|,|$))').test(text);
    for (const m of text.matchAll(QUOTES)) {
      if (!m[1].startsWith('.')) continue;
      const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
      if (candidate === stem || candidate + '/index' === stem || candidate === target)
        qualified = true;
    }
    if (qualified) return { kind: 'REFERENCE', rank: 0 };
  }
  if (symbol && new RegExp('(?<!\\w)' + escapeRE(symbol) + '(?!\\w)').test(text))
    return { kind: 'SYMBOL', rank: 1 };
  if (signals.some(s => text.includes(s))) return { kind: 'SIGNAL', rank: 1 };
  return null;
}
export function referenceScan(argv, { cwd = process.cwd(),
  stdout = process.stdout, stderr = process.stderr } = {}) {
  let opts;
  try { opts = parse(argv); }
  catch (e) { stderr.write('ERROR: ' + e.message + '\n'); return 2; }
  if (opts.help) {
    stdout.write('Usage: reference-scan <file> [symbol] [--signal LITERAL] [--exclude GLOB] [--limit N] [--max-bytes N] [--max-files N] [--scan-bytes N]\n');
    return 0;
  }
  try {
    const root = path.resolve(cwd);
    const source = safeFile(root, opts.positionals[0]);
    if (!source) throw Error('target must be a local regular file without symlinks');
    const target = posix(path.relative(root, source));
    if (privatePath(target)) throw Error('sensitive target cannot be scanned');
    const symbol = opts.positionals[1] ?? null;
    if (symbol && utf8(symbol) > 256) throw Error('symbol is too long');
    const fromGit = inventoryGit(root);
    const fallback = fromGit ? null : inventoryWalk(root, opts.maxFiles + 1);
    const inv = fromGit ? 'git (respects ignore files)' : 'walk (ignore coverage incomplete)';
    const candidates = [...new Set([...(fromGit ?? fallback.files), target])]
      .filter(name => typeof name === 'string' && !name.includes('\0'));
    let excluded = 0;
    const names = candidates.filter(name => {
      const rel = name.replaceAll('\\', '/');
      if (rel !== target && (privatePath(rel) || opts.excludes.some(re => re.test(rel)))) {
        excluded++; return false;
      }
      return true;
    }).map(p => p.replaceAll('\\', '/'));
    names.sort((a, b) => Number(b === target) - Number(a === target) ||
      a.localeCompare(b, 'en'));
    let scanned = 0, consumed = 0, skipped = 0, total = 0,
      redacted = 0, budgetHit = Boolean(fallback?.incomplete);
    const matches = [];
    for (const name of names) {
      if (scanned >= opts.maxFiles) { budgetHit = true; break; }
      const abs = safeFile(root, name);
      if (!abs) { skipped++; continue; }
      try {
        const size = fs.statSync(abs).size;
        if (size > FILE_MAX) { skipped++; continue; }
        if (consumed + size > opts.scanBytes) { budgetHit = true; continue; }
        const data = fs.readFileSync(abs);
        consumed += data.length;
        if (data.includes(0)) { skipped++; continue; }
        const content = DEC.decode(data);
        scanned++;
        const lines = content.split(/\r\n|\r|\n/);
        for (let i = 0; i < lines.length; i++) {
          const matched = findKind(lines[i], name, target, symbol, opts.signals);
          if (!matched) continue;
          if (REDACT.test(lines[i])) { redacted++; continue; }
          total++;
          matches.push({ ...matched, name, number: i + 1,
            display: matched.kind + ' ' + safeDisplay(name) +
              ':' + (i + 1) + ': ' + safeDisplay(lines[i].trim()) });
          matches.sort((a, b) => a.rank - b.rank ||
            a.name.localeCompare(b.name, 'en') || a.number - b.number);
          if (matches.length > opts.limit) matches.pop();
        }
      } catch { skipped++; }
    }
    let text = 'Heuristic references; imports/text matches are not a resolved call graph.\n' +
      'Inventory: ' + inv + '; scanned ' + scanned + ' files/' + consumed +
      ' bytes; excluded ' + excluded + '; skipped ' + skipped +
      ' oversized/binary/unsafe files.\n';
    if (opts.signals.length) text += 'Evidence-triggered expansion: literal signals.\n';
    if (redacted) text += 'Sensitive-looking matched lines withheld: ' + redacted + '.\n';
    let shown = 0;
    for (const m of matches) {
      if (utf8(text + m.display + '\n') > opts.maxBytes - 300) break;
      text += m.display + '\n'; shown++;
    }
    text += 'Coverage: ' + shown + '/' + total + ' unique references shown; ' +
      (shown < total ? 'TRUNCATED, incomplete.' :
        'no display truncation; implicit/dynamic coupling may be missing.');
    if (budgetHit) text += ' Scan budget reached; incomplete.';
    if (skipped || excluded || redacted || fallback)
      text += ' Skipped/excluded/withheld paths or inventory gaps make search incomplete.';
    text += '\n';
    if (utf8(text) > opts.maxBytes) throw Error('output exceeds max-bytes');
    stdout.write(text);
    return 0;
  } catch (e) {
    stderr.write('ERROR: ' + e.message + '\n');
    return 2;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = referenceScan(process.argv.slice(2));
