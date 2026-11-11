// CR-3B: read-only, answer-level disclosure candidates from the existing
// trust-filtered search --explain report. No second Git verifier, memory
// mutation, host response interception, or notification delivery claim.
import { words } from './lacc-core.mjs';

const ID = /^[a-f0-9]{24}$/;
const REV = /^[a-f0-9]{7,40}$/i;
const SAFE_PATH = /^[A-Za-z0-9_./@-]{1,160}$/;
const RESTRICTED = /(?:password|passwd|secret|token|api[_-]?key|credential|private[_-]?key|bearer)/i;
const KINDS = Object.freeze({
  'source-drift': 'its cited Git source changed',
  'indirect-dependency-drift': 'a dependency of its cited source changed',
  'potential-fact-conflict': 'stored claims under the same fact key need review',
  'evidence-unavailable': 'its cited evidence cannot be verified',
  'coverage-incomplete': 'its evidence is unverified or analysis is incomplete',
});
const LIMIT = 4;
function safePath(value) {
  if (typeof value !== 'string' || !SAFE_PATH.test(value) ||
      value.startsWith('/') || value.includes('//') ||
      value.split('/').some(x => !x || x === '.' || x === '..') ||
      RESTRICTED.test(value)) return null;
  return value;
}
function candidate(f, claimWords) {
  if (!f || !ID.test(f.finding_id ?? '') || f.trust !== 'review-required' ||
      !(f.kind in KINDS) || typeof f.fact !== 'object' ||
      !/^memory\/topics\/[A-Za-z0-9_./-]+\.md:\d+$/.test(f.fact?.location ?? ''))
    return null; // a global scan/checkpoint warning is not a matched fact
  const all = [
    ...(Array.isArray(f.evidence?.changed_paths) ? f.evidence.changed_paths : []),
    ...(Array.isArray(f.evidence?.dependency_chain) ? f.evidence.dependency_chain : []),
    ...(Array.isArray(f.evidence?.cited_sources) ? f.evidence.cited_sources : []),
  ];
  const sources = [...new Set(all.map(safePath).filter(Boolean))].slice(0, 3);
  const revision = REV.test(f.fact?.verified_commit ?? '') ? f.fact.verified_commit : null;
  const keywords = words([f.fact?.key ?? '', f.fact?.location ?? '', ...sources].join(' '));
  const claimOverlap = [...claimWords].some(w => keywords.has(w));
  return {
    finding_id: f.finding_id,
    kind: f.kind,
    relevance: claimWords.size && claimOverlap ? 'query-and-claim-lexical' : 'query-lexical-only',
    materiality: 'agent-must-confirm',
    reason: KINDS[f.kind],
    checked_evidence: {
      cited_paths: sources,
      recorded_git_revision: revision,
      verification_scope: typeof f.evidence?.verification_scope === 'string' &&
        /^[a-z0-9-]{1,70}$/.test(f.evidence.verification_scope)
        ? f.evidence.verification_scope : 'unknown',
      dependency_trace: ['complete', 'partial', 'unavailable'].includes(f.evidence?.trace?.status)
        ? f.evidence.trace.status : 'unavailable',
    },
    requires_current_code_review: true,
  };
}
function wording(item, plural) {
  const subject = plural ? 'Earlier project memory notes were withheld' :
    'An earlier project memory note was withheld';
  const detail = plural ? 'because cited evidence may be stale or unresolved' :
    'because ' + item.reason;
  const path = item.checked_evidence.cited_paths[0];
  const evidence = path ? ' Evidence path: ' + path + '.' :
    ' No safe source path was available to cite.';
  return subject + ' ' + detail + '.' + evidence +
    ' This is not proof of a semantic contradiction or a current behavior change.' +
    ' I need to inspect current code and tests before relying on the previous note.';
}
export function buildAnswerDisclosure(report, { claim = '', limit = LIMIT } = {}) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.diagnostics) ||
      typeof report.query !== 'string' || Buffer.byteLength(report.query, 'utf8') > 256)
    throw Error('expected bounded trust-filtered search --explain report');
  if (typeof claim !== 'string' || Buffer.byteLength(claim, 'utf8') > 512)
    throw Error('--claim must be at most 512 UTF-8 bytes');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10)
    throw Error('answer-disclosure limit must be 1..10');
  const seen = new Set(), matches = [], claimWords = words(claim);
  for (const f of report.diagnostics) {
    const row = candidate(f, claimWords);
    if (!row || seen.has(row.finding_id)) continue;
    seen.add(row.finding_id);
    matches.push(row);
  }
  const inputIncomplete = report.status !== 'complete' ||
    Boolean(report.stats?.scan_incomplete || report.stats?.verification_limited ||
      report.stats?.invalid_facts || report.stats?.output_truncated ||
      report.diagnostics_truncated || report.diagnostics_input_incomplete ||
      report.output_truncated ||
      report.diagnostics_total > report.diagnostics.length);
  const selected = matches.slice(0, limit);
  const warning = selected.length ? wording(selected[0], matches.length > 1) : null;
  return {
    schema: 1, gate: 'CR-3B', status: matches.length ? 'review-for-answer' :
      inputIncomplete ? 'incomplete-no-candidate-certification' : 'no-matched-exclusion-observed',
    query_scope: 'bounded-lexical-matched-facts-only',
    decision: matches.length ? 'disclose-in-answer-if-material' :
      inputIncomplete ? 'verify-coverage-and-current-code' : 'not-relevant-in-checked-matches',
    decision_reason: matches.length ?
      'Withheld matched memory evidence may affect this answer; assess its materiality.' :
      inputIncomplete ? 'Search/diagnostic coverage is incomplete; no safe absence claim.' :
      'No withheld fact appeared among the searched, matched and emitted diagnostics.',
    candidate_total_observed: matches.length,
    candidates: selected,
    candidates_truncated: matches.length > limit,
    scan_incomplete: inputIncomplete,
    suggested_answer_warning: warning,
    next_verification: 'Inspect current source and tests; revalidate old memory only after review.',
    diagnostics_generated: true,
    warning_in_agent_response: 'not-observed',
    host_delivery_observed: 'not-observed',
    user_delivery: 'not-observed',
    no_automatic_notification: true,
    note: 'This CLI generates an advisory warning, not an actual host response. Query/claim lexical overlap is not semantic relevance or proof of delivery.',
  };
}
// An explicitly supplied local text file is NOT proof of actual host output.
// This deterministic gate detects missing canonical wording, without
// copying any response content into a report or inventing user delivery.
export function auditSuppliedAnswer(disclosure, suppliedText) {
  if (typeof suppliedText !== 'string' || Buffer.byteLength(suppliedText, 'utf8') > 65536)
    throw Error('answer-file must contain at most 65536 UTF-8 bytes');
  const expected = disclosure?.suggested_answer_warning;
  const matched = expected ? suppliedText.includes(expected) : null;
  return {
    source: 'explicit-local-answer-file',
    canonical_warning_required_if_material: Boolean(expected),
    canonical_warning_present: matched,
    status: expected ? matched ? 'canonical-warning-present' : 'canonical-warning-missing' :
      'no-canonical-warning-required',
    warning_in_agent_response: 'not-observed',
    host_delivery_observed: 'not-observed',
    note: 'Checks supplied text only, not semantic adequacy, actual emitted agent text, host display or user acknowledgment.',
  };
}
