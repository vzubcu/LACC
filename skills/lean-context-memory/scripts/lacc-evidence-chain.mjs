// CR-2: deterministic, evidence-backed explanation of direct and reverse
// dependency impact. Pure formatting only; no Git, source scan or memory writes.
const MAX_STEPS = 8;
const MAX_PATH_BYTES = 240;
const ADAPTER = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const KINDS = new Set(['import','project-reference','symbol-reference',
  'package-reference','generated-from','configuration','schema-consumer',
  'runtime-registration','unknown']);
const CONFIDENCE = new Set(['resolved','heuristic','unknown']);
const REV = /^[a-f0-9]{40}$/i;
const CHANGE = new Set(['changed-source','missing-source','untracked-source']);
function safePath(value) {
  if (typeof value !== 'string' || !value ||
      Buffer.byteLength(value,'utf8') > MAX_PATH_BYTES ||
      /[\x00-\x1f\x7f\\]/.test(value) || value.startsWith('/') ||
      /^[a-z]:/i.test(value) || /%(?:2e|2f|5c)/i.test(value) ||
      value.split('/').some(x => !x || x === '.' || x === '..') ||
      /(?:password|secret|token|api[_-]?key)\s*[:=]/i.test(value))
    return null;
  return value;
}
function atom(value) {
  return typeof value === 'string' && ADAPTER.test(value) ? value : null;
}
function fullCommit(value) {
  return typeof value === 'string' && REV.test(value) ? value.toLowerCase() : null;
}
function reason(value) {
  return typeof value === 'string' && CHANGE.has(value) ? value : null;
}
function base(status, verified, location, cited) {
  return {
    status, evidence_origin: 'existing-lacc-git-and-static-dependency-analysis',
    baseline_commit: verified,
    current_commit: null,
    changed_file: null, change_reason: null,
    hops: [], fact_link: null,
    limitations: [], semantics: 'not-evaluated',
    note: 'Evidence describes potential staleness; it does not prove a semantic contradiction.',
  };
}
function incomplete(trace, why) {
  return { ...trace, status:'partial', limitations:[...new Set([...trace.limitations, why])] };
}
/**
 * issue: an existing LACC source or dependency diagnostic.
 * context: already normalized CR-1 values; nothing is reread or inferred.
 */
export function explainMemoryEvidence(issue, context) {
  const { kind, source, dependency, chain, citedSources, revision, location } = context;
  const savedRevision = typeof revision === 'string' && /^[a-f0-9]{7,40}$/i.test(revision)
    ? revision.toLowerCase() : null;
  const trace = base('unavailable',savedRevision,location,citedSources);
  if (!['source-drift','indirect-dependency-drift','evidence-unavailable','coverage-incomplete'].includes(kind))
    return trace;
  const validLocation = safePath(location?.replace(/:\d+$/,'')) != null;
  const validSources = Array.isArray(citedSources) && citedSources.every(x => safePath(x));
  if (!validLocation || !validSources || !savedRevision)
    return incomplete(trace,'verified-fact-or-source-context-unavailable');
  if (kind === 'source-drift' || kind === 'evidence-unavailable') {
    const cited = safePath(source);
    if (!cited || !citedSources.includes(cited))
      return incomplete(trace,'cited-source-evidence-unavailable');
    trace.changed_file = kind === 'source-drift' ? cited : null;
    trace.change_reason = kind === 'source-drift'
      ? reason(issue.code === 'changed-source' ? 'changed-source' : issue.reason) : null;
    trace.fact_link = {
      cited_source:cited, memory_location:location,
      baseline_commit:savedRevision, relation:'cites-source',
    };
    trace.status = kind === 'source-drift' && trace.change_reason ? 'direct-git-evidence' : 'partial';
    if (trace.status === 'partial') trace.limitations.push('git-change-reason-not-confirmed');
    trace.explanation = trace.status === 'direct-git-evidence'
      ? 'Cited source changed since the fact\'s verified Git revision; recheck current code.'
      : 'Cited source evidence is unavailable or incomplete; verification is required.';
    return trace;
  }
  if (kind === 'coverage-incomplete')
    return incomplete(trace,'resolver-or-source-coverage-incomplete');
  // A reverse path runs dependency (changed) -> intermediate importers
  // -> source cited in memory. Never manufacture missing edges.
  if (!Array.isArray(chain) || chain.length < 2 || chain.length > MAX_STEPS + 1 ||
      chain.some(x => !safePath(x)) ||
      chain[0] !== dependency || chain.at(-1) !== source ||
      !citedSources.includes(source))
    return incomplete(trace,'dependency-path-not-grounded-in-cited-source');
  const rawEdges = issue.evidence_edges;
  if (!Array.isArray(rawEdges) || rawEdges.length !== chain.length-1)
    return incomplete(trace,'dependency-edge-evidence-unavailable');
  const hops=[];
  for (let i=0;i<rawEdges.length;i++) {
    const item=rawEdges[i];
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        safePath(item.from) !== chain[i+1] ||
        safePath(item.to) !== chain[i] ||
        safePath(item.evidence_source) !== chain[i+1] ||
        !KINDS.has(item.kind) || !CONFIDENCE.has(item.confidence) ||
        !atom(item.adapter) || !(typeof item.adapter_version === 'string' && VERSION.test(item.adapter_version)) ||
        !atom(item.language) || !fullCommit(item.revision) ||
        !fullCommit(item.revision).startsWith(savedRevision))
      return incomplete(trace,'inconsistent-or-unverified-dependency-edge');
    hops.push({
      dependency:chain[i], dependent:chain[i+1],
      relationship:item.kind, adapter:item.adapter,
      adapter_version:item.adapter_version, language:item.language,
      confidence:item.confidence, baseline_commit:fullCommit(item.revision),
      evidence_source:chain[i+1],
    });
  }
  trace.changed_file=dependency;
  trace.change_reason=reason(issue.reason);
  trace.hops=hops;
  trace.fact_link={
    cited_source:source, memory_location:location,
    baseline_commit:savedRevision, relation:'cites-source',
  };
  if (!trace.change_reason)
    return incomplete(trace,'git-change-reason-not-confirmed');
  trace.status='static-dependency-evidence';
  trace.limitations.push('file-level-links-do-not-prove-symbol-or-runtime-dependency');
  trace.explanation = 'Git reported a change in a dependency; ' + hops.length +
    ' static relationship(s) connect it to the cited source. Semantic impact is unverified.';
  return trace;
}
