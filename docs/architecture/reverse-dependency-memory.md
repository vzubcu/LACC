# Design proposal: Language-neutral reverse dependency and change-driven memory invalidation

**Status:** DESIGN ONLY / not implemented. **Branch:** develop. **Reviewed:** 2026-11-10.
**Parent milestone:** ROADMAP.md — P1 Dependency-aware memory staleness.
**Trigger:** community feedback: if a cited source imports another changed module, a
source-only Git check can return a misleading "source unchanged"; reverse walk from
changed dependencies to affected cited files and memory facts.

## Scope and core invariants

LACC runs on Windows/Linux/macOS, works with projects in *arbitrary* languages
and keeps Node 22+ plus Git as its portable default (no mandatory native
compiler, daemon, Python, Bash, cloud service or paid API).

1. Detect **potential indirect impact**, not semantic falsehood. The status is
   `review-required`, and only human-reviewed verification can reconfirm a claim.
2. A missing/unsupported language, dynamic resolution, unresolved module,
   runtime configuration, generated code, package upgrade, truncated index or
   failed adapter must never become a positive "dependency-complete" claim.
3. The default path remains bounded, local, read-only and offline. No
   background watcher or continuous process is required. No implicit execution
   of build scripts, package postinstalls, arbitrary repository commands or LSP
   servers. Optional tools must be explicit opt-ins with timeouts.
4. Facts are versioned against their **own `verified` Git revision**; do not
   falsely use one globally current graph to validate facts from earlier commits.
   An indexed edge needs revision/context and resolver provenance.
5. The implementation must support multi-root monorepos and repositories
   containing several languages, rather than selecting a single language.

## Relationship model

Use a normalized **directed forward** graph `dependent -> dependency`, plus
an inverse index `dependency -> dependents` for impact queries. Every edge
carries enough metadata to explain and evaluate its reliability.

```json
{
  "schema": 1,
  "from": "src/auth.ts",
  "to": "src/permissions.ts",
  "kind": "import",
  "language": "typescript",
  "workspace": ".",
  "confidence": "resolved",
  "resolver": "js-ts-static@1",
  "evidence": {"revision": "<git-sha>", "source": "src/auth.ts"},
  "coverage": {"complete": false, "reason": "package aliases not checked"}
}
```

The example is conceptual, not a promised runtime JSON API. The model
supports `import`, `project-reference`, `symbol-reference`,
`package-reference`, `generated-from`, `configuration`,
`schema-consumer`, `runtime-registration` and `unknown` relationships.
Use file-level nodes first; add symbol-level and workspace/package-level
nodes later only when real semantic indexes justify their accuracy.

The source-of-truth index can be rebuilt and must not be trusted merely
because it exists. Store it outside WARM facts (e.g.
`memory/.lacc-cache/dependency-index.json`), with Git-ignore protection,
content hashes, adapter versions, indexed commit, worktree/index identity,
explicit incomplete coverage and construction budgets. Do not commit
derived graphs with potentially sensitive source names by default.

## Pluggable adapters

Expose an internal adapter contract returning a bounded list of edges,
unresolved references, configuration dependencies, coverage and provenance.
An adapter must declare languages/extensions, workspaces, supported edge
types, resolution modes, version and limitations. Adapters do **not** mark
facts verified; the LACC core owns fact trust, Git checks and traversal.

**Layer 0 — universal, no language parser required:**
- Git changed paths (commit delta, staged and unstaged changes, deletes,
  renames, untracked paths, sparse/partial checkout awareness).
- Manifest/build-level and explicitly cited source mappings as supported;
  unresolved relationships are documented, not guessed.
- Any fact directly citing a changed path is already handled by LACC Git
  provenance. Reverse impact is additional.

**Layer 1 — built-in lightweight adapters, no extra installation:**
- JS/TS: local ESM/CommonJS imports; `tsconfig`/`jsconfig` aliases,
  workspaces and lockfiles initially trigger incomplete review unless
  safely resolved. Reuse/replace experimental `lacc-dependencies.mjs`;
  do NOT build a second incompatible verification checker.
- C#/.NET: `.sln`, `.slnx`, `.csproj`, `ProjectReference`,
  `PackageReference`, `Directory.Build.props/targets`, central package
  versions and generated outputs. File-level `using` alone is **not**
  enough to resolve C# symbol dependencies across projects.
- PHP: Composer `autoload` and `autoload-dev` PSR-4 mappings,
  package references and `require/include` where statically resolvable.
  CS-Cart-specific hooks, events and dynamically named PHP functions
  must be handled as unresolved/domain-aware edges unless another
  adapter can substantiate them.
- Python: relative/absolute package imports, `pyproject.toml`,
  `requirements*` and namespace-package considerations; dynamic
  `importlib` and runtime path manipulation are incomplete.
- Java/Kotlin: Maven/Gradle module relationships first; compiler-resolved
  references only through optional indexing.
- Go: module/package imports, `go.mod`, `go.work` and replace directives.
- Rust: crate/workspace and Cargo feature/manifest relations first.
- Other languages: generic/manual adapter or `unsupported-language`,
  never fake a complete import closure.

**Layer 2 — optional semantic integrations:**
- Tree-sitter adapters for richer syntax extraction. Its incremental
  parsing is useful, but a syntax tree does **not** by itself resolve
  project symbols, frameworks or dynamic runtime wiring.
- Language-server/indexer adapters (LSP, SCIP or language-native indexes)
  may supply richer symbol references/call graphs with explicit
  permission, existing locally installed tools, timeouts and no downloads
  or hidden execution.
- User-defined project adapters can record framework-specific relations,
  but their outputs are still untrusted evidence to verify.

Prefer incremental coverage over pretending all ecosystems are solved.

## Change-driven algorithm

1. Resolve the current Git HEAD and explicit comparison base (per fact,
   its `verified` revision); collect changed files from committed history,
   index and worktree without losing staged-only or `assume-unchanged` cases.
2. Choose adapters for each relevant workspace/file. Build only the needed
   subgraph (or use a validated, versioned cache). Include both old and
   new dependencies: removed/renamed imports must not disappear from
   historical impact analysis.
3. Walk the inverse graph from each changed dependency through its
   dependents, bounded by configurable depth, edges, files, bytes, time
   and fact candidates. Track visited nodes to terminate cycles.
4. Map each reached dependent (including the changed source itself) to
   facts citing it via `source -> fact IDs`. Produce path evidence:
   `permissions.ts -> auth.ts -> fact(auth.policy)` and the exact checked
   revision / changed path. Also consider package/build/config edges.
5. Return statuses: `direct-source-changed`,
   `dependency-changed`, `dependency-coverage-incomplete`,
   `unchecked` and `unaffected-within-covered-scope`. Only the last
   is scoped to covered edges, never a universal "safe" classification.
6. Default recall excludes review-required candidates when opt-in strict
   dependency policy is active; `--include-review` explains the
   source-to-fact chain. **No memory file is rewritten**, auto-stamped,
   deleted or reverified merely because an index changed.

Performance goals should be measured, not asserted. Initial bounded
reference target: at most 200 fact candidates, 3 graph levels, 32 edges
per candidate, 16 MiB aggregate scan and time-limited Git children.
Choose actual defaults after Windows and large-monorepo benchmarks.
Avoid indexing whole repositories at every query: incremental delta
handling and a content-addressed cache are the intended optimization.

## Important accuracy limitations

- A syntactically present import does not imply a semantic relationship
  between a specific fact and every symbol in that module. File-level
  invalidation can be conservative and produce false positives.
- Runtime dependency injection, reflection, hooks, plugin registration,
  events/message queues, generated clients, SQL migrations and API
  contracts can change behavior without a static source import.
- A commit's changed *bytes* can miss changes in external services or
  package registries; lockfiles and manifests provide partial evidence.
- A reverse graph created at HEAD alone may omit edges that existed at a
  fact's older verified revision. Build/honor historical edges or mark
  incomplete; never silently accept.
- Git ignore / untracked, aliases, dynamic imports, vendored modules,
  case sensitivity and symlinks need explicit coverage and security tests.

## Link to explainable memory reporting

The inverse dependency engine should emit **evidence**, not UI-specific
notifications. The independent
[memory conflict reporting design](memory-conflict-reporting.md) defines
how changed dependency -> cited fact chains become consistent diagnostic
findings, and how agents may disclose *material* uncertainty to users.
A changed file means **possible staleness**, not proof that a code claim
semantically contradicts memory. Do not mark the user as notified merely
because the CLI returned a finding.

## Delivery slices and acceptance

**RD-1 — common contract and trust semantics (research/design):**
spec edge schema, adapter interface, per-fact revision identity, explicit
coverage outcomes, security boundary and mocked cross-language fixtures.
No new runtime policy defaults until validated.

**RD-2 — portable JS/TS proof of concept (implementation):**
refactor existing `--deps` into the same common graph engine, add changed-file
reverse traversal and fact impact. Test ES modules, CommonJS, alias gaps,
renamed/deleted import, staged-only, cycles, and an unchanged `auth.ts`
whose `permissions.ts` changes. Do not duplicate source verification.

**RD-3 — first non-JS language adapters (implementation):**
C#/.NET (`.csproj` / `ProjectReference` and optional symbolic indexing),
PHP/Composer and Python package/relative imports. At least one multi-root
mixed-language fixture must show correct impacts and honest unknown status.

**RD-4 — cache and optional semantics (implementation/research):**
persist bounded derived indexes with file hashes and adapter version,
incremental rebuild; optional Tree-sitter, local LSP/SCIP indexing. No
unexpected installs/exec or mandatory native packages.

**RD-5 — validation and rollout:**
Windows/Linux local suites, realistic .NET/PHP/JS/Python monorepos,
adversarial paths, package/config/lockfile changes, benchmarking direct
vs reverse retrieval and token cost. Remain opt-in until false-negative
and incomplete-coverage rates are acceptable and documented.

### Explicit regression matrix

- Direct unchanged source imports changed dependency; reverse query
  reaches the fact and marks review.
- Nested dependency A -> B -> C, where C changes, within and beyond depth.
- Dependency moved/renamed/deleted; historical edge still considered.
- New and removed import with a fact verified on an earlier commit.
- C# .csproj ProjectReference; PHP Composer PSR-4; Python relative import;
  JS workspace alias; mixed-language service with schema/contract boundary.
- Unrelated change does not invalidate fully covered facts.
- Unknown language, reflection, dynamic import and missing semantic index
  report incomplete rather than healthy.
- Dirty worktree, staged-only, untracked, `assume-unchanged`, cycles,
  symlink attacks, invalid UTF-8, huge graph, sparse checkout and
  interrupted cache update.
- Cross-platform case and separator handling without Bash/WSL.

## Upstream background (for implementation choices)

- Tree-sitter docs: https://tree-sitter.github.io/tree-sitter/
- LSP: https://microsoft.github.io/language-server-protocol/
- SCIP schema: https://github.com/scip-code/scip/blob/main/docs/scip.md

These tools are **candidates**, not existing LACC integrations or required
dependencies. Implement only after compatibility, risk and performance
have been evaluated against LACC's portable, offline baseline.
