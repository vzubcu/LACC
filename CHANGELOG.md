# Changes

## Develop (validation pending) — RD-1 portable dependency graph contract

- Add a language-neutral graph contract for file/project/package/symbol
  dependency nodes, revision-scoped evidence edges, and source-backed fact
  indexes, with direct forward/reverse query primitives.
- Add explicit adapter registry and scan-result validation, conservative
  coverage reports and strict path/size limits; **no built-in adapters
  executed and no automatic changed-file reverse traversal in RD-1**.
- Expose `node lacc.mjs dependency-contract` for honest contract-only
  capability introspection. Existing JS/TS `--deps` is not rewired yet.
- Author cross-language, historical-revision and hostile-input fixtures;
  deliberately **do not execute tests** during develop integration.
- Reapply three previous agent-reported code/test fixes from PR #23 through
  PR #26 without overwriting newer roadmap changes.
- No new native packages, GitHub Actions, hosted runners or main merge.


## Develop (unvalidated) — recoverable multi-file memory migration

- Add read-only `migration-plan` and `migration-restore-preview` commands.
- Add explicit `--reviewed --expect` apply and restore operations, with
  Git HEAD/source/proposal digest binding, bounded file inventory, exclusive
  cooperative migration lock, verified preimages and durable private journal.
- Add `migration-transaction-inspect` and explicit `migration-recover`,
  refusing to overwrite unrecognized external edits.
- Author regression tests for apply, stale preview, snapshot restore, rejected
  paths and journal verification; tests deferred until develop validation.
- Not full ACID/cross-file atomicity; no automatic semantic correction or
  promotion of legacy facts. No GitHub Actions or new runtime dependencies.


## Develop (unvalidated) — canonical single-file CAS

- Add `canonical-preview` and `canonical-apply` Node CLI commands.
- Bind a reviewed preview to target/proposal content SHA-256, file paths
  and HEAD; require `--reviewed --expect` and per-file exclusive lock.
- Create a private exact rollback copy before atomic file replacement;
  refuse stale previews, locks, symlinks and oversized HOT proposals.
- Does not coordinate non-LACC editors or support multi-file transactions;
  source-backed semantic review and post-apply health remain mandatory.
- Add local regression tests; execution intentionally deferred on develop.
- No GitHub Actions, automatic merge or new runtime dependencies.


## Develop (unvalidated) — private agent data and acceptance gate

- Add automatic local Git-ignore rules for generated snapshot and handoff
  directories so ordinary `git add -A` does not stage private contents.
- Refuse non-ignoring custom directory rules rather than silently claiming
  secrets are excluded. Explicit `git add -f` can still override ignores.
- Add a consolidated local-only acceptance checklist for the eventual
  develop-to-main promotion. All tests remain pending execution.
- No hosted GitHub Actions or runtime package dependencies introduced.


## Develop (unvalidated) — multi-agent task handoffs

- Add immutable, bounded Node handoff publish/list/read commands stored
  under `memory/handoffs/` outside validated source-backed topics.
- Require checked Git HEAD before publishing; use exclusive create and
  deterministic idempotency keys to prevent silent handoff overwrites.
- Keep all handoffs unverified, with no automatic memory fact promotion;
  canonical concurrent writes remain a future reviewed transaction feature.
- Author local tests for idempotency, stale HEAD refusal and tamper detection;
  tests not executed yet. No hosted Actions.


## Develop (unvalidated) — opt-in indirect source staleness

- Prototype opt-in `search --deps` and `session-check --deps` for
  bounded local JS/TS static imports with Git evidence at the checked
  revision and current index/worktree.
- Review indirect `dependency-changed` sources, unresolved imports,
  aliases, external packages and exhausted depth/edge/file budgets.
- Keep the heuristic off by default until local acceptance/false-negative
  testing; unchanged direct-source behavior remains compatible.
- Author regression fixtures for changed imported module, irrelevant file,
  aliases and budget overflow. Tests not executed yet.
- No GitHub Actions, new Node dependencies or automatic writes.


## Develop (unvalidated) — legacy memory backup preparation

- Add a bounded Node migration audit, deterministic snapshot preview,
  digest-gated backup and read-only archive integrity inspection.
- Never overwrite canonical HOT/WARM memory, invent provenance or silently
  treat historical notes as verified. Backups are private and excluded from
  WARM topic discovery.
- Author local regression tests for read-only audit, digest mismatch,
  idempotency, tamper detection and symlink handling; execution deferred.
- Restoration and semantic migration remain manual until separately validated.
- No GitHub Actions or hosted CI introduced.


## Develop (unvalidated) — session-start freshness check

- Add a bounded, read-only `session-check` Node command using existing Git
  source verification, HOT checkpoints, conflict findings and explicit
  incomplete coverage.
- Add session-check to capability discovery and to agent task-start guidance;
  no assumed automatic host hook or implicit semantic revalidation.
- Author regression tests for clean/stale, UNSYNCED, scan overflow and missing Git.
  **Tests not executed yet**: pending consolidated develop validation.
- No GitHub Actions changes, no automatic writes or background service.


## Unreleased — Memory v3.2.x portable runtime verification

- Replace skipped Windows no-Python/Bash test with a native `git.exe`
  isolated-PATH regression; ensure tests do not rely on symlink privileges.
- Add a fail-closed regression proving missing Git cannot confirm facts.
- Add optional shared Node/Python Git fixtures that compare source trust
  outcomes and UTF-8 read limits; skip parity explicitly when Python is absent.
- Document exact validation commands and update P0 roadmap status without
  claiming unexecuted Windows/dual-runtime tests passed.
- No GitHub Actions, workflows, hosted runners, runtime dependency or new
  automatic memory writes.


## Unreleased — bounded Git operations on Windows

- Bound Git child processes in the Node core to 30 seconds and disable
  interactive credential prompts, failing explicitly on timeouts instead of
  allowing an agent to hang indefinitely.
- Add 15-second Git / 30-second Node subprocess limits and optional
  `LACC_TEST_DEBUG=1` tracing to the local Node test harness.
- Move Windows-only test skip before creating a Git fixture and prevent
  host-level signing, hooks and fsmonitor configuration affecting test commits.
- Keep test execution entirely local; no hosted CI workflows or runners.


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
