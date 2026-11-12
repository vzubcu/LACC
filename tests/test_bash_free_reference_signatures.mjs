import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function run(root, command, ...args) {
  return spawnSync(process.execPath, [cli, command, ...args], {
    cwd: root, encoding: 'utf8', timeout: 20000, windowsHide: true,
    maxBuffer: 8 * 1024 * 1024, env: {
      ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });
}
function write(root, name, content) {
  const abs = path.join(root, name);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-bf2b-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = spawnSync('git', ['init', '-q'], { cwd: root,
    encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(git.status, 0, git.stderr);
  write(root, 'src/producer.ts',
    'import { dispatch } from "./bus";\ndispatch("checkout.ready", payload);\n');
  write(root, 'src/bus.ts', 'export function dispatch(topic) {}\n');
  write(root, 'src/invoice-worker.ts',
    'on("checkout.ready", payload => invoice(payload.taxCents));\n');
  write(root, 'src/no-match.ts', 'on("checkoutXready", handler);\n');
  return root;
}

test('native reference search keeps old opt-in literal signals and direct outbound', t => {
  const root = fixture(t);
  const direct = run(root, 'reference-scan', 'src/producer.ts');
  assert.equal(direct.status, 0, direct.stderr);
  assert.match(direct.stdout, /OUTBOUND src\/producer\.ts:1:/);
  assert.doesNotMatch(direct.stdout, /invoice-worker\.ts:/);
  const expanded = run(root, 'reference-scan', 'src/producer.ts',
    '--signal', 'checkout.ready', '--signal', 'checkout.ready');
  assert.equal(expanded.status, 0, expanded.stderr);
  assert.equal((expanded.stdout.match(/src\/invoice-worker\.ts:1:/g) ?? []).length, 1);
  assert.doesNotMatch(expanded.stdout, /no-match\.ts:/);
  assert.match(expanded.stdout, /Heuristic references/);
});
test('relative qualified imports outrank generic prose even for root index', t => {
  const root = fixture(t);
  write(root, 'index.ts', 'export const n = 1;\n');
  write(root, 'consumer.ts', 'import { n } from "./index";\n');
  write(root, 'unrelated.ts', 'import { index } from "index-package";\n');
  for (let i = 0; i < 45; i++)
    write(root, 'docs/page' + i + '.md', 'An index of useful things.\n');
  const result = run(root, 'reference-scan', 'index.ts');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /REFERENCE consumer\.ts:1:/);
  assert.doesNotMatch(result.stdout, /REFERENCE unrelated\.ts:/);
});
test('nested src/memory, src/build and top-level bin remain discoverable', t => {
  const root = fixture(t);
  for (const folder of ['src/memory','src/build','bin'])
    write(root, folder + '/consumer.py', 'on("review.event")\n');
  const result = run(root, 'reference-scan', 'src/producer.ts',
    '--signal', 'review.event');
  assert.equal(result.status, 0, result.stderr);
  for (const folder of ['src/memory','src/build','bin'])
    assert.ok(result.stdout.includes(folder + '/consumer.py:1:'), folder);
});
test('secrets and ignored locations are omitted from broad candidate scanning', t => {
  const root = fixture(t);
  for (const name of ['src/.env.production','src/client.pem','src/.ssh/id_rsa',
    'memory/secret.md','vendor/secret.js','node_modules/secret.js']) {
    write(root, name, 'import "./producer";\n');
  }
  const result = run(root, 'reference-scan', 'src/producer.ts');
  assert.equal(result.status, 0, result.stderr);
  for (const name of ['.env.production','client.pem','id_rsa',
    'secret.md','secret.js'])
    assert.ok(!result.stdout.includes(name + ':'), name);
  assert.match(result.stdout, /incomplete/);
});
test('byte budgets, file budgets and Unicode output are bounded and explicit', t => {
  const root = fixture(t);
  for (let i = 0; i < 70; i++)
    write(root, 'src/caller' + i + '.ts',
      'import "./producer"; // ' + 'ț'.repeat(200) + '\n');
  const result = run(root, 'reference-scan', 'src/producer.ts',
    '--limit', '3', '--max-bytes', '1024');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(Buffer.byteLength(result.stdout) <= 1024);
  assert.match(result.stdout, /TRUNCATED, incomplete/);
  const short = run(root, 'reference-scan', 'src/producer.ts',
    '--max-files', '1', '--scan-bytes', '512');
  assert.equal(short.status, 0, short.stderr);
  assert.match(short.stdout, /Scan budget reached; incomplete/);
});
test('missing files, unsafe targets and invalid limits fail closed', t => {
  const root = fixture(t);
  for (const args of [
    ['missing.ts'], ['../secret.ts'], ['src/producer.ts', '--limit', '0'],
    ['src/producer.ts', '--max-bytes', '100'], ['src/producer.ts', '--max-files', '0'],
    ['src/producer.ts', '--scan-bytes', '0'], ['src/producer.ts','--signal',''],
    ['src/producer.ts', '--bad'],
  ]) {
    const result = run(root, 'reference-scan', ...args);
    assert.equal(result.status, 2, args.join(' ') + '\n' + result.stderr);
    assert.equal(result.stdout, '');
  }
});
test('a symlinked source is rejected instead of scanned', t => {
  const root = fixture(t);
  try { fs.symlinkSync(path.join(root, 'src/producer.ts'),
    path.join(root, 'source-link.ts')); }
  catch (e) {
    if (['EPERM','EACCES','ENOTSUP'].includes(e.code)) return t.skip('symlink privilege unavailable');
    throw e;
  }
  const result = run(root, 'reference-scan', 'source-link.ts');
  assert.equal(result.status, 2, result.stderr);
});
test('native heuristic signatures preserve class/function lines without decorators', t => {
  const root = fixture(t);
  write(root, 'example.ts', '@Field()\n'.repeat(100) +
    'export class Example {}\nexport function perform() {}\n');
  const result = run(root, 'signatures', 'example.ts');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /101: export class Example/);
  assert.match(result.stdout, /102: export function perform/);
  assert.doesNotMatch(result.stdout, /@Field\(\)/);
});
test('Python fallback never pretends to have AST coverage', t => {
  const root = fixture(t);
  write(root, 'example.py', 'class Example:\n    async def run(self):\n        return 1\n');
  const result = run(root, 'signatures', 'example.py', '--no-python');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Heuristic Python declarations; AST unavailable/);
  assert.match(result.stdout, /1: class Example/);
  assert.match(result.stdout, /2: async def run/);
  const strict = run(root, 'signatures', 'example.py',
    '--no-python', '--require-ast');
  assert.equal(strict.status, 2);
});
test('optional genuine Python AST remains exact for nested declarations', t => {
  const root = fixture(t);
  write(root, 'example.py', 'class Example:\n    def run(self):\n        return 1\n');
  const candidates = process.env.LACC_PYTHON
    ? [[process.env.LACC_PYTHON, []]]
    : process.platform === 'win32'
      ? [['py', ['-3']], ['python', []], ['python3', []]]
      : [['python3', []], ['python', []]];
  const py = candidates.find(([bin, prefix]) => {
    const r = spawnSync(bin, [...prefix, '--version'],
      { encoding: 'utf8', windowsHide: true, timeout: 3000 });
    const match = (r.stdout || r.stderr || '').match(/Python (\d+)\.(\d+)/);
    return !r.error && r.status === 0 && match &&
      (Number(match[1]) > 3 || Number(match[1]) === 3 &&
        Number(match[2]) >= 9);
  });
  if (!py) {
    const absent = run(root, 'signatures', 'example.py', '--require-ast');
    assert.equal(absent.status, 2, absent.stderr);
    assert.match(absent.stderr, /AST is unavailable/);
    return;
  }
  const result = run(root, 'signatures', 'example.py', '--require-ast');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Python AST definition starts/);
  assert.match(result.stdout, /class Example/);
  assert.match(result.stdout, /def run/);
});
test('signatures reject unsafe and oversized inputs without false completeness', t => {
  const root = fixture(t);
  write(root, 'large.py', 'x'.repeat(1024 * 1024 + 1));
  write(root, 'invalid.py', Buffer.from([0xff, 0xfe, 0xfd]));
  for (const args of [
    ['../secret.py'], ['large.py'], ['invalid.py', '--no-python'],
    ['example.ts','--max-bytes','20'], ['example.ts','--limit','0'],
  ]) {
    const result = run(root, 'signatures', ...args);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
  }
});
