# LACC Roadmap

**Scope:** [LACC — Lean Agent Capabilities Collection](README.md), an extensible collection of installable AI-agent skills.  
**Current published-in-repository skill:** `lean-context-memory v3.2`.  
**Last reviewed:** 2026-11-11. **Status:** planning; this document is not evidence that future work is implemented.

This is the **canonical forward-looking roadmap**. `CHANGELOG.md` records shipped changes;
historical `docs/superpowers/plans/` describe earlier implementation plans, not the current backlog.
Version labels below are *tentative*; priorities and acceptance criteria matter more than version numbers.

## Design constraints

1. A Git-unchanged source is **evidence freshness**, not proof that the remembered claim is semantically true.
2. Confirmed memory requires an actually checked source and Git revision. Incomplete coverage is disclosed;
   an agent must never invent evidence or silently promote review data.
3. Default validation is **local, offline, bounded, read-only and cross-platform**. Any mutation
   needs an explicit action, preview, review and a safe way to revert.
4. No automatic deleting of memory, modifying project code, or rewriting the skill from feedback.
5. No hosted CI/GitHub Actions consumption for these milestones: test locally on Windows and Linux.
6. Do not claim token savings without matched, complete real-agent A/B measurements.

## Current execution checkpoint — 2026-11-11

**main** remains the stable v3.2 baseline. **develop** contains experimental
implementations PR #15–#22 and code corrections from the agent's validation
branch, reapplied via merged PR #26.

| Scope | Evidence | Status |
|---|---|---|
| PR #15–#22 | Session gate, migration/snapshots, opt-in JS/TS dependency scan, multi-agent handoffs, canonical CAS and journaled restore | **Integrated into develop; complete validation pending** |
| PR #23 → PR #26 | Agent reported 34 Windows Node PASS, one optional Python-parity SKIP on its older head; three fixes cherry-picked into new PR #26, which is merged. Outdated PR #23 was closed as superseded | **Fixes integrated; results are not current-develop certification** |
| PR #24 | Cross-language reverse dependency architecture RD-1..RD-5 | **Design merged in develop** |
| PR #25 | Memory-code discrepancy explanations and CR-1..CR-5 reporting roadmap | **Design merged in develop** |
| RD-1 | Versioned graph/adapter and source-to-fact index contract, portable Node implementation, tests authored | **Implementation on develop, validation pending; no graph scanning yet** |
| RD-2 | Static JS/TS historical/current import edges connected to revision-scoped reverse index; opt-in change-to-fact impact output and existing retrieval/health commands | **Implementation on develop, validation pending; scoped, not a cross-language semantic index** |
| CR-1 | Common bounded `--explain --json` findings for search, health, doctor, session-check and dependency-impact | **Implementation on develop, validation pending; outputs are agent-only, not user notifications** |
| RD-3 | Optional static C#/.NET project/manifest, PHP literal include/Composer, and Python local-import adapters connected to RD-1/RD-2 graph | **Code in develop, validation pending; symbol/runtime resolution incomplete** |
| CR-2 | Git revision, adapter/version, relation type and source-to-fact links carried through per-hop evidence traces | **Code authored in develop; validation pending; semantic verification not claimed** |
| CR-3 | Host-neutral disclosure contract, Codex/Claude/Gemini/Roo marked instruction bridges, additive agent-only guidance for `--explain --json` | **Authored in develop; validation pending; no host delivery confirmation** |
| CR-3B — Answer-Level Disclosure Gate | Require relevant excluded/review memory facts to be acknowledged in the **agent's answer**, not merely in CLI health output; host-specific acceptance with honest delivery semantics | **Planned only; not implemented, not validated; required before promoting develop to main** |
| CR-4 | Task-scoped bounded disclosure summaries, brief/detail groups, new-vs-agent-seen counts and opt-in private seven-day Git/evidence-bound seen markers | **Code authored in develop; validation pending; no automatic suppression, semantic repair or user delivery proof** |
| RD-4 (initial scope) | Opt-in exact JS/TS tsconfig/jsconfig alias hints and private content-addressed parser-token cache with disk revalidation; common Git source verifier remains authoritative | **Code authored on develop, macOS/Windows/Linux validation pending; full semantic symbols and graph caching not implemented** |

**Implementation sequence:** RD-1 graph → RD-2 JS/TS reverse impact →
CR-1 findings → RD-3 .NET/PHP/Python static adapters → CR-2 evidence
chains → CR-3 disclosure guidance → CR-4 task-scoped UX →
RD-4 **initial opt-in literal JS/TS aliases and validated parser-token
cache** (all code authored in develop, **not tested**) →
**CR-3B Answer-Level Disclosure Gate (planned)** →
**RD-5/CR-5 cross-platform acceptance**, then future optional
compiler/LSP semantic resolvers with independent review.
Windows, Linux **and native macOS** are required; no assumed host delivery.
Develop is unvalidated until the consolidated release gate.

**Validation boundary:** all newly written RD-1 tests and current develop
acceptance tests remain to be executed in the future consolidated phase.
The earlier PR #23 test report does **not** certify newer code, Python
parity, Linux compatibility or all supported agent hosts.

## Implemented baseline — verify before duplicating

| Area | Available today | Important limit |
|---|---|---|
| Source-backed memory | `source:` and `verified:` fields per fact; Git commit/index/worktree checks, including `assume-unchanged` | Only explicitly cited source files are verified |
| Memory v3.0 retrieval | Bounded lexical `memory-search`, excludes unverified/stale/review facts by default; review mode available | No resolved import graph; lexical matching is not semantic reasoning |
| Memory v3.1 diagnostics | Read-only doctor, optional fact keys and conservative potential-conflict flags | Conflict detection is keyed/text-based, not formal contradiction proof |
| Memory v3.2 runtime | Bundled dependency-free Node.js 22+ CLI: `capabilities`, `init`, `read`, `search`, `health`, `doctor` and `sync` | Python/Bash advanced tools are not fully ported |
| Legacy exploration | Python `dep_graph.py` can discover *candidate* inbound references | Heuristic exploration, **not** dependency-aware invalidation of a fact |
| Agent setup | `AGENTS.md` and native-agent instruction bridges; a documented session-start recipe | A recipe does not prove the host automatically runs it on every new session |
| Context and usage tools | Context-pressure advice and provider/host usage importers | No published, measured real-model savings |
| Test harness | Node tests with Windows subprocess timeouts, an isolated-PATH `git.exe` case, a missing-Git fail-closed case, and an optional shared Node/Python parity harness | Updated Windows case and optional parity harness require execution; no full cross-runtime parity result |

**Stable-main vs. develop:** stable `main` does not ship the experimental
session gate, JS/TS dependency scanner, journaled migration or multi-agent
features; those have code merged to `develop` with incomplete validation.
No universal enforced session hook, complete inverse dependency engine,
semantic conflict notifier, safe noncooperating-editor coordination,
fully automatic legacy semantic migration or published `npx lacc` package exists.


## Implementation audit — partial capabilities are not zero

The roadmap tracks **slices of behavior**, not whole feature names. Labels:
- **implemented**: code and instructions exist; this does not imply cross-platform tests passed.
- **locally validated**: matching tests passed in a declared local environment.
- **pilot reported**: an actual agent used the capability in a real project, according
  to a user-supplied execution report; not a reproducible public test artifact.
- **partial**: useful foundations exist but at least one acceptance requirement is missing.
- **planned**: the exact required behavior has no implementation yet.

| Roadmap capability | Existing implementation (do not duplicate) | Missing work | Precise status |
|---|---|---|---|
| Cross-platform Node core | Bundled Node CLI, Windows isolated-PATH tests and optional Python-parity fixtures; PR #23 reported 34 Windows Node PASS / 1 parity SKIP on its older head | Fixes from PR #23 merged via PR #26; finish current develop regression, Python/Linux parity, installer and host tests | **Implemented in develop; Windows Node validation reported; full P0 pending** |
| Existing-memory cleanup | Develop includes health/doctor, migration audit, digest-bound backups, inspect, journaled migration/restore and recovery | Validate crash/concurrent-writer behavior and manual provenance review; no full automatic legacy semantic migration | **Develop code integrated, validation pending; semantic auto-migration absent** |
| Session freshness | sync, search, health and bounded session-check on develop; agent instruction bridges | Validate all supported hosts and incomplete scans; no universal automatic hook | **Develop implementation; host automation and end-to-end acceptance pending** |
| Indirect dependencies | RD-1/2 reverse graph, RD-3 .NET/PHP/Python adapters, initial RD-4 opt-in JS/TS literal alias hints and private parse-token cache | Full symbol resolution and graph caching, benchmarking, security review and real macOS/Windows/Linux acceptance | **Develop authored, no consolidated tests executed; unknown coverage remains review-required** |
| Multi-agent memory | Shared facts, develop handoffs, single-file canonical CAS and journaled multi-file operations | Non-cooperating writers, fault-injected recovery and semantic conflict resolution | **Cooperative code merged to develop; general concurrency not proven** |
| Measurement | Context-pressure tools, usage importers and synthetic A/B method | Matched real-agent measurements of full token cost and task quality | **Instrumentation exists; savings unmeasured** |
| Conflict transparency | CR-1 diagnostics, CR-2 per-hop provenance, CR-3 host instruction guidance, CR-4 task-scoped grouping and explicit private agent-seen markers (without suppression) | CR-5 cross-host acceptance and actual observed-delivery integrations remain unimplemented | **CR-1..4 authored in develop; tests unexecuted; no user notification proof** |
| Multi-skill platform | Installable catalog and lean-context-memory v3.2 skill | Independent CS-Cart/.NET/security/GDPR skills, integration suites and reviewed improvements | **Catalog implemented; domain skills planned** |

**Evidence reviewed:** `skills/lean-context-memory/SKILL.md`, `scripts/lacc.mjs`,
`scripts/lacc-core.mjs`, `scripts/memory-maintain.py`, `scripts/dep_graph.py`,
`tests/test_node_runtime.mjs`, `references/runtime.md`, `references/benchmark.md`.
This is a **static repository audit plus agent-reported local Windows results on an earlier PR #23 head**, not a new independently repeated end-to-end test run. Do not upgrade any status without checking complete acceptance evidence.

## Prioritized delivery plan

### P0 — v3.2.x: runtime parity and reliability

**Already available:** the Node core, timeout-protected Git checks and a user-reported
Windows/Rider pilot where five Node tests passed, one executable-shim test was
skipped, and the agent executed the installed CLI. This is **not** full parity.

**Remaining goal:** stabilize the shipped Node runtime before expanding provenance semantics.

- **Test authored, execution pending:** run the unskipped Windows `git.exe`
  isolated-PATH test (`tests/test_node_runtime.mjs`) and fail-closed no-Git test;
  confirm no Python/Bash dependency on an actual Windows machine.
- **Initial shared fixture harness authored:** run `tests/test_node_python_parity.mjs`
  with CPython 3.9+ to compare healthy, dirty, staged, `assume-unchanged`, missing
  and unavailable sources, review-state facts, conflicts, invalid provenance
  and UTF-8 budgets; expand to untracked, symlink and large-budget cases.
  Python absence skips this optional parity test, **not** the Node-only suite.
- Preserve the previously reported global-copy Rider/Claude pilot, including exact
  executed path, CLI exit codes and its unresolved health findings; repeat
  independently in at least one other supported host.
- Keep node subprocess timeouts, explicit failure diagnostics and no implicit network calls.

**Acceptance:** zero unjustified trust discrepancies between runtimes on the
full shared fixture corpus; local Windows/Linux results documented, including
skips/failures. Authored test code alone does **not** satisfy this acceptance gate.

### P1 — Legacy memory migration (candidate v3.3)

**Problem observed in a real project:** legacy memories may have many unsupported
fact lines and an oversized ACTIVE_STATE, so new strict health reports review rather
than returning trustworthy recall.

- **Build on existing `health`, `doctor` and Python preview/apply compaction and
  revalidation**. Their current diagnostics and transaction helpers are not a
  complete migration engine and are not yet available in Node.
- **Authored on develop, validation pending:** a Node `migration-audit` flags
  legacy notes and reviewed Git evidence; `migration-backup` creates a
  digest-bound, explicit, byte-for-byte snapshot outside validated topics;
  `migration-inspect` verifies archive contents. No automatic rewriting.
- Continue with **read-only `migration audit`** coverage: inventory/locate invalid, outdated, duplicate and
  unverified records; identify valuable material without treating it as confirmed.
- Design a **lossless archive** outside validated `memory/topics/`, with a manifest and
  immutable backup/digest, so historical notes are not silently discarded or indexed as facts.
- **Authored on develop, validation pending (PR #22):** digest/HEAD-bound
  `migration-plan` and `migration-apply` perform reviewed multi-file
  replacements with cooperative exclusive lock, verified preimages and a
  recovery journal. `migration-restore-preview` / `migration-restore-apply`
  restore an existing snapshot with the same controls; `migration-recover`
  refuses unknown external edits. These are *recoverable per-file replacements*,
  not atomic multi-file visibility and not a semantic migration engine.
- Continue improving deterministic preview/diff, explicit approval, digest-bound
  apply and rollback, including crash fault-injection and noncooperating editors.
- Verify real code and tests before adding source/commit; do not manufacture provenance.
- Move current task state under HOT limits while preserving outstanding work and decisions.

**Acceptance:** original memory is recoverable byte-for-byte; default search never
promotes migrated unverified notes; healthy status is earned, never forced by deletion.

### P1 — Session-start freshness gate (candidate v3.4)

**Community feedback:** a Git-backed claim is useful only if source drift is rechecked
*after* code changes and *before* the agent trusts it.

- **Already implemented:** a task-start recipe in `SKILL.md`, `sync` drift checks,
  `health` provenance diagnostics and Git verification during `search`.
  Neither an instruction nor advisory `sync` proves a complete health check ran
  automatically when a fresh session began.
- Reuse existing `health` and `search` verification; **do not duplicate the Git hash checker**.
- **Authored on develop, validation pending:** `lacc.mjs session-check`
  is a bounded read-only startup check for direct source drift, missing/unavailable
  evidence, conflicts, HOT budgets, checkpoint and incomplete scan coverage.
  Execute its regression cases in Windows/Linux before treating as shipped.
- Have `SKILL.md` and native instruction bridges instruct agents to run it before loading
  trusted WARM facts in each new session and after relevant code changes.
- Distinguish an *agent instruction* from an *enforced host hook*; no universal host hook
  is assumed. Optional host-specific integrations must be explicit, supported and documented.
- No automatic source repair, revalidation or checkpoint stamping.

**Acceptance:** on a changed source, a fresh session reports a review-required finding
before trust; a missing runtime/Git or skipped scan never reports a verified pass;
read-only commands preserve all project files.

### P1 — Explainable memory trust, conflict reporting & user transparency (CR-1 authored; remaining items planned)

**Community feedback (Exori AI):** "When the memory says one thing and the
current code says another, which wins, and does the agent tell you it noticed?"

**Trust precedence:** current, independently checked source and tests are
primary evidence; historical memory cannot override verified current behavior.
However, changed file bytes or a keyed potential-conflict signal alone do
**not** prove a semantic contradiction. Treat mismatches as
**potential staleness / review required** pending substantive rechecking.
Never silently rewrite memory, invent provenance or claim a false conflict.

- **Existing foundation:** \`search\` excludes directly stale source-backed
  facts by default, \`health\` and \`doctor\` report evidence drift, and
  develop \`session-check\` surfaces review candidates. These commands
  do **not** guarantee user-visible notification across all agent hosts.
- **CR-1 — unified findings (implemented in develop, validation
  pending):** optional `--explain --json` on `search`, `health`,
  `doctor`, `session-check` and `dependency-impact` adds a stable,
  bounded `diagnostics[]` schema with kind/severity, evidence path,
  fact revision when available, trust, scoped coverage, a redacted
  reason and review action. Uses existing Git/impact findings, not a
  second source verification engine. Legacy output is unchanged
  without `--explain`; findings do not auto-notify a user.
- **CR-2 — source-to-fact evidence chains (authored in develop,
  validation pending):** `lacc-evidence-chain.mjs` uses exact RD-1/2/3
  file-level edges and the existing Git source verifier. An opt-in
  `--explain --json` trace supplies each dependency → importer hop's
  adapter/version, edge kind/confidence, verified Git baseline and
  changed-file reason, ending at the cited memory fact. Missing or
  inconsistent evidence becomes `partial`, not a fabricated link.
  It does not infer current HEAD, semantic contradiction or user delivery.
- **CR-3 — agent/host disclosure (authored in develop, validation
  pending):** `lacc-disclosure.mjs` defines a host-neutral protocol and
  a read-only `disclosure-contract` introspection command. CR-1
  `--explain --json` results gain additive `disclosure_protocol`
  guidance; `lacc init` embeds material-warning rules into the marked
  `AGENTS.md` block and native Codex/Claude/Gemini/Roo bridges.
  Guidance requires agents to evaluate task relevance and disclose
  important uncertainties before trusting affected memory. LACC cannot
  observe actual user delivery, record host receipts or guarantee host
  compliance; output always says `not-observed`. Re-run `init` to
  refresh existing installed instruction bridges.
- **CR-3B — Answer-Level Disclosure Gate (NEW; planned, NOT
  implemented):** community follow-up: *if an answer touches a fact
  that was excluded from trusted retrieval, disclose that exclusion in
  the answer itself—not only in a health check*. Before composing a
  material answer, the agent must correlate the current task and
  proposed claims with withheld/review-required **matched** memory
  facts (using source references and stable IDs, never full raw notes).
  When materially relevant, include a concise, user-facing disclosure
  in that same answer: which remembered claim/source may be outdated,
  the verified Git/coverage reason, what remains unknown, and the
  next evidence-check step. Continue with currently verified code
  evidence when available; do not silently trust or auto-rewrite memory.
  Unrelated findings must not spam the answer, and no source byte
  change alone may be called a proven semantic conflict. Incomplete
  searches, truncated diagnostics or an unavailable source must be
  reported as uncertainty rather than a false clean result.
  **Implementation options:** a bounded answer-context candidate
  contract followed by a host-specific pre-response rule/hook if
  supported; do not claim a generic output interceptor works across
  Codex/Claude/Gemini/Roo. An instruction or emitted diagnostic is
  not proof that the user saw it.
  **Release gate:** test positive (direct and indirect source drift,
  withheld relevant result), negative (unrelated finding), incomplete
  coverage, sensitive text, no Git, byte budgets and response-draft
  relevance. Capture the **actual generated answer** in each host;
  require the warning to be present in the answer when relevant
  (not only in logs/JSON), while accurately recording whether host
  display/delivery was actually observed. Repeat across native
  Windows, Linux and macOS; no PASS without executed tests.
  [Specification](docs/architecture/answer-level-disclosure-gate.md).
- **CR-4 — task-scoped explanation UX and deduplication (authored in
  develop, validation pending):** `lacc-disclosure-ux.mjs` adds
  read-only `disclosure-summary --task <id> [--deps] [--detail] --json`,
  grouping existing CR-1/2/3 normalized findings by changed/cited
  source and sorting new warnings first. It preserves full unresolved
  counts and incomplete-scan/truncation flags, with bounded brief and
  detailed presentation and real serialized-input byte counts
  (not unmeasured token savings). The explicit write command
  `disclosure-mark-seen --task <id> --id <finding-id> --expect-head
  <commit>` stores minimal private task/Git/evidence-bound
  **agent-seen** markers with seven-day validity. A marker never
  resolves or suppresses a finding, implies delivery or changes
  canonical memory. Retention is manual; no cleanup worker exists.
  Default recall and `--explain` output remain unchanged.
- **CR-5 — adversarial acceptance:** distinguish Git byte drift from
  confirmed semantic conflict; changed direct/dependency sources,
  missing evidence/unknown language, contradictory facts, large/incomplete
  scans, no false host notification, sensitive output, **answer-level
  disclosure** for materially relevant withheld facts, and real
  Windows/Linux/**macOS** host response tests. CR-3B is a release-blocking
  prerequisite, not merely an optional health-check assertion.

**Acceptance:** an integrated agent's **actual final answer** must
explain when materially relevant memory was withheld, what source
evidence was checked, what remains unknown and what verification
is next. A health-check finding alone does not satisfy acceptance.
Unrelated facts should not generate unsolicited noise. Distinguish
"warning generated", "agent response contains warning" and
"host-confirmed user delivery" without inventing the final state.
No auto-promotion or auto-reverification; universal platform popups
are not promised.

**Design:** [Memory conflict reporting and transparency](docs/architecture/memory-conflict-reporting.md).
**Status:** CR-1–CR-4 code authored in develop with **no
consolidated tests executed**. **CR-3B answer-level gate is newly
planned and unimplemented**; CR-5 acceptance remains planned.
LACC can group and mark agent-seen findings; it cannot verify that
a user saw a notice, that a claim was semantically corrected, or
that a host loaded its rules. No automatic message or memory repair.
**Contracts:** [normalized findings](skills/lean-context-memory/references/findings.md),
[evidence chains](skills/lean-context-memory/references/evidence-chains.md),
[agent disclosure](skills/lean-context-memory/references/disclosure.md),
[task-scoped disclosure UX](skills/lean-context-memory/references/disclosure-ux.md).

### P1 — Dependency-aware memory staleness (candidate v3.5)

**Community feedback:** a cited `auth.ts` may be unchanged while imported
`permissions.ts` changes the behavior described by the memory fact.

- **Already implemented:** heuristic `dep_graph.py` for exploring candidate references.
  A memory fact can also cite multiple explicit sources today, and each gets verified
  individually. Neither mechanism automatically resolves its import closure.
- **Prototype authored on develop, validation pending:** optional Node
  `search --deps` and `session-check --deps` traverse bounded local
  JS/TS imports and flag indirect `dependency-changed`; unresolved
  dynamic/alias/external imports are marked incomplete. This uses a
  heuristic parser, **not** a sound AST/resolved module graph. Do not
  enable by default until tests and false-negative reviews pass.
- Continue toward a deterministic, **bounded graph of resolvable local imports**,
  starting with JS/TS and configurable depth; reuse insights from the existing heuristic
  `dep_graph.py` but do not claim it already supplies a sound dependency graph.
- Compare relevant dependency files at the fact's **verified commit** and at current
  Git index/worktree; detect deletions, renames, staged-only and unstaged modifications.
- Report `dependency-changed` as **potential indirect staleness / review required**,
  *not* proof that the remembered assertion is false.
- Mark unresolved aliases, dynamic imports, external packages, conditional resolution,
  cycles or budget exhaustion as **dependency coverage incomplete**, never as a
  fully dependency-verified result.
- Expand supported languages and resolution rules only with explicit test fixtures;
  lockfile/package changes and generated code need a separately designed policy.
- Keep strict file/byte/edge/depth budgets and symlink/secret-path protections;
  prefer conservative review to silent acceptance.

**Required regression case:** `auth.ts` cites an unchanged direct source at commit X,
but `permissions.ts` imported by it changes; ordinary recall must not portray the
fact as dependency-verified. Review mode explains the implicated file and evidence.
Control cases: irrelevant file changes, cyclic imports, renamed/missing dependency,
import alias, dirty index and incomplete graph.

**Acceptance:** correctly flagged changes with reproducible Git evidence, declared
language/depth coverage and no false claim of complete transitive safety.

### P1 — Reverse dependency graph & language-neutral change-driven invalidation (new, design only)

**Community input:** an unchanged cited file can import a changed dependency.
Build and maintain the *inverse* mapping `changed dependency -> impacted
dependents -> source-backed facts`. This improves early detection beyond
pulling the forward import closure only when an individual fact is retrieved.

**Important portability constraint:** LACC is not a JS/TS-only memory skill.
It must work on **mixed-language, multi-root repositories** (C#/.NET,
PHP/CS-Cart, Python, Java/Kotlin, Go, Rust, JS/TS and unknown languages).
Avoid a mandatory compiler, OS-specific native parser, daemon, paid API,
network service, or Python/Bash dependency. Keep the Node+Git core portable.

- **Current foundation (not a completed implementation):** the optional
  experimental `search --deps` / `session-check --deps` scans a bounded
  JS/TS *forward* import graph only. `dep_graph.py` is heuristic candidate
  exploration. Neither provides a language-neutral inverse graph, a
  source-to-fact impact index, or comprehensive semantic project resolution.
- **RD-1 — common graph/adapter contract (implemented in develop,
  validation pending):** `lacc-graph-contract.mjs` normalizes language-
  neutral nodes/edges, adapter descriptors/results and source-backed fact
  references by verified Git revision. It supplies direct forward/reverse
  lookup indexes, strict path/budget checks and scoped coverage reporting.
  `dependency-contract` CLI introspection explicitly says no adapters
  are registered and inverse *traversal* is not implemented. RD-2 must
  connect real scanners, changes and historical edges; no semantic
  validation is inferred from the contract.
- **RD-2 — reverse-walk JS/TS prototype (authored on develop,
  validation pending):** reuse the existing Git verifier with RD-1
  revision-scoped graph indexes. The opt-in `dependency-impact`
  command identifies changed reachable dependencies and walks their
  inverse edges to linked source-backed facts, with evidence chains.
  `search --deps` and `session-check --deps` reuse this same
  engine. The static JS/TS parser is heuristic, bounded and not a
  compiler; no full repo-wide graph or cross-language resolver exists.
  Commit/index/worktree drift is checked through existing provenance,
  with historical/current imports retained for deleted/renamed paths.
- **RD-3 — non-JS adapters (code authored in develop; not tested):**
  `dotnet-static@1` links C# files to a uniquely identified project and
  literal `ProjectReference`/MSBuild imports; `php-static@1` follows
  literal includes and Composer manifest changes; `python-static@1`
  follows simple local Python imports/pyproject config. Each reuses the
  RD-1/2 reverse graph and Git verification. All three deliberately
  report partial coverage where compiler symbols, PSR-4/CS-Cart hooks,
  runtime import resolution and build/package logic cannot be checked.
  JVM/Go/Rust and optional LSP/Roslyn/Tree-sitter remain future adapters.
- **RD-4 — initial opt-in semantic hints and parse cache (authored
  on develop, validation pending):** `--semantic` resolves only literal
  JS/TS `tsconfig.json`/`jsconfig.json` alias mappings (one exact
  key/target), retaining historical/current config edges; patterns,
  extends, dynamic resolution and all cross-language compiler symbols
  remain explicitly incomplete. `--cache` is an **explicit private
  write** into `memory/analysis-cache/`: content-keyed/versioned
  JS/TS parser tokens only. Disk entries are independently re-parsed
  before they can affect dependency edges; no trusted memory, Git
  source status, resolved graph or semantic verdict is cached.
  Same-process memoization exists, but no cross-run savings claim.
  Tree-sitter, language servers, SCIP, Roslyn and advanced manifest
  semantics remain optional future extensions requiring independent
  reviews; never download or execute unapproved tools.
- **RD-5 — measured acceptance:** Windows/Linux/**native macOS** tests, mixed-language
  fixtures, historical edges, path attacks, false positive/negative rates,
  scan limits, latency and total context-token overhead. Retain opt-in
  mode until validated and avoid claiming all languages fully supported.

**Expected semantics:** `dependency-changed` or
`dependency-coverage-incomplete` means **review required**, not semantic
falsity; `unaffected-within-covered-scope` never means full safety.
Do not auto-rewrite, revalidate or promote memory facts.

**Design:** [Language-neutral reverse dependency engine](docs/architecture/reverse-dependency-memory.md).
**RD-1 contract:** [Graph/adapter index contract](docs/architecture/dependency-graph-contract.md).
**Status:** RD-1/2/3 plus initial RD-4 optional JS/TS alias
hints and validated parse-token cache authored on develop,
**tests unexecuted**. The graph only covers bounded dependencies from
cited files; full symbol-level/compiler/framework behavior and
cross-platform acceptance are **not implemented/validated**.
**RD-4 reference:** [Portable semantic hints and cache](skills/lean-context-memory/references/semantic-cache.md).

**Acceptance:** a changed imported dependency reaches an unchanged
cited source and its fact; mixed C#/.NET, PHP, Python and JS fixtures
report impacted facts or truthful incomplete coverage, with demonstrable
per-fact Git revision evidence and no mandatory external tools.

### P2 — Coordinated multi-agent memory

**Already implemented:** a cross-agent, project-local `memory/` fact store plus
`AGENTS.md`/native instruction bridges. Multiple agent clients can consume the
same facts serially; parallel edits are not coordinated.

- **Authored on develop, validation pending:** Node handoff publish/list/read
  uses immutable, task-scoped JSON with exclusive create, deterministic
  idempotency IDs and Git-HEAD preconditions. Proposals remain outside
  validated WARM facts and cannot auto-promote. Canonical memory still
  requires a single reviewed writer; transactional multi-writer merges
  are **not implemented**.
- Extend independent agents' **immutable, task-scoped handoffs** with owner,
  source revision, task status, review notes and bounded payloads.
- **Authored on develop, validation pending:** add reviewed single-file
  `canonical-preview`/`canonical-apply` with Git HEAD/digest-bound CAS,
  exclusive per-file LACC lock, temp-file atomic replacement and private
  rollback bytes. It prevents cooperating LACC writers from silently
  overwriting one another; external writers and multi-file atomicity
  remain unsupported.
- Extend the reviewed canonical fact writer with cross-file optimistic
  concurrency, idempotency and explicit conflict resolution; no silent
  last-writer-wins overwrites.
- Keep agents' unverified suggestions separate from source-backed shared memory.
- Support mixed Codex, Claude, Gemini and other native hosts without a daemon requirement.

**Acceptance:** parallel writers cannot silently destroy one another's facts or promote
an unverified handoff to confirmed memory.

### P2 — Practical quality and savings evaluation

**Already implemented:** host/provider usage importers, context-pressure advice
and a reproducible A/B protocol with synthetic/contract tests. No controlled
real-model savings result has been confirmed or published.

- Compare real projects with/without the skill and against host-native memory, using
  matched tasks, model versions, permissions, fixtures and acceptance tests.
- Measure total model usage, retrieval precision, wrong/stale fact rate, task quality,
  maintenance overhead, and cold/warm session behavior; separate bytes from tokens.
- Report regressions, incomplete traces and unfavorable results rather than suppressing them.

**Acceptance:** reproducible local A/B data; any savings percentage has its
measurement source and equal-quality acceptance gate.

### P3 — Multi-skill ecosystem

**Already implemented:** the generic skill catalog layout, installer integration
and one shipped, independently installable skill (`lean-context-memory`).
A generic catalog does not mean the future domain-specific skills are shipped.

- Add independent skills for CS-Cart development, .NET engineering, application security
  and privacy/GDPR compliance under `skills/<name>/`, with domain-specific tests.
- Create a reviewable improvement loop: capture post-task lessons, propose skill revisions,
  test against baseline, require human approval before publishing.
- Explore optional CLI packaging/distribution only when it materially simplifies installs;
  `npx skills add` is already the installer, **`npx lacc` does not currently exist**.
- Consider stronger semantic retrieval and other storage backends only with measured need,
  privacy controls and explicit resource budgets.

**Acceptance:** skills remain independently installable; shared runtime/memory does not
create circular dependencies or unverifiable “self-improvement.”

## Working order and status rules

**Recommended next delivery (2026-11-11):** RD-4's initial
literal alias hints and conservative parser cache are authored in
develop, **tests unexecuted**. The next implementation gate is **CR-3B — Answer-Level Disclosure**
to prevent relevant excluded facts from going silently unmentioned
in actual responses. Then **RD-5/CR-5** consolidates security,
privacy, functionality, token benchmarks and executed native Windows,
Linux AND macOS host-response acceptance for Codex, Claude, Gemini
and Roo. Do not promote develop to main until tests
are actually run and blocking failures resolved; no GitHub Actions
or hosted CI. Full compiler/LSP semantics remain separately scoped.

Use the per-slice status definitions in the implementation audit above:
**implemented**, **locally validated**, **pilot reported**, **partial**, **planned**,
or **research**. Report the environment and source of evidence before saying
**pilot validated**; do not call a complete milestone shipped merely because
some of its components already exist.

All roadmap items are proposals until merged and tested. Implementation PRs must
link the affected section and report tested environments, skipped tests, read/write
effects, and any unsupported languages or host clients. **Do not touch `.github/`
or consume GitHub Actions minutes** for roadmap updates or planned milestones.
