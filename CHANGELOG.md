# Changes

## Integration candidate — PR #40 Windows fixes + BF-1..BF-7 (unreleased)

- Reconcile the historical Windows PR #40 source fixes: normalized
  findings ordering, parser cache tokens, session evidence edges,
  Python stdout bytes, and corrected validation assertions.
- Preserve BF-1..BF-7 Bash-free Node runtime, test harness, isolated
  installer and native matrix. Bash is NOT a dependency of the
  Node core or BF installer; the old Bash-execution probe is no
  longer run from the new Node-first runner.
- Retain the historical Bash prerequisite classifier as an isolated
  optional legacy test contract. On blocked Windows the legacy tests
  are SKIPPED/UNVERIFIED, not falsely PASS.
- This integration branch is an **authored test candidate**, not an
  executed cross-OS validation or a merged release. `develop` and
  `main` remain unmodified.


## Stacked feature PR — BF-3 to BF-6, native Bash-free acceptance tooling (unreleased)

- The legacy initializer now generates Node-first sync/health commands,
  without telling agents to call Bash in their normal workflow.
- A Python test harness probes **actual** Bash execution. Only historical
  shell-specific assertions are skipped when Bash is unavailable;
  they remain executable on POSIX hosts and are never marked PASS
  when skipped. Original POSIX injection fixtures are retained.
- Add opt-in Node-only `tests/install_smoke.mjs` for pinned installer
  copy/link modes in isolated projects, with four native agent bridges,
  byte-for-byte payload verification, idempotent bootstrap and health.
  No Bash/WSL/Python needed; missing Node/npm prerequisites are UNVERIFIED.
- Add `--bash-free` partial consolidated mode and `node_core_status`
  evidence without relaxing the complete release gate.
- Add security, installer preflight and native-path source contract tests.
  The default Node `capabilities` command no longer executes even a
  Bash capability probe.
- Add conservative `aggregate_bash_free.mjs` requiring matching SHA
  native Windows/Linux/macOS Node+installer evidence **and** independent
  Linux/macOS legacy Bash results; never claim actual agent answer
  delivery or final release.
- All code/tests **authored, not validated on three native OSes**.
  No hosted Actions, external tools installed or `main` merge.


## Stacked feature PR — BF-2c native bootstrap and Git drift safeguards (unreleased)

- Preflight all memory template and agent instruction destinations before
  writing bootstrap state, preserve existing user facts, validate generated
  ownership metadata and count newly created templates accurately.
- Parse NUL-delimited porcelain and committed diff Git records including
  renames/copies, preserve paths with spaces and tabs, separate memory-only
  changes and disclose bounded evidence without claiming semantic freshness.
- Add native regression scenarios for malformed Git output, dirty sources,
  invalid instruction markers, safe idempotent bootstrap and checkpoint
  non-mutation on refusal.
- The original Bash/Python scripts are still intact and platform acceptance
  is **not** claimed. BF-3..BF-8 remain gated.


## Stacked feature PR — BF-2b reference candidates and signatures (unreleased)

- Add `reference-scan.mjs` for bounded, ranked import/symbol/literal
  event evidence, Git-aware candidate inventory with filesystem fallback,
  private-file exclusions and honest incomplete-coverage output.
- Add `signatures.mjs` for dependency-free declaration heuristics,
  using the bundled Python `signatures.py` through isolated subprocess
  arguments when genuine Python AST is available; `--require-ast`
  refuses to downgrade to a heuristic silently.
- Expose both through `lacc.mjs`, with a native regression suite for
  root/nested imports, path safety, private files, byte budgets,
  platform-specific optional Python AST and missing parser fallback.
- No Bash invoked by these Node helpers. Python is **optional for exact
  AST**, and compiler-level semantic resolution is not claimed.
- **Authored, not fully executed:** native Windows/Linux/macOS acceptance
  and comparison against legacy helpers remain open. This is stacked
  on BF-2a, not merged into `develop` or `main`.


## Feature PR — BF-1 audit and BF-2a native context slicer (unreleased)

- Inventory all five Bash wrappers and separate semantic/AST,
  dependency-search and agent-init/sync parity obligations.
- Add `ctx-slice.mjs` and `lacc.mjs ctx-slice` for streamed
  60/40 context slicing, no implicit disk retention, explicit private
  `--keep`, UTF-8 replacement, CRLF preservation and bounded usage.
- Add Node regression fixtures for file/stdin/Unicode/error/retention
  behavior; authored pending the full multi-platform acceptance.
- Existing Python/Bash utilities retained, so this is **not** a claim
  of complete Bash removal; no hosted Actions or `main` merge.


## Develop — Windows validation reporter and graph-contract test correction

- Explicitly request Node TAP output and normalize TAP/spec test totals
  including Windows CRLF and ANSI; report reasons for omitted,
  inconsistent and missing summaries rather than treating exit=0 as
  automatically complete or incorrectly labeling a valid spec output.
- Add parser regression fixtures for both formats and fail-closed cases.
  Locally exercised four isolated reporter cases on Linux Node 22
  (4/4 PASS); full develop suites and Windows rerun not yet verified.
- Align the graph-contract test with the existing CLI's
  `no semantic guarantee` wording. No graph logic changed.
- Other Windows suites exiting 1 remain open pending original failure
  logs. No hosted CI or main promotion.


## Develop (validation pending) — RD-5/CR-5 native local acceptance tooling

- Author dependency-free `tests/run_consolidated.mjs` for local native
  Windows/Linux/macOS Node suites, optional Python/installer checks and
  private outside-repo logs with exact Git SHA, exit codes and TAP skips.
- Author `tests/aggregate_consolidated.mjs` to inventory matching
  platform reports, refuse missing/skipped/dirty/mixed-SHA evidence and
  **never** claim real host response acceptance or user delivery.
- Add conservative aggregation regression fixtures and a native
  [validation runbook](docs/CONSOLIDATED_VALIDATION_RUNBOOK.md).
- **Tests NOT EXECUTED**; no `.github/` changes, hosted CI, new
  packages or main merge. Release remains blocked by native real-host
  CR-5 acceptance and independent security/privacy review.

## Develop (validation pending) — CR-3B answer-level disclosure candidates

- Add bounded, offline `answer-disclosure . --query TEXT --json` using existing
  trusted search and CR-1/CR-2 evidence; optionally inspect `--claim`,
  `--deps` and one local `--response-file` with exact canonical wording.
- Include stable withheld-fact IDs, conservative source/coverage reasons,
  one safe suggested answer warning, explicit incomplete-scan states and
  strict separation of diagnostics, supplied text and unobserved host delivery.
- Refresh Codex/Claude/Gemini/Roo instruction rules to require relevant
  exclusions in the agent's actual answer; no universal interceptor or
  notification proof is claimed.
- Author native Node fixtures for direct/indirect drift, unrelated tasks,
  conflict, missing Git, privacy, incomplete output and supplied response audit.
  **Tests NOT EXECUTED**, real host answer acceptance pending CR-5.
- No new packages, automatic memory mutation, hosted CI or main merge.


## Develop (validation pending) — RD-4 optional JS/TS alias hints & safe parser cache

- Add opt-in `--semantic` for **exact literal** tsconfig/jsconfig
  alias mappings in JS/TS: union historical/current local file edges
  and include changed config in reverse impact. Globs, extends,
  compiler symbols and dynamic packages remain incomplete.
- Add opt-in `--cache` for a private, content-addressed/versioned
  JS/TS **parse-token-only** store; always reparse disk entries before
  they influence source/dependency evidence. Memoize within a process.
  No trusted memory, Git freshness, resolved edges or semantic result
  is ever cached. No cross-run performance gain claimed.
- Wire switches through dependency-impact, search --deps,
  session-check --deps and task disclosure commands. Without flags,
  existing recall and output are unchanged.
- Author corruption/tampering, cache lifecycle, changed tsconfig,
  aliases, option misuse and native Windows/Linux/**macOS** fixtures;
  **tests NOT executed** per implementation-first policy.
- Use Node.js builtins and Git only; no WSL, Docker, tree-sitter, LSP,
  compiler, external packages or GitHub Actions. Main unchanged.


## Develop (validation pending) — CR-4 grouped disclosure UX

- Add opt-in, read-only `disclosure-summary --task ID --json` with
  bounded brief/detail grouping, deterministic group identifiers,
  new vs previously agent-seen counts, honest incomplete/truncated
  status, and actual serialized input byte measurement (not token savings).
- Add explicit `disclosure-mark-seen --task ID --id FINDING --expect-head
  COMMIT` for a currently emitted finding only. Stores tiny private
  agent-seen markers tied to Git HEAD and evidence fingerprint,
  at most seven-day validity. Never auto-suppresses, changes memory
  trust or claims that any user saw a notification.
- Reuse existing bounded session-check, CR-1 findings, CR-2 evidence
  and CR-3 instruction guidance; default search/health/doctor JSON
  remains unchanged.
- Update generated AGENTS.md disclosure rule to recommend grouping
  and explicitly warn against using a seen marker as fact repair.
- Author deterministic, task-isolation, private marker, expiration,
  Git-concurrency, missing-Git, bytes, output-size and privacy fixtures;
  **tests NOT executed**, pending consolidated develop acceptance.
- No new packages, hosted GitHub Actions, semantic repairs or main merge.


## Develop (validation pending) — CR-3 agent/host disclosure contract

- Add read-only `disclosure-contract` introspection and bounded
  `disclosure_protocol` guidance on opt-in `--explain --json` findings.
- Distinguish CLI detection, agent instruction and actual user delivery:
  status remains `agent-guidance-only`, user delivery `not-observed`,
  never a claim the user saw an alert.
- `lacc init` installs task-relevance-aware, privacy-preserving
  disclosure instructions in marked project AGENTS.md and references
  them from Claude/Gemini/Roo native instruction bridges.
- Preserve existing project instructions, repeatable init semantics,
  normal search output and finding IDs. No automatic memory edits.
- Author regression cases for contract, native bridges, no false
  delivery, idempotence and optional search. **Tests unexecuted**.
- No extra packages, external messaging, .github edits,
  GitHub Actions or main merge.


## Develop (validation pending) — CR-2 provenance-backed evidence chains

- Add a pure `lacc-evidence-chain.mjs` for direct Git drift and
  per-hop static reverse dependency explanations.
- Preserve existing RD-1/2/3 edge relation, adapter/version, language,
  confidence, checked Git revision and source-to-fact link with
  opt-in `--deps --explain --json`; no additional Git queries.
- Check each hop against the changed dependency, source citation and
  recorded verified revision. Missing/forged/unsafe evidence is
  `partial`, never invented. Current HEAD remains null without
  actual verifier evidence; semantic behavior is not evaluated.
- Keep existing finding IDs and normal outputs without `--explain`.
- Add regression fixtures for JS/TS, .NET, PHP, Python, tampered
  paths/revisions, session/search integration and memory read-only
  operation. **Tests intentionally not executed** until validation.
- No new dependencies, .github edits, Actions or main merge.


## Develop (validation pending) — RD-3 cross-language static adapters

- Add portable `dotnet-static@1`, `php-static@1` and
  `python-static@1` adapters using only bundled Node/Git tools.
- Track .NET source-to-project, static `ProjectReference` and build
  manifest edges; literal PHP includes and Composer config edges;
  Python local relative/absolute imports and pyproject config.
- Integrate all adapters with existing RD-1/2 graph, Git verifier,
  reverse impact, opt-in `--deps` and CR-1 explanation scopes.
- Preserve old/current import edges, bounded file/Git scans and honest
  `dependency-coverage-incomplete` when symbols, DI, Composer PSR-4,
  CS-Cart hooks, Python runtime imports or MSBuild logic are unknown.
- Author mixed-language regression fixtures and update the validation
  gate; **do not execute tests** until consolidated develop review.
- No extra runtime dependencies, compiler/interpreter execution,
  GitHub Actions, hosted runners or main branch merge.


## Develop (validation pending) — CR-1 unified memory findings

- Add `lacc-findings.mjs`, a dependency-free, read-only diagnostic
  normalization layer with deterministic deduplicated IDs, finite
  output budgets, scoped evidence, cause/action mappings and basic
  redaction. Unknown findings remain review-required.
- Add opt-in `--explain --json` diagnostics to `search`, `health`,
  `doctor`, `session-check` and `dependency-impact`; preserve
  legacy/default JSON and trusted-recall filtering without the flag.
  Results include withheld relevant matched facts as explanations,
  not trusted search matches.
- Reuse existing Git evidence and RD-2 impact results. When available,
  provide source/revision/dependency-chain context; do not run another
  Git validation or claim semantic contradiction.
- Mark outputs `agent-output-only`; no host notification, memory edit,
  semantic revalidation or auto-promotion.
- Author regression cases for direct/indirect drift, checkpoint,
  consistent health/doctor IDs, privacy, byte limits and read-only
  behavior. **Tests deliberately not executed** in develop.
- No new native packages, GitHub Actions/hosted runners or main merge.


## Develop (validation pending) — RD-2 JS/TS reverse dependency impact

- Unify the JS/TS static import extractor with the RD-1 revision-scoped
  graph contract and shared Git verifier. Preserve historical and
  current imports to identify removed/renamed dependencies.
- Add bounded inverse traversal from changed source/dependency files
  to source-backed memory facts; include evidence path/reason and
  explicit incomplete coverage. No general semantic graph claims.
- Add opt-in `dependency-impact --json`; wire `search --deps` and
  `session-check --deps` to the shared reverse-impact engine.
  Default search and memory trust remain direct Git-only.
- Enforce fact/depth/edge/byte/Git-lookup budgets and unknown-language
  review. No persistent cache, daemon or new native dependencies.
- Author regression tests for transitive/cyclic edges, staged-only,
  assume-unchanged, deletion/rename, aliases, dynamic imports, mixed
  language unknowns and read-only behavior. **Not executed yet**.
- No GitHub Actions, hosted runners, memory rewrites or main merge.


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
