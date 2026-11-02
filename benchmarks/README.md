# Benchmark plan and status

**Status: planned; no complete real-model A/B dataset or savings percentage published.**

Unit tests use synthetic counters to verify arithmetic and adapters. Installer checks verify
packaging. The handoff exercise validates one workflow. None is a token-economy benchmark.

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
