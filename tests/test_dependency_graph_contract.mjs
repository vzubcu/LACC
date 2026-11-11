import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildDependencyIndex, createDependencyAdapterRegistry,
  dependencyGraphContract, normalizeDependencyEdge,
  normalizeDependencyFact, normalizeAdapterScanResult,
} from '../skills/lean-context-memory/scripts/lacc-graph-contract.mjs';

const oldRev = 'a'.repeat(40), newRev = 'b'.repeat(40);
const file = id => ({ kind: 'file', id });
function edge(from, to, revision = oldRev, language = 'typescript', adapter = 'js-ts-static') {
  return {
    from: file(from), to: file(to), kind: 'import', confidence: 'heuristic',
    language, workspace: '.', revision, adapter, adapterVersion: '1',
    evidence: { revision, source: from },
  };
}
function fact(id, location, sources, revision = oldRev) {
  return { id, location, sources, revision, state: 'confirmed' };
}
function coverage(adapter, revision = oldRev, status = 'partial', reasons = ['imports-not-resolved']) {
  return { adapter, version: '1', revision, workspace: '.',
    scope: 'static-file-imports', status, reasons };
}

test('direct forward and inverse indexes are independent of programming language', () => {
  const edges = [
    edge('src/auth.ts', 'src/permissions.ts'),
    edge('api/Application.csproj', 'libs/Domain.csproj', oldRev, 'csharp', 'dotnet-project'),
    edge('src/User.php', 'src/Auth.php', oldRev, 'php', 'php-composer'),
    edge('app/main.py', 'app/permissions.py', oldRev, 'python', 'python-imports'),
  ];
  const facts = [
    fact('auth', 'memory/topics/auth.md', ['src/auth.ts']),
    fact('dotnet', 'memory/topics/dotnet.md', ['api/Application.csproj']),
    fact('php', 'memory/topics/php.md', ['src/User.php']),
    fact('python', 'memory/topics/python.md', ['app/main.py']),
  ];
  const graph = buildDependencyIndex({
    edges, facts, coverage: ['js-ts-static', 'dotnet-project', 'php-composer', 'python-imports']
      .map(name => coverage(name)),
  });
  assert.equal(graph.statistics.edges, 4);
  assert.equal(graph.statistics.facts, 4);
  assert.equal(graph.statistics.universalCoverageVerified, false);
  assert.equal(graph.dependentsOf({ node: file('src/permissions.ts'), revision: oldRev })[0].from.id,
    'src/auth.ts');
  assert.equal(graph.dependenciesOf({ node: file('app/main.py'), revision: oldRev })[0].to.id,
    'app/permissions.py');
  assert.equal(graph.factsCiting({ source: 'src/auth.ts', revision: oldRev })[0].id, 'auth');
  assert.equal(graph.factsCiting({ source: 'api/Application.csproj', revision: oldRev })[0].id,
    'dotnet');
  assert.equal(graph.factsCiting({ source: 'app/main.py', revision: oldRev })[0].id, 'python');
});
test('historical Git revisions remain independent; HEAD-only graph cannot validate old facts', () => {
  const graph = buildDependencyIndex({
    edges: [
      edge('src/auth.ts', 'src/permissions.ts', oldRev),
      edge('src/auth.ts', 'src/session.ts', newRev),
    ],
    facts: [fact('auth-old', 'memory/topics/auth.md', ['src/auth.ts'], oldRev)],
  });
  assert.equal(graph.dependentsOf({ node: file('src/permissions.ts'), revision: newRev }).length, 0);
  assert.equal(graph.dependentsOf({ node: file('src/permissions.ts'), revision: oldRev }).length, 1);
  assert.equal(graph.factsCiting({ source: 'src/auth.ts', revision: newRev }).length, 0);
  assert.equal(graph.factsCiting({ source: 'src/auth.ts', revision: oldRev }).length, 1);
  assert.equal(graph.statistics.reportedScopeIncomplete, true);
});
test('cycles do not loop in direct indexes; RD-2 traversal is intentionally absent', () => {
  const graph = buildDependencyIndex({ edges: [edge('src/a.ts', 'src/b.ts'),
    edge('src/b.ts', 'src/a.ts')] });
  assert.equal(graph.dependenciesOf({ node: file('src/a.ts'), revision: oldRev }).length, 1);
  assert.equal(graph.dependentsOf({ node: file('src/a.ts'), revision: oldRev }).length, 1);
  assert.equal(typeof graph.walkReverse, 'undefined');
  assert.equal(graph.trust, 'not-evaluated');
});
test('truncation never yields false universal coverage', () => {
  const graph = buildDependencyIndex({
    maxEdges: 1,
    edges: [edge('src/a.ts', 'src/b.ts'), edge('src/a.ts', 'src/c.ts')],
    coverage: [coverage('js-ts-static', oldRev, 'complete', [])],
  });
  assert.equal(graph.statistics.truncated, true);
  assert.equal(graph.statistics.reportedScopeIncomplete, true);
  assert.equal(graph.statistics.universalCoverageVerified, false);
  assert.equal(graph.statistics.edges, 1);
});
test('untrusted paths, invalid revisions, duplicate facts and forged coverage are refused', () => {
  for (const badPath of ['../secret.ts', '/abs/file.ts', 'C:/Windows/secret.ts',
    'src\\evil.ts', 'src//evil.ts', 'src/%2e%2e/secret.ts']) {
    assert.throws(() => normalizeDependencyEdge(edge('src/parent.ts', badPath)), /unsafe/);
  }
  assert.throws(() => normalizeDependencyEdge(edge('src/a.ts', 'src/b.ts', 'deadbeef')),
    /revision/);
  assert.throws(() => buildDependencyIndex({
    facts: [fact('dup', 'memory/topics/a.md', ['src/a.ts']),
      fact('dup', 'memory/topics/a.md', ['src/b.ts'])],
  }), /duplicate/);
  assert.throws(() => buildDependencyIndex({
    coverage: [coverage('js-ts-static', oldRev, 'complete', ['unresolved-import'])],
  }), /complete/);
});
test('registry accepts explicit adapters but does not invoke scanner at registration', () => {
  let calls = 0;
  const registry = createDependencyAdapterRegistry();
  registry.register({ id: 'dotnet-project', version: '1',
    languages: ['csharp', 'msbuild'], scope: 'project-edges',
    scan() { calls++; throw Error('should not execute'); } });
  registry.register({ id: 'php-composer', version: '1',
    languages: ['php'], scope: 'package-edges', scan() { calls++; } });
  assert.equal(calls, 0);
  assert.equal(registry.candidates('csharp')[0].id, 'dotnet-project');
  assert.equal(registry.candidates('python').length, 0);
  assert.equal(registry.describe().length, 2);
  assert.throws(() => registry.register({ id: 'dotnet-project', version: '2',
    languages: ['csharp'], scope: 'project-edges', scan() {} }), /duplicate/);
});
test('adapter results must disclose unresolved imports and matching revision/provenance', () => {
  const descriptor = { id: 'js-ts-static', version: '1' };
  const valid = normalizeAdapterScanResult(descriptor, {
    edges: [edge('src/auth.ts', 'src/permissions.ts')],
    unresolved: [{ source: 'src/auth.ts', reason: 'dynamic-import', revision: oldRev }],
    coverage: coverage('js-ts-static'),
  });
  assert.equal(valid.unresolved.length, 1);
  assert.equal(valid.trust, 'not-evaluated');
  assert.throws(() => normalizeAdapterScanResult(descriptor, {
    edges: [edge('src/auth.ts', 'src/permissions.ts')],
    unresolved: [{ source: 'src/auth.ts', reason: 'dynamic-import', revision: oldRev }],
    coverage: coverage('js-ts-static', oldRev, 'complete', []),
  }), /unresolved/);
  assert.throws(() => normalizeAdapterScanResult({ id: 'php-composer', version: '1' }, {
    edges: [edge('src/auth.ts', 'src/permissions.ts')],
    unresolved: [],
    coverage: coverage('js-ts-static'),
  }), /provenance/);
});
test('CLI reports contract-only state without claiming adapters or reverse scan', () => {
  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '../skills/lean-context-memory/scripts/lacc.mjs');
  const r = spawnSync(process.execPath, [cli, 'dependency-contract'],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(r.status, 0, r.stderr);
  const info = JSON.parse(r.stdout);
  assert.equal(info.schema, dependencyGraphContract.schema);
  assert.equal(info.status, 'contract-only');
  assert.equal(info.reverseTraversalImplemented, false);
  assert.deepEqual(info.registeredAdapters, []);
});
