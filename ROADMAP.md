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

The **last merged design milestone** is PR #24 (cross-language reverse
dependency architecture). The **last merged runtime feature** is PR #22
(journaled migration/restore). Both are on **develop** only. **main** stays
on the stable v3.2 baseline. PR #23 is an **open** validation/hardening PR,
not yet integrated into develop.

| Scope | Evidence | Status |
|---|---|---|
| PR #15–#22 | Develop policy; session gate; legacy audit/snapshot; JS/TS opt-in dependencies; handoffs; private storage; canonical CAS; journaled migration/restore | **Code merged into develop; feature validation incomplete** |
| PR #23 | Validation branch reports Windows Node.js 24.13: 34 pass, 1 optional Python-parity skip, 0 fail; fixes snapshot directory creation and two test fixtures; Python/Bash-dependent checks blocked | **OPEN PR; agent-reported partial validation, not integrated / not a complete release gate** |
| PR #24 | Language-neutral reverse dependency architecture, RD-1..RD-5 | **Design merged into develop; inverse graph NOT implemented** |
| Exori AI feedback | What if memory conflicts with current code, and does the agent tell the user? | **New CR-1..CR-5 design below; not implemented** |

**Immediate action:** review PR #23 and its local logs, reconcile its
changes with current develop, then merge any accepted fixes **only into
develop**. Do not treat a Windows Node pass as proof of Python/Linux parity,
installer compatibility or end-to-end agent notification.

**Next feature:** RD-1 common cross-language graph/adapter contract,
followed by RD-2 reverse graph traversal; implement CR-1 common reporting
in a separate PR so that direct and indirect findings share vocabulary.
CR-1 could precede RD-2 because direct Git findings already exist.

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
| Cross-platform Node core | Bundled Node CLI, Windows isolated-PATH tests and optional Python-parity fixtures; PR #23 reports 34 Windows Node PASS / 1 parity SKIP | Review/integrate PR #23; finish Python/Linux parity, installer and host integration tests | **Implemented in develop; Windows Node validation reported; full P0 pending** |
| Existing-memory cleanup | Develop includes health/doctor, migration audit, digest-bound backups, inspect, journaled migration/restore and recovery | Validate crash/concurrent-writer behavior and manual provenance review; no full automatic legacy semantic migration | **Develop code integrated, validation pending; semantic auto-migration absent** |
| Session freshness | sync, search, health and bounded session-check on develop; agent instruction bridges | Validate all supported hosts and incomplete scans; no universal automatic hook | **Develop implementation; host automation and end-to-end acceptance pending** |
| Indirect dependencies | dep_graph.py heuristic and opt-in develop search --deps / session-check --deps static JS/TS forward prototype | Language-neutral reverse graph/source-to-fact impact RD-1..RD-5; unknown coverage must remain explicit | **Experimental forward prototype merged; reverse engine design only** |
| Multi-agent memory | Shared facts, develop handoffs, single-file canonical CAS and journaled multi-file operations | Non-cooperating writers, fault-injected recovery and semantic conflict resolution | **Cooperative code merged to develop; general concurrency not proven** |
| Measurement | Context-pressure tools, usage importers and synthetic A/B method | Matched real-agent measurements of full token cost and task quality | **Instrumentation exists; savings unmeasured** |
| Conflict transparency | Direct Git/source and keyed-conflict findings available in CLI | Unified finding/report schema, agent disclosure and verified per-host delivery (CR-1..CR-5) | **Partial diagnostics; reporting planned** |
| Multi-skill platform | Installable catalog and lean-context-memory v3.2 skill | Independent CS-Cart/.NET/security/GDPR skills, integration suites and reviewed improvements | **Catalog implemented; domain skills planned** |

**Evidence reviewed:** `skills/lean-context-memory/SKILL.md`, `scripts/lacc.mjs`,
`scripts/lacc-core.mjs`, `scripts/memory-maintain.py`, `scripts/dep_graph.py`,
`tests/test_node_runtime.mjs`, `references/runtime.md`, `references/benchmark.md`.
This is a **static repository audit, plus agent-reported local Windows results in open PR #23**, not a new independently repeated end-to-end test run. Do not upgrade any status without checking complete acceptance evidence.

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

### P1 — Explainable memory trust, conflict reporting & user transparency (new; design only)

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
- **CR-1 — unified findings:** one stable, bounded schema across \`search\`,
  \`health\`, \`doctor\`, \`session-check\`: fact identity, kind/severity,
  evidence path/commit, trust, scan coverage, redacted reason and action.
  Extend the existing evaluator instead of duplicating Git logic.
- **CR-2 — source-to-fact evidence chains:** once RD-1/RD-2 exists,
  include \`changed dependency -> imported module -> cited fact\` with
  resolver provenance and explicit incomplete language coverage.
- **CR-3 — agent disclosure:** update native bridges/guidance to tell
  users about *material and relevant* memory-code inconsistencies
  before relying on historical facts. A CLI diagnostic means
  **reported to agent**, not necessarily **shown to user**;
  optional host hooks must be implemented and tested per host.
- **CR-4 — useful explanations:** short/detail formats, grouping,
  stable finding IDs/deduplication, bounded token cost, security redaction.
- **CR-5 — adversarial acceptance:** distinguish Git byte drift from
  confirmed semantic conflict; changed direct/dependency sources,
  missing evidence/unknown language, contradictory facts, large/incomplete
  scans, no host notification, sensitive output and Windows/Linux paths.

**Acceptance:** an integrated agent can explain why a fact is withheld,
what current source evidence was checked, what remains unknown and
whether it actually showed the user a warning. No auto-promotion or
auto-reverification. Universal platform popups are not promised.

**Design:** [Memory conflict reporting and transparency](docs/architecture/memory-conflict-reporting.md).
**Status:** CR-1..CR-5 planned only; existing diagnostics are partial,
not a unified end-user notification implementation.

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
- **RD-1 — common graph/adapter contract:** unify forward edges, inverse
  edges, `source -> fact` references, per-fact Git verified revision,
  resolver provenance, confidence and explicit missing coverage. Ensure
  historical edges removed in new code are not lost.
- **RD-2 — reverse-walk JS/TS prototype:** reuse the existing `--deps`
  source verifier, index local static imports, walk changed dependencies
  backwards, return affected facts with evidence paths. Detect committed,
  staged, unstaged, deleted and renamed paths and bound graph traversal.
- **RD-3 — non-JS adapters:** separate adapters for C#/.NET
  (`ProjectReference`, project manifests, optional symbol resolution),
  PHP/Composer/CS-Cart, Python and JVM/Go/Rust project/module graphs.
  Unknown runtime wiring (DI, reflection, events, hooks, dynamic imports,
  schemas, lockfiles) must trigger explicit incomplete coverage, not pass.
- **RD-4 — optional richer parsing:** evaluate Tree-sitter, language
  servers and SCIP indexes for syntax/symbol accuracy, but never require
  them or start unapproved external processes/downloads. Add a safe,
  versioned, content-addressed derived cache outside trusted memory.
- **RD-5 — measured acceptance:** Windows/Linux tests, mixed-language
  fixtures, historical edges, path attacks, false positive/negative rates,
  scan limits, latency and total context-token overhead. Retain opt-in
  mode until validated and avoid claiming all languages fully supported.

**Expected semantics:** `dependency-changed` or
`dependency-coverage-incomplete` means **review required**, not semantic
falsity; `unaffected-within-covered-scope` never means full safety.
Do not auto-rewrite, revalidate or promote memory facts.

**Design:** [Language-neutral reverse dependency memory engine](docs/architecture/reverse-dependency-memory.md).
**Status:** specified in roadmap, implementation **not started**;
the earlier JS/TS forward prototype remains experimental and unvalidated.

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

**Recommended next delivery (2026-11-11):** review and reconcile the
**open PR #23** with current develop (reported 34 Windows Node PASS, one
optional Python-parity SKIP), retain full cross-runtime/host validation
as a release gate, and **do not merge develop into main yet**.
**Next new runtime feature: RD-1** cross-language graph/adapter contract
(following merged design PR #24). Then implement RD-2 reverse
dependency impact and CR-1 normalized explainable findings as separate
PRs. Both must reuse existing Git provenance and remain opt-in until
locally validated.

Use the per-slice status definitions in the implementation audit above:
**implemented**, **locally validated**, **pilot reported**, **partial**, **planned**,
or **research**. Report the environment and source of evidence before saying
**pilot validated**; do not call a complete milestone shipped merely because
some of its components already exist.

All roadmap items are proposals until merged and tested. Implementation PRs must
link the affected section and report tested environments, skipped tests, read/write
effects, and any unsupported languages or host clients. **Do not touch `.github/`
or consume GitHub Actions minutes** for roadmap updates or planned milestones.
