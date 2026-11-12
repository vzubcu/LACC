#!/usr/bin/env node
// BF-2a: portable, bounded context slicing. No shell, Python or dependency install.
// Preserves stdin streaming, legacy 60/40 head/tail and explicit private --keep.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_LINES = 10000;
const MAX_LINE_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

function parseArgs(args) {
  const positional = [];
  let keep = false;
  for (const value of args) {
    if (value === '--keep') {
      if (keep) throw Error('duplicate --keep');
      keep = true;
    } else if (value === '--help' || value === '-h') {
      return { help: true };
    } else if (value.startsWith('--')) throw Error('unknown flag ' + value);
    else positional.push(value);
  }
  if (positional.length > 2) throw Error('too many arguments');
  const file = positional[0] ?? '-';
  const limitRaw = positional[1] ?? '100';
  if (!/^[0-9]+$/.test(limitRaw)) throw Error('max_lines must be a positive integer');
  const lines = Number(limitRaw);
  if (!Number.isSafeInteger(lines) || lines < 1 || lines > MAX_LINES)
    throw Error('max_lines must be 1..' + MAX_LINES);
  if (keep && file !== '-') throw Error('--keep is supported only for stdin');
  return { file, lines, keep };
}

function privateOutputDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lean-context-'));
  try {
    // Respect stricter platform-specific private ACLs where supported.
    if (process.platform !== 'win32') fs.chmodSync(dir, 0o700);
    // On Windows the directory inherits the current user's temp ACL.
    const file = path.join(dir, 'stdin.log');
    const fd = fs.openSync(file, 'wx', 0o600);
    return { dir, file, fd };
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

export async function sliceContext(args, {
  stdin = process.stdin, stdout = process.stdout, stderr = process.stderr,
} = {}) {
  let opts;
  try { opts = parseArgs(args); }
  catch (error) {
    stderr.write('ERROR: ' + error.message + '\n');
    return 2;
  }
  if (opts.help) {
    stdout.write('Usage: node ctx-slice.mjs [file|-] [max_lines=100] [--keep]\n' +
      'Keeps a 60/40 head/tail slice. --keep explicitly stores private stdin bytes.\n');
    return 0;
  }

  let reader, retained = null, success = false, onTerm = null, onInterrupt = null;
  try {
    if (opts.file === '-') reader = stdin;
    else {
      // Never follow a direct symlink as a convenience for inspecting sources.
      const details = fs.lstatSync(opts.file);
      if (!details.isFile() || details.isSymbolicLink()) throw Error('file must be regular and not a symlink');
      reader = fs.createReadStream(opts.file);
    }
    if (opts.keep) {
      retained = privateOutputDir();
      const cleanupSignal = code => {
        try {
          if (retained?.fd != null) fs.closeSync(retained.fd);
          if (retained?.dir) fs.rmSync(retained.dir, { recursive: true, force: true });
        } finally { process.exit(code); }
      };
      onTerm = () => cleanupSignal(143);
      onInterrupt = () => cleanupSignal(130);
      process.once('SIGTERM', onTerm);
      process.once('SIGINT', onInterrupt);
    }

    const headCount = Math.max(1, Math.floor(opts.lines * 0.6));
    const tailCount = opts.lines - headCount;
    const first = [], last = [];
    let count = 0, pending = Buffer.alloc(0), capturedBytes = 0;
    function takeLine(bytes) {
      count++;
      if (count <= opts.lines) {
        first.push(bytes);
        capturedBytes += bytes.length;
      }
      if (tailCount > 0) {
        last.push(bytes);
        capturedBytes += bytes.length;
        if (last.length > tailCount) capturedBytes -= last.shift().length;
      }
      if (capturedBytes > MAX_OUTPUT_BYTES)
        throw Error('slice output exceeds 16 MiB; choose a smaller max_lines');
    }
    for await (const item of reader) {
      const raw = Buffer.isBuffer(item) ? item : Buffer.from(item);
      if (retained) fs.writeSync(retained.fd, raw);
      let start = 0, pos;
      while ((pos = raw.indexOf(10, start)) !== -1) {
        const piece = raw.subarray(start, pos + 1);
        if (pending.length + piece.length > MAX_LINE_BYTES)
          throw Error('input line exceeds 1 MiB; inspect targeted ranges');
        takeLine(pending.length ? Buffer.concat([pending, piece]) : Buffer.from(piece));
        pending = Buffer.alloc(0);
        start = pos + 1;
      }
      const rest = raw.subarray(start);
      if (pending.length + rest.length > MAX_LINE_BYTES)
        throw Error('input line exceeds 1 MiB; inspect targeted ranges');
      if (rest.length) pending = pending.length
        ? Buffer.concat([pending, rest]) : Buffer.from(rest);
    }
    if (pending.length) takeLine(pending);
    const selected = count <= opts.lines
      ? first : [
        ...first.slice(0, headCount),
        Buffer.from('\n[TRUNCATED: ' + (count - opts.lines) +
          ' of ' + count + ' lines omitted]\n'),
        ...last,
      ];
    const output = Buffer.concat(selected);
    if (output.length > MAX_OUTPUT_BYTES)
      throw Error('slice output exceeds 16 MiB; choose a smaller max_lines');
    stdout.write(output.toString('utf8'));
    if (retained) {
      fs.closeSync(retained.fd); retained.fd = null;
      stderr.write('\nFull output saved to ' + retained.file + '\n');
    }
    success = true;
    return 0;
  } catch (error) {
    stderr.write('ERROR: ' + error.message + '\n');
    return 2;
  } finally {
    if (onTerm) process.removeListener('SIGTERM', onTerm);
    if (onInterrupt) process.removeListener('SIGINT', onInterrupt);
    if (retained && retained.fd != null) {
      try { fs.closeSync(retained.fd); } catch { /* cleanup only */ }
    }
    if (retained && !success)
      fs.rmSync(retained.dir, { recursive: true, force: true });
    if (reader && reader !== stdin) reader.destroy();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  sliceContext(process.argv.slice(2)).then(code => { process.exitCode = code; })
    .catch(error => {
      process.stderr.write('ERROR: ' + error.message + '\n');
      process.exitCode = 2;
    });
}
