#!/usr/bin/env node
"use strict";
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget, checkMemory, conflicts, defaults, emitLimited, git, gitText, inventory, isGit, LIMITS, localPath, relevance, utf8, verifySources, words } from './lacc-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.resolve(here, '..');
const START = '<!-- LEAN-CONTEXT-MEMORY:START -->';
const END = '<!-- LEAN-CONTEXT-MEMORY:END -->';
const actions = {
  'changed-source': 'Inspect current source and tests; revise or explicitly revalidate after review.',
  'missing-source': 'Find reviewed replacement source, never invent provenance.',
  'unsafe-source': 'Correct unsafe source path.',
  'untracked-source': 'Verify tracked evidence before confirming fact.',
  'unavailable-commit': 'Find valid checked commit before confirming fact.',
  'potential-conflict': 'Review conflicting claims; do not choose a winner automatically.',
  'pending-review': 'Keep pending until a reviewed check succeeds.',
  'invalid-fact': 'Repair formatting/provenance and review evidence.',
};

function options(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (['json', 'include-review', 'strict', 'stamp'].includes(key)) opts[key] = true;
      else if (['query', 'agent', 'limit', 'max-bytes', 'topic'].includes(key)) {
        if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('missing value for ' + arg);
        if (key === 'topic') (opts.topic ??= []).push(argv[++i]);
        else opts[key] = argv[++i];
      } else throw Error('unknown option: ' + arg);
    } else opts._.push(arg);
  }
  return opts;
}
function cap(root, opts) {
  const conf = budget(root).load_bytes;
  const value = opts['max-bytes'] == null ? conf : Number(opts['max-bytes']);
  if (!Number.isSafeInteger(value) || value < 512) throw Error('max-bytes must be an integer >= 512');
  return Math.min(value, conf);
}
function runtimeStatus() {
  const probe = (bin, argv) => { const r = spawnSync(bin, argv, { encoding: 'utf8', windowsHide: true, timeout: 3000 }); return r.error ? null : (r.stdout || r.stderr).trim().split('\n')[0]; };
  const result = {
    platform: process.platform, node: process.version,
    git: probe('git', ['--version']), python: probe('python', ['--version']) ?? probe('python3', ['--version']),
    bash: probe('bash', ['--version']),
    commands: { init: true, read: true, search: true, health: true, doctor: true, sync: true },
    strict_git_evidence: Boolean(probe('git', ['--version'])),
    python_maintenance: 'optional separate Python tool; not implemented in Node',
    mode: 'node',
  };
  return result;
}
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function readUtf8(file) { return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file)); }
function safeWrite(dest, data) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data, { encoding: 'utf8' });
}
function init(root, opts) {
  const agent = opts.agent ?? 'auto';
  if (!['auto','codex','claude','gemini','roo','all'].includes(agent)) throw Error('unknown agent: ' + agent);
  const native = { claude: 'CLAUDE.md', gemini: 'GEMINI.md', roo: '.roo/rules/lean-context-memory.md' };
  const selected = new Map();
  const common = `${START}\n## Project memory (lean-context-memory v3.2)\n` +
    `- Read ${path.join(skill, 'SKILL.md').replaceAll('\\','/')} and use memory/ as the project fact store.\n` +
    `- Prefer Node CLI: node ${path.join(here, 'lacc.mjs').replaceAll('\\','/')} <command> . (no Python/Bash required).\n` +
    `- At task start run sync, read HOT, and search WARM by task; inspect code and tests before acting.\n` +
    `- Keep confirmed facts with real sources and checked commits; run health before handoff.\n` +
    `- If Git or Node is unavailable, use native agent tools and disclose unverified evidence.\n${END}`;
  const bridge = `${START}\nRead marked LACC instructions in project-root AGENTS.md once; use the same memory/ facts.\n${END}`;
  selected.set('AGENTS.md', common);
  for (const [name, dest] of Object.entries(native)) {
    // In auto mode a symlinked native file remains untouched; explicit targets
    // validate the destination and refuse to overwrite a symlink.
    const probe = path.join(root, ...dest.split('/'));
    const explicit = agent === name || agent === 'all';
    if (agent === 'auto') {
      if (!fs.existsSync(probe)) continue;
      try { localPath(root, dest); }
      catch (error) { if (String(error.message).includes('symlink')) continue; throw error; }
    }
    if (explicit || agent === 'auto') {
      localPath(root, dest);
      selected.set(dest, name === 'claude' ? `${START}\n@AGENTS.md\n${END}` : bridge);
    }
  }
  const templatePaths = ['MEMORY_INDEX.md','ACTIVE_STATE.md','topics/architecture.md','topics/db-and-api.md','topics/gotchas.md','topics/decisions.md','topics/lessons.md'];
  const output = [];
  const manifest = localPath(root, 'memory/.bootstrap.json');
  const generated = fs.existsSync(manifest) ? JSON.parse(readUtf8(manifest)) : {};
  if (!generated || typeof generated !== 'object' || Array.isArray(generated)) throw Error('invalid bootstrap manifest');
  const next = { ...generated };
  for (const [dest, block] of selected) {
    const target = localPath(root, dest);
    const existing = fs.existsSync(target) ? readUtf8(target) : '# Agent Instructions\n';
    if (existing.split(START).length !== existing.split(END).length || existing.split(START).length > 2 || (existing.includes(START) && existing.indexOf(END) < existing.indexOf(START))) throw Error('ambiguous instruction markers: ' + dest);
    const updated = existing.includes(START) ? existing.replace(new RegExp(START + '[\\s\\S]*?' + END), block) : existing.replace(/\n*$/, '') + '\n\n' + block + '\n';
    const created = !fs.existsSync(target) || sha(fs.readFileSync(target)) === generated[dest];
    if (created) next[dest] = sha(updated);
    else delete next[dest];
    output.push([target, updated]);
  }
  const templates = templatePaths.map(rel => [localPath(root, 'memory/' + rel), path.join(skill, 'templates', ...rel.split('/'))]);
  // All paths were checked before any writes; preserve existing project facts.
  for (const [dest, template] of templates) if (!fs.existsSync(dest)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(template, dest); }
  for (const [dest, value] of output) if (!fs.existsSync(dest) || readUtf8(dest) !== value) safeWrite(dest, value);
  const manifestData = JSON.stringify(next, null, 2) + '\n';
  if (!fs.existsSync(manifest) || readUtf8(manifest) !== manifestData) safeWrite(manifest, manifestData);
  return { status: 'initialized', agent, created_templates: templates.filter(([dest]) => fs.existsSync(dest)).length, maintained_paths: [...selected.keys()] };
}
function readMemory(root, opts) {
  const max = cap(root, opts), topic = opts.topic ?? [];
  const selected = topic.length ? topic.map(x => 'memory/topics/' + x) : ['memory/ACTIVE_STATE.md', 'memory/MEMORY_INDEX.md'];
  const files = [...new Set(selected)].map(name => [name, localPath(root, name)]);
  for (const [, file] of files) if (!fs.statSync(file).isFile()) throw Error('missing memory file');
  const suffix = '\n[TRUNCATED: memory load budget reached; narrow read.]\n';
  const finish = '\n[Memory selection complete; other topics were not loaded.]\n';
  let result = '';
  let truncated = false;
  for (const [name, file] of files) {
    const header = '## ' + name + '\n';
    const body = readUtf8(file) + '\n';
    if (utf8(result + header + body + finish) <= max) result += header + body;
    else {
      truncated = true;
      const budget = max - utf8(result + header + suffix);
      if (budget <= 0) break;
      let fragment = '';
      for (const char of body) { if (utf8(fragment + char) > budget) break; fragment += char; }
      result += header + fragment;
      break;
    }
  }
  const output = result + (truncated ? suffix : finish);
  if (utf8(output) > max) throw Error('memory output exceeds budget');
  return output;
}
function searchMemory(root, opts) {
  const query = opts.query;
  if (typeof query !== 'string' || utf8(query) > 256 || words(query).size === 0) throw Error('--query requires meaningful terms, max 256 bytes');
  const limit = opts.limit == null ? 5 : Number(opts.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw Error('--limit must be 1..20');
  const all = inventory(root);
  const ambiguous = conflicts(all.facts);
  const matches = all.facts.map(row => ({ ...row, score: relevance(query, row), potential_conflict: Boolean(row.key && ambiguous.has(row.key)), conflict_check_incomplete: Boolean(row.key && all.incomplete) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.location.localeCompare(b.location));
  const limited = matches.length > LIMITS.candidateCount;
  const candidates = matches.slice(0, LIMITS.candidateCount);
  const states = verifySources(root, candidates);
  const selected = [];
  for (const row of candidates) {
    const problems = states.get(row.location) ?? [];
    const freshness = problems[0]?.code ?? 'source-unchanged';
    const review_required = row.state !== 'confirmed' || freshness !== 'source-unchanged' || row.potential_conflict || row.conflict_check_incomplete;
    if (!review_required || opts['include-review']) selected.push({ ...row, freshness, review_required });
  }
  const result = {
    query, status: (all.incomplete || limited ? 'incomplete' : 'complete'), results: selected.slice(0, limit),
    stats: { matched: matches.length, invalid_facts: all.invalid.length, skipped_untrusted: candidates.length - selected.length, scan_incomplete: all.incomplete, verification_limited: limited, returned: Math.min(selected.length, limit), output_truncated: selected.length > limit },
    note: 'Git source hashes are not semantic proof. Review flagged facts before use.',
  };
  let output = emitLimited(result, cap(root, opts));
  const decoded = JSON.parse(output);
  decoded.stats.returned = decoded.results.length;
  decoded.stats.output_truncated ||= decoded.results.length < selected.length;
  output = emitLimited(decoded, cap(root, opts));
  if (opts.json) return output;
  const content = JSON.parse(output);
  const header = `MEMORY SEARCH ${query}: ${content.results.length} facts; incomplete=${content.status === 'incomplete'}\n`;
  const footer = `[Output truncated=${content.stats.output_truncated}]\n`;
  const rows = [];
  for (const r of content.results) {
    const line = `- [${r.review_required ? 'REVIEW' : 'confirmed'}; ${r.freshness}] ${r.location}: ${r.fact} | sources: ${r.sources.join(', ')}\n`;
    if (utf8(header + rows.join('') + line + footer) > cap(root, opts)) break;
    rows.push(line);
  }
  return header + rows.join('') + footer;
}
function health(root, opts) {
  const result = checkMemory(root);
  const out = opts.json ? JSON.stringify(result) + '\n' : `${result.status.toUpperCase()}: ${result.findings_total} findings; ${result.topics} topics\n` + result.findings.slice(0, 18).map(x => `- ${x.code}: ${x.location}`).join('\n') + '\n';
  return { text: out, code: result.status === 'healthy' ? 0 : 1 };
}
function doctor(root, opts) {
  const health = checkMemory(root), max = cap(root, opts);
  const limit = opts.limit == null ? 20 : Number(opts.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw Error('--limit must be 1..50');
  const issues = health.findings.map(x => ({ code: x.code, location: x.location, action: actions[x.code] ?? 'Investigate with memory-health.py and current code before correcting facts.' }));
  const counts = {};
  for (const issue of issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1;
  const data = { status: issues.length ? 'review' : 'healthy', total_issues: issues.length, counts, items: issues.slice(0, limit), output_truncated: issues.length > limit, note: 'Read-only. No fact corrected; semantic review required.' };
  const output = emitLimited(data, max), parsed = JSON.parse(output);
  if (opts.json) return { text: output, code: issues.length ? 1 : 0 };
  const header = parsed.status.toUpperCase() + ': ' + parsed.total_issues + ' issues\n';
  const footer = '[Truncated=' + parsed.output_truncated + ']\n';
  const parts = [];
  for (const issue of parsed.items) {
    const line = `- ${issue.code}: ${issue.location}; ${issue.action}\n`;
    if (utf8(header + parts.join('') + line + footer) > max) break;
    parts.push(line);
  }
  return { text: header + parts.join('') + footer, code: issues.length ? 1 : 0 };
}
function sync(root, opts) {
  const file = localPath(root, 'memory/ACTIVE_STATE.md');
  const state = readUtf8(file);
  const match = [...state.matchAll(/^- \*\*Last Synced Commit\*\*: `([^`]+)`[ \t]*$/gm)];
  const strict = Boolean(opts.strict || opts.stamp);
  if (match.length !== 1) return { text: 'REVIEW: exactly one Last Synced Commit required\n', code: strict ? 1 : 0 };
  const head = git(root, ['rev-parse','--verify','HEAD']);
  if (!head.ok) return { text: 'REVIEW: Git history unavailable; source evidence unverified\n', code: strict ? 1 : 0 };
  const current = gitText(head), previous = match[0][1];
  const valid = /^[a-f\d]{7,40}$/i.test(previous) && git(root, ['rev-parse', '--verify', previous + '^{commit}']).ok;
  const dirty = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (!dirty.ok) throw Error('git status failed');
  const status = dirty.stdout.toString('utf8').split('\0').filter(Boolean).filter(x => !x.slice(3).startsWith('memory/'));
  const manifest = localPath(root, 'memory/.bootstrap.json');
  const generated = fs.existsSync(manifest) ? JSON.parse(readUtf8(manifest)) : {};
  const clean = status.filter(row => {
    const name = row.slice(3);
    if (!row.startsWith('?? ') || !['AGENTS.md','CLAUDE.md','GEMINI.md','.roo/rules/lean-context-memory.md'].includes(name)) return true;
    try { return sha(fs.readFileSync(localPath(root, name))) !== generated[name]; }
    catch { return true; }
  });
  const diff = valid ? git(root, ['diff', '--name-only', '-z', previous, current]) : null;
  if (valid && !diff.ok) throw Error('Git diff failed');
  const committed = diff ? diff.stdout.toString('utf8').split('\0').filter(x => x && !x.startsWith('memory/')) : [];
  let output = `Committed drift: ${committed.length} paths\nWorking-tree drift: ${clean.length} paths\n`;
  if (!valid) output += 'REVIEW: checkpoint unavailable or unverified\n';
  if (opts.stamp && ((!valid && previous !== 'UNSYNCED') || clean.length)) return { text: output + 'REVIEW: cannot stamp dirty sources or an unavailable prior commit\n', code: 1 };
  if (strict) {
    const checked = checkMemory(root);
    if (checked.findings_total) return { text: output + `REVIEW: memory-health has ${checked.findings_total} findings\n`, code: 1 };
  }
  if (opts.stamp) {
    const updated = state.replace(/^- \*\*Last Synced Commit\*\*: `([^`]+)`[ \t]*$/m, `- **Last Synced Commit**: \`${current}\``);
    if (updated.split(/\r\n|\n|\r/).length > LIMITS.stateLines || utf8(updated) > LIMITS.stateBytes) return { text: output + 'REVIEW: checkpoint too large\n', code: 1 };
    safeWrite(file, updated);
    return { text: output + 'STAMPED: Git evidence checked; semantic review remains agent responsibility\n', code: 0 };
  }
  const review = !valid || committed.length || clean.length;
  return { text: output + (review ? 'REVIEW: inspect source changes\n' : 'NO SOURCE DRIFT; not semantic proof\n'), code: strict && review ? 1 : 0 };
}
function help() { return `LACC Runtime v3.2 — node lacc.mjs <command> [project_dir] [flags]\nCommands: capabilities, init, sync, read, search, health, doctor\nFlags: --agent auto|claude|codex|gemini|roo|all; --query TEXT; --topic FILE;\n --json; --include-review; --limit N; --max-bytes N; --strict; --stamp\nNo Python, Bash, WSL, cloud SDK, or external npm packages required.\nGit is needed for trusted provenance; without it retrieval excludes unverifiable facts.\n` }
export function main(argv = process.argv.slice(2)) {
  const [command = 'help', ...args] = argv;
  if (['help', '--help', '-h'].includes(command)) { process.stdout.write(help()); return 0; }
  const opts = options(args);
  const root = path.resolve(opts._[0] || '.');
  if (opts._.length > 1) throw Error('only one project_dir is allowed');
  if (command === 'capabilities') { process.stdout.write(JSON.stringify(runtimeStatus(), null, 2) + '\n'); return 0; }
  if (!fs.statSync(root).isDirectory()) throw Error('invalid project directory');
  if (command === 'init') { process.stdout.write(JSON.stringify(init(root, opts), null, 2) + '\n'); return 0; }
  if (command === 'read') { process.stdout.write(readMemory(root, opts)); return 0; }
  if (command === 'search') { process.stdout.write(searchMemory(root, opts)); return 0; }
  if (command === 'health') { const r = health(root, opts); process.stdout.write(r.text); return r.code; }
  if (command === 'doctor') { const r = doctor(root, opts); process.stdout.write(r.text); return r.code; }
  if (command === 'sync') { const r = sync(root, opts); process.stdout.write(r.text); return r.code; }
  throw Error('unsupported command: ' + command);
}
try { process.exitCode = main(); }
catch (error) { process.stderr.write('ERROR: ' + error.message + '\n'); process.exitCode = 2; }
