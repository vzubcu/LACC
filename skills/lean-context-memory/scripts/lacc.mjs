#!/usr/bin/env node
"use strict";
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { budget, checkMemory, conflicts, defaults, emitLimited, git, gitText, inventory, isGit, LIMITS, localPath, relevance, utf8, verifySources, words } from './lacc-core.mjs';
import { sessionCheck } from './lacc-session.mjs';
import { migrationAudit, migrationBackup, migrationInspect } from './lacc-migrate.mjs';
import { analyzeDependencyImpact, registeredImpactAdapters, IMPACT_LIMITS } from './lacc-impact.mjs';
import { handoffPublish, handoffList, handoffRead } from './lacc-handoff.mjs';
import { canonicalPreview, canonicalApply } from './lacc-cas.mjs';
import { transactionPreview, transactionApply, transactionInspect, transactionRecover } from './lacc-transaction.mjs';
import { dependencyGraphContract, createDependencyAdapterRegistry } from './lacc-graph-contract.mjs';
import { normalizeMemoryFindings, FINDING_SCHEMA } from './lacc-findings.mjs';
import { disclosureContract, DISCLOSURE_AGENT_RULES } from './lacc-disclosure.mjs';
import { buildDisclosureSummary, markDisclosureSeen } from './lacc-disclosure-ux.mjs';
import { buildAnswerDisclosure, auditSuppliedAnswer } from './lacc-answer-disclosure.mjs';
import { sliceContext } from './ctx-slice.mjs';
import { referenceScan } from './reference-scan.mjs';
import { signatures } from './signatures.mjs';

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
      if (['json', 'include-review', 'strict', 'stamp', 'apply', 'deps', 'reviewed', 'explain', 'detail', 'semantic', 'cache'].includes(key)) opts[key] = true;
      else if (['query', 'agent', 'limit', 'max-bytes', 'topic', 'expect', 'snapshot', 'task', 'actor', 'message', 'expect-head', 'id', 'file', 'content-file', 'plan', 'claim', 'response-file'].includes(key)) {
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
    commands: { init: true, 'ctx-slice': true, 'reference-scan': true, signatures: true, read: true, search: true, health: true, doctor: true, sync: true, 'session-check': true, 'migration-audit': true, 'migration-backup': true, 'migration-inspect': true, 'handoff-publish': true, 'handoff-list': true, 'handoff-read': true, 'canonical-preview': true, 'canonical-apply': true, 'migration-plan': true, 'migration-apply': true, 'migration-restore-preview': true, 'migration-restore-apply': true, 'migration-transaction-inspect': true, 'migration-recover': true, 'dependency-contract': true, 'dependency-impact': true, 'explain-findings': true, 'disclosure-contract': true, 'disclosure-summary': true, 'disclosure-mark-seen': true, 'answer-disclosure': true, 'semantic-hints': true, 'parse-cache': true },
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
    `- At task start run session-check before trusting WARM facts; read HOT and search WARM by task; if review/incomplete, inspect sources and tests.\n` +
    `- Keep confirmed facts with real sources and checked commits; run health before handoff.\n` +
    `- If Git or Node is unavailable, use native agent tools and disclose unverified evidence.\n` +
    DISCLOSURE_AGENT_RULES.map(rule => '- ' + rule + '\n').join('') + `${END}`;
  const bridge = `${START}\nRead marked LACC instructions in project-root AGENTS.md once; use the same memory/ facts.\nFollow AGENTS.md CR-3 material-finding disclosure rules; these are guidance only, not delivery receipts.\n${END}`;
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
      selected.set(dest, name === 'claude' ? `${START}\n@AGENTS.md\nFollow the shared CR-3 disclosure rules; LACC cannot confirm user-visible delivery.\n${END}` : bridge);
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
  const dependencies = opts.deps ? analyzeDependencyImpact(root, candidates, { explain: Boolean(opts.explain), semantic: Boolean(opts.semantic), cache: Boolean(opts.cache) }).byFact : new Map();
  const selected = [];
  const diagnosticIssues = [];
  for (const row of candidates) {
    const problems = states.get(row.location) ?? [];
    const freshness = problems[0]?.code ?? 'source-unchanged';
    const dep = dependencies.get(row.location);
    const dependency_issues = dep?.issues ?? [];
    if (opts.explain) {
      for (const item of problems) diagnosticIssues.push({ ...item, location: row.location });
      for (const item of dependency_issues) diagnosticIssues.push({ ...item, location: row.location });
      if (row.potential_conflict) diagnosticIssues.push({ code: 'potential-conflict', location: row.location });
      if (row.state !== 'confirmed') diagnosticIssues.push({ code: 'pending-review', location: row.location });
      if (row.conflict_check_incomplete) diagnosticIssues.push({ code: 'scan-incomplete', location: row.location });
    }
    const review_required = row.state !== 'confirmed' || freshness !== 'source-unchanged' || row.potential_conflict || row.conflict_check_incomplete || dependency_issues.length > 0;
    if (!review_required || opts['include-review'])
      selected.push({ ...row, freshness, review_required,
        ...(opts.deps ? { dependency_scope: dep?.scope, dependency_issues,
          dependency_local_scan_complete: Boolean(dep?.complete) } : {}) });
  }
  const result = {
    query, status: (all.incomplete || limited ? 'incomplete' : 'complete'), results: selected.slice(0, limit),
    stats: { matched: matches.length, invalid_facts: all.invalid.length, skipped_untrusted: candidates.length - selected.length, scan_incomplete: all.incomplete, verification_limited: limited, returned: Math.min(selected.length, limit), output_truncated: selected.length > limit },
    note: opts.deps ? 'Experimental bounded static cross-language dependency scan. Unknown MSBuild symbols, Composer autoload and Python runtime imports require review; no semantic proof.' : 'Only explicitly cited Git sources are checked; indirect dependencies not verified by default.',
    ...(opts.explain ? normalizeMemoryFindings([
      ...diagnosticIssues, ...(all.incomplete || limited ? [{ code: 'scan-incomplete', location: 'memory/topics' }] : []),
    ], { facts: new Map(candidates.map(row => [row.location, row])) }) : {}),
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
  const result = checkMemory(root, { sourceDetails: Boolean(opts.explain) });
  const report = opts.explain
    ? { ...result, ...normalizeMemoryFindings(result.findings) } : result;
  const out = opts.json
    ? (opts.explain ? emitLimited(report, cap(root, opts)) : JSON.stringify(report) + '\n')
    : `${result.status.toUpperCase()}: ${result.findings_total} findings; ${result.topics} topics\n` +
      result.findings.slice(0, 18).map(x => `- ${x.code}: ${x.location}`).join('\n') +
      (opts.explain ? '[Use --json for normalized explanations; agent output only.]\n' : '\n');
  return { text: out, code: result.status === 'healthy' ? 0 : 1 };
}
function doctor(root, opts) {
  const health = checkMemory(root, { sourceDetails: Boolean(opts.explain) }), max = cap(root, opts);
  const limit = opts.limit == null ? 20 : Number(opts.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw Error('--limit must be 1..50');
  const issues = health.findings.map(x => ({ code: x.code, location: x.location, action: actions[x.code] ?? 'Investigate with memory-health.py and current code before correcting facts.' }));
  const counts = {};
  for (const issue of issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1;
  const data = { status: issues.length ? 'review' : 'healthy', total_issues: issues.length, counts, items: issues.slice(0, limit), output_truncated: issues.length > limit, note: 'Read-only. No fact corrected; semantic review required.', ...(opts.explain ? normalizeMemoryFindings(health.findings) : {}) };
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
function help() { return `LACC Runtime v3.2 — node lacc.mjs <command> [project_dir] [flags]\nCommands: capabilities, init, sync, ctx-slice, reference-scan, signatures, read, search, health, doctor, session-check, migration-audit, migration-backup, migration-inspect, handoff-publish, handoff-list, handoff-read, canonical-preview, canonical-apply, migration-plan, migration-apply, migration-restore-preview, migration-restore-apply, migration-transaction-inspect, migration-recover, dependency-contract, dependency-impact, disclosure-contract, disclosure-summary, disclosure-mark-seen, answer-disclosure\nFlags: --agent auto|claude|codex|gemini|roo|all; --query TEXT; --topic FILE;\n --json; --include-review; --explain (normalized, agent-only); --detail (disclosure summary); --deps (experimental); --semantic (literal JS/TS alias hints); --cache (private parse-token writes); --limit N; --max-bytes N; --strict; --stamp; --apply; --expect DIGEST; --snapshot DIGEST; --file PATH; --content-file PATH; --plan PATH; --id DIGEST; --task ID; --expect-head SHA; --reviewed; --claim TEXT; --response-file PATH (answer-disclosure only)\nCore Node commands require no Python, Bash, WSL, cloud SDK, or external npm packages.\nFor ctx-slice: node lacc.mjs ctx-slice [file|-] [max_lines=100] [--keep].\nFor reference-scan: node lacc.mjs reference-scan FILE [SYMBOL] [--signal LITERAL].\nFor signatures: node lacc.mjs signatures FILE [--require-ast | --no-python].\nGit is needed for trusted provenance; without it retrieval excludes unverifiable facts.\n` }
export function main(argv = process.argv.slice(2)) {
  const [command = 'help', ...args] = argv;
  if (['help', '--help', '-h'].includes(command)) { process.stdout.write(help()); return 0; }
  const opts = options(args);
  const root = path.resolve(opts._[0] || '.');
  if (opts._.length > 1) throw Error('only one project_dir is allowed');
  if ((opts.semantic || opts.cache) &&
      !['search','session-check','dependency-impact',
        'disclosure-summary','disclosure-mark-seen','answer-disclosure'].includes(command))
    throw Error('--semantic and --cache require a dependency analysis command');
  if ((opts.semantic || opts.cache) && command!=='dependency-impact' && !opts.deps)
    throw Error('--semantic and --cache require explicit --deps');

  if (command === 'capabilities') { process.stdout.write(JSON.stringify(runtimeStatus(), null, 2) + '\n'); return 0; }
  if (command === 'disclosure-contract') { process.stdout.write(JSON.stringify(disclosureContract(), null, 2) + '\n'); return 0; }
  if (command === 'dependency-contract') {
    process.stdout.write(JSON.stringify({
      status: 'experimental-cross-language-static-reverse',
      ...dependencyGraphContract,
      registeredAdapters: registeredImpactAdapters(),
      reverseTraversalImplemented: true,
      currentJsTsPrototypeSeparate: false,
      note: 'RD-3 opt-in static adapters cover JS/TS relative imports, .NET project references, literal PHP includes/Composer manifests and Python local imports. Compiler symbols, PSR-4 runtime resolution, dynamic imports and unknown dependencies require review; no semantic guarantee.',
    }, null, 2) + '\n');
    return 0;
  }
  if (!fs.statSync(root).isDirectory()) throw Error('invalid project directory');
  if (command === 'init') { process.stdout.write(JSON.stringify(init(root, opts), null, 2) + '\n'); return 0; }
  if (command === 'disclosure-summary' || command === 'disclosure-mark-seen') {
    if (!opts.task) throw Error('--task is required for disclosure commands');
    const maxBytes = cap(root, opts);
    const scan = sessionCheck(root, {
      json: true, explain: true, deps: Boolean(opts.deps), semantic: Boolean(opts.semantic), cache: Boolean(opts.cache), maxBytes,
    });
    const parsed = JSON.parse(scan.text);
    if (command === 'disclosure-mark-seen') {
      const text = markDisclosureSeen(root, parsed, {
        task: opts.task, id: opts.id,
        expectedHead: opts['expect-head'], maxBytes,
      });
      process.stdout.write(text);
      return 0;
    }
    const limit = opts.limit == null ? 6 : Number(opts.limit);
    const summary = buildDisclosureSummary(root, parsed, {
      task: opts.task, detail: Boolean(opts.detail), limit, maxBytes,
    });
    if (opts.json) process.stdout.write(summary);
    else {
      const result = JSON.parse(summary);
      const header = 'DISCLOSURE SUMMARY: ' + result.status +
        '; groups=' + result.total_groups + '; unresolved=' +
        result.unresolved_findings + '; new=' + result.new_findings +
        '; seen-markers=' + result.seen_markers + '\n';
      const lines = result.results.map(group =>
        '- ' + group.focus + ': ' + group.findings + ' unresolved (' +
        group.new_findings + ' new, ' + group.seen_markers +
        ' seen markers); ' + group.kinds.join(', ') + '\n');
      const footer = '[No memory facts resolved; user delivery not observed. ' +
        'Use --json --detail for finding IDs.]\n';
      let out = header;
      for (const line of lines) {
        if (utf8(out + line + footer) > maxBytes) break;
        out += line;
      }
      process.stdout.write(out + footer);
    }
    return parsed.status === 'healthy' && !parsed.scan_incomplete &&
      !parsed.diagnostics_truncated && !parsed.output_truncated ? 0 : 1;
  }
  if (command === 'answer-disclosure') {
    if (!opts.query) throw Error('answer-disclosure requires --query');
    if (opts['include-review']) throw Error('answer-disclosure never returns raw review facts');
    const maxBytes = cap(root, opts);
    // Reuse the EXACT existing trust-filtered search/Git verdict. A
    // bounded diagnostic lost to search byte caps remains incomplete.
    const searched = JSON.parse(searchMemory(root, {
      ...opts, json: true, explain: true, limit: 1,
    }));
    const limit = opts.limit == null ? 4 : Number(opts.limit);
    const result = buildAnswerDisclosure(searched, {
      claim: opts.claim ?? '', limit,
    });
    if (opts['response-file']) {
      const answerPath = localPath(root, opts['response-file']);
      const stat = fs.statSync(answerPath);
      if (!stat.isFile() || stat.size > 65536)
        throw Error('response-file must be a regular file of at most 65536 bytes');
      result.supplied_response_audit = auditSuppliedAnswer(
        result, readUtf8(answerPath));
    }
    process.stdout.write(emitLimited(result, maxBytes));
    return result.supplied_response_audit?.status === 'canonical-warning-missing' ? 1 : 0;
  }
  if (command === 'read') { process.stdout.write(readMemory(root, opts)); return 0; }
  if (command === 'search') { process.stdout.write(searchMemory(root, opts)); return 0; }
  if (command === 'dependency-impact') {
    const count = opts.limit == null ? 20 : Number(opts.limit);
    if (!Number.isSafeInteger(count) || count < 1 || count > 20)
      throw Error('--limit must be 1..20');
    const inv = inventory(root, { bounded: true, maximumFacts: IMPACT_LIMITS.facts });
    const analysis = analyzeDependencyImpact(root, inv.facts, { explain: Boolean(opts.explain), semantic: Boolean(opts.semantic), cache: Boolean(opts.cache) });
    const affected = inv.facts.map(row => ({
      fact_id: row.key ?? row.location, location: row.location,
      sources: row.sources, verified: row.revision,
      trust: row.state, ...(analysis.byFact.get(row.location) ?? {
        issues: [{ code: 'dependency-coverage-incomplete', source: '', dependency: 'not-scanned' }],
        complete: false,
      }),
    })).filter(x => x.issues.length || x.trust !== 'confirmed');
    const incomplete = inv.incomplete || inv.invalid.length > 0 ||
      inv.unsupported.length > 0 ||
      analysis.statistics.truncated || analysis.statistics.reportedScopeIncomplete ||
      affected.some(x => x.issues.some(i => i.code === 'dependency-coverage-incomplete'));
    const report = {
      status: incomplete ? 'incomplete' : affected.length ? 'review' : 'clear-within-scanned-scope',
      results: affected.slice(0, count),
      stats: {
        ...analysis.statistics, invalid_facts: inv.invalid.length,
        unsupported_notes: inv.unsupported.length, inventory_incomplete: inv.incomplete,
        matched_review_facts: affected.length, returned: Math.min(affected.length, count),
        output_truncated: affected.length > count,
      },
      changed_paths: analysis.changedPaths.slice(0, 12),
      note: 'Read-only, opt-in static cross-language reverse impact scoped to cited sources. .NET symbol resolution, PHP autoload, Python dynamic imports and unknown coverage require review. No automatic memory edit or semantic verification.',
      ...(opts.explain ? normalizeMemoryFindings([
        ...affected.flatMap(row => row.issues.map(issue => ({ ...issue, location: row.location }))),
        ...(incomplete ? [{ code: 'scan-incomplete', location: 'memory/topics' }] : []),
      ], { facts: new Map(inv.facts.map(row => [row.location, row])) }) : {}),
    };
    const text = emitLimited(report, cap(root, opts));
    if (opts.json) process.stdout.write(text);
    else {
      const parsed = JSON.parse(text);
      process.stdout.write('DEPENDENCY IMPACT: ' + parsed.status + '; review=' +
        parsed.stats.matched_review_facts + '; scanned=' +
        parsed.stats.analyzedFacts + '\n' +
        parsed.results.map(x => '- ' + x.location + ': ' +
          x.issues.map(i => i.code + ' ' + (i.chain?.join(' -> ') ?? i.dependency)).join('; ')
        ).join('\n') + '\n');
    }
    return report.status === 'clear-within-scanned-scope' ? 0 : 1;
  }

  if (command === 'health') { const r = health(root, opts); process.stdout.write(r.text); return r.code; }
  if (command === 'doctor') { const r = doctor(root, opts); process.stdout.write(r.text); return r.code; }
  if (['migration-plan', 'migration-apply', 'migration-restore-preview', 'migration-restore-apply'].includes(command)) {
    const options = { plan: opts.plan, snapshot: opts.snapshot, expect: opts.expect,
      reviewed: Boolean(opts.reviewed) };
    const result = command === 'migration-plan' || command === 'migration-restore-preview'
      ? transactionPreview(root, options) : transactionApply(root, options);
    process.stdout.write(emitLimited(result, cap(root, opts)));
    return 0;
  }
  if (command === 'migration-transaction-inspect' || command === 'migration-recover') {
    const result = command === 'migration-transaction-inspect'
      ? transactionInspect(root, opts.id)
      : transactionRecover(root, { id: opts.id, reviewed: Boolean(opts.reviewed) });
    process.stdout.write(emitLimited(result, cap(root, opts)));
    return 0;
  }
  if (command === 'canonical-preview' || command === 'canonical-apply') {
    const details = { file: opts.file, contentFile: opts['content-file'],
      expect: opts.expect, reviewed: Boolean(opts.reviewed) };
    const result = command === 'canonical-preview'
      ? canonicalPreview(root, details) : canonicalApply(root, details);
    process.stdout.write(emitLimited(result, cap(root, opts)));
    return 0;
  }
  if (command === 'handoff-publish') {
    const r = handoffPublish(root, { task: opts.task, actor: opts.actor,
      message: opts.message, expectedHead: opts['expect-head'], maxBytes: cap(root, opts) });
    process.stdout.write(r.text); return r.code;
  }
  if (command === 'handoff-list') {
    const r = handoffList(root, { task: opts.task, maxBytes: cap(root, opts) });
    process.stdout.write(r.text); return r.code;
  }
  if (command === 'handoff-read') {
    const r = handoffRead(root, { task: opts.task, id: opts.id, maxBytes: cap(root, opts) });
    process.stdout.write(r.text); return r.code;
  }
  if (command === 'migration-audit') {
    const r = migrationAudit(root, cap(root, opts));
    process.stdout.write(r.text); return r.code;
  }
  if (command === 'migration-backup') {
    const r = migrationBackup(root, { expect: opts.expect, apply: Boolean(opts.apply), maxBytes: cap(root, opts) });
    process.stdout.write(r.text); return r.code;
  }
  if (command === 'migration-inspect') {
    const r = migrationInspect(root, { snapshot: opts.snapshot, maxBytes: cap(root, opts) });
    process.stdout.write(r.text); return r.code;
  }
  if (command === 'session-check') {
    const r = sessionCheck(root, { json: Boolean(opts.json), maxBytes: cap(root, opts), deps: Boolean(opts.deps), explain: Boolean(opts.explain), semantic: Boolean(opts.semantic), cache: Boolean(opts.cache) });
    process.stdout.write(r.text);
    return r.code;
  }
  if (command === 'sync') { const r = sync(root, opts); process.stdout.write(r.text); return r.code; }
  throw Error('unsupported command: ' + command);
}
// Context slicing consumes streamed stdin and is intentionally dispatched
// outside the project-root CLI parser; it never accesses memory or Git.
if (['ctx-slice', 'context-slice'].includes(process.argv[2])) {
  sliceContext(process.argv.slice(3)).then(code => { process.exitCode = code; })
    .catch(error => {
      process.stderr.write('ERROR: ' + error.message + '\n'); process.exitCode = 2;
    });
} else if (['reference-scan', 'signatures'].includes(process.argv[2])) {
  // Source discovery is project-CWD scoped, not a Git-memory trust verdict.
  try {
    process.exitCode = process.argv[2] === 'reference-scan'
      ? referenceScan(process.argv.slice(3)) : signatures(process.argv.slice(3));
  } catch (error) {
    process.stderr.write('ERROR: ' + error.message + '\n');
    process.exitCode = 2;
  }
} else {
  try { process.exitCode = main(); }
  catch (error) { process.stderr.write('ERROR: ' + error.message + '\n'); process.exitCode = 2; }
}
