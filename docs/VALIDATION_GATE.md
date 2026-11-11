# Consolidated acceptance gate: develop -> main

**Status: NOT COMPLETE for current develop.** An earlier Windows agent
run reported 34 Node tests passed and one optional Python-parity skip on
the former PR #23 head. Fixes were incorporated via PR #26, and RD-1
changes were added later. **No complete validation of current develop has
been run.** Do not advertise develop as the stable release.

**Hard constraints:** local execution, no hosted GitHub Actions, no
auto-merges into main, preserve user memory and private handoffs.
Do not mark any item PASS until an actual command exits successfully and
the relevant assertions are reviewed.

## 1. Freeze scope and record evidence

```powershell
git fetch origin
git switch develop
git pull --ff-only origin develop
git status --short
node --version
git --version
```

Record branch SHA, OS, Node, Python, Git versions, command exits and any
skips. Leave personal memory files untouched unless using an isolated
fixture. On Windows, Git Bash and WSL are NOT required for Node tests.

## 2. Run the Node tests locally

```powershell
node --test tests/test_node_runtime.mjs
node --test tests/test_session_check.mjs
node --test tests/test_memory_migration.mjs
node --test tests/test_dependency_staleness.mjs
node --test tests/test_multiagent_handoff.mjs
node --test tests/test_canonical_cas.mjs
node --test tests/test_memory_transaction.mjs
node --test tests/test_dependency_graph_contract.mjs
node --test tests/test_reverse_dependency_impact.mjs
node --test tests/test_memory_conflict_findings.mjs
node --test tests/test_cross_language_dependency_impact.mjs
node --test tests/test_memory_evidence_chains.mjs
node --test tests/test_agent_disclosure_protocol.mjs
node --test tests/test_disclosure_ux.mjs
node --test tests/test_rd4_semantic_cache_portability.mjs
```

Tests expected after implementation and review: Windows isolated Git PATH,
no Git fail-closed, start-of-session drift/overflow, reviewed backup and
tamper detection, indirect permission-module drift and incomplete import
resolution, idempotent task handoffs and tampered handoff rejection.

If a Node test hangs, enable `LACC_TEST_DEBUG=1` in the session. Each Git
child process has an explicit timeout. Missing binaries must fail or
skip explicitly; they must never masquerade as a pass.

## 3. Cross-runtime and installer parity (optional tool prerequisites)

```powershell
node --test tests/test_node_python_parity.mjs
```

CPython 3.9+ is required for meaningful parity results. A skipped parity
test does **not** prove Node and Python agree. Run the full Python tests in
a local Python-capable environment:

```bash
python3 -m unittest discover -s tests -v
```

The full installer smoke test needs npm/npx, Git, Python and Bash and may
fetch an npm package. Run it only in a supported local container/VM:

```bash
python3 tests/install_smoke.py
```

No GitHub Actions minutes or hosted runners are needed. Use Linux Docker
locally when Git Bash is broken on Windows.

## 4. Security and consistency checklist

- No symlink or path-traversal escape from project root.
- Invalid or missing commit evidence never enters confirmed recall.
- Incomplete scans and unresolved imports never report a trustworthy
  dependency-complete result.
- Keyed fact conflicts remain review-required.
- Memory startup commands do not write files.
- Legacy snapshot copies original HOT/WARM bytes; source changes during
  backup abort the operation. An incomplete backup cannot look valid.
- Snapshot/handoff folders are ignored by Git by default, and are not
  added to agent context. Avoid `git add -f` and private file commits.
- Handoff writes are exclusive/idempotent, read as untrusted proposals,
  and cannot automatically modify canonical memory.
- Canonical multi-writer memory merges and transaction-based restore are
  **not implemented**; their acceptance gates remain open.
- Test secrets, malformed UTF-8, large files, Git index-only changes,
  `assume-unchanged`, Windows path handling and bounded output.

## 5. Promotion criteria

A promotion PR from develop to main requires:

1. Test and smoke summary (passed/failed/skipped, environments, commands).
2. All P0/P1 feature regressions either passing or explicitly removed/
   disabled pending a separate accepted release.
3. Review of privacy/security regressions and unresolved TODOs.
4. Updated SKILL.md/README and clear runtime/feature availability status.
5. Owner approval, no force-push on main and a planned rollback reference.
6. **CR-3B Answer-Level Disclosure Gate:** actual generated answers
   disclose task-relevant excluded memory, with host/OS evidence.
   Passing CLI checks alone is insufficient; missing host support
   remains explicitly unverified and must be resolved before claiming
   full cross-host release compatibility.

No automatic tag/version or release announcement follows merely from
merging the implementations into develop. Real-model A/B token measurements
are a separate quality goal and cannot be fabricated by local helper tests.

## CR-1 explainable evidence acceptance (pending)

- Verify normalized findings cover direct source drift, indirect JS/TS
  dependency drift, potential keyed conflicts, missing evidence and
  session checkpoint changes without claiming semantic contradiction.
- Verify legacy JSON remains stable without `--explain` and trusted
  search still excludes unverified facts. Explanations must not promote
  withheld matches into trusted results.
- Ensure sensitive strings, raw user fact prose, credentials and
  untrusted diagnostic text are not copied to normalized reports.
- Check bounded `--max-bytes`, stable IDs across `health` and `doctor`,
  honest truncation, Windows/Linux and agent-host integrations.
- No user-facing notification proof exists: `agent-output-only`
  indicates generated CLI data, not delivery to a person.
- Tests are **authored, not executed** for current develop.

## RD-3 cross-language adapters (validation pending)

- Validate C# file -> project manifest -> ProjectReference and changes
  in Directory.Build.props/targets; ensure `using` without Roslyn never
  produces a false complete-coverage assertion.
- Validate Composer manifest/PSR-4 handling and literal PHP includes;
  keep runtime autoloaders and CS-Cart hooks explicitly incomplete.
- Validate Python package relative/local absolute imports, pyproject
  configuration, namespace/dynamic imports and `sys.path` caveats.
- Test a mixed project with JS/TS, .NET, PHP, Python and unknown files;
  report adapter scopes, changed-file evidence and partial coverage.
- Test Windows path separators, symlink/traversal, large manifests,
  Git commit/index/worktree drift, deleted imports and no script execution.
- Tests are **authored, not executed** until consolidated develop validation.

## CR-2 evidence-chain acceptance (NOT EXECUTED)

- A changed JS/TS dependency must expose dependency → importing file
  hops, adapter/version, relation type, checked Git baseline and the
  final memory fact citation, without any additional Git lookup.
- .NET ProjectReference, PHP include and Python import paths expose
  the matching adapter or declare missing/dynamic coverage.
- Forged, reordered, unsafe or missing hop data and wrong revisions
  result in `partial`, not manufactured evidence or a false HEAD.
- Without `--explain`, dependency-impact stays backward compatible;
  normal finding IDs do not change, output remains size-bounded.
- Check Windows/Linux, privacy, no memory mutation and no false user
  notification, as part of the consolidated develop validation.
- Tests authored; **do not mark PASS before execution**.

## CR-3B answer-level disclosure gate — release-blocking (PLANNED)

**Community report:** an excluded stale fact must not silently disappear
when the answer materially touches that fact. This gate is **not**
implemented, and no answer-level agent test has been executed.

- In controlled task fixtures, retrieve relevant memory with the
  standard trust filter and `--explain` evidence. Where a relevant
  matched fact is withheld, the agent's **actual final answer**
  must mention the exclusion, cite safe checked source/dependency
  evidence, explain uncertainty and identify the needed verification.
- Negative control: unrelated withheld facts should not generate
  extraneous warnings. Group repeated findings; avoid leaking
  sensitive note text, adversarial prompts or full raw diagnostics.
- Direct source changed and indirect imported dependency changed
  must both trigger correct answer-level review when task relevant.
  Byte drift must not be described as proof of semantic conflict.
- Missing Git, unavailable commit, unsupported language, truncated
  scan and ambiguous relevance remain uncertain; no false
  `all-clear` or invented delivery confirmation.
- **Acceptance evidence:** record the real generated answer and
  check it for meaningful, accurate disclosure. A PASS from
  `health`/`doctor`, a JSON diagnostic or an instruction bridge
  alone does **not** pass this gate. Missing a relevant warning
  in a generated answer is a **release-blocking FAIL**.
- Distinguish `diagnostics_generated`, `warning_in_agent_response`
  and `host_delivery_observed` in test logs. The latter may be
  `not-observed`; do not claim the user saw a message without
  authenticated host evidence.
- Repeat with real Codex/Claude/Gemini/Roo responses where supported,
  on **native Windows, Linux and macOS**. An untested host/OS
  combination is **UNVERIFIED**, never implicitly PASS.

**Implementation status:** planned; no runtime gate, host hook or
universal answer interceptor is currently implemented. This
criterion must be developed, run and evaluated before
`develop` can be promoted to `main`.
[Detailed specification](architecture/answer-level-disclosure-gate.md).

## CR-3 host disclosure protocol (NOT EXECUTED)

- Validate `disclosure-contract` introspection without a project,
  with Codex, Claude, Gemini and Roo instruction bridges and no
  invented delivery telemetry or user notification state.
- Verify `init --agent all` creates marked AGENTS.md and native
  bridges, preserves existing project rules and is idempotent; `auto`
  never creates unrelated native files or follows unsafe symlinks.
- The `--explain --json` protocol must remain agent guidance only;
  detect a relevant source-drift warning but never claim it was
  displayed to the user or that semantic contradiction is proven.
- Verify unchanged default JSON and trusted fact filtering, no
  user-notification API calls, no memory file rewrite, and no secrets.
- Test small `--max-bytes` responses retain `user_delivery: not-observed`
  after optional guidance truncation; candidacy may be incomplete.
- Test Windows/Linux paths and real host instruction loading separately:
  a generated bridge is **not** proof a host actually obeyed it.
- All assertions are authored, **not run** before consolidated develop
  acceptance. No hosted GitHub Actions.

## Platform matrix (release-blocking for macOS support)

The same commit of develop must be checked with **native Node.js 22+
and Git on all three operating-system families**, not only a Linux
container emulating a different platform:

| Platform | Minimum evidence | Status |
|---|---|---|
| Windows 11 PowerShell (NTFS) | All Node suites + Git index/staging, symlink and native path tests | NOT RUN for current develop |
| Linux (ext4 or equivalent) | All Node suites + privacy/symlink and source drift tests | NOT RUN for current develop |
| **macOS** (Apple Silicon preferred; Intel if available) | All Node suites + native Git, APFS casing/Unicode, symlinks, paths and RD-4 cache tests | **NOT RUN — mandatory before main merge** |

Record OS version, CPU architecture (`process.arch`), filesystem
case sensitivity, Node and Git versions, exact develop SHA, test
exits/skips and `--cache` effects. On macOS use native Terminal /
zsh only to invoke Node and Git, not Linux-specific CLI flags or WSL.
Do not claim macOS validated until those tests have actually run
on a real macOS host.

## RD-4 alias hint and parse-cache acceptance (NOT EXECUTED)

- With `--deps --semantic`, resolve one exact literal JS/TS alias
  from tsconfig/jsconfig to a checked file. An edit to its target OR
  config must flag the cited source/fact. Reject extends, globs,
  dynamic package resolution and invalid/unsafe config as incomplete.
- With `--cache`, write only private, ignored parser tokens. Run
  again and check content/version-keyed entries are independently
  re-parsed. Corrupt/forged cache files cannot create false
  verified edges. Canonical memory facts and Git verification
  must never come from a cache.
- Without explicit options, default result shapes/read-only
  behavior remain unchanged. Validate flag misuse and symlinks,
  Unicode/case-sensitive filesystems, nested manifests,
  index-only/assume-unchanged changes and historical/deleted paths.
- Compare actual elapsed time and complete input/output tokens
  with caching on/off for the same project/task. Parser stats or
  byte counts are **not** proof of token/latency savings.
- Node tests authored, **NOT RUN**. No GitHub Actions or hosted
  runners used; release still blocked until macOS/Windows/Linux
  and host-level acceptance are complete.

## CR-4 task-scoped disclosure UX (NOT EXECUTED)

- Deterministic groups: identical changed sources are grouped with
  stable IDs; new warnings are prioritized, previously agent-seen
  findings remain visible/unresolved, and brief/detail modes do not
  disclose raw fact text or secrets.
- Read-only `disclosure-summary` never writes metadata; explicit
  `disclosure-mark-seen` validates current finding ID and exact Git
  HEAD, stores no raw claim, uses `wx` private ignored records and
  remains idempotent within the same evidence/time window.
- Verify task isolation, evidence/HEAD binding, seven-day expiration,
  marker tamper/symlink/path traversal rejection and no false user
  notification or memory fact revalidation.
- Check incomplete scan, missing Git, truncation, hostile values and
  `--max-bytes` budget, Windows/Linux paths and multi-agent concurrency.
- Real byte and token cost A/B comparisons must be measured, not
  inferred from the number of grouped warnings.
- Test cases are **authored only**; run the consolidated gate before
  develop -> main. No GitHub Actions or hosted runners.
