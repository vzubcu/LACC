#!/usr/bin/env node
// BF-5 opt-in installer smoke: no Bash/WSL/Python or command-shell execution.
// Uses pinned skills@1.7.4 in an isolated, disposable project only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS = { codex: '.agents', 'claude-code': '.claude',
  'gemini-cli': '.agents', roo: '.roo' };
const MAX_LOG = 1800;
const MAX_SUBPROC = 210000;
function nodeSupported() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return major > 22 || major === 22 && minor >= 20;
}
function npxJs() {
  const bin = path.dirname(process.execPath);
  const npmParent = process.env.npm_execpath
    ? path.dirname(process.env.npm_execpath) : null;
  const paths = [
    process.env.LACC_NPX_CLI,
    path.join(bin, 'node_modules/npm/bin/npx-cli.js'),
    path.resolve(bin, '../lib/node_modules/npm/bin/npx-cli.js'),
    path.resolve(bin, '../node_modules/npm/bin/npx-cli.js'),
    npmParent && path.join(npmParent, 'npx-cli.js'),
  ].filter(Boolean);
  // POSIX package managers often install npx as a symlink to npx-cli.js.
  // Resolve the executable target, but never launch a shell shim.
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    paths.push(path.join(directory, 'npx'));
    paths.push(path.join(directory, 'npx-cli.js'));
  }
  for (const candidate of paths) {
    try {
      const resolved = fs.realpathSync(candidate);
      if (path.basename(resolved) === 'npx-cli.js' &&
          fs.statSync(resolved).isFile()) return resolved;
    } catch { /* candidate unavailable */ }
  }
  return null;
}
function run(label, bin, args, cwd, timeout = MAX_SUBPROC) {
  const result = spawnSync(bin, args, {
    cwd, encoding: 'utf8', windowsHide: true, timeout,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, DISABLE_TELEMETRY: '1',
      DO_NOT_TRACK: '1', CI: '1', PYTHONDONTWRITEBYTECODE: '1',
      GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  if (result.error || result.status !== 0)
    throw Error(label + ' failed (exit=' + result.status +
      ', error=' + (result.error?.code ?? 'none') + '): ' +
      String(result.stderr || result.stdout || '').slice(-MAX_LOG));
  return result;
}
function check(condition, explanation) { if (!condition) throw Error(explanation); }
function relativeFiles(dir) {
  const found = [];
  function visit(sub) {
    for (const item of fs.readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = path.join(sub, item.name);
      if (item.isSymbolicLink()) throw Error('refusing symlinked file in skill payload: ' + rel);
      if (item.isDirectory()) visit(rel);
      else if (item.isFile()) found.push(rel);
    }
  }
  visit('');
  return found.sort();
}
function compareInstalled(src, installed) {
  check(fs.existsSync(installed), 'missing installed skill: ' + installed);
  const expected = relativeFiles(src).filter(p =>
    !p.split(path.sep).includes('__pycache__') && !p.endsWith('.pyc'));
  const actual = relativeFiles(installed);
  check(JSON.stringify(expected) === JSON.stringify(actual),
    'installed skill file inventory differs from source');
  for (const name of expected) {
    const source = fs.readFileSync(path.join(src, name));
    const copied = fs.readFileSync(path.join(installed, name));
    check(source.equals(copied), 'installed skill bytes differ for ' + name);
  }
}
function verifyRuntime(installed, cwd) {
  const cli = path.join(installed, 'scripts/lacc.mjs');
  run('help', process.execPath, [cli, '--help'], cwd, 10000);
  run('capabilities', process.execPath, [cli, 'capabilities'], cwd, 10000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-install-init-'));
  try {
    run('init', process.execPath, [cli, 'init', root, '--agent', 'all'], root, 15000);
    const state = path.join(root, 'memory/ACTIVE_STATE.md');
    check(fs.readFileSync(state, 'utf8').includes('UNSYNCED'),
      'bootstrap must leave unverified memory checkpoint UNSYNCED');
    fs.appendFileSync(state, '\nUser handoff: preserve me.\n');
    run('re-init', process.execPath, [cli, 'init', root, '--agent', 'all'], root, 15000);
    check(fs.readFileSync(state, 'utf8').includes('User handoff: preserve me.'),
      'repeat bootstrap overwrote user memory');
    check(fs.existsSync(path.join(root, 'AGENTS.md')), 'Codex bridge missing');
    check(fs.existsSync(path.join(root, 'CLAUDE.md')), 'Claude bridge missing');
    check(fs.existsSync(path.join(root, 'GEMINI.md')), 'Gemini bridge missing');
    check(fs.existsSync(path.join(root, '.roo/rules/lean-context-memory.md')),
      'Roo bridge missing');
    run('read', process.execPath, [cli, 'read', root], root, 15000);
    const health = run('health', process.execPath, [cli, 'health', root, '--json'],
      root, 15000);
    const verdict = JSON.parse(health.stdout);
    check(['healthy', 'review'].includes(verdict.status),
      'health must return a meaningful, non-fabricated verdict');
    run('context slice', process.execPath, [cli, 'ctx-slice', state, '10'], root, 15000);
    run('signature help', process.execPath, [cli, 'signatures', '--help'], root);
    run('reference help', process.execPath, [cli, 'reference-scan', '--help'], root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function usage() {
  console.log('Usage: node tests/install_smoke.mjs [--source LOCAL_REPO] [--copy-only]\n' +
    'Opt-in network install of pinned skills@1.7.4 into disposable temp projects.');
}
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) { usage(); return 0; }
  const sourceIndex = argv.indexOf('--source');
  if (sourceIndex >= 0 && (!argv[sourceIndex + 1] ||
      argv[sourceIndex + 1].startsWith('--'))) throw Error('missing --source value');
  const source = path.resolve(sourceIndex < 0 ? ROOT : argv[sourceIndex + 1]);
  const args = [...argv];
  if (sourceIndex >= 0) args.splice(sourceIndex, 2);
  const copyOnly = args.includes('--copy-only');
  if (copyOnly) args.splice(args.indexOf('--copy-only'), 1);
  if (args.length) throw Error('unsupported options: ' + args.join(' '));
  if (!nodeSupported()) {
    console.log('UNVERIFIED: Node 22.20+ required for pinned installer');
    return 3;
  }
  const npx = npxJs();
  if (!npx) {
    console.log('UNVERIFIED: npx-cli.js unavailable; do not invoke shell wrappers');
    return 3;
  }
  const skillsDir = path.join(source, 'skills');
  check(fs.statSync(skillsDir).isDirectory(), 'local skill catalog missing');
  const skills = fs.readdirSync(skillsDir).filter(name => {
    try { return fs.statSync(path.join(skillsDir, name, 'SKILL.md')).isFile(); }
    catch { return false; }
  });
  check(skills.length > 0, 'no skill manifests');
  const modes = copyOnly ? ['copy'] : ['copy', 'link'];
  for (const mode of modes) {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'lacc-install-smoke-'));
    try {
      const cmd = [npx, '--yes', 'skills@1.7.4', 'add', source, '--skill',
        '*', '--agent', ...Object.keys(AGENTS), '-y',
        ...(mode === 'copy' ? ['--copy'] : [])];
      try {
        run('pinned installer ' + mode, process.execPath, cmd, target);
      } catch (error) {
        if (mode === 'link' && process.platform === 'win32' &&
          /EPERM|EACCES|privilege|symlink/i.test(error.message)) {
          console.log('UNVERIFIED: link mode blocked by Windows symlink privileges');
          continue;
        }
        throw error;
      }
      for (const [agent, folder] of Object.entries(AGENTS))
        for (const skill of skills) {
          const installed = path.join(target, folder, 'skills', skill);
          compareInstalled(path.join(skillsDir, skill), installed);
          if (skill === 'lean-context-memory') verifyRuntime(installed, target);
        }
      console.log('PASS: ' + mode + ' mode; ' + skills.length + ' skills; all agents');
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
  return 0;
}
try { process.exitCode = main(); }
catch (error) {
  process.stderr.write('FAIL: ' + error.message + '\n');
  process.exitCode = 1;
}
