# Universal Runtime 4.0 — migration contract and acceptance

**Status:** UR-4/M0 inventory and differential tooling authored on a separate experimental branch.
**NOT IMPLEMENTED:** Node replacements for remaining Python/Bash functionality.
**NOT VERIFIED:** full parity, regression compatibility, native Windows/Linux/macOS and
release readiness. Do not remove the legacy runtime yet.

## Decision

LACC aims for a single **Node.js 22+ + Git** runtime with no mandatory
Python, Bash, WSL, PowerShell, external process daemon or compiler during
normal skill operation. Git remains necessary to verify source provenance.
A developer may optionally run Python/Bash during the *migration only* as
the frozen behavioral baseline; it does not become an end-user requirement.

This is a **strangler migration, not a rewrite**: legacy entrypoints remain
unchanged while new Node replacements are built and proven against them.
The migration must never convert untrusted memory to trusted memory,
change an output budget silently, or weaken safety to make tests green.

## Scope inventory (machine checked)

The authoritative list is
[`tests/fixtures/universal-runtime-v4-inventory.json`](../../tests/fixtures/universal-runtime-v4-inventory.json).
The Node test `tests/test_universal_runtime_inventory.mjs` fails if a
shipped `.py` / `.sh` legacy script is missing from the list or if an
unverified candidate is asserted to have completed parity.

At the recorded starting point `develop@cc4bc0b`:

- **5 Bash scripts:** `init-memory.sh`, `sync-memory.sh`,
  `ast-skeleton.sh`, `dep-graph.sh`, `ctx-slice.sh`.
- **11 executable Python tools:** context-pressure, ctx_slice, dep_graph,
  memory-doctor, memory-health, memory-maintain, memory-read, memory-search,
  session-totals, signatures and usage-report.
- **2 Python libraries:** `memory_common.py` and `usage_providers.py`.
- **6 candidate Node command overlaps (UNVERIFIED):**
  `init`, `sync`, `doctor`, `health`, `read`, `search`.
  Same command *name* or similar output is not behavioral equivalence.
- **10 gaps:** AST/signatures, context slicing, legacy dep-graph,
  context pressure, memory-maintain, session totals, usage reports and
  their Bash wrappers. Existing `dependency-impact` does *not*
  automatically replace `dep-graph.py`.
- **2 libraries require review** for implicit path/encoding, Git, source
  and API-provider behavior even if no executable is exposed.

The inventory covers **runtime scripts** in the skill. Legacy Python
tests and installer smoke are separate **acceptance surfaces** and must
also be ported without deleting their assertions.

## M0 — freeze evidence, not behavior

1. Preserve an exact SHA of the source implementation under test.
   This branch starts at `cc4bc0bca2bea2e3cbc56a29a6101337f9e585b3`.
   PR #40 is separate, draft and contains Windows fixes that may require
   rebasing/renewing the baseline after it is reviewed.
2. Maintain the manifest and explicit classifications:
   `candidate-unverified`, `missing`, `library-review`. No entry
   is marked parity-verified in M0.
3. Run inventory test locally with `node --test tests/test_universal_runtime_inventory.mjs`.
4. Run **opt-in** differential fixture:
   `node tests/run_universal_runtime_diff.mjs`.
   Requires Node 22+, Git and Python 3.9+ available *only on the test host*.
   It creates a disposable Git fixture outside the checkout, runs the existing
   Node and Python read/health implementations and writes a private
   `report.json` under the OS temp directory. Reports compare exact
   stdout bytes for read; selected structured health status/findings and
   exit codes for health. Differences are `NOT_PARITY` (exit 1), missing
   runtime or setup errors are `UNVERIFIED` (exit 2), and matches are
   **partial** evidence only (never release eligibility).
   Report only hashes/byte lengths, not actual remembered source text.
5. Review the result; if any mismatch is found, add a red/green
   regression fixture before modifying either implementation.

## M1–M5 implementation sequence

| Milestone | Target | Acceptance before advancing |
|---|---|---|
| M1 | Close Node memory read/health/search/sync/init and doctor semantic gaps | Differential exit/output/write/permission/source-trust parity, malformed facts and historical Git revisions |
| M2 | Port `compact` and explicit reviewed `revalidate` | Review preconditions, digest CAS, multi-file safety, no unapproved writes, rollback fixtures |
| M3 | Port legacy `dep_graph`, signature extraction, slicing, context pressure | Literal symbol/signal coverage, Python AST equivalence, bounded UTF-8 streams, no source execution |
| M4 | Port usage/token reporting, API provider normalization and session totals | Exact reported token counts, costs, final-response checks, missing-usage fail closed |
| M5 | Port legacy tests and installer; cut over docs and remove dependencies | Full native OS matrix, installer smoke, negative security tests and real agent answers; no regression |

## Required parity dimensions

For **the same Git fixture and bytes**, compare at least:
- command arguments and defaults, stdout/stderr/JSON schema, exit status,
  deterministic ordering, truncation semantics and byte/time limits;
- memory file contents before/after, modified and created paths,
  user-authored instruction preservation and transaction failure recovery;
- Git worktree/index state, missing commits, assume-unchanged files,
  source ref paths, dirty/staged/untracked changes and history boundaries;
- shell quoting and injection, Unicode/CRLF/surrogates, symlinks,
  path traversal, ambiguous metadata, secrets, input overflows and
  missing executables;
- usage evidence source, token totals, A/B cohort rules and providers;
- actual agent output (Codex, Claude, Gemini, Roo), not merely a CLI
  assertion that a warning was constructed.

**No broad regex-based replacement for Python `ast` is accepted as
automatically equivalent**. A platform-neutral parser or an explicit,
conservative incomplete result needs feature-specific acceptance.
No optional external compiler may be silently installed or executed.

## Promotion / rollback

- Develop new code only in a **separate feature branch and PR**.
  Do not modify PR #40 and do not touch `main`.
- Preserve existing legacy implementations until each replacement is
  independently reviewed and validated. Do not weaken legacy tests or
  convert blocked Bash tests into PASS.
- For each migration slice, record red/green differential reports and
  independently executed native Windows, Linux and macOS results.
  Windows Docker/WSL is *not* native macOS evidence.
- Final deletion of `.sh` and `.py` requires zero uncovered legacy
  behaviors, clean full regression/security results, installed-skill
  smoke on all three OSes, documented compatibility impact, a
  rehearsed rollback and owner approval.
- Until then the user-facing project remains LACC v3.2,
  with UR-4 strictly experimental.
