# Measure actual savings

## Contents

- [Matched runs](#matched-runs)
- [API usage](#capture-reported-api-usage-from-any-agent)
- [Codex logs](#optional-capture-a-complete-codex-cli-session)
- [Interpretation](#read-the-result)

## Matched runs

Run the relative `scripts/usage-report.py` examples below from this skill directory,
or replace the script path with its installed absolute path.

Use paired end-to-end runs; do not infer token savings from lines, bytes or compressed text length.
The tool below imports reported usage and compares measurements; it does not launch or fund model runs.

1. Choose fixed tasks: a source rename, an event-consumer change and an overflowing-memory handoff.
2. Prepare identical application code, task prompts and acceptance checks. Cold-start variants
   begin without learned facts. Warm variants start with equivalent verified facts in their
   respective memory formats; record preparation and reset state between repetitions.
3. Primary comparison: no skill vs v2.4. Also compare native agent memory vs v2.4 and,
   separately, v2.3 vs v2.4. Define whether native auto-memory is enabled in each arm;
   do not accidentally give the skill arm a second hidden memory store.
4. Keep exact model version, reasoning settings, agent/tool versions and permissions fixed;
   record the unchanged harness configuration in `config_id`. The intentionally varied memory
   treatment is the experiment arm, not a reason to assign mismatched config_id values.
5. Use a fresh session for each run; include skill loading, bootstrap/sync where applicable, exploration, retries,
   memory maintenance, compaction and final validation.
6. Alternate/randomize variant order and collect at least five matched repetitions per task.
7. Evaluate both outputs with the same acceptance checks; record failed/unverified runs rather than dropping them.
8. Keep cold-start and warmed-memory/cache experiments separate.
   Providers may cache shared prefixes even in a cold project run; record actual cached counts rather than assuming zero.

Five pairs per task is an initial observation, not proof of a general improvement. Report per-task
results, including small one-off tasks where startup overhead may dominate. Record source revision
and installed skill revision, agent version, prompts, order, acceptance results and trace completeness
alongside each dataset. `fixture_commit` identifies the common application fixture; keep variant-specific
instruction/install changes in the experiment manifest rather than changing that matched identity.

The comparator checks supplied labels and counters; the operator must independently run the same
acceptance tests. For failed or unverified runs it reports usage and blocks a savings percentage.

For an initial benchmark, disable subagent delegation in both variants.
Parent-only logs undercount delegated work: the importer rejects observed spawn-agent calls.
For delegated benchmarks, aggregate all agent usage externally into the normalized format below.
Peak input must still describe the main session; this importer does not collect child sessions automatically.

### Capture reported API usage from any agent

`capture-api` consumes JSONL containing one final non-streaming provider response per request.
Export these complete responses from the agent's API harness; host-specific session logs are not automatically API responses.
The collector imports records locally and makes no model/API requests.

```bash
python3 scripts/usage-report.py capture-api provider-responses.jsonl --format anthropic \
  --task-id source-rename --pair-id 1 --model EXACT_REPORTED_MODEL_VERSION \
  --fixture-commit FIXTURE_COMMIT --config-id AGENT_VERSION_EFFORT_TOOLS_ID \
  --cache-mode cold --quality passed > baseline.jsonl
```

| Format | Required response shape | Accounting |
|---|---|---|
| `openai-responses` | `id`, `model`, `usage` and input cache details | Input already includes cache; output already includes reasoning |
| `openai-chat` | `id`, `model`, `usage` and prompt cache details | Prompt/completion counts normalize to input/output |
| `anthropic` | `id`, `model`, `usage` | Input = uncached input + cache reads + cache writes; output remains inclusive |
| `gemini` | `responseId`, `modelVersion`, `usageMetadata` | Input = prompt + tool-use prompts; output = candidates + thoughts |

Terminal metadata is required: OpenAI response status, chat finish reasons, Anthropic stop_reason, or Gemini finish/block reasons.
Partial/streaming snapshots are rejected; terminal truncations/refusals still count because their usage was consumed.
Identical snapshots of the same response id are counted once; conflicting duplicates, missing usage and model changes fail.
Models must match the exact reported version; provider aliases and opaque host summaries need explicit external normalization.
Anthropic normalization follows its [cache accounting](https://platform.claude.com/docs/en/build-with-claude/prompt-caching#tracking-cache-performance);
OpenAI and Gemini fields are documented in the official
[OpenAI response usage type](https://github.com/openai/openai-python/blob/main/src/openai/types/responses/response_usage.py)
and [Google SDK usage metadata](https://github.com/googleapis/python-genai/blob/main/google/genai/types.py).
Cache-write tokens are retained; simple three-rate cost estimation remains unavailable when writes are nonzero.

Run no-skill/native-memory/v2.3/v2.4 comparisons separately within each agent and exact model/configuration.
Include the agent version in config_id; different model tokenizers do not provide interchangeable token units.
The importers cannot prove that an external harness exported every retry, server-side request or child agent;
the benchmark operator must ensure whole-run coverage. Unsupported logs fail or require the normalized schema below.

### Optional: capture a complete Codex CLI session

```bash
python3 scripts/usage-report.py capture-codex /path/to/baseline-session.jsonl \
  --task-id source-rename --pair-id 1 --model EXACT_MODEL_VERSION \
  --fixture-commit FIXTURE_COMMIT --config-id HARNESS_EFFORT_TOOLS_ID \
  --cache-mode cold --quality passed > baseline.jsonl

python3 scripts/usage-report.py capture-codex /path/to/optimized-session.jsonl \
  --task-id source-rename --pair-id 1 --model EXACT_MODEL_VERSION \
  --fixture-commit FIXTURE_COMMIT --config-id HARNESS_EFFORT_TOOLS_ID \
  --cache-mode cold --quality passed > optimized.jsonl

python3 scripts/usage-report.py compare baseline.jsonl optimized.jsonl --json
```

Use `--quality passed` only after checking actual acceptance results; default quality is unverified.
For subsequent repetitions, append one record per unique task/pair to the appropriate file.
Optional `--duration-ms` accepts the harness's measured whole-run elapsed time; session timestamps are not used
because they may include user idle time.

The importer reads `event_msg/token_count` cumulative and last-request counters, ignores repeated counter snapshots,
and rejects resets, incomplete/synthetic updates and observed model changes.
It supports the [Codex protocol usage fields](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs);
unsupported trace formats fail explicitly rather than fabricating measurements.
It cannot recover usage that the host does not expose.

Other providers can produce the same normalized JSONL schema.
This is an invented schema example, **not a benchmark result**:

```json
{"task_id":"source-rename","pair_id":"1","model":"EXACT_MODEL_VERSION","fixture_commit":"FIXTURE_COMMIT","config_id":"HARNESS_EFFORT_TOOLS_ID","cache_mode":"cold","quality_passed":true,"source":"provider_usage","trace_path":"private-local-trace.jsonl","duration_ms":1200,"usage":{"input_tokens":1000,"cached_input_tokens":400,"output_tokens":200,"peak_input_tokens":600}}
```

`input_tokens` includes cached input; `output_tokens` includes any reasoning charged as output.
Do not add cached input or reasoning a second time.
For delegated runs, cumulative counts must include every agent; peak input is the main session's observed request maximum.
The comparator trusts supplied provenance/acceptance labels; it cannot independently audit external billing or quality.

### Read the result

| Metric | Meaning |
|---|---|
| Cumulative input/output/total | Token volume across the complete run, including repeated context |
| Cached and uncached input | Cache reuse and its effect on billing; cached input is a subset |
| Peak observed input | Main-session context proxy; not exact occupancy or the context-window capacity |
| Paired median/range | Variation across matched runs; not a statistical-significance claim |
| Whole-run duration | Harness measurement, available only when supplied |
| Estimated cost | Optional estimate from explicit rates, not the provider's invoice |

Savings = `(baseline - optimized) / baseline × 100`; negative values mean increased usage.
A zero baseline yields no percentage.
Task/pair sets, model, fixture, configuration and cache regime must match.
Any failed/unverified quality check blocks aggregate savings claims; fewer than five repetitions per task are marked pilot.
Raw measurements remain visible, including increased output or lower cache reuse.

For price estimates, explicitly supply current per-million uncached-input, cached-input and output rates:

```bash
python3 scripts/usage-report.py compare baseline.jsonl optimized.jsonl \
  --input-rate INPUT_RATE --cached-input-rate CACHED_RATE --output-rate OUTPUT_RATE
```

No prices are hardcoded; nonzero cache-write usage makes this simple cost model unsupported.
Keep raw traces and benchmark results local: they can contain source code, prompts and secrets.
No valid A/B savings percentage has been established by the included synthetic integration fixtures.

