// ML-1: bounded, read-only task-end reconciliation inventory.
//
// This cannot observe the agent's conversation, prove semantic truth, or edit
// memory. It exposes review candidates while the host agent owns any justified
// fact correction and must respect user-imposed no-write constraints.
import fs from 'node:fs';
import { emitLimited, git, gitText, inventory, LIMITS, localPath, utf8 } from './lacc-core.mjs';
import { sessionCheck } from './lacc-session.mjs';

const MAX_LOCATIONS = 12;

function hotReviewLocations(root) {
  const relative = 'memory/ACTIVE_STATE.md';
  const file = localPath(root, relative);
  if (!fs.statSync(file).isFile()) throw Error('ACTIVE_STATE is not a regular file');
  const raw = fs.readFileSync(file);
  if (raw.length > LIMITS.stateBytes)
    throw Error('ACTIVE_STATE exceeds the safe HOT byte limit');
  const content = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > LIMITS.stateLines)
    throw Error('ACTIVE_STATE exceeds the safe HOT line limit');

  const pending = { hypotheses: [], checks: [] };
  let section = '';
  for (const [index, line] of lines.entries()) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1].toLowerCase();
      continue;
    }
    if (!/^\s*-\s+(?:\[[ xX]\]\s+)?\S/.test(line)) continue;
    const location = relative + ':' + (index + 1);
    if (section === 'hypotheses awaiting confirmation')
      pending.hypotheses.push(location);
    if (section === 'progress and pending checks' && /^\s*-\s+\[ \]/.test(line))
      pending.checks.push(location);
  }
  return {
    hypotheses_count: pending.hypotheses.length,
    hypotheses_locations: pending.hypotheses.slice(0, MAX_LOCATIONS),
    pending_checks_count: pending.checks.length,
    pending_check_locations: pending.checks.slice(0, MAX_LOCATIONS),
    locations_truncated: pending.hypotheses.length > MAX_LOCATIONS ||
      pending.checks.length > MAX_LOCATIONS,
  };
}

function exactDuplicates(facts) {
  // Exact normalized duplicates only. Semantic overlaps are intentionally not
  // guessed; sharing a symbol, source path, or key is not duplication evidence.
  const groups = new Map();
  for (const item of facts) {
    const normalized = item.fact.trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
    const locations = groups.get(normalized) ?? [];
    locations.push(item.location);
    groups.set(normalized, locations);
  }
  const duplicates = [...groups.values()].filter(x => x.length > 1);
  return {
    groups: duplicates.length,
    locations: duplicates.slice(0, 6).map(x => x.slice(0, 6)),
    truncated: duplicates.length > 6 || duplicates.some(x => x.length > 6),
  };
}

export function taskEndReview(root, { maxBytes = 8192, json = false } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 512)
    throw Error('maxBytes must be an integer >= 512');
  const freshness = JSON.parse(sessionCheck(root, { json: true, maxBytes }).text);
  const inv = inventory(root, { bounded: true, maximumFacts: 1000 });
  const head = git(root, ['rev-parse', '--verify', 'HEAD']);
  const hot = hotReviewLocations(root);
  const duplicateFacts = exactDuplicates(inv.facts);
  const needsEvidenceReview = freshness.status !== 'healthy' ||
    freshness.scan_incomplete || freshness.output_truncated || inv.incomplete ||
    !head.ok;
  const report = {
    schema: 'lacc.task-end-review.v1',
    status: needsEvidenceReview ? 'evidence-review-required' : 'agent-review-required',
    // A healthy repository still requires the agent's semantic task-end audit.
    agent_reconciliation_required: true,
    automatic_fact_promotion: false,
    memory_mutated: false,
    head: head.ok ? gitText(head) : null,
    freshness: {
      status: freshness.status,
      checked_facts: freshness.reviewed_facts,
      observed_facts: freshness.observed_facts,
      scan_incomplete: Boolean(freshness.scan_incomplete || inv.incomplete),
      findings: freshness.total_findings,
      diagnostics_truncated: Boolean(freshness.output_truncated),
    },
    hot,
    exact_duplicates: duplicateFacts,
    actions: [
      'Compare NEW source/test observations with existing facts and HOT hypotheses. This CLI cannot see the conversation.',
      'If edits are permitted, correct contradicted facts and promote only source-verified reusable findings; mark unresolved facts review.',
      'Deduplicate confirmed identical facts carefully; never erase a distinct constraint or an unresolved hypothesis.',
      'If the user forbids file edits, preserve memory and disclose the exact pending correction in the final answer.',
      'After permitted edits, re-run health and session-check; report remaining uncertainty and tests actually executed.',
    ],
    limitations: 'Git freshness is not semantic verification. Missing conversation evidence, unsupported dependencies and provider behavior remain unverified. A zero-finding result never certifies task completion or automatic learning.',
    output_truncated: false,
  };
  const text = emitLimited(report, maxBytes);
  // Nonzero warns about unverified evidence, not about an agent's semantic work.
  const code = needsEvidenceReview ? 1 : 0;
  if (json) return { text, code };
  const parsed = JSON.parse(text);
  const summary = 'TASK-END REVIEW: ' + parsed.status + '; checked=' +
    parsed.freshness.checked_facts + '/' + parsed.freshness.observed_facts +
    '; hypotheses=' + parsed.hot.hypotheses_count +
    '; pending_checks=' + parsed.hot.pending_checks_count +
    '; exact_duplicate_groups=' + parsed.exact_duplicates.groups + '\n' +
    '[Read only; agent must reconcile verified new findings or report no changes. Not semantic proof.]\n';
  if (utf8(summary) > maxBytes) throw Error('task-end summary exceeds output budget');
  return { text: summary, code };
}
