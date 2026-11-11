// RD-2: scoped reverse dependency impact, using RD-1 graph indexes and
// LACC's existing Git source verifier. Read-only, offline and opt-in.
import { buildDependencyIndex, createDependencyAdapterRegistry } from './lacc-graph-contract.mjs';
import { createJsTsScanner, jsTsLanguage, JS_TS_SCANNER } from './lacc-dependencies.mjs';
import { createCrossLanguageScanner, languageForSource, CROSS_ADAPTERS } from './lacc-cross-adapters.mjs';
import { git, gitText, verifySources } from './lacc-core.mjs';

export const IMPACT_LIMITS = Object.freeze({
  facts: 64, depth: 3, edgesPerFact: 32, bytesPerFact: 1024 * 1024,
  totalEdges: 1024, maximumChangedPaths: 256, maximumIssuesPerFact: 24,
});
const ADAPTER = 'js-ts-static';
const META = [JS_TS_SCANNER, ...CROSS_ADAPTERS];
const language = path => jsTsLanguage(path) ?? languageForSource(path);
function adapterFor(path) { return jsTsLanguage(path) ? JS_TS_SCANNER : CROSS_ADAPTERS.find(x => x.languages.includes(language(path))) ?? null; }
function fullRevision(root, revision, cache) {
  if (cache.has(revision)) return cache.get(revision);
  const r = /^[a-f\d]{7,40}$/i.test(revision ?? '')
    ? git(root, ['rev-parse', '--verify', revision + '^{commit}']) : { ok: false };
  const rev = r.ok && /^[a-f\d]{40}$/i.test(gitText(r)) ? gitText(r).toLowerCase() : null;
  cache.set(revision, rev);
  return rev;
}
function factKey(location) { return location; }
function addIssue(map, location, code, source, dependency, extra = {}) {
  const items = map.get(location) ?? [];
  const issue = { code, source, dependency, ...extra };
  if (!items.some(x => JSON.stringify(x) === JSON.stringify(issue))) {
    if (items.length < IMPACT_LIMITS.maximumIssuesPerFact) items.push(issue);
    else if (!items.some(x => x.code === 'dependency-coverage-incomplete' && x.dependency === 'issue-budget'))
      items.push({ code: 'dependency-coverage-incomplete', source, dependency: 'issue-budget' });
  }
  map.set(location, items);
}
function getRegistry() {
  const registry = createDependencyAdapterRegistry();
  for (const item of META) registry.register({
    id: item.id, version: item.version,
    languages: [...item.languages], scope: item.scope,
    // Explicit impact analysis only. No build, package manager, LSP or Python execution.
    scan: item.id === JS_TS_SCANNER.id ? createJsTsScanner : createCrossLanguageScanner,
  });
  return registry;
}
export function registeredImpactAdapters() { return getRegistry().describe(); }

export function analyzeDependencyImpact(root, inputFacts, { maxFacts = IMPACT_LIMITS.facts } = {}) {
  if (!Array.isArray(inputFacts) || !Number.isSafeInteger(maxFacts) ||
      maxFacts < 1 || maxFacts > IMPACT_LIMITS.facts)
    throw Error('invalid impact fact limit');
  const facts = inputFacts.slice(0, maxFacts);
  const truncated = inputFacts.length > facts.length;
  const issues = new Map(facts.map(row => [factKey(row.location), []]));
  const revisions = new Map(), perRevision = new Map(), edges = [], graphFacts = [];
  const scannerCache = new Map(), scannedNodes = new Map(), reports = new Map();
  let edgesTotal = 0, graphTruncated = false;

  for (const row of facts) {
    const location = factKey(row.location);
    const source = row.sources?.[0] ?? 'unknown';
    const rev = fullRevision(root, row.revision, revisions);
    if (!rev) {
      addIssue(issues, location, 'dependency-coverage-incomplete', source, 'unavailable-verified-commit');
      continue;
    }
    if (!Array.isArray(row.sources) || !row.sources.length) {
      addIssue(issues, location, 'dependency-coverage-incomplete', source, 'missing-cited-sources');
      continue;
    }
    const state = row.state === 'confirmed' ? 'confirmed' : 'review';
    graphFacts.push({ id: row.key ?? location, location, revision: rev, sources: row.sources, state });
    const existing = perRevision.get(rev) ?? new Set();
    perRevision.set(rev, existing);
    const scanners = scannerCache.get(rev) ?? {
      js: createJsTsScanner(root, rev), cross: createCrossLanguageScanner(root, rev),
    };
    scannerCache.set(rev, scanners);
    const queue = row.sources.map(source => ({ source, depth: 0 }));
    const visited = new Set();
    let counted = 0, bytes = 0, incomplete = false;
    while (queue.length) {
      const next = queue.shift();
      if (visited.has(next.source)) continue;
      visited.add(next.source);
      existing.add(next.source);
      const meta = adapterFor(next.source);
      if (!meta) {
        addIssue(issues, location, 'dependency-coverage-incomplete', next.source, 'unsupported-language');
        incomplete = true;
        continue;
      }
      const cacheKey = rev + '\0' + next.source;
      let result = scannedNodes.get(cacheKey);
      if (!result) {
        try {
          const scanner = meta.id === JS_TS_SCANNER.id ? scanners.js : scanners.cross;
          result = scanner.scan(next.source);
        } catch {
          result = { edges: [], unknown: ['scanner-failed-or-unsafe-path'], bytes: 0 };
        }
        scannedNodes.set(cacheKey, result);
      }
      bytes += result.bytes;
      if (bytes > IMPACT_LIMITS.bytesPerFact) {
        addIssue(issues, location, 'dependency-coverage-incomplete', next.source, 'byte-budget');
        incomplete = true;
        break;
      }
      if (result.unknown.length) incomplete = true;
      for (const reason of result.unknown)
        addIssue(issues, location, 'dependency-coverage-incomplete', next.source, reason,
          { adapter: meta.id, language: language(next.source) });
      for (const rawDep of result.edges) {
        const dep = typeof rawDep === 'string'
          ? { path: rawDep, kind: 'import', confidence: 'heuristic' } : rawDep;
        if (!dep || typeof dep.path !== 'string') {
          addIssue(issues, location, 'dependency-coverage-incomplete', next.source, 'invalid-adapter-edge');
          incomplete = true;
          continue;
        }
        if (next.depth >= IMPACT_LIMITS.depth) {
          addIssue(issues, location, 'dependency-coverage-incomplete', next.source, 'depth-limit');
          incomplete = true;
          continue;
        }
        if (counted >= IMPACT_LIMITS.edgesPerFact || edgesTotal >= IMPACT_LIMITS.totalEdges) {
          addIssue(issues, location, 'dependency-coverage-incomplete', next.source, 'edge-budget');
          incomplete = true;
          if (edgesTotal >= IMPACT_LIMITS.totalEdges) graphTruncated = true;
          break;
        }
        counted++;
        edgesTotal++;
        edges.push({
          from: { kind: 'file', id: next.source },
          to: { kind: 'file', id: dep.path },
          kind: dep.kind ?? 'import', confidence: dep.confidence ?? 'heuristic',
          language: language(next.source), workspace: '.',
          revision: rev, adapter: meta.id, adapterVersion: meta.version,
          evidence: { revision: rev, source: next.source },
        });
        queue.push({ source: dep.path, depth: next.depth + 1 });
      }
      if (graphTruncated) break;
    }
    // Coverage is scoped per adapter+Git revision; never merge C# and Python
    // into a misleadingly complete JS/TS report.
    for (const source of visited) {
      const meta = adapterFor(source);
      if (!meta) continue;
      const k = rev + '\0' + meta.id;
      const previous = reports.get(k) ?? { rev, meta, incomplete: false, reasons: new Set() };
      previous.incomplete ||= incomplete;
      for (const item of issues.get(location))
        if (item.code === 'dependency-coverage-incomplete')
          previous.reasons.add(item.dependency);
      reports.set(k, previous);
    }
  }

  // If the graph is truncated at the global edge budget, a fact outside the
  // constructed portion must never be treated as dependency-clean.
  if (truncated || graphTruncated) for (const row of facts)
    addIssue(issues, row.location, 'dependency-coverage-incomplete',
      row.sources?.[0] ?? 'unknown', 'global-scan-incomplete');
  const coverage = [...reports.values()].map(info => ({
    adapter: info.meta.id, version: info.meta.version,
    revision: info.rev, workspace: '.', scope: info.meta.scope,
    status: info.incomplete ? 'partial' : 'complete',
    reasons: [...info.reasons].sort().slice(0, 32),
  }));
  let index;
  try {
    index = buildDependencyIndex({ edges, facts: graphFacts, coverage });
  } catch {
    for (const row of facts)
      addIssue(issues, row.location, 'dependency-coverage-incomplete',
        row.sources?.[0] ?? 'unknown', 'graph-contract-rejected');
    return makeResult(facts, issues, [], { truncated: true,
      graphContractRejected: true, universalCoverageVerified: false });
  }

  const synthetic = [];
  for (const [rev, names] of perRevision) for (const source of names) {
    if (synthetic.length >= IMPACT_LIMITS.maximumChangedPaths) {
      graphTruncated = true;
      break;
    }
    synthetic.push({ location: rev + ':' + source, revision: rev, sources: [source] });
  }
  if (graphTruncated) for (const row of facts)
    addIssue(issues, row.location, 'dependency-coverage-incomplete',
      row.sources?.[0] ?? 'unknown', 'global-scan-incomplete');

  let freshness;
  try { freshness = verifySources(root, synthetic); }
  catch {
    for (const row of facts)
      addIssue(issues, row.location, 'dependency-coverage-incomplete',
        row.sources?.[0] ?? 'unknown', 'git-verification-unavailable');
    return makeResult(facts, issues, [], {
      ...index.statistics, verificationFailed: true, universalCoverageVerified: false,
    });
  }
  const changed = [];
  for (const row of synthetic) {
    const statuses = freshness.get(row.location) ?? [];
    for (const status of statuses) {
      if (['unavailable-commit', 'unsafe-source'].includes(status.code)) {
        for (const fact of graphFacts.filter(f => f.revision === row.revision))
          addIssue(issues, fact.location, 'dependency-coverage-incomplete',
            row.sources[0], status.code);
      } else {
        changed.push({ revision: row.revision, path: row.sources[0], reason: status.code });
      }
    }
  }
  // Forward evidence is collected by walking from each cited source.
  // Now change the direction: changed file -> every dependent -> cited fact.
  // This also considers old-only import edges (deletions/renames).
  for (const change of changed) {
    const queue = [{ source: change.path, chain: [change.path], adapters: [] }];
    const visited = new Set();
    while (queue.length) {
      const { source, chain, adapters } = queue.shift();
      if (visited.has(source)) continue;
      visited.add(source);
      for (const fact of index.factsCiting({ source, revision: change.revision })) {
        addIssue(issues, fact.location,
          chain.length > 1 ? 'dependency-changed' : 'direct-source-changed',
          source, change.path, { chain, reason: change.reason,
            ...(adapters.length ? { adapter: adapters[adapters.length-1],
              adapters } : {}) });
      }
      if (chain.length > IMPACT_LIMITS.depth) continue;
      for (const edge of index.dependentsOf({
        node: { kind: 'file', id: source }, revision: change.revision,
      })) {
        const parent = edge.from.id;
        if (!visited.has(parent))
          queue.push({ source: parent, chain: [...chain, parent],
            adapters: [...adapters, edge.adapter] });
      }
    }
  }
  return makeResult(facts, issues, changed, {
    ...index.statistics, reverseTraversal: true,
    adapters: META.map(x => x.id), scope: 'bounded-static-cross-language-cited-source-closure',
  });
}

function makeResult(facts, issues, changed, graph) {
  const byFact = new Map();
  for (const row of facts) {
    const entries = issues.get(row.location) ?? [];
    const sorted = [...entries].sort((a, b) =>
      (a.code + a.dependency).localeCompare(b.code + b.dependency, 'en'));
    byFact.set(row.location, {
      issues: sorted,
      complete: sorted.length === 0 && !graph.truncated,
      scope: 'bounded-cross-language-static-revision-scoped-reverse-graph',
    });
  }
  return {
    byFact,
    changedPaths: changed.slice(0, IMPACT_LIMITS.maximumChangedPaths),
    statistics: {
      ...graph, analyzedFacts: facts.length,
      changedPaths: changed.length,
      reviewFacts: [...byFact.values()].filter(row => row.issues.length).length,
    },
  };
}
