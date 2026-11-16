#!/usr/bin/env node
// BF-2b: Bash-free declaration candidates. Python AST is delegated to the
// existing safe stdlib Python parser when available; otherwise Python syntax
// precision is explicitly unavailable, never silently called an AST.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEC = new TextDecoder('utf-8', { fatal: true });
const utf8 = s => Buffer.byteLength(s, 'utf8');
const MAX_FILE = 1024 * 1024;
const OTHER = /^\s*(?:(?:export|default|async|public|protected|private|static|abstract|final|override)\s+)*(?:class|interface|type|enum|function|fn|struct|trait|impl|namespace|module|func)\b/;
const PY = /^\s*(?:async\s+def|def|class)\s+\w+/;
function numberFlag(raw, label, minimum, maximum) {
  if (!/^[0-9]+$/.test(raw ?? '')) throw Error(label + ' requires an integer');
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < minimum || n > maximum)
    throw Error(label + ' must be ' + minimum + '..' + maximum);
  return n;
}
function argsParse(argv) {
  const out = { file: null, limit: 80, maxBytes: 5000,
    requireAst: false, noPython: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '--limit') out.limit = numberFlag(argv[++i], arg, 1, 500);
    else if (arg === '--max-bytes') out.maxBytes = numberFlag(argv[++i], arg, 512, MAX_FILE);
    else if (arg === '--require-ast') out.requireAst = true;
    else if (arg === '--no-python') out.noPython = true;
    else if (arg.startsWith('--')) throw Error('unknown option: ' + arg);
    else if (!out.file) out.file = arg;
    else throw Error('too many filenames');
  }
  if (!out.file) throw Error('Usage: signatures <file> [--limit N] [--max-bytes N] [--require-ast]');
  if (out.requireAst && out.noPython) throw Error('--require-ast conflicts with --no-python');
  return out;
}
function safeFile(root, file) {
  const resolved = path.resolve(root, file);
  const rel = path.relative(root, resolved);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel))
    throw Error('file must be inside the project');
  let cursor = root;
  for (const part of rel.split(path.sep)) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('unsafe symlink path');
  }
  if (!fs.statSync(resolved).isFile()) throw Error('file is not a regular local path');
  if (fs.statSync(resolved).size > MAX_FILE)
    throw Error('file exceeds 1 MiB; inspect targeted ranges');
  return resolved;
}
function pythonRuntime(cwd) {
  const commands = process.env.LACC_PYTHON
    ? [[process.env.LACC_PYTHON, []]]
    : process.platform === 'win32'
      ? [['py', ['-3']], ['python', []], ['python3', []]]
      : [['python3', []], ['python', []]];
  for (const [bin, prefix] of commands) {
    const result = spawnSync(bin, [...prefix, '--version'], {
      cwd, encoding: 'utf8', timeout: 3000, windowsHide: true,
    });
    const version = (result.stdout || result.stderr || '').match(/Python (\d+)\.(\d+)/);
    if (!result.error && result.status === 0 && version &&
        (Number(version[1]) > 3 || Number(version[1]) === 3 && Number(version[2]) >= 9))
      return { bin, prefix };
  }
  return null;
}
function formatHeuristic(bytes, file, opts, pythonFallback) {
  const source = DEC.decode(bytes);
  const lines = source.split(/\r\n|\r|\n/);
  const numbers = [];
  const pattern = pythonFallback ? PY : OTHER;
  for (let i = 0; i < lines.length; i++)
    if (pattern.test(lines[i])) numbers.push(i + 1);
  let result = pythonFallback
    ? 'Heuristic Python declarations; AST unavailable; syntax, decorators and nested semantics unverified\n'
    : 'Heuristic declaration candidates; methods and dynamic definitions may be missing\n';
  let shown = 0;
  for (const number of numbers.slice(0, opts.limit)) {
    const line = number + ': ' + lines[number - 1].trim() + '\n';
    if (utf8(result + line) > opts.maxBytes - 120) break;
    result += line; shown++;
  }
  result += 'Coverage: ' + shown + '/' + numbers.length + ' declarations' +
    (shown < numbers.length ? '; TRUNCATED\n' : '\n');
  if (utf8(result) > opts.maxBytes) throw Error('output exceeded max-bytes');
  return result;
}
export function signatures(argv, { cwd = process.cwd(),
  stdout = process.stdout, stderr = process.stderr } = {}) {
  let opts;
  try { opts = argsParse(argv); }
  catch (e) { stderr.write('ERROR: ' + e.message + '\n'); return 2; }
  if (opts.help) {
    stdout.write('Usage: signatures <file> [--limit N] [--max-bytes N] [--require-ast] [--no-python]\n' +
      'Python AST uses optional Python 3.9+ without Bash. Without Python, output is explicitly heuristic.\n');
    return 0;
  }
  try {
    const root = path.resolve(cwd);
    const abs = safeFile(root, opts.file);
    const isPython = path.extname(abs).toLowerCase() === '.py';
    if (opts.requireAst && !isPython) throw Error('--require-ast accepts Python files only');
    const bytes = fs.readFileSync(abs);
    if (isPython && !opts.noPython) {
      const py = pythonRuntime(root);
      if (py) {
        // stdlib ast.parse only; don't import or execute the inspected project.
        const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'signatures.py');
        const result = spawnSync(py.bin, [...py.prefix, '-E', '-S', '-X', 'utf8', script, opts.file,
          '--limit', String(opts.limit), '--max-bytes', String(opts.maxBytes)], {
          cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15000,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1',
            PYTHONNOUSERSITE: '1' },
        });
        if (result.error) throw Error('Python AST failed: ' + result.error.message);
        if (result.status !== 0) {
          stderr.write('ERROR: Python AST validation failed: ' +
            String(result.stderr || 'unknown error').slice(0, 512) + '\n');
          return 2;
        }
        if (utf8(result.stdout) > opts.maxBytes)
          throw Error('Python AST output exceeded max-bytes');
        stdout.write(result.stdout);
        return 0;
      }
    }
    if (opts.requireAst) throw Error('Python 3.9+ AST is unavailable');
    stdout.write(formatHeuristic(bytes, abs, opts, isPython));
    return 0;
  } catch (e) {
    stderr.write('ERROR: ' + e.message + '\n'); return 2;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = signatures(process.argv.slice(2));
