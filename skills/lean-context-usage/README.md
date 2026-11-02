# Measure lean-context-memory

This optional skill compares reported usage; it does not launch model runs, collect billing,
or automatically capture every agent client's logs. No real-model A/B savings result has been
established by this repository's synthetic tests.

## Install

```bash
npx skills add vzubcu/lean-context-memory-skill --skill lean-context-usage
```

Requires Python 3.9+. Locate the installed skill directory through your agent or `npx skills list`.
Run the following relative script commands from that skill directory; a checkout uses
`skills/lean-context-usage/`.

## First comparison

Choose a fixed task and application commit. Run the same task with no skill and with memory v2.4,
using fresh sessions and identical model/tool settings. Include initialization and all maintenance;
validate each output with the same application tests. For native-memory comparisons, explicitly
record which native features are enabled in each arm. See the [protocol](references/benchmark.md)
for warm memory, repeat counts, retries, cache and delegated-work rules.

For complete fresh Codex CLI session logs, normalize a baseline run:

```bash
python3 scripts/usage-report.py capture-codex /path/to/baseline-session.jsonl \
  --task-id event-change --pair-id 1 --model EXACT_MODEL_VERSION \
  --fixture-commit COMMON_APPLICATION_COMMIT --config-id SAME_HARNESS_ID \
  --cache-mode cold --quality passed > baseline.jsonl
```

Repeat with the skill run's log and the same matched identifiers, saving `optimized.jsonl`.
Use `--quality passed` only after acceptance checks actually pass; retain `failed`/`unverified`
runs. For more pairs, append one normalized record per unique task_id/pair_id in each file.
Never overwrite or drop expensive/failed repetitions to improve the comparison.

For other hosts, export final provider responses into `capture-api --format ...`, or supply
the documented normalized schema. Format support does not imply the host exposes those responses.
If the host does not expose complete usage, report that limitation rather than estimate tokens from bytes.

```bash
python3 scripts/usage-report.py compare baseline.jsonl optimized.jsonl --json
```

## Read the output

| Output | Interpretation |
|---|---|
| `baseline` / `optimized` | Complete-run input/output/total and cache counters |
| `savings_pct.total_tokens` | Percentage reduction in cumulative token volume; can be negative |
| `median_paired_total_savings_pct` | Typical paired change; also inspect per-task results |
| `paired_total_savings_range_pct` | Observed variation; not a confidence interval |
| `peak_input_tokens` | Largest observed main-session input; a context proxy |
| `quality_counts` / `comparable` | Acceptance status; failures block savings claims |

Cached tokens are already included in input. Report cost separately with explicit appropriate
rates; the simple price model does not support cache writes. A smaller instruction file or an
8192-byte recall cap is an implementation property, not an observed token-saving percentage.

Publish only sanitized reproducibility metadata and aggregate results. Keep prompts, source
content, credentials and raw traces private unless deliberately cleared for publication.
