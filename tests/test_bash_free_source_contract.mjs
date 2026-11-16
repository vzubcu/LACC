import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sources = [
  'skills/lean-context-memory/scripts/lacc.mjs',
  'skills/lean-context-memory/scripts/ctx-slice.mjs',
  'skills/lean-context-memory/scripts/reference-scan.mjs',
  'skills/lean-context-memory/scripts/signatures.mjs',
  'skills/lean-context-memory/scripts/lacc-git-parity.mjs',
  'tests/install_smoke.mjs',
];
test('portable Node path never invokes Bash or shell-evaluates untrusted arguments', () => {
  for (const relative of sources) {
    const content = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(content,
      /(?:spawnSync|execFileSync|execSync|spawn)\(\s*['"](?:bash|sh|cmd(?:\.exe)?|powershell|pwsh)['"]/,
      'native command launched a shell: ' + relative);
    assert.doesNotMatch(content, /\bshell\s*:\s*true\b/,
      'native command enabled a shell: ' + relative);
    assert.doesNotMatch(content, /\beval\s*\(/,
      'native command uses eval: ' + relative);
  }
});
test('bundled CLI provides Native BF commands from one portable entrypoint', () => {
  const cli = fs.readFileSync(path.join(root, sources[0]), 'utf8');
  for (const command of ['ctx-slice','reference-scan','signatures','sync','init'])
    assert.ok(cli.includes(command), 'missing native command ' + command);
  assert.doesNotMatch(cli, /probe\(['"]bash['"]/,
    'native capabilities must not launch Bash to detect it');
});
test('historical Bash scripts are retained until actual parity acceptance', () => {
  for (const name of ['ctx-slice.sh','dep-graph.sh','ast-skeleton.sh',
    'init-memory.sh','sync-memory.sh'])
    assert.ok(fs.statSync(path.join(root,
      'skills/lean-context-memory/scripts', name)).isFile(),
    'compatibility script removed prematurely: ' + name);
});
