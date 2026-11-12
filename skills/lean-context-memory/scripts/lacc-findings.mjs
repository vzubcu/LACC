// CR-1: evidence-only, bounded common diagnostic format for existing LACC tools.
// It never evaluates code semantics, verifies sources, edits memory or sends notices.
import { createHash } from 'node:crypto';
import { explainMemoryEvidence } from './lacc-evidence-chain.mjs';
import { disclosureGuidance } from './lacc-disclosure.mjs';

export const FINDING_SCHEMA = 1;
const MAX = Object.freeze({ diagnostics: 40, input: 2000, sources: 8, chain: 8, fieldBytes: 240 });
const TYPES = Object.freeze({
  'changed-source': ['source-drift', 'The checked Git source differs from the remembered revision.', 'Inspect current code and tests; reverify the memory fact after review.'],
  'direct-source-changed': ['source-drift', 'The cited source changed since its verified Git revision.', 'Review the current cited source and reverify the memory fact.'],
  'dependency-changed': ['indirect-dependency-drift', 'An imported dependency changed; the cited file may be indirectly affected.', 'Inspect the dependency chain and current behavior before relying on the fact.'],
  'potential-conflict': ['potential-fact-conflict', 'Stored facts with the same key have different claims; no contradiction is proven.', 'Review both claims and their current source evidence.'],
  'duplicate-fact': ['potential-fact-conflict', 'Duplicated stored claim needs review, not automatic deletion.', 'Review duplication and current evidence.'],
  'missing-source': ['evidence-unavailable', 'The cited source is missing.', 'Locate a legitimate replacement and verify it before updating memory.'],
  'untracked-source': ['evidence-unavailable', 'The cited source is not tracked in the expected Git index.', 'Check tracked evidence and commit provenance.'],
  'unsafe-source': ['evidence-unavailable', 'A source path failed safety checks.', 'Inspect the source path and correct unsafe references.'],
  'unavailable-commit': ['evidence-unavailable', 'The verified Git commit cannot be checked.', 'Verify the repository and commit before trusting the claim.'],
  'dependency-coverage-incomplete': ['coverage-incomplete', 'Dependency analysis was incomplete or unsupported; no clean result is established.', 'Inspect unresolved imports, project tooling and relevant code manually.'],
  'scan-incomplete': ['coverage-incomplete', 'The scan did not cover all facts or files.', 'Expand or repeat the bounded scan before relying on absence of findings.'],
  'invalid-fact': ['coverage-incomplete', 'A stored fact could not be parsed or verified.', 'Review fact syntax and source provenance.'],
  'invalid-fact-format': ['coverage-incomplete', 'Unstructured memory content requires review.', 'Migrate or review the note manually.'],
  'pending-review': ['coverage-incomplete', 'The stored fact is not confirmed.', 'Inspect source evidence before confirming the claim.'],
  'committed-drift': ['stale-checkpoint', 'Git commits changed since the recorded session checkpoint.', 'Recheck affected sources before trusting the session memory.'],
  'unverified-checkpoint': ['stale-checkpoint', 'Session checkpoint is unverified.', 'Review the current Git HEAD and session state.'],
  'unavailable-checkpoint': ['stale-checkpoint', 'The recorded checkpoint commit is unavailable.', 'Locate a valid baseline or revalidate session memory.'],
  'invalid-checkpoint': ['stale-checkpoint', 'Session checkpoint format is invalid.', 'Review the checkpoint entry before continuing.'],
});
const KIND_PRIORITY = Object.freeze({
  'source-drift': 0,
  'indirect-dependency-drift': 1,
  'evidence-unavailable': 2,
  'stale-checkpoint': 3,
  'potential-fact-conflict': 4,
  'coverage-incomplete': 5,
});
function clipped(value) {
  if (typeof value !== 'string' || !value) return null;
  const plain = value.replace(/[\u0000-\u001f\u007f]/g, '?');
  const bytes = Buffer.from(plain, 'utf8');
  if (bytes.length > MAX.fieldBytes) return null;
  if (/^(?:https?:\/\/|file:\/\/|[a-z]:[\\/]|\/\/|\\\\)/i.test(plain) ||
      /(?:password|secret|token|api[_-]?key)\s*[:=]/i.test(plain)) return null;
  return plain;
}
function pathOnly(value) {
  const v = clipped(value);
  if (!v || v.startsWith('/') || v.includes('\\') || v.split('/').includes('..')) return null;
  return v;
}
function normalizedLocation(value) {
  const v = clipped(value) ?? '';
  // Health/session entries may have explanatory text after a location.
  const match = v.match(/(?:memory\/[a-zA-Z0-9_./-]+\.md(?::\d+)?)/);
  return match?.[0] ?? (pathOnly(v.split(/[\s;]/)[0]) ?? 'unknown');
}
function sanitizedSources(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(pathOnly).filter(Boolean))].sort().slice(0, MAX.sources);
}
function checkedCommit(value) {
  return /^[a-f0-9]{7,40}$/i.test(value ?? '') ? value.toLowerCase() : null;
}
function safeChain(chain) {
  if (!Array.isArray(chain)) return [];
  return chain.map(pathOnly).filter(Boolean).slice(0, MAX.chain);
}
export function memoryFinding(issue, { fact = null, scope = 'direct-git-provenance' } = {}) {
  if (!issue || typeof issue !== 'object') throw Error('invalid memory diagnostic');
  const code = clipped(issue.code) ?? 'unsupported';
  const [kind, reason, recommended_action] = TYPES[code] ??
    ['coverage-incomplete', 'An unsupported diagnostic needs manual inspection.', 'Inspect source evidence and the original diagnostic.'];
  const location = normalizedLocation(fact?.location ?? issue.location);
  const source = pathOnly(issue.source);
  const dependency = pathOnly(issue.dependency);
  const cited_sources = sanitizedSources(fact?.sources ?? (source ? [source] : []));
  const dependency_chain = safeChain(issue.chain);
  const changed_paths = sanitizedSources(
    kind === 'source-drift' ? (source ? [source] : []) :
    kind === 'indirect-dependency-drift' ? (dependency ? [dependency] : []) : []);
  const revision = checkedCommit(fact?.revision);
  const detail = kind === 'coverage-incomplete' ? [code] : [];
  if (kind === 'coverage-incomplete' && dependency) detail.push(dependency);
  const trace = explainMemoryEvidence(issue, {
    kind, location, source, dependency, chain: dependency_chain,
    citedSources: cited_sources, revision,
  });
  const identity = {
    code, location, revision, source, dependency, dependency_chain,
  };
  const finding_id = createHash('sha256')
    .update(JSON.stringify(identity)).digest('hex').slice(0, 24);
  return {
    schema: FINDING_SCHEMA,
    finding_id, kind, severity: 'review',
    fact: { key: clipped(fact?.key), location, verified_commit: revision },
    evidence: {
      cited_sources, changed_paths,
      current_commit: null, // existing verifier does not supply HEAD on this path
      dependency_chain,
      ...(trace.status !== 'unavailable' ||
          ['source-drift', 'indirect-dependency-drift','evidence-unavailable','coverage-incomplete'].includes(kind)
        ? { trace } : {}),
      verification_scope: kind === 'indirect-dependency-drift' ||
        code === 'dependency-coverage-incomplete'
        ? (['dotnet-static','php-static','python-static'].includes(issue.adapter)
          ? 'experimental-' + issue.adapter
          : 'experimental-js-ts-static-imports') : scope,
    },
    trust: 'review-required',
    reason, recommended_action,
    coverage: {
      complete: !['coverage-incomplete', 'evidence-unavailable', 'stale-checkpoint'].includes(kind),
      limitations: detail,
      note: 'Complete means only this finding is classified; no semantic or repository-wide verification.',
    },
    disclosure: 'reported-to-agent-only',
  };
}

export function normalizeMemoryFindings(issues, opts = {}) {
  if (!Array.isArray(issues)) throw Error('expected diagnostic array');
  const facts = opts.facts instanceof Map ? opts.facts : new Map();
  const found = new Map();
  for (const issue of issues.slice(0, MAX.input)) {
    // Accept either source-specific enriched records or location-based existing diagnostics.
    const context = facts.get(issue.location) ?? issue.fact ?? null;
    const result = memoryFinding(issue, { fact: context, scope: opts.scope });
    if (!found.has(result.finding_id)) found.set(result.finding_id, result);
  }
  const sorted = [...found.values()].sort((a, b) =>
    (KIND_PRIORITY[a.kind] ?? 99) - (KIND_PRIORITY[b.kind] ?? 99) ||
    a.fact.location.localeCompare(b.fact.location, 'en') ||
    a.kind.localeCompare(b.kind, 'en') ||
    a.finding_id.localeCompare(b.finding_id, 'en'));
  return {
    diagnostic_schema: FINDING_SCHEMA,
    diagnostics_total: sorted.length,
    diagnostics: sorted.slice(0, MAX.diagnostics),
    diagnostics_truncated: sorted.length > MAX.diagnostics || issues.length > MAX.input,
    diagnostics_input_incomplete: issues.length > MAX.input,
    notification: 'agent-output-only',
    disclosure_protocol: disclosureGuidance(sorted.slice(0, MAX.diagnostics), {
      truncated: sorted.length > MAX.diagnostics || issues.length > MAX.input,
    }),
    note: 'Git byte drift is potential staleness, not proof of semantic conflict. No user-visible delivery or automatic memory mutation was performed.',
  };
}
