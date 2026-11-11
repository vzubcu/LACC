# RD-1 — Portable dependency graph contract

**Branch:** develop. **Status:** RD-1 code integrated; RD-2 JS/TS opt-in reverse impact authored, **behavioral tests pending**.
**Goal:** provide a single language-neutral contract for evidence and indexes.
RD-1 remains the shared contract; RD-2 now reuses it for a bounded JS/TS parser and inverse graph traversal. Other languages and semantic resolving are not shipped.

## Implementation

- `skills/lean-context-memory/scripts/lacc-graph-contract.mjs` exports
  `dependencyGraphContract`, `normalizeDependencyNode`,
  `normalizeDependencyEdge`, `normalizeDependencyFact`,
  `normalizeAdapterCoverage`, `normalizeAdapterScanResult`,
  `createDependencyAdapterRegistry` and `buildDependencyIndex`.
- `node <skill_dir>/scripts/lacc.mjs dependency-contract` now reports
  `status: experimental-js-ts-reverse` with a single registered JS/TS
  static-import adapter and a bounded inverse traversal. It still makes
  no cross-language/semantic coverage claim. RD-1 alone never scans.
- RD-1 never edits canonical memory, starts a language server, invokes an
  adapter scan, accesses the network, or labels an unverified fact confirmed.
- RD-2 rewires opt-in `--deps` to the same JS/TS import extractor and
  revision-scoped graph. No default memory verification policy changes.

## Nodes, edges and provenance

A node is `{ kind, id }`. Allowed kinds: `file`, `project`,
`package`, `symbol`, `configuration` and `schema`. Source and project
paths use project-relative Git forward slashes; unsafe traversal,
Windows drive, UNC, control characters and encoded separators are refused.
Package and symbol identifiers are not interpreted as local file paths.

A directed edge follows **dependent -> dependency**:

```json
{
  "from": { "kind": "file", "id": "src/auth.ts" },
  "to": { "kind": "file", "id": "src/permissions.ts" },
  "kind": "import",
  "confidence": "heuristic",
  "language": "typescript",
  "workspace": ".",
  "revision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "adapter": "js-ts-static",
  "adapterVersion": "1",
  "evidence": {
    "revision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "source": "src/auth.ts"
  }
}
```

The edge's revision must exactly match its evidence revision. Its
`confidence` is `resolved`, `heuristic` or `unknown`, never a statement
that a memory claim is true. Future RD-2 adapters should use
`normalizeAdapterScanResult` to validate consistent adapter identity,
version, workspace and revision, plus explicit unresolved dependencies.

A memory source-reference record is separate:

```json
{
  "id": "auth.policy",
  "location": "memory/topics/architecture.md",
  "sources": ["src/auth.ts"],
  "revision": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "state": "confirmed"
}
```

This is a **mapping**. The RD-1 index never checks the content behind
`state: confirmed`: that remains the responsibility of Git-backed
`search`/`health`/`session-check`. A fact's source and graph edges
are indexed by **their respective verified Git revision**, so a graph
at HEAD cannot silently certify a historical fact.

## Direct indexes (not multi-hop traversal)

`buildDependencyIndex({ edges, facts, coverage, maxEdges, maxFacts })`
returns synchronous, in-memory, read-only *query methods*:

- `dependenciesOf({ node, revision })` -> direct outgoing edges.
- `dependentsOf({ node, revision })` -> direct incoming edges.
- `factsCiting({ source, revision })` -> facts citing that file.
- `coverageReports()` -> per-adapter/per-workspace/per-revision reports.
- `statistics` -> edge/fact totals, partial coverage, truncation flags.

RD-1 alone provides direct indexes; RD-2 now uses them for a bounded
reverse walk from changed paths **within the cited-source closure**.
A repository-wide index and cross-language resolver are not present.

Limits: at most 4096 edges, 1000 indexed facts, 16 cited sources per
fact, 512 UTF-8 bytes per identifier, 32 coverage reasons. Caller
may lower limits; over-budget collections are explicitly truncated
and `statistics.truncated` is true. Graph results are advisory.

The graph deliberately reports `universalCoverageVerified: false`
**even when some adapter-scoped reports say complete**.
`reportedScopeIncomplete` means only that supplied bounded reports
have gaps; it is not a global completeness assertion.

## Adapter boundary

An adapter registers metadata with `createDependencyAdapterRegistry()`:

```js
const registry = createDependencyAdapterRegistry();
registry.register({
  id: 'dotnet-project',
  version: '1',
  languages: ['csharp', 'msbuild'],
  scope: 'project-edges',
  scan() {
    // RD-3 implementation: explicit, bounded, read-only project scan
  },
});
const candidates = registry.candidates('csharp');
```

Registration and candidate selection **never execute** the `scan` callback.
RD-2/3 will separately define safe invocation, timeout and resource limits
before any adapter code runs on untrusted projects. Tool availability and
host permission must be checked explicitly. Unknown languages produce
no candidates and hence incomplete coverage, not an empty "clean graph".

The contract itself has no built-in JS, .NET, PHP or Python parser.
Explicit language-specific adapters remain RD-2/RD-3 work.

## Cross-language fixture requirements

The authored `tests/test_dependency_graph_contract.mjs` covers synthetic
JS/TS, .NET project references, PHP, Python, multi-revision indexing,
cycles, limits, unsafe paths, duplicate facts, incomplete coverage and
non-execution of adapter callbacks. These tests must run locally on Windows
and Linux during the develop validation gate; authoring them is not a pass.

Before promoting a release, execute RD-2 regression cases and test
integration with real code through RD-3, and compare Git stage/worktree state, deletions, aliases,
symbol resolution and false-negative rates. See the broader
[reverse dependency design](reverse-dependency-memory.md) and
[conflict-reporting contract](memory-conflict-reporting.md).

## RD-2 handoff

1. Refactor the current `lacc-dependencies.mjs` JS/TS forward parser into
   a registered adapter, or wrap it without duplicating source verification.
2. Build a scoped index from per-fact historical sources + current Git changes.
3. Walk the inverse adjacency map with bounded depth/visited tracking.
4. Map changed dependent files back to fact IDs and produce evidence paths.
5. Signal `review-required` for impacts **and for incomplete coverage**.
6. Keep the feature opt-in until tests and security review; never auto-rewrite
   facts or claim complete semantic analysis.
