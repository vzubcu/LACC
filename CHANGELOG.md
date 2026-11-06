# Changes

## Unreleased — Memory v3.2: universal Node.js core

- Bundle dependency-free Node.js 22+ CLI (`lacc.mjs` and `lacc-core.mjs`)
  for init, capabilities, read, search, health, doctor and sync,
  including guarded, explicit checkpoint stamping; no Python/Bash/WSL needed.
- Preserve Git-backed evidence checks, including index and actual worktree
  content, while excluding stale and keyed conflict facts from normal recall.
- Preserve existing Python/Bash tools for advanced revalidation, compaction,
  graph/signature/log tools and benchmark import; do not overstate parity.
- Document limited native-agent fallback without a runtime or Git, including
  unverified status and no automatic stamping.
- Add local Node test coverage for initialization, read budgets, source drift,
  assume-unchanged, key conflicts, stamping and symlink defenses.
- No GitHub Actions changes, background services or npm publication.


## Unreleased — Memory v3.1: safe self-healing diagnostics

- Add optional stable `key:` identity to source-backed facts, preserving
  backwards compatibility and retaining keys during selected revalidation.
- Report groups of different keyed assertions as `potential-conflict`
  (human review required, never inferred logical contradiction).
- Exclude potentially conflicting keyed facts from normal retrieval; when
  topic scanning is incomplete, fail closed for keyed conflict confidence.
- Add bounded, offline, read-only `memory-doctor.py` triage reports with
  review actions for changed/untracked/missing sources, invalid provenance,
  unavailable commits, review-state facts and key conflicts.
- Add local regression coverage and documentation. No database, external
  agent requests, automatic memory rewriting or GitHub Actions changes.


## Unreleased — Memory v3.0 Intelligent Retrieval

- Add read-only `memory-search.py` with deterministic task-aware lexical
  ranking, bounded UTF-8 output and JSON results.
- Verify candidate facts against their existing checked Git sources; exclude
  changed/missing/unavailable or `state: review` records by default. Optional
  `--include-review` clearly marks unsafe candidates for investigation.
- Protect memory retrieval with scan/verification budgets and explicit
  incomplete-result signals. No embeddings, servers or provider calls.
- Add source-backed decisions and lessons topic templates and index pointers;
  existing memory remains preserved on reinitialization.
- Add local retrieval regression tests and documented recall-quality fixtures.
- No GitHub Actions workflow or runner changes; no synthetic token-savings claims.


## Unreleased — safe context signals and reproducible local benchmarks

- Separate Codex active-context observations (`last_token_usage.total_tokens`)
  from cumulative token spending and request-input proxies; read host-reported
  context capacity when supplied and keep compaction advisory-only.
- Import real, complete `codex exec --json` turn-level usage without confusing
  it with internal Codex rollout `token_count` records.
- Add an offline total-only comparator for JetBrains Rider Claude Agent
  sessions measured through JetBrains Session explorer when available.
  Report no invented prompt/output/cache breakdown or costs.
- Document local matched-run validation and add contract tests.
  No GitHub Actions workflows, runners or infrastructure introduced.


## Unreleased — Git verification and agent diagnostics

- Verify historical source blobs and staged index modes in bounded Git batches,
  while still hashing every distinct worktree source through `git hash-object --path`.
- Preserve checks for staged-only changes, literal Git pathspecs, and source
  modifications hidden by `assume-unchanged`; no automatic fact promotion.
- Provide read-only `memory-health.py --json` with complete structured findings
  and unchanged exit codes.
- Add local regression coverage for multi-revision facts, large source batches,
  permission-only staged changes and JSON diagnostics. No hosted CI changes.

## Unreleased — safety and memory correctness

- Use a shared provenance/fact parser across health and maintenance, preserving fenced examples and inline shell pipes.
- Protect task checkpoints from oversized indexes; validate topic pointers and add an index byte cap.
- Exclude common secrets from broad dependency scans, constrain signature extraction to local safe files, and use accurate source line numbers.
- Stream sliced logs without temporary disk writes by default; `--keep` explicitly retains a private stdin log.
- Respect explicit native agent targets and symlinked auto-discovery; make UTF-8 bootstrap and checkpoint writes byte-stable on Windows.
- Preserve topic file modes and CRLF during reviewed memory maintenance; provide Python interpreter fallback for Bash wrappers.
- Add regression tests for security, provenance parsing, state protection and portability. No CI workflow or runner changes.


## v2.4 — review-driven improvements

- Rename the catalog to LACC (Lean Agent Capabilities Collection), with independent skill
  names and installation commands using vzubcu/LACC. Document project/global source rebinding.

- Secure temporary stdin logs, validate limits and clean up on normal exit/SIGTERM.
- Bound content scans as well as output; preserve source directories and prioritize qualified imports.
- Repair declaration extraction and state clearly where it is heuristic.
- Initialize empty topics, use Claude's native import, and distinguish unchanged bootstrap artifacts.
- Keep default sync advisory and inexpensive; retain strict health/stamp modes.
- Separate optional disk limits from bounded recall output.
- Add digest-bound previews for within-topic exact deduplication and selected-fact revalidation.
- Check actual normalized source content even when Git index flags hide changes; recheck before evidence writes.
- Reject corrupted UTF-8 rather than silently changing recalled text.
- Shorten daily instructions while keeping optional benchmarking tooling inside lean-context-memory.
- Add read-only context-pressure monitoring with configurable checkpoint/compact thresholds; it never invokes host compaction automatically.

Compatibility: rerun initialization after upgrading; shell gates should use sync --strict.
Configured legacy disk caps still apply. Existing facts/checkpoints are preserved. Benchmark tooling
remains optional inside lean-context-memory. No hooks or measured token-saving percentage are supplied.
