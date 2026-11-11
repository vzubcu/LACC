// Language-neutral dependency graph contract (RD-1).
// No source parser, import resolver, Git reader or memory trust decision here.
// Adapters supply scoped evidence; the existing LACC verifier owns trust.
const SCHEMA = 1;
const NODE_KINDS = new Set(['file', 'project', 'package', 'symbol', 'configuration', 'schema']);
const EDGE_KINDS = new Set([
  'import', 'project-reference', 'symbol-reference', 'package-reference',
  'generated-from', 'configuration', 'schema-consumer', 'runtime-registration', 'unknown',
]);
const CONFIDENCE = new Set(['resolved', 'heuristic', 'unknown']);
const COVERAGE = new Set(['complete', 'partial', 'unsupported', 'unavailable']);
const FACT_STATES = new Set(['confirmed', 'review', 'unverified']);
const MAX = Object.freeze({
  edges: 4096, facts: 1000, sourcesPerFact: 16, idBytes: 512, reasons: 32,
});
const bad = value => typeof value !== 'string' ||
  !value || Buffer.byteLength(value, 'utf8') > MAX.idBytes ||
  /[\u0000-\u001f\u007f]/.test(value);
const clone = value => JSON.parse(JSON.stringify(value));

function identifier(value, field) {
  if (bad(value)) throw Error('invalid ' + field);
  return value;
}
function sourcePath(value, field = 'path') {
  identifier(value, field);
  // Git uses forward slashes even on Windows. No absolute/drive/UNC path,
  // traversal, repeated separators, trailing slash, or encoded separators.
  if (value.includes('\\') || value.startsWith('/') ||
      /^[a-zA-Z]:/.test(value) || value.startsWith('//') ||
      /%(?:2e|2f|5c)/i.test(value) ||
      value.split('/').some(x => x === '' || x === '.' || x === '..'))
    throw Error('unsafe ' + field);
  return value;
}
function workspace(value) {
  return value === '.' ? '.' : sourcePath(value, 'workspace');
}
function revision(value) {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value))
    throw Error('invalid Git revision');
  return value;
}
function node(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !NODE_KINDS.has(input.kind)) throw Error('unknown graph node kind');
  const id = input.kind === 'file' || input.kind === 'project' ||
    input.kind === 'configuration' || input.kind === 'schema'
    ? sourcePath(input.id, 'node path') : identifier(input.id, 'node id');
  return Object.freeze({ kind: input.kind, id });
}
function key(n, rev) {
  return JSON.stringify([rev, n.kind, n.id]);
}
function edge(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('invalid graph edge');
  const from = node(input.from), to = node(input.to);
  if (!EDGE_KINDS.has(input.kind)) throw Error('unknown dependency relation');
  if (!CONFIDENCE.has(input.confidence)) throw Error('invalid confidence');
  const rev = revision(input.revision);
  const adapter = identifier(input.adapter, 'adapter');
  const adapterVersion = identifier(input.adapterVersion, 'adapter version');
  const evidence = input.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) ||
      revision(evidence.revision) !== rev) throw Error('edge provenance must match graph revision');
  return Object.freeze({
    from, to, kind: input.kind, confidence: input.confidence,
    language: identifier(input.language, 'language'),
    workspace: workspace(input.workspace ?? '.'),
    revision: rev, adapter, adapterVersion,
    evidence: Object.freeze({ revision: rev, source: sourcePath(evidence.source, 'evidence source') }),
  });
}
function fact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('invalid graph fact');
  if (!Array.isArray(input.sources) || input.sources.length < 1 ||
      input.sources.length > MAX.sourcesPerFact) throw Error('invalid fact sources');
  if (!FACT_STATES.has(input.state)) throw Error('unknown fact state');
  return Object.freeze({
    id: identifier(input.id, 'fact id'),
    location: sourcePath(input.location, 'fact location'),
    revision: revision(input.revision),
    state: input.state,
    sources: Object.freeze([...new Set(input.sources.map(x => sourcePath(x, 'cited source')))].sort()),
  });
}
function coverage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !COVERAGE.has(input.status)) throw Error('invalid adapter coverage');
  if (!Array.isArray(input.reasons) || input.reasons.length > MAX.reasons ||
      input.reasons.some(x => bad(x))) throw Error('invalid coverage reasons');
  if (input.status === 'complete' && input.reasons.length)
    throw Error('complete scoped coverage cannot have unresolved reasons');
  return Object.freeze({
    adapter: identifier(input.adapter, 'adapter'),
    version: identifier(input.version, 'adapter version'),
    revision: revision(input.revision),
    workspace: workspace(input.workspace ?? '.'),
    scope: identifier(input.scope, 'coverage scope'),
    status: input.status,
    reasons: Object.freeze([...new Set(input.reasons)].sort()),
  });
}
function indexPush(index, indexKey, record) {
  const list = index.get(indexKey) ?? [];
  list.push(record);
  index.set(indexKey, list);
}
function boundedLimit(value, maximum, name) {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw Error('invalid ' + name + ' budget');
  return value;
}
export const dependencyGraphContract = Object.freeze({
  schema: SCHEMA,
  edgeDirections: Object.freeze({ forward: 'dependent -> dependency', reverse: 'dependency -> dependent' }),
  nodeKinds: Object.freeze([...NODE_KINDS]),
  edgeKinds: Object.freeze([...EDGE_KINDS]),
  confidence: Object.freeze([...CONFIDENCE]),
  coverage: Object.freeze([...COVERAGE]),
  budgets: MAX,
  semantics: 'Evidence-only. No edge or complete scoped scan can certify a memory fact.',
  portable: 'Node.js and Git are the baseline; no compiler, network or daemon required.',
});
export { node as normalizeDependencyNode, edge as normalizeDependencyEdge,
  fact as normalizeDependencyFact, coverage as normalizeAdapterCoverage };

export function buildDependencyIndex({
  edges = [], facts = [], coverage: reports = [], maxEdges, maxFacts,
} = {}) {
  if (![edges, facts, reports].every(Array.isArray)) throw Error('expected arrays for graph inputs');
  const edgeBudget = boundedLimit(maxEdges, MAX.edges, 'edges');
  const factBudget = boundedLimit(maxFacts, MAX.facts, 'facts');
  // A truncated graph can still assist triage, but NEVER signals full coverage.
  const incomplete = edges.length > edgeBudget || facts.length > factBudget;
  const byDependency = new Map(), byDependent = new Map(), bySource = new Map();
  const normalizedEdges = [], normalizedFacts = [], seenEdges = new Set(), seenFacts = new Set();
  for (const raw of edges.slice(0, edgeBudget)) {
    const item = edge(raw);
    const fingerprint = JSON.stringify(item);
    if (seenEdges.has(fingerprint)) continue;
    seenEdges.add(fingerprint);
    normalizedEdges.push(item);
    indexPush(byDependency, key(item.to, item.revision), item);
    indexPush(byDependent, key(item.from, item.revision), item);
  }
  for (const raw of facts.slice(0, factBudget)) {
    const item = fact(raw);
    const fingerprint = JSON.stringify([item.revision, item.location, item.id]);
    if (seenFacts.has(fingerprint)) throw Error('duplicate source-backed fact identity');
    seenFacts.add(fingerprint);
    normalizedFacts.push(item);
    for (const cited of item.sources)
      indexPush(bySource, key({ kind: 'file', id: cited }, item.revision), item);
  }
  const normalizedCoverage = reports.slice(0, MAX.edges).map(coverage);
  const reportsTruncated = reports.length > MAX.edges;
  const reportedScopeIncomplete = incomplete || reportsTruncated ||
    normalizedCoverage.length === 0 || normalizedCoverage.some(x => x.status !== 'complete');
  const stable = values => clone(values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const getEdges = (index, query) => stable([...(index.get(key(node(query.node), revision(query.revision))) ?? [])]);
  return Object.freeze({
    schema: SCHEMA,
    statistics: Object.freeze({
      edges: normalizedEdges.length, facts: normalizedFacts.length,
      coverageReports: normalizedCoverage.length,
      truncated: incomplete || reportsTruncated,
      reportedScopeIncomplete,
      universalCoverageVerified: false, // even a complete adapter report is scoped evidence
    }),
    // These are direct index primitives; RD-2 adds bounded multi-hop traversal.
    dependentsOf: query => getEdges(byDependency, query),
    dependenciesOf: query => getEdges(byDependent, query),
    factsCiting: query => stable([...(bySource.get(key(
      { kind: 'file', id: sourcePath(query.source) }, revision(query.revision))) ?? [])]),
    coverageReports: () => stable([...normalizedCoverage]),
    // No "verified" or "unaffected" result is produced by this index.
    trust: 'not-evaluated',
    graphScope: 'explicit-input-edges-only',
  });
}

export function normalizeAdapterScanResult(descriptor, output) {
  if (!descriptor || typeof descriptor !== 'object' || !output ||
      typeof output !== 'object' || Array.isArray(output) ||
      !Array.isArray(output.edges) || !Array.isArray(output.unresolved))
    throw Error('invalid adapter scan result');
  const id = identifier(descriptor.id, 'adapter id');
  const version = identifier(descriptor.version, 'adapter version');
  if (output.edges.length > MAX.edges || output.unresolved.length > MAX.edges)
    throw Error('adapter output exceeded hard edge budget; report incomplete');
  const edges = output.edges.map(edge);
  const unresolved = output.unresolved.map(ref => {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref))
      throw Error('invalid unresolved dependency');
    return Object.freeze({
      source: sourcePath(ref.source, 'unresolved source'),
      reason: identifier(ref.reason, 'unresolved reason'),
      revision: revision(ref.revision),
    });
  });
  const report = coverage(output.coverage);
  if (report.adapter !== id || report.version !== version ||
      edges.some(x => x.adapter !== id || x.adapterVersion !== version))
    throw Error('adapter scan provenance does not match its descriptor');
  if (report.status === 'complete' && unresolved.length)
    throw Error('unresolved references forbid complete scoped coverage');
  if (edges.some(x => x.revision !== report.revision) ||
      unresolved.some(x => x.revision !== report.revision))
    throw Error('adapter scan mixed incompatible Git revisions');
  if (edges.some(x => x.workspace !== report.workspace))
    throw Error('adapter scan mixed workspaces');
  return Object.freeze({
    schema: SCHEMA,
    edges: Object.freeze(edges),
    unresolved: Object.freeze(unresolved),
    coverage: report,
    trust: 'not-evaluated',
  });
}

export function createDependencyAdapterRegistry() {
  const adapters = new Map();
  return Object.freeze({
    register(spec) {
      if (!spec || typeof spec !== 'object' || Array.isArray(spec) ||
          typeof spec.scan !== 'function') throw Error('adapter must supply a scan function');
      const id = identifier(spec.id, 'adapter id');
      if (adapters.has(id)) throw Error('duplicate dependency adapter id: ' + id);
      const descriptor = Object.freeze({
        id,
        version: identifier(spec.version, 'adapter version'),
        languages: Object.freeze(
          [...new Set((spec.languages ?? []).map(x => identifier(x, 'language')))].sort()),
        scope: identifier(spec.scope, 'adapter scope'),
      });
      if (!Array.isArray(spec.languages) || descriptor.languages.length === 0)
        throw Error('adapter needs explicit supported languages');
      // Registration only; scanning is never triggered automatically.
      adapters.set(id, { descriptor, scan: spec.scan });
      return clone(descriptor);
    },
    describe() { return clone([...adapters.values()].map(x => x.descriptor)
      .sort((a, b) => a.id.localeCompare(b.id))); },
    candidates(language) {
      identifier(language, 'language');
      return clone([...adapters.values()]
        .filter(x => x.descriptor.languages.includes(language))
        .map(x => x.descriptor).sort((a, b) => a.id.localeCompare(b.id)));
    },
    // Callers may explicitly invoke their own adapters in RD-2+; registration
    // does not execute untrusted repository scripts or optional LSP tooling.
  });
}
