# Consolidated acceptance gate: develop -> main

**Status: partially executed locally on Windows.** The Node.js acceptance suites
for the implementations integrated into develop pass on the validation branch.
Python parity was skipped by the Node harness, and the legacy Bash/Python helper
suite remains incomplete because Git Bash cannot start in the current Windows
environment. This checklist remains separate from the published main branch.

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
```

Executed on the validation branch: Windows isolated Git PATH,
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

CPython 3.9+ is required for meaningful parity results. The current Node
parity test skipped because it did not discover CPython through its optional
`python3` lookup; this does **not** prove Node and Python agree. The full
Python suite was attempted with CPython 3.12, but Bash-dependent helpers
remain unvalidated because Git Bash returned `Bash/E_ACCESSDENIED`.

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
