# RD-4 — Optional static alias hints and conservative parse cache

**Status:** develop-only prototype, validation pending. **No test suite was
executed.** Works with native Node.js 22+ and Git on Windows, Linux and
macOS; requires no WSL, Docker, shell, Python, PHP, Composer, dotnet,
language server, binary package, daemon or network.

## Goals and explicit limits

RD-4 introduces two **separately opt-in** mechanisms:

1. `--semantic`: constrained TypeScript/JavaScript tsconfig/jsconfig
   alias hints for **exact literal keys and one literal target**.
2. `--cache`: a content-addressed, private cache of **pure JS/TS import
   parser tokens**, keyed by parser ID/version and SHA-256 of the
   actual file bytes. Cache is not a Git verifier or a semantic proof.

The existing static JS/TS, C#/.NET, PHP/Composer and Python reverse
dependency adapters remain active under the existing `--deps` option.
RD-4 does **not** make Roslyn/MSBuild, PSR-4 runtime autoload, Python
`sys.path`/importlib, C# dependency injection or reflection semantically
resolved. Those require optional native host adapters in a later phase.

## Commands

```powershell
node <skill_dir>/scripts/lacc.mjs dependency-impact . --semantic --json --explain
node <skill_dir>/scripts/lacc.mjs dependency-impact . --cache --json
node <skill_dir>/scripts/lacc.mjs search . --query "permissions" --deps --semantic --cache --include-review --json --explain
node <skill_dir>/scripts/lacc.mjs session-check . --deps --semantic --json
node <skill_dir>/scripts/lacc.mjs disclosure-summary . --task auth_fix --deps --semantic --detail --json
```

For `search`, `session-check` and disclosure commands,
`--semantic`/`--cache` require explicit `--deps`.
`dependency-impact` is already a dependency analysis and accepts
these flags directly. Without either option, previous CLI behavior
and memory trust filtering are unchanged.

**Caching writes private metadata** only when `--cache` is requested.
It does not mutate canonical memory facts. Use `--semantic` alone for
a purely read-only analysis.

## Exact TS/JS alias hints

Given:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {"@/permissions": ["src/permissions"]}
  }
}
```

A cited `src/auth.ts` that imports `@/permissions` can be linked to
`src/permissions.ts` if it exists at the checked revision or in the
current workspace. Historical and current edges are unioned, and
the configuration file is included as a dependency, so an edit to
`tsconfig.json` can also trigger source-backed review.

**Not supported:** config-file comments, `extends` resolution,
wildcards, multiple possible targets, plugins, package exports,
node resolution, generated symbols or runtime module loaders.
Ambiguous/unreadable/missing config produces
`dependency-coverage-incomplete`; no invented links.
The returned graph records file-level `confidence: heuristic`
and `semanticProof: false`. This is **semantic enrichment as static
configuration-aware hints**, not certified compiler behavior.

## Content-addressed parser cache

The optional cache is under `memory/analysis-cache/`. It creates a
nested `.gitignore` through the existing privateStore guard;
ordinary `git add -A` does not include cached parser tokens.
No raw memory claims, chat messages or verified facts are saved.
Some literal import specifiers may appear in this private cache;
treat it as sensitive local development metadata and do not commit
it or copy it into prompts. Entries are capped at 16 KiB,
content-keyed SHA-256 and written exclusively (mode 0600 where
supported). Each parser result has a version and a checksum.

**Important integrity limitation:** the checksum detects accidental
corruption, not a malicious actor with local write access. Therefore
a **disk cache hit is independently re-parsed and compared to the
cached tokens before the graph uses it**. An altered entry is rejected.
Same-process memoization can avoid repeated parsing, but no
cross-invocation performance gain is claimed until measured.
Resolved edges, Git HEAD, index/worktree status and memory trust
are **never cached**. Fresh path resolution and Git verification
continue for every analysis. Unknown coverage stays review-required.

In the JSON `dependency-impact` stats with `--cache`:

- `parseCache.hits` — memo hits plus disk entries verified by reparse.
- `parseCache.revalidated` — disk entries actually re-parsed.
- `parseCache.misses` / `writes` / `rejected` — local parser cache
  metrics, **not token/latency savings**.
- `scope` — `js-ts-content-keyed-parse-tokens-only`.
- `trust` — `untrusted-performance-hint`.

No automatic cache cleanup is installed. To reset it, manually
delete the private `memory/analysis-cache` directory; this never
deletes canonical memory. The ordinary read-only commands without
`--cache` never write it.

## Platform invariants

- Source and Git paths are repository-relative, forward-slash POSIX
  paths, including on Windows. Absolute/parent/symlink escapes
  are rejected via existing `localPath`.
- Filesystem access, crypto and child-process execution use Node.js
  built-ins. External `git` runs with the existing bounded timeout.
- Same code is intended to work natively on macOS (both Apple Silicon
  and Intel), Windows PowerShell and Linux. No WSL assumptions.
- Real macOS testing is **required** before develop -> main:
  a written test or passing Linux test alone is not macOS evidence.
- Case-sensitive vs case-insensitive filesystems, symlinks, Unicode
  paths, unexpected project layouts and command-line Git availability
  need adversarial real-platform validation.

## What remains

Full symbol-level semantic dependency resolution and broad
cross-language persistent graph caching are **not implemented**.
LACC is deliberately conservative: source changes produce a review,
not a conclusion that a memory claim is wrong; unknown import wiring
does not become a trusted clean result. Real token savings and
latency improvements require matched A/B agent runs, not parser
statistics.

## Deferred acceptance gate

The authored `tests/test_rd4_semantic_cache_portability.mjs` covers
literal aliases, changed tsconfig, wildcard/extends gaps,
cross-invocation cache reads, tampered but rechecksummed entries,
read-only defaults, explicit option validation, memory integrity,
Git index/worktree evidence and native Windows/Linux/macOS paths.
Run the complete suite on **all three OS families**, including
a **real macOS runner**, before promotion.
