# Benchmark plan and status

**Status: planned; no complete real-model A/B dataset or savings percentage published.**

Unit tests use synthetic counters to verify arithmetic and adapters. Installer checks verify
packaging. The handoff exercise validates one workflow. None is a token-economy benchmark.

## Memory v3.1 triage correctness (offline)

Run the regression tests locally, with no model calls or GitHub Actions:

```bash
python3 -m unittest discover -s tests -p 'test_memory_doctor.py' -v
python3 -m unittest discover -s tests -p 'test_memory_search.py' -v
```

The tests cover stale source detection, invalid keys, review-state facts,
key-based potential-conflict reporting, exclusion of conflict groups from
default search, retained keys after selected revalidation, read-only
behavior and bounded output. An explicitly keyed conflict is only a
**candidate for semantic review**, not proof that either fact is false.

The regression fixture is synthetic: it does not measure production conflict
precision/recall, false-positive rates, agent quality or model-token savings.
These require independently reviewed project evidence and matched real agent
sessions. Neither the doctor nor the retrieval tool records token usage.

## Memory v3.0 retrieval quality (offline)

The local test `tests/test_memory_search.py` contains a deliberately
synthetic **3-query Recall@5 acceptance fixture**, covering source-backed
architecture, decisions and lessons. It also checks deterministic rank,
UTF-8 output budgets, stale-source fail-closed behavior and review labels.

Run without model/API usage or GitHub Actions:

```bash
python3 -m unittest discover -s tests -p 'test_memory_search.py' -v
```

This fixture is a regression test, **not empirical project-wide recall or
token savings**. A meaningful later recall study requires independently
labeled questions from real projects, fixed memory snapshots and ranking
metrics such as Recall@5, stale-fact exposure and output bytes. Measure total
agent tokens separately using complete paired model sessions. No percentage
for either quality or token savings is published from these synthetic cases.

## Initial pilot

Run three fixed tasks with five matched repetitions per task, in separate fresh sessions:

| Task | Acceptance evidence |
|---|---|
| Small source rename | Correct imports/references and the same application tests pass |
| Event payload/unit change | Producer/consumer checks pass and no consumer is silently omitted |
| Memory handoff/maintenance | Invariants, evidence and pending checks survive; no false stamp |

Compare no skill vs v2.4 first: 3 tasks × 5 pairs × 2 arms = 30 complete runs for one
agent/model/configuration and one cold/warm regime. This is a proposed pilot size, not work
already executed. Add native-memory vs v2.4 and v2.3 vs v2.4 comparisons separately. Measure
cold initialization and warmed-memory regimes independently, including maintenance overhead.

Alternate/randomize arm order. Keep application fixtures, task prompts, exact model version,
reasoning settings, tools, permissions and acceptance checks matched. Reset mutable memory
between repetitions. Equivalent warm knowledge must be documented in each arm's native format.
Record which native auto-memory features are enabled; avoid accidental double-memory treatment.

## Optional Rider pilot (total tokens only)

For Claude Agent inside Rider using JetBrains AI, Session explorer can expose
per-session total tokens when that analytics view is available. Use the
standalone `scripts/session-totals.py` comparator; do not convert context-window
percentages or AI Credits into token estimates. Use separate matched sessions,
the same model/configuration/fixture, a settled total and independently
verified quality. The schema, example and constraints are documented in the
[benchmark protocol](../skills/lean-context-memory/references/benchmark.md#jetbrains-rider-agent-session-totals).
If totals cannot be obtained, the experiment is unmeasured.

Codex `exec --json` uses `usage-report.py capture-codex-exec`, not
`capture-codex` (which handles internal rollout logs).

## Dataset and report contract

Use the optional usage tooling bundled with [lean-context-memory](../skills/lean-context-memory/README.md)
and its [measurement protocol](../skills/lean-context-memory/references/benchmark.md).
Each dataset needs a sanitized experiment manifest with application fixture revision,
installed skill revisions, exact agent/model/configuration, variant definition, prompts or
safe prompt identifiers, initialization/warm-state preparation, execution order, trace-coverage
notes and independent acceptance results. Provider aliases alone are not exact model identities.

Keep all repetitions, including failures and increased usage. Compare whole-run reported
input/output/cache counts; include every retry and child agent or disable delegation in both arms.
Report each task and the aggregate, paired median/range, sample size and quality pass counts.
Peak observed main-session input is a context proxy, not exact free context capacity.
Report costs separately because cache reuse, output mix and rates may change the conclusion.

Five pairs are an initial observation, not a general guarantee or a significance threshold.
Future published claims must identify the dataset, agent/model, tasks, cache regime and limitations.
Raw traces may contain private source, prompts or secrets; they are not automatically public artifacts.
