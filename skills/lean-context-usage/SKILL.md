---
name: lean-context-usage
description: Use when comparing agent token usage, evaluating context-memory overhead, or importing reported provider usage for a reproducible benchmark.
---

# Lean Context Usage v2.4

Compare complete matched runs using reported usage. This optional companion needs Python 3.9+;
it works independently of lean-context-memory and makes no API calls.

1. Read [benchmark protocol](references/benchmark.md) before running a comparison.
2. Keep task, fixture, exact model/configuration, acceptance checks and cache regime matched.
   Include instruction loading, bootstrap, maintenance, retries, compaction and all agent usage.
3. Export normalized JSONL, complete fresh Codex CLI token_count logs, or final non-streaming
   OpenAI/Anthropic/Gemini API responses. Host logs are not automatically raw API responses.
   Use `python3 <skill_dir>/scripts/usage-report.py --help` for supported importers.
4. Compare normalized records:
   `python3 <skill_dir>/scripts/usage-report.py compare baseline.jsonl optimized.jsonl --json`.
5. Report cumulative input/output, cache usage, main-session observed peak input, quality failures
   and paired variation. Peak input is a proxy, not exact context occupancy. Cached input is already
   included in input. Failed/unverified acceptance blocks savings claims.

Keep raw traces private. The tool trusts completeness/acceptance supplied by the harness; it cannot
audit billing or recover hidden usage. Provider adapters are format support, not certified client
integrations. No measured skill-saving percentage is established by the synthetic unit tests.
