// Read-only bounded pre-recall freshness gate for supported agents.
// This does not install a host hook; SKILL.md instructs agents to invoke it.
import fs from 'node:fs';
import { conflicts, emitLimited, git, gitText, inventory, LIMITS, localPath, utf8, verifySources } from './lacc-core.mjs';
import { analyzeDependencyImpact } from './lacc-impact.mjs';
import { normalizeMemoryFindings } from './lacc-findings.mjs';

const HOT = [
  ['MEMORY_INDEX.md', LIMITS.indexLines, LIMITS.indexBytes],
  ['ACTIVE_STATE.md', LIMITS.stateLines, LIMITS.stateBytes],
];

export function sessionCheck(root, { json = false, maxBytes = 8192, deps = false, explain = false } = {}) {
  const inv = inventory(root, { bounded: true, maximumFacts: 1000 });
  const VERIFY_CAP = 64;
  const facts = inv.facts.slice(0, VERIFY_CAP);
  const incomplete = inv.incomplete || inv.facts.length > VERIFY_CAP;
  const findings = [
    ...inv.invalid.map(x => ({ code: 'invalid-fact', location: x.location })),
    ...inv.unsupported.map(x => ({ code: 'invalid-fact-format', location: x.location })),
  ];
  const add = (code, location, details = null) => findings.push(details ? { code, location, ...details } : { code, location });

  for (const [name, maxLines, maxSize] of HOT) {
    const relative = 'memory/' + name;
    let contents;
    try {
      const file = localPath(root, relative);
      if (!fs.statSync(file).isFile()) throw Error('not a regular file');
      const raw = fs.readFileSync(file);
      if (raw.length > maxSize) {
        add('hot-bytes', relative);
        add('hot-content-not-scanned', relative);
        continue;
      }
      contents = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      const entries = contents.split(/\r\n|\r|\n/);
      if (entries.length - (entries.at(-1) === '' ? 1 : 0) > maxLines)
        add('hot-lines', relative);
    } catch {
      add('unreadable-memory', relative);
      continue;
    }
    if (name === 'MEMORY_INDEX.md') {
      for (const match of contents.matchAll(/`(topics\/[^`]+\.md)`/g)) {
        try {
          if (!fs.statSync(localPath(root, 'memory/' + match[1])).isFile())
            add('missing-topic-pointer', match[1]);
        } catch { add('missing-topic-pointer', match[1]); }
      }
    } else {
      const records = [...contents.matchAll(/^- \*\*Last Synced Commit\*\*: `([^`]+)`[ \t]*$/gm)];
      if (records.length !== 1) { add('invalid-checkpoint', relative); continue; }
      const previous = records[0][1];
      const current = git(root, ['rev-parse', '--verify', 'HEAD']);
      if (!current.ok || previous === 'UNSYNCED') {
        add('unverified-checkpoint', relative);
      } else if (!/^[a-f\d]{7,40}$/i.test(previous) ||
                 !git(root, ['rev-parse', '--verify', previous + '^{commit}']).ok) {
        add('unavailable-checkpoint', relative);
      } else {
        const drift = git(root, ['diff', '--name-only', '-z', previous, gitText(current)]);
        if (!drift.ok) add('unavailable-checkpoint', relative);
        else if (drift.stdout.toString('utf8').split('\0')
          .some(name => name && !name.startsWith('memory/')))
          add('committed-drift', relative);
      }
    }
  }

  for (const [key, locations] of conflicts(inv.facts))
    add('potential-conflict', 'key=' + key + ': ' + locations.slice(0, 3).join(', '));
  const checked = verifySources(root, facts);
  for (const row of facts) {
    if (row.state !== 'confirmed') add('pending-review', row.location);
    for (const issue of checked.get(row.location) ?? [])
      add(issue.code, row.location + (issue.source ? ' ' + issue.source : ''),
        explain ? { source: issue.source, fact: { key: row.key ?? null,
          location: row.location, revision: row.revision, sources: row.sources } } : null);
  }
  if (deps) {
    const extra = analyzeDependencyImpact(root, facts).byFact;
    for (const row of facts) {
      for (const issue of extra.get(row.location)?.issues ?? [])
        add(issue.code, row.location + ': ' + issue.source + ' -> ' + issue.dependency,
          explain ? { source: issue.source, dependency: issue.dependency,
            chain: issue.chain, fact: { key: row.key ?? null,
              location: row.location, revision: row.revision, sources: row.sources } } : null);
    }
  }
  if (incomplete) add('scan-incomplete', 'Not every fact was verified');

  const counts = {};
  for (const item of findings) counts[item.code] = (counts[item.code] ?? 0) + 1;
  const report = {
    status: incomplete ? 'incomplete' : findings.length ? 'review' : 'healthy',
    reviewed_facts: facts.length,
    observed_facts: inv.facts.length,
    scanned_topic_bytes: inv.bytes,
    scanned_topics: inv.files.length,
    scan_incomplete: incomplete,
    counts,
    total_findings: findings.length,
    items: findings.slice(0, 30),
    output_truncated: findings.length > 30,
    note: deps ? 'Experimental revision-scoped static JS/TS, .NET, PHP/Composer and Python reverse impact enabled. Unknown runtime/symbol edges require review; no semantic guarantee.' : 'Only directly cited sources were verified; indirect imports not checked. Invoke at session start.',
    ...(explain ? normalizeMemoryFindings(findings, {
      facts: new Map(facts.map(row => [row.location, row])),
    }) : {}),
  };
  const output = emitLimited(report, maxBytes);
  if (json) return { text: output, code: findings.length ? 1 : 0 };
  const parsed = JSON.parse(output);
  const header = [parsed.status.toUpperCase(), parsed.total_findings + ' findings',
    'checked ' + parsed.reviewed_facts + '/' + parsed.observed_facts + ' facts',
    'scan_incomplete=' + parsed.scan_incomplete].join('; ') + '\n';
  const footer = '\n[Read only. Do not trust review/incomplete facts.]\n';
  let lines = '';
  for (const item of parsed.items) {
    const line = '- ' + item.code + ': ' + item.location + '\n';
    if (utf8(header + lines + line + footer) > maxBytes) break;
    lines += line;
  }
  return { text: header + lines + footer, code: findings.length ? 1 : 0 };
}
