# RD-3 — Portable static adapters for .NET, PHP/Composer and Python

**State:** develop-only prototype; regression tests authored but **NOT RUN**.
**Requirements:** Node.js 22+ and Git; no Python interpreter, dotnet CLI, PHP,
Composer, Tree-sitter, LSP server, WSL, daemon, network or package install.
All operations are bounded, local and read-only.

## Usage

```powershell
node <skill_dir>/scripts/lacc.mjs dependency-contract
node <skill_dir>/scripts/lacc.mjs dependency-impact . --json --explain
node <skill_dir>/scripts/lacc.mjs search . --query "project security" --deps --include-review --explain --json
node <skill_dir>/scripts/lacc.mjs session-check . --deps --explain --json
```

The opt-in `--deps` flag selects the common RD-1/2/3 graph machinery.
Without it, normal LACC retrieval checks only directly cited Git sources.
Changed paths are compared with **each fact's own verified Git commit**;
historical/current local edges are unioned before a bounded reverse walk.

## Adapters and supported evidence

### C#/.NET — `dotnet-static@1`

- A `.cs` source can be associated with its nearest unambiguous project
  manifest (`.csproj`/`.fsproj`/`.vbproj`), using project files that
  exist in the checked version.
- A project manifest can cite literal `ProjectReference Include` and
  `Import Project` files, plus discoverable `Directory.Build.props`,
  `Directory.Build.targets` and `Directory.Packages.props` ancestors.
- A modified referenced project/manifest can therefore be traced to
  a fact citing a source in the dependent project.
- **Explicitly incomplete:** C# `using`/symbol references, Roslyn
  resolution, inheritance, reflection, DI, generated code, implicit MSBuild
  imports, property expansions, globbed/conditional evaluation and NuGet
  dependency graphs. Current workspace directory discovery is bounded
  and may miss historical-only manifests; reports review, not clean.

### PHP / Composer — `php-static@1`

- Statically literal `require`, `require_once`, `include` and
  `include_once` (including `__DIR__ . '/file.php'`) are resolved to
  safe project-local files when present.
- Nearby `composer.json` manifests become configuration dependencies.
- **Explicitly incomplete:** PSR-4/PSR-0 class-to-file resolution,
  Composer package versions, runtime autoloaders, dynamic includes,
  CS-Cart hooks/events, PHP reflection or dynamically registered functions.
  Composer file parsing never executes Composer scripts or plugins.
- Therefore, a successful literal `require` graph does **not** certify
  the full PHP application.

### Python — `python-static@1`

- Statically resolvable relative and local absolute imports are mapped
  to existing `.py` or package `__init__.py` files.
- A nearby `pyproject.toml` can be tracked as a configuration dependency.
- **Explicitly incomplete:** namespace packages, dynamically adjusted
  `sys.path`, `importlib`, `__import__`, package entrypoints, optional
  dependencies, environment-specific imports and interpreter resolution.
  Python files are only read as UTF-8; no interpreter execution.

### Existing JS/TS — `js-ts-static@2`

The existing RD-2 scanner is retained and uses the **same graph and Git
verification** as the three new adapters. It still only resolves
bounded static relative imports. Dynamic imports, tsconfig aliases,
package dependencies and transitive framework behavior remain review
candidates.

## RD-4 optional extension (develop, not validated)

`--semantic` can enrich JS/TS edges from an **exact literal**
tsconfig/jsconfig alias mapping; the changed configuration itself
becomes part of the bounded reverse graph. Complex paths, extends,
globs and package resolution stay incomplete, and compiler/symbol
resolution for .NET, PHP/Composer and Python remains unimplemented.
`--cache` only stores private content-addressed JS/TS parse
tokens with independent reparse-on-disk-hit; no resolved graph
or Git trust decision is cached. Details and macOS acceptance:
[RD-4 semantic/cache](semantic-cache.md).

## Evidence and trust behavior

Adapter edges are normalized to RD-1's contract with file paths,
`adapter`, `adapterVersion`, language, Git revision, evidence source,
confidence and relationship kind (e.g. `project-reference`,
`configuration`, `import`).

Every source and dependency remains inside the project, via existing
Git-aware path safeguards. File reads are limited to 128 KiB,
Git revision lookups and directory scans have hard caps, and RD-2
reverse traversal remains bounded by depth/edges/facts/bytes.
Unsupported languages and unresolved relationships produce
`dependency-coverage-incomplete`, not an invented "all clear".
`--explain` carries adapter-specific evidence scope in CR-1 diagnostics.

**Partial coverage is expected**, even in simple .NET/PHP/Python
projects. This prototype is not a semantic build graph and does not
automatically edit, mark confirmed, or delete facts. A changed imported
file is possible staleness, not proven semantic disagreement.

## Deliberate limits and next work

- Only the bounded dependency closure of **memory-cited files** is
  explored. Whole-repository invalidation, symbol indexing and persistent
  graph caching are not implemented.
- No project compiler/Composer interpreter is invoked. An unobserved
  DI/CS-Cart hook/remote schema can change behavior without a static edge.
- File-level links may cause false positives; static gaps can cause
  false negatives. Unknown coverage is surfaced conservatively.
- Historical-only project discovery and robust MSBuild evaluation,
  Composer PSR-4 class resolution and Python namespace-package semantics
  are future refinement/optional semantic adapters (RD-4).

**Acceptance gate (not executed):**
`tests/test_cross_language_dependency_impact.mjs` covers a .NET source
through its ProjectReference, PHP literal include, Python relative import,
mixed-language repository and dynamic/unknown resolution. Prior JS/TS
RD-2 regression cases remain part of the final develop validation.
Verify on Windows and Linux, including security and performance, before
promoting develop to main.
