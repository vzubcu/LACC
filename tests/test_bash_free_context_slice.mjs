import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '../skills/lean-context-memory/scripts');
const direct = path.join(scripts, 'ctx-slice.mjs');
const unified = path.join(scripts, 'lacc.mjs');

function run(cli, args = [], input = '') {
  const call = cli === unified ? [cli, 'ctx-slice', ...args] : [cli, ...args];
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-bf-fixture-'));
  const env = { ...process.env, TMPDIR: temp, TMP: temp, TEMP: temp };
  const result = spawnSync(process.execPath, call, {
    cwd: temp, env, encoding: 'utf8', input, windowsHide: true,
    maxBuffer: 8 * 1024 * 1024, timeout: 15000,
  });
  return { ...result, temp, cleanup() { fs.rmSync(temp, { recursive: true, force: true }); } };
}
function equalOutput(argv, input, expected) {
  for (const cli of [unified, direct]) {
    const result = run(cli, argv, input);
    try {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, expected, cli);
      assert.equal(result.stderr, '', cli);
      assert.deepEqual(fs.readdirSync(result.temp), [],
        'default operation must not write temporary files');
    } finally { result.cleanup(); }
  }
}

test('stdin at exactly the requested limit is returned unchanged', () => {
  equalOutput(['-', '2'], 'alpha\nbeta\n', 'alpha\nbeta\n');
});
test('three lines under a two-line head/tail budget match legacy semantics', () => {
  equalOutput(['-', '2'], 'one\ntwo\nthree\n',
    'one\n\n[TRUNCATED: 1 of 3 lines omitted]\nthree\n');
});
test('single-line and empty input remain valid', () => {
  equalOutput(['-', '1'], 'one\nlast\n',
    'one\n\n[TRUNCATED: 1 of 2 lines omitted]\n');
  equalOutput(['-', '2'], '', '');
});
test('CRLF and Unicode input preserve editor-facing text correctly', () => {
  equalOutput(['-', '2'], 'café\r\nMünchen\r\n最後\r\n',
    'café\r\n\n[TRUNCATED: 1 of 3 lines omitted]\n最後\r\n');
});
test('file reading works with the unified Node CLI, no shell or Python', () => {
  const result = run(unified, ['source with spaces.txt', '4']);
  try {
    fs.writeFileSync(path.join(result.temp, 'source with spaces.txt'), 'hello\nworld\n');
    const actual = spawnSync(process.execPath, [unified, 'ctx-slice',
      'source with spaces.txt', '4'], {
      cwd: result.temp, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(actual.status, 0, actual.stderr);
    assert.equal(actual.stdout, 'hello\nworld\n');
    assert.deepEqual(fs.readdirSync(result.temp), ['source with spaces.txt']);
  } finally { result.cleanup(); }
});
test('explicit --keep retains exact private stdin bytes only when requested', () => {
  const result = run(unified, ['-', '2', '--keep'], 'one\ntwo\nthree\n');
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout,
      'one\n\n[TRUNCATED: 1 of 3 lines omitted]\nthree\n');
    const match = result.stderr.match(/Full output saved to (.+)\n$/);
    assert.ok(match, result.stderr);
    const file = match[1].trim();
    assert.equal(fs.readFileSync(file, 'utf8'), 'one\ntwo\nthree\n');
    assert.equal(fs.statSync(file).isFile(), true);
    if (process.platform !== 'win32')
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.ok(file.startsWith(result.temp));
  } finally { result.cleanup(); }
});
test('invalid options and --keep with a file fail without writing memory', () => {
  for (const argv of [
    ['-', '0'], ['-', '-3'], ['-', 'not-a-number'], ['-', '10001'],
    ['-', '2', '--unknown'], ['-', '2', 'unexpected'],
    ['example.txt', '2', '--keep'],
  ]) {
    const result = run(unified, argv, 'hello\n');
    try {
      assert.equal(result.status, 2, argv.join(' ') + '\n' + result.stderr);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /ERROR:/);
      assert.deepEqual(fs.readdirSync(result.temp), []);
    } finally { result.cleanup(); }
  }
});
test('oversized input lines fail closed and --keep cleans incomplete temporary files', () => {
  const result = run(direct, ['-', '2', '--keep'], 'x'.repeat(1024 * 1024 + 1));
  try {
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /exceeds 1 MiB/);
    assert.deepEqual(fs.readdirSync(result.temp), [],
      'failure must remove private partial retention');
  } finally { result.cleanup(); }
});
