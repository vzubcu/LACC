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
