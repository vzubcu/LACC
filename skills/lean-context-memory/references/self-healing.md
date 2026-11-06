# Memory v3.1 — safe self-healing triage

Memory v3.1 diagnoses what should be investigated. It **does not** repair facts
automatically: source hashes and lexical differences cannot establish semantic truth.
There is no background worker, model invocation, embedding index, or hidden write.

## Canonical optional identities

Existing fact bullets remain valid unchanged. To express that multiple claims
describe **one stable design question**, attach a lower-case dotted key:

```markdown
- Tenant scoping is mandatory | source: `src/auth.ts` | verified: `CHECKED_COMMIT` | key: auth.tenant.scoping
```

The example is illustrative: replace `CHECKED_COMMIT` with an actual checked
Git revision, never a guessed or placeholder hash. `key` is optional, max
96 ASCII characters, and permits lower-case letters, digits, underscores,
hyphens and dots (each segment starts with a letter). Apply one key only to
claims expected to describe the same rule, not complementary statements.

Different assertion text under the same key is reported as
`potential-conflict`, **not** a confirmed contradiction. Identical normalized
assertions from different source paths do not conflict merely because their
metadata differs.

For a flagged key:
- Check each recorded source at its verified revision and against current code.
- Determine whether the claims disagree, describe distinct conditions, or
  require narrower keys. Run relevant checks.
- Change/remove obsolete claims only in a reviewed diff; do not delete
  independently valid security invariants or decisions.
- Never select the newest verified commit as the automatic winner.
- Run memory-health.py and relevant tests before stamping ACTIVE_STATE.

## Diagnose and propose review actions

Run on demand after health warnings or a major refactor:

```bash
python3 <skill_dir>/scripts/memory-doctor.py . --json
python3 <skill_dir>/scripts/memory-doctor.py . --limit 10 --max-bytes 4000
```

`memory-doctor.py` is read-only. It reports issue types, affected topic lines,
candidate source paths and safe review actions without printing raw file
contents or rewriting memory.

| Code | Meaning | Human/agent next step |
|---|---|---|
| potential-conflict | Different assertions share a key | Compare claims against current behavior |
| changed-source | Git index/worktree differs from verification | Inspect code/tests; revise or explicitly revalidate |
| untracked-source | Source not in the Git index | Commit and verify real provenance |
| missing-source / unsafe-source | Missing/unsafe reference | Find and check safe replacement evidence |
| unavailable-commit | Recorded revision unavailable | Investigate history, never invent a revision |
| pending-review | Claim explicitly unresolved | Verify or leave pending |
| invalid-fact | Invalid bullet metadata | Repair grammar and provenance |

Exit codes: 0 healthy, 1 review required or incomplete scan, 2 tool/config error.
JSON provides issue counts, actions, `scan_incomplete` and `output_truncated`.
Response budgets use project `load_bytes` (default 8192) or
`--max-bytes` (minimum 512). Scans are capped at 16 MiB across topics,
1 MiB per topic and 1000 accepted facts. Incomplete coverage is disclosed;
absence of an issue in an incomplete scan is **not** evidence of safety.

`memory-health.py` remains authoritative for structural checks,
unsupported prose, index/checkpoint limits and complete provenance.
The doctor is a bounded, supplemental triage tool.

## Human-reviewed repair

After inspecting current source code and relevant passing tests:

```bash
python3 <skill_dir>/scripts/memory-maintain.py revalidate . --topic architecture.md --line 5 --reviewed
```

This prints a preview and `Plan: DIGEST`. Apply only the reviewed selection:

```bash
python3 <skill_dir>/scripts/memory-maintain.py revalidate . --topic architecture.md --line 5 --reviewed --apply --expect DIGEST
```

Selected revalidation retains optional `key` metadata and never
invents a new claim. It cannot resolve conflicts between separate facts:
reconcile the actual text manually, inspect the diff and rerun health.
Do not stamp the checkpoint while health or required tests are failing.

## Retrieval protection

`memory-search.py` withholds keyed facts belonging to potential-conflict
groups. `--include-review` displays them only as review candidates.
If a topic was skipped by scan limits, keyed facts are conservatively flagged
because an omitted claim might disagree. This is a lexical/structural guard,
not a semantic proof.

The doctor never runs automatically on every task and requires no provider
keys, daemon, vector database, GitHub Actions or hosted runners.
