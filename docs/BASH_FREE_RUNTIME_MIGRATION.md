# BF-1 — Bash-free runtime inventory and parity contract

**State (2026-11-12):** Architecture audit completed; migration is in progress.
This is **not** an assertion that Bash or Python have been removed.
Source base: `develop` at `cc4bc0b`. Draft Windows PR #40 is separate and
must be reconciled on integration.

## Mandatory versus optional dependencies

The installed Node runtime (`scripts/lacc.mjs`) already supports init,
sync, read, search, health, doctor, session-check, memory migration,
reverse dependency impact, CAS, multi-agent handoffs and disclosure
without Bash/Python. Git is required for trustworthy source provenance;
it must never be replaced with a claimed verified result when unavailable.

The five historical shell entrypoints are listed below. They are
**not interchangeable** with their Node counterparts until explicit
behavioral comparison passes. Do not remove them yet.

| Existing Bash command | Implementation it executes | Node migration target | Parity risks | Current state |
|---|---|---|---|---|
| `init-memory.sh` | Embedded Python bootstrap, agent bridges, templates, bootstrap hashes | `lacc.mjs init` | Exact generated instructions, existing content/marker preservation, symlink refusal, idempotence, file hash ownership | Node alternative exists; differences need parity fixtures |
| `sync-memory.sh` | Embedded Python Git drift, strict/stamp, bootstrap exclusions and checkpoint | `lacc.mjs sync` | Git statuses including rename, index flags, untracked sources, absent baseline, advisory vs strict/stamp, no writes before checks | Node alternative exists; differences need parity fixtures |
| `dep-graph.sh` | `dep_graph.py`: bounded candidate inventory, literal signals, declaration/import heuristics | Node `reference-scan` (candidate search) plus separate `dependency-impact` (Git evidence) | Generic reference lookup ≠ reverse dependency impact; root `bin/`, nested `src/build`, ignore rules, rank ordering, private files and byte budgets | **BF-2b authored**: native Node `reference-scan`, test evidence pending |
| `ast-skeleton.sh` | `signatures.py`: Python AST + multi-language heuristic starts | Node `signatures`: existing Python AST when available; explicit heuristic without Python | Python syntax/AST exactness and syntax-error diagnostics, line numbers, decorator handling and limits | **BF-2b authored**: no-Bash parser selection; Python optional for exact AST |
| `ctx-slice.sh` | `ctx_slice.py`: streamed bounded stdin or file, 60/40 head/tail, optional private `--keep` | New `ctx-slice.mjs` / `lacc.mjs ctx-slice` | CRLF and binary UTF-8 replacement, 1-line and empty input, long lines, stdout/stderr, retention, temp permissions, cancellation | First native Node migration slice |

## Exit, safety and data compatibility contract

- Exit codes: `0` success; `1` review/degraded state where applicable;
  `2` usage, missing input or unsafe state. Never upgrade an unverified
  memory claim to trusted during translation.
- No implicit writes to `memory/`, automatic fact promotion, shell
  concatenation, `eval` or `shell: true`. Opt-in cache and `--keep`
  persist only to declared locations, with private permissions.
- Preserve Git provenance, paths and source revision checks; preserve
  empty/unavailable/truncated distinctions and status/diagnostics.
- Case-sensitive path claims require real Windows, Linux and native macOS
  evidence. Node-only Linux tests do not prove other OS support.
- File and output limits must fail visibly and never silently drop
  safety diagnostics or return a false complete result.
- Installation acceptance must exercise both copy and link mode, with
  Windows link constraints reported honestly, plus isolated agent
  initialization. No installer runs without explicit opt-in.

## Bash references that must be addressed

- Agent instructions: `skills/lean-context-memory/SKILL.md`,
  `skills/lean-context-memory/README.md`, root `README.md`,
  and native bridge generation in both init implementations.
- Python integration and shell safety tests: `tests/test_memory_tools.py`,
  `test_review_helpers.py`, `test_review_boundaries.py`,
  `test_review_memory.py`, `test_safety_regressions.py` and
  `test_memory_search.py`.
- `tests/install_smoke.py` invokes `bash -n`, bootstrap shell and
  `python3`; changing shell requirements must not drop these
  legacy-security assertions.
- `tests/run_consolidated.mjs` currently executes all Python suites.
  A blocked Bash environment must **not** be reported PASS.

## Work packages and acceptance

1. **BF-1** (this audit): record the command/interface inventory, map
   risk cases and track the migration gate.
2. **BF-2a**: implement Node context slice with opt-in private retention,
   tests for stdin/file/limits/Unicode/no implicit persistence;
   retain `.sh`/Python legacy behavior.
3. **BF-2b** (stacked feature PR): add `reference-scan` for bounded,
   privacy-filtered import/symbol/event evidence and `signatures` for
   declaration candidates. Python files use the existing safe stdlib
   `ast.parse` implementation when Python 3.9+ is available **without
   Bash**; absent Python, fallback is clearly marked heuristic and
   `--require-ast` fails closed. These are not compiler/LSP symbols
   and not semantic proof. Unit tests authored; native OS parity pending.
4. **BF-2c** (stacked feature PR): harden Node init preflight,
   preserve user fact files and generated instructions, and parse NUL Git
   rename/dirty evidence with bounded display. Legacy Bash sync/bootstrap
   are preserved and require independent behavioral parity checks; no
   single OS test proves security parity on all three platforms.
5. **BF-3–BF-6** (stacked feature PR): legacy initializer emits
   Node-first instructions; original POSIX Bash tests run where Bash
   actually executes and are SKIPPED (never PASS) where blocked;
   separate Node suites exercise the replacement functionality;
   opt-in pinned installer smoke uses Node only; security regression
   covers private paths, no source execution and symlink boundaries.
   The consolidated runner can report partial `--bash-free` Node core
   evidence without asserting legacy parity. **Code authored; full
   Windows/Linux/macOS validation pending.**
6. **BF-7–BF-8**: follow the
   [native Bash-free acceptance matrix](BASH_FREE_ACCEPTANCE_MATRIX.md)
   on the same reviewed SHA. A conservative five-report aggregator is
   authored: Node+installer on Windows/Linux/macOS and Bash legacy
   suites on Linux/macOS, without Windows Bash dependency. The
   aggregator only inventories operator-supplied JSON and never
   attests native execution or host answer delivery. Record actual
   Codex/Claude/Gemini/Roo responses and opt-in installer results;
   only then consider deprecating wrappers with a rollback plan and
   maintainer approval. Do not call an authored test a passed test.

**Release gate:** Experimental until native three-OS results, complete
legacy/new command parity, installer acceptance, privacy regressions,
and real host-response acceptance are reviewed. No GitHub Actions and
no `main` promotion until the owner approves the consolidated gate.
