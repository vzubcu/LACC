# lean-context-memory v2.3

Compact, source-backed project memory and bounded dependency exploration for coding agents.
This version adds explicit retention rules, read-only validation, safer synchronization and usage measurement.
It does not promise a token-saving percentage or a resolved dependency graph.

The memory core is independent of Codex and of any model provider.
Requires Bash, Git and Python 3.9+; ripgrep is optional.
Invoke helpers through `bash` or `python3`; executable bits are not required.

## Agent compatibility

The same SKILL.md, scripts and memory files are shared by every agent; only its instruction entry point differs.

| Agent | Native entry point | Bootstrap option |
|---|---|---|
| Codex / AGENTS-compatible agents | `AGENTS.md` | `--agent codex` |
| Claude Code | `CLAUDE.md` | `--agent claude` |
| Gemini CLI | `GEMINI.md` | `--agent gemini` |
| Roo Code | `.roo/rules/lean-context-memory.md` | `--agent roo` |
| Other agents | Load SKILL.md and the project protocol explicitly | default `--agent auto` |

The entry points follow the [Claude Code](https://code.claude.com/docs/en/memory),
[Gemini CLI](https://geminicli.com/docs/cli/gemini-md/) and
[Roo Code](https://docs.roocode.com/features/custom-instructions) instruction conventions.
An explicit option creates the selected native file; `all` creates all listed files.
The common protocol is stored once in AGENTS.md; native files contain short bridges and preserve unrelated rules.
Default `auto` creates AGENTS.md and updates existing native files without creating other agents' configuration.
The skill folder must remain readable to the agent; bootstrap does not install or launch any agent application.

Agents use their own read/search/edit/terminal tools; no OpenAI SDK or Codex executable is needed.
An environment without terminal access can follow the Markdown workflow manually, but must leave helper checks unverified.
Helper integration tests run in temporary Git projects on the available Linux runtime; these are not end-to-end
certifications of each agent client or of Windows. On Windows, provide Bash (Git Bash or WSL), Git and Python 3.9+.

## Initialize or upgrade

Place the skill where your coding agent loads skills, then ask it to initialize `lean-context-memory`.
From the target project root, it runs:

```bash
bash /path/to/lean-context-memory/scripts/init-memory.sh . --agent claude
```

The script creates missing memory files and idempotently updates the common marked protocol in AGENTS.md
and the selected/existing native bridges, preserving existing memory and unrelated instructions.
Preflight rejects symlinked/escaping destinations and ambiguous markers before writing.
The agent must populate real facts; placeholders remain unverified and HEAD is not stamped automatically.

For a v2.2 project, run initialization again and migrate durable topic bullets to the evidence format below.
Validate each topic before relying on it; do not invent source paths or historical verification commits.
Budget defaults can be adjusted during this one-time migration when valid knowledge needs more space.

## Memory workflow

| File | Role | Default limit |
|---|---|---|
| `memory/MEMORY_INDEX.md` | Derived summary and domain pointers | 60 lines |
| `memory/ACTIVE_STATE.md` | Current task, pending checks and checkpoint | 30 lines AND 2048 UTF-8 bytes |
| `memory/topics/*.md` | Confirmed reusable domain facts | 4096 bytes each, 16384 bytes combined |

Load the index/checkpoint once, then only the topics relevant to the current task.
Retain confirmed, reusable facts worth rediscovering: contracts, invariants, verified commands and root causes.
Keep guesses, raw logs and transient progress out of durable topics.

Each topic fact is one bullet with project-relative source files and the commit at which it was checked:

```markdown
- [Request] --(tenant isolation)--> [Guard] | source: `src/auth/tenant.ts` | verified: `a1b2c3d`
- [Publisher] --(cents payload)--> [Worker] | source: `src/publish.ts`, `src/worker.ts` | verified: `a1b2c3d` | state: review
```

Use real commits and file paths; `state: review` retains the last confirmed commit while checks are pending.
The checker treats any source-file diff conservatively as a review signal; it does not decide whether a fact remains true.
A rename/deletion requires corrected provenance or a justified obsolete decision.
Replace stale facts in place and remove proven obsolete entries/exact duplicates.
Preserve security and data-integrity invariants; neither age nor budget pressure alone authorizes deletion.

Optional `memory/.memory-budget.json`:

```json
{"topic_bytes": 8192, "topics_total_bytes": 32768}
```

Both supported values must be positive integer byte counts; index/checkpoint limits stay fixed.
These are storage guardrails, not token measurements.

```bash
bash /path/to/lean-context-memory/scripts/sync-memory.sh .
python3 /path/to/lean-context-memory/scripts/memory-health.py .
```

The health check never writes: it reports budgets, changed/untracked/missing sources, missing/unavailable
provenance, pending review and exact duplicate topic facts, counting all findings before limiting display.
Exit codes: `0` checks passed, `1` review needed, `2` invalid invocation/config/check failure.
It does not validate the semantic truth or completeness of the facts.

After reviewing affected facts and passing relevant application tests:

```bash
bash /path/to/lean-context-memory/scripts/sync-memory.sh . --stamp
```

Stamping refuses dirty source files or failed structural checks; it records a commit, not proof of application correctness.
If the application remains uncommitted, update the pending checkpoint and leave Last Synced Commit unchanged.
Without Git history, modification-time hints cannot verify source freshness.

## Adaptive dependency exploration

```bash
bash /path/to/lean-context-memory/scripts/dep-graph.sh src/checkout.ts publishCheckout
bash /path/to/lean-context-memory/scripts/dep-graph.sh src/publish.ts --signal checkout.ready --limit 40 --max-bytes 5000
```

Start with direct import/reference candidates; expand by a named event, contract, DI registration, schema or failed test.
An unchanged TypeScript signature does not prove unchanged units or behavior.
`--signal` is a repeatable literal search, not a recursive call-graph traversal.
Inspect relevant neighbor signatures and one further hop first; follow additional evidence when correctness requires it.
Record why you expanded.

References are deduplicated by file/line; output defaults to 40 references and 5000 UTF-8 bytes.
The helper respects inventory ignore rules, skips dependency/build/memory directories and files over 1 MiB,
and discloses skipped files/truncation.
It uses ripgrep's file inventory, falling back to Git or a filesystem walk.
Resolve incomplete coverage with narrower local searches before claiming the blast radius is understood.

## Measure actual savings

Use paired end-to-end runs; do not infer token savings from lines, bytes or compressed text length.
The tool below imports reported usage and compares measurements; it does not launch or fund model runs.

1. Choose fixed tasks: a source rename, an event-consumer change and an overflowing-memory handoff.
2. Prepare identical code, initial memory and acceptance checks for each variant.
3. Run separate comparisons: no skill vs v2.3, and v2.2 vs v2.3.
4. Keep exact model version, reasoning settings, agent/tool versions and permissions fixed; record them in `config_id`.
5. Use a fresh session for each run; include skill loading, bootstrap/sync where applicable, exploration, retries,
   memory maintenance, compaction and final validation.
6. Alternate/randomize variant order and collect at least five matched repetitions per task.
7. Evaluate both outputs with the same acceptance checks; record failed/unverified runs rather than dropping them.
8. Keep cold-start and warmed-memory/cache experiments separate.
   Providers may cache shared prefixes even in a cold project run; record actual cached counts rather than assuming zero.

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

Run no-skill/v2.2/v2.3 comparisons separately within each agent and exact model/configuration.
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

## Validate the helpers

```bash
python3 -m unittest discover -s tests -v
bash -n scripts/init-memory.sh scripts/sync-memory.sh scripts/dep-graph.sh scripts/ctx-slice.sh scripts/ast-skeleton.sh
```

Tests exercise temporary Git projects, rename/drift checks, retention without writes, budget failures,
indirect event lookup, bootstrap idempotence and usage-accounting edge cases.
The behavioral handoff scenario is recorded under `tests/scenarios/`.
