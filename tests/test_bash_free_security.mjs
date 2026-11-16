import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePorcelainZ, safeGitPath } from
  '../skills/lean-context-memory/scripts/lacc-git-parity.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts/lacc.mjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-bf-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const src = path.join(root, 'src');
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'entry.ts'),
    'export const entry = 1;\n');
  return root;
}
function call(root, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8', windowsHide: true,
    timeout: 15000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'Never', PYTHONDONTWRITEBYTECODE: '1' },
  });
}
test('Git path display never emits control/terminal escapes verbatim', () => {
  assert.equal(safeGitPath('src/escape\x1b[31m\tname\n.ts'),
    'src/escape?[31m\\tname\\n.ts');
  assert.deepEqual(parsePorcelainZ(Buffer.from('?? src/line\n.txt\0')), [
    { status: '??', path: 'src/line\n.txt', previous: null },
  ]);
});
test('known credentials are never valid reference scan targets', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'src/.env'), 'SECRET=DO_NOT_REVEAL\n');
  fs.writeFileSync(path.join(root, 'src/id_ed25519'), 'DO_NOT_REVEAL\n');
  for (const name of ['src/.env', 'src/id_ed25519']) {
    const result = call(root, 'reference-scan', name);
    assert.equal(result.status, 2, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_REVEAL/);
  }
});
test('candidate excerpts with secret-like assignments are withheld', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'src/client.ts'),
    'export const api_key = "DO_NOT_REVEAL"; // on checkout.ready\n');
  const result = call(root, 'reference-scan', 'src/entry.ts',
    '--signal', 'checkout.ready');
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /DO_NOT_REVEAL/);
  assert.match(result.stdout, /withheld/);
  assert.match(result.stdout, /incomplete/);
});
test('Python source is parsed rather than executed by optional AST mode', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'src/risky.py'),
    'from pathlib import Path\n' +
    'Path("INJECTED").write_text("unsafe")\n' +
    'class LiteralOnly:\n    def safe(self):\n        return True\n');
  const result = call(root, 'signatures', 'src/risky.py');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(root, 'INJECTED')),
    'AST discovery must never execute user source');
  assert.match(result.stdout, /LiteralOnly/);
});
test('file inspection refuses a symlink through a parent directory', t => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-bf-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'secret.ts'), 'DO_NOT_REVEAL\n');
  try { fs.symlinkSync(outside, path.join(root, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (e) {
    if (['EPERM','EACCES','ENOTSUP'].includes(e.code)) {
      t.diagnostic('Host symlink creation unavailable; native acceptance still required');
      return;
    }
    throw e;
  }
  for (const command of ['reference-scan', 'signatures']) {
    const result = call(root, command, 'linked/secret.ts');
    assert.equal(result.status, 2, result.stderr);
    assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_REVEAL/);
  }
});
