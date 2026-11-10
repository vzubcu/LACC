# LACC Roadmap

**Scope:** [LACC — Lean Agent Capabilities Collection](README.md), an extensible collection of installable AI-agent skills.  
**Current published-in-repository skill:** `lean-context-memory v3.2`.  
**Last reviewed:** 2026-11-10. **Status:** planning; this document is not evidence that future work is implemented.

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

**Current gaps explicitly not shipped:** automatically enforced session-start health gate;
indirect/transitive dependency staleness; lossless migration of old unverified memory;
multi-agent concurrency coordination; a published `npx lacc` package.


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
| Cross-platform Node core | Bundled `lacc.mjs` with Git-backed verification and prior Rider pilot: 5 passed, 1 skipped. A new Windows `git.exe` isolated-PATH test and optional Node/Python parity fixture harness are now authored | Execute updated tests on Windows and Linux, resolve any parity failures, test a second host | **Implemented / pilot reported; new P0 tests authored, execution pending** |
| Existing-memory cleanup | Read-only `health` and `doctor`; Python `memory-maintain.py compact/revalidate` uses preview, digest-bound apply and manual review | Automated *lossless legacy migration audit*, archival manifest/backup and rollback; migrate arbitrary old notes safely in Node-first environments | **Partial foundation; migration planned** |
| Session freshness | `SKILL.md` already tells agents to run `sync` at task start; `sync` checks checkpoint/worktree drift; `search` verifies *cited* source evidence at retrieval; `health` checks facts | A single bounded, explicit startup health gate and proof it is invoked for each supported host/session; startup `sync` alone is not complete per-fact health | **Existing manual workflow; enforced/combined gate planned** |
| Indirect dependencies | `dep_graph.py` provides bounded *candidate references* for manual investigation; fact metadata already permits **multiple explicit `source:` files**, each checked by source verification | Automatically resolve imported dependencies, compare them at checked commit and worktree, report indirect change and incomplete graph coverage | **Manual exploration implemented; automatic indirect staleness planned** |
| Multi-agent memory | Shared on-disk `memory/`, `AGENTS.md` and native instruction bridges for Claude/Gemini/Roo; Codex uses `AGENTS.md` | Concurrent-writer coordination, immutable handoff envelopes, compare-and-swap, conflict merge protocol | **Shared store implemented; safe coordination planned** |
| Measurement | `context-pressure.py`, `usage-report.py`, `usage_providers.py`, `session-totals.py`, A/B guidance and tests | Matched *real-agent* end-to-end measurements showing outcome quality and full token costs | **Instrumentation implemented; savings unmeasured** |
| Multi-skill platform | Installer-discoverable `skills/<name>/SKILL.md` layout, documented catalog rules, one shipped skill | Separate CS-Cart/.NET/security/GDPR skills; reviewed self-improvement and multi-skill acceptance tests | **Catalog foundation implemented; new skills planned** |

**Evidence reviewed:** `skills/lean-context-memory/SKILL.md`, `scripts/lacc.mjs`,
`scripts/lacc-core.mjs`, `scripts/memory-maintain.py`, `scripts/dep_graph.py`,
`tests/test_node_runtime.mjs`, `references/runtime.md`, `references/benchmark.md`.
This is a **static repository audit plus user-reported Windows pilot**, not a new
end-to-end test run. Avoid upgrading any status without executing its acceptance checks.

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

**Recommended next delivery:** P0 runtime parity, followed by P1 migration and
session-start health; dependency-aware review should be prototyped alongside
the freshness contract, **not** rushed into the existing “source-unchanged” status.

Use the per-slice status definitions in the implementation audit above:
**implemented**, **locally validated**, **pilot reported**, **partial**, **planned**,
or **research**. Report the environment and source of evidence before saying
**pilot validated**; do not call a complete milestone shipped merely because
some of its components already exist.

All roadmap items are proposals until merged and tested. Implementation PRs must
link the affected section and report tested environments, skipped tests, read/write
effects, and any unsupported languages or host clients. **Do not touch `.github/`
or consume GitHub Actions minutes** for roadmap updates or planned milestones.
