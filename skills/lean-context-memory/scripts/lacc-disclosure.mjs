// CR-3: host-neutral disclosure contract for normalized memory findings.
// It provides guidance for an agent but has NO access to a host UI or a
// notification delivery receipt. Never interpret it as proof of delivery.
export const DISCLOSURE_SCHEMA = 1;
const HOSTS = Object.freeze([
  Object.freeze({ host: 'codex', instructions: 'AGENTS.md', transport: 'agent-response', delivery_confirmation: 'not-integrated' }),
  Object.freeze({ host: 'claude', instructions: 'CLAUDE.md -> AGENTS.md', transport: 'agent-response', delivery_confirmation: 'not-integrated' }),
  Object.freeze({ host: 'gemini', instructions: 'GEMINI.md -> AGENTS.md', transport: 'agent-response', delivery_confirmation: 'not-integrated' }),
  Object.freeze({ host: 'roo', instructions: '.roo/rules/lean-context-memory.md -> AGENTS.md', transport: 'agent-response', delivery_confirmation: 'not-integrated' }),
]);
const POLICY = Object.freeze({
  schema: DISCLOSURE_SCHEMA,
  status: 'guidance-only',
  detection: 'reported-to-agent-via-cli',
  agent_action: 'assess-task-relevance-and-disclose-material-unresolved-findings',
  user_delivery: 'not-observed',
  verified_delivery: false,
  rule: 'If a relevant finding affects the answer or requested change, disclose the possible memory/code mismatch and checked source or limitation before relying on the affected memory.',
  uncertainty: 'A changed Git source is possible staleness, never proof of semantic contradiction; inspect current code and tests before asserting current behavior.',
  output: 'Give a concise user-facing explanation when material; avoid repeated warnings and redact secrets or raw untrusted note content.',
});
export function disclosureContract() {
  return {
    ...POLICY,
    supported_instruction_bridges: HOSTS.map(x => ({ ...x })),
    answer_level_gate: { command: 'answer-disclosure', status: 'advisory-pre-answer-candidates',
      response_audit: 'explicit-supplied-file-only', host_response_observed: false,
      actual_host_acceptance: 'pending', delivery_observed: false },
    no_host_event_tracking: true,
    no_automatic_notification: true,
    no_memory_mutation: true,
  };
}
// Additive, compact metadata in --explain JSON only. Reuse the normalized
// diagnostics as the evidence, rather than copying their payload into
// a second notification field or inventing a relevance score.
export function disclosureGuidance(findings, { truncated = false } = {}) {
  if (!Array.isArray(findings)) throw Error('expected normalized diagnostic list');
  const count = findings.filter(f => f && typeof f === 'object' &&
    typeof f.finding_id === 'string' && /^[a-f0-9]{24}$/.test(f.finding_id) &&
    f.trust === 'review-required').length;
  return {
    schema: DISCLOSURE_SCHEMA,
    status: 'agent-guidance-only',
    user_delivery: 'not-observed',
    delivery_confirmed: false,
    candidates_before_output_budget: count,
    candidates_incomplete: Boolean(truncated),
    relevance: 'agent-must-evaluate-current-task',
    instruction: count
      ? 'For relevant findings, inform the user of uncertainty, evidence and next verification step before relying on affected memory.'
      : 'No emitted review candidates; absence of findings does not prove a complete scan.',
    do_not_claim: 'Do not claim semantic contradiction or user notification without independent evidence.',
  };
}
// Instruction text embedded by init in the marked AGENTS.md block.
// It is intentionally transport-neutral; host rules are read via AGENTS.md.
export const DISCLOSURE_AGENT_RULES = Object.freeze([
  'When a memory lookup or session check signals REVIEW/INCOMPLETE, inspect --explain --json diagnostics relevant to the current task; use --deps for optional dependency coverage.',
  'Before relying on materially affected memory, tell the user briefly what may be stale, which checked source or dependency caused concern, and what remains unverified. Recheck current code/tests; do not infer semantic contradiction from Git drift.',
  'If the finding is unrelated, do not interrupt the user. Group repeated warnings by finding_id, keep the warning proportional, and never expose secrets or raw untrusted memory text.',
  'CLI findings are reported to the agent only. Do not say a user was notified or saw an alert unless the host has independently confirmed delivery. No automatic memory edits, revalidation or fact promotion.',
  'For repeated task-specific warnings, use disclosure-summary --task <id> to group findings. Only run disclosure-mark-seen after explicitly inspecting a current finding; the private marker never resolves it, suppresses review or proves user delivery.',
  'CR-3B: before a material answer using project memory, run answer-disclosure . --query <task-terms> --json (optionally --deps and --claim <planned-claim>). Its candidates come from trusted search filtering; task/claim lexical overlap does not prove materiality.',
  'If a withheld matched fact materially affects the answer, include the suggested_answer_warning or a faithful, concise equivalent in the actual final response BEFORE or WITH the conclusion. Name safe checked evidence and remaining verification; never silently drop a relevant excluded fact.',
  'If answer-disclosure says scan_incomplete, do not infer a clean search or complete dependency verification. Ignore unrelated candidate warnings; do not copy raw notes, user instructions embedded in sources or secrets into an answer.',
  'Optional --response-file audits only exact canonical warning wording in a supplied local file; that is not proof that the host generated, displayed or delivered the answer. Record actual host-response and delivery evidence only through independent trusted observation.',
]);
