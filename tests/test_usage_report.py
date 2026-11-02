import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "skills/lean-context-usage/scripts/usage-report.py"


class UsageReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write_rows(self, name, rows):
        path = self.root / name
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        return str(path)

    def run_tool(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *args], text=True, capture_output=True)

    def row(self, **overrides):
        result = {"task_id": "rename", "pair_id": "1", "model": "fixed-model-version",
                  "fixture_commit": "fixed-code-fixture", "config_id": "same-harness-effort-tools", "cache_mode": "cold", "quality_passed": True,
                  "source": "provider_usage", "trace_path": "raw-trace.jsonl", "duration_ms": 100,
                  "usage": {"input_tokens": 1000, "cached_input_tokens": 400,
                            "output_tokens": 200, "peak_input_tokens": 600}}
        result.update(overrides)
        return result

    def compare(self, before, after, *extra):
        return self.run_tool("compare", self.write_rows("before.jsonl", before),
                             self.write_rows("after.jsonl", after), "--json", *extra)

    def capture_api(self, provider, responses):
        return self.run_tool("capture-api", self.write_rows("api.jsonl", responses), "--format", provider,
                             "--task-id", "rename", "--pair-id", "1", "--model", "fixed-model-version",
                             "--fixture-commit", "fixed-code-fixture", "--config-id", "same-harness-effort-tools",
                             "--cache-mode", "cold", "--quality", "passed")

    def test_openai_responses_and_chat_import_reported_usage_without_reasoning_double_count(self):
        cases = [("openai-responses", {"input_tokens": 100, "output_tokens": 30, "total_tokens": 130,
                                      "input_tokens_details": {"cached_tokens": 40},
                                      "output_tokens_details": {"reasoning_tokens": 20}}),
                 ("openai-chat", {"prompt_tokens": 100, "completion_tokens": 30, "total_tokens": 130,
                                 "prompt_tokens_details": {"cached_tokens": 40},
                                 "completion_tokens_details": {"reasoning_tokens": 20}})]
        for provider, value in cases:
            with self.subTest(provider=provider):
                response = {"id": "request-1", "model": "fixed-model-version", "usage": value,
                            "object": "response" if provider == "openai-responses" else "chat.completion"}
                if provider == "openai-responses":
                    response["status"] = "completed"
                else:
                    response["choices"] = [{"finish_reason": "stop"}]
                result = self.capture_api(provider, [response, response])
                self.assertEqual(result.returncode, 0, result.stderr)
                data = json.loads(result.stdout)
                self.assertEqual(data["usage"]["input_tokens"], 100)
                self.assertEqual(data["usage"]["output_tokens"], 30)
                self.assertEqual(data["usage"]["cached_input_tokens"], 40)
                self.assertEqual(data["usage_updates"], 1)

    def test_anthropic_input_includes_cache_reads_and_writes(self):
        response = {"id": "msg-1", "type": "message", "stop_reason": "end_turn", "model": "fixed-model-version", "usage": {
            "input_tokens": 10, "cache_creation_input_tokens": 20,
            "cache_read_input_tokens": 100, "output_tokens": 30}}
        result = self.capture_api("anthropic", [response])
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["usage"]["input_tokens"], 130)
        self.assertEqual(data["usage"]["cached_input_tokens"], 100)
        self.assertEqual(data["usage"]["cache_write_input_tokens"], 20)
        self.assertEqual(data["usage"]["peak_input_tokens"], 130)
        self.assertEqual(self.compare([data], [data]).returncode, 0)

    def test_gemini_import_includes_thoughts_and_tool_inputs(self):
        response = {"responseId": "gemini-1", "modelVersion": "fixed-model-version", "candidates": [{"finishReason": "STOP"}], "usageMetadata": {
            "promptTokenCount": 100, "cachedContentTokenCount": 40, "candidatesTokenCount": 30,
            "thoughtsTokenCount": 20, "toolUsePromptTokenCount": 10, "totalTokenCount": 160}}
        result = self.capture_api("gemini", [response])
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["usage"]["input_tokens"], 110)
        self.assertEqual(data["usage"]["output_tokens"], 50)
        self.assertEqual(data["usage"]["cached_input_tokens"], 40)

    def test_api_capture_rejects_missing_usage_conflicting_duplicates_and_mixed_models(self):
        response = {"id": "request-1", "object": "response", "status": "completed", "model": "fixed-model-version", "usage": {
            "input_tokens": 10, "output_tokens": 5, "total_tokens": 15, "input_tokens_details": {"cached_tokens": 0}}}
        variants = [[{"id": "missing"}], [response, dict(response, usage={"input_tokens": 11, "output_tokens": 5, "total_tokens": 16})],
                    [response, dict(response, id="request-2", model="different")]]
        for responses in variants:
            result = self.capture_api("openai-responses", responses)
            self.assertEqual(result.returncode, 2)
            self.assertIn("ERROR:", result.stderr)

    def test_partial_or_streaming_provider_usage_is_rejected(self):
        cases = [("openai-responses", {"id": "r", "object": "response", "status": "in_progress", "model": "fixed-model-version",
                  "usage": {"input_tokens": 100, "output_tokens": 1, "total_tokens": 101, "input_tokens_details": {"cached_tokens": 0}}}),
                 ("openai-chat", {"id": "r", "object": "chat.completion.chunk", "model": "fixed-model-version", "choices": [{"finish_reason": None}],
                  "usage": {"prompt_tokens": 100, "completion_tokens": 1, "total_tokens": 101, "prompt_tokens_details": {"cached_tokens": 0}}}),
                 ("anthropic", {"id": "r", "type": "message", "stop_reason": None, "model": "fixed-model-version",
                  "usage": {"input_tokens": 100, "output_tokens": 1}}),
                 ("gemini", {"responseId": "r", "modelVersion": "fixed-model-version", "candidates": [{"finishReason": "FINISH_REASON_UNSPECIFIED"}],
                  "usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 1, "totalTokenCount": 101}})]
        for provider, response in cases:
            with self.subTest(provider=provider):
                result = self.capture_api(provider, [response])
                self.assertEqual(result.returncode, 2, result.stdout)
                self.assertIn("ERROR:", result.stderr)

    def test_terminal_truncation_and_refusal_usage_still_counts(self):
        cases = [("openai-responses", {"id": "r", "object": "response", "status": "incomplete", "model": "fixed-model-version",
                  "usage": {"input_tokens": 10, "output_tokens": 1, "total_tokens": 11, "input_tokens_details": {"cached_tokens": 0}}}),
                 ("openai-chat", {"id": "r", "object": "chat.completion", "model": "fixed-model-version", "choices": [{"finish_reason": "length"}],
                  "usage": {"prompt_tokens": 10, "completion_tokens": 1, "total_tokens": 11, "prompt_tokens_details": {"cached_tokens": 0}}}),
                 ("anthropic", {"id": "r", "type": "message", "stop_reason": "max_tokens", "model": "fixed-model-version",
                  "usage": {"input_tokens": 10, "output_tokens": 1}}),
                 ("gemini", {"responseId": "r", "modelVersion": "fixed-model-version", "promptFeedback": {"blockReason": "SAFETY"},
                  "usageMetadata": {"promptTokenCount": 10, "totalTokenCount": 10}})]
        for provider, response in cases:
            with self.subTest(provider=provider):
                result = self.capture_api(provider, [response])
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout)["usage"]["input_tokens"], 10)

    def test_real_token_totals_do_not_double_count_cached_input(self):
        optimized = self.row(usage={"input_tokens": 700, "cached_input_tokens": 100,
                                   "output_tokens": 250, "peak_input_tokens": 500})
        result = self.compare([self.row()], [optimized])
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["baseline"]["total_tokens"], 1200)
        self.assertEqual(data["optimized"]["total_tokens"], 950)
        self.assertEqual(data["baseline"]["uncached_input_tokens"], 600)
        self.assertEqual(data["optimized"]["uncached_input_tokens"], 600)
        self.assertAlmostEqual(data["savings_pct"]["total_tokens"], 20.833333, places=5)
        self.assertEqual(data["savings_pct"]["output_tokens"], -25)
        self.assertEqual(data["pairs"], 1)
        self.assertIn("pilot", data["note"].lower())

    def test_failed_quality_blocks_claiming_savings(self):
        result = self.compare([self.row()], [self.row(quality_passed=False)])
        self.assertEqual(result.returncode, 1)
        data = json.loads(result.stdout)
        self.assertFalse(data["comparable"])
        self.assertIsNone(data["savings_pct"])

    def test_comparison_requires_matched_tasks_model_revision_and_cache(self):
        for override in [{"model": "different"}, {"fixture_commit": "changed"},
                         {"cache_mode": "warm"}, {"task_id": "different"}, {"config_id": "different-effort"}]:
            with self.subTest(override=override):
                self.assertEqual(self.compare([self.row()], [self.row(**override)]).returncode, 2)

    def test_invalid_measurements_and_duplicate_pairs_are_rejected(self):
        for usage in [{"input_tokens": -1}, {"input_tokens": True}, {"cached_input_tokens": 1001},
                      {"peak_input_tokens": 1001}]:
            row = self.row()
            row["usage"].update(usage)
            self.assertEqual(self.compare([row], [self.row()]).returncode, 2)
        self.assertEqual(self.compare([self.row(), self.row()], [self.row()]).returncode, 2)
        self.assertEqual(self.compare([self.row(source="byte_estimate")], [self.row()]).returncode, 2)

    def test_zero_denominators_do_not_invent_percentage_savings(self):
        row = self.row(usage=dict.fromkeys(["input_tokens", "cached_input_tokens", "output_tokens", "peak_input_tokens"], 0))
        data = json.loads(self.compare([row], [row]).stdout)
        self.assertIsNone(data["savings_pct"]["total_tokens"])

    def test_price_estimate_can_increase_despite_fewer_total_tokens(self):
        row = self.row(usage={"input_tokens": 700, "cached_input_tokens": 100,
                              "output_tokens": 250, "peak_input_tokens": 500})
        result = self.compare([self.row()], [row], "--input-rate", "2", "--cached-input-rate", "0.2", "--output-rate", "8")
        data = json.loads(result.stdout)
        self.assertLess(data["savings_pct"]["estimated_cost"], 0)

    def test_codex_capture_uses_cumulative_usage_and_ignores_duplicate_updates(self):
        def event(total, last):
            return {"type": "event_msg", "payload": {"type": "token_count", "info": {
                "total_token_usage": total, "last_token_usage": last}}}
        one = {"input_tokens": 100, "cached_input_tokens": 20, "output_tokens": 10}
        two = {"input_tokens": 150, "cached_input_tokens": 20, "output_tokens": 30}
        last = {"input_tokens": 50, "cached_input_tokens": 0, "output_tokens": 20}
        trace = self.write_rows("trace.jsonl", [{"type": "turn_context", "payload": {"model": "fixed-model-version"}},
                                               event(one, one), event(two, last), event(two, last)])
        result = self.run_tool("capture-codex", trace, "--task-id", "rename", "--pair-id", "1",
                               "--model", "fixed-model-version", "--fixture-commit", "fixed-code-fixture",
                               "--config-id", "same-harness-effort-tools", "--cache-mode", "cold", "--quality", "passed")
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["usage"]["input_tokens"], 150)
        self.assertEqual(data["usage"]["output_tokens"], 30)
        self.assertEqual(data["usage"]["peak_input_tokens"], 100)
        self.assertEqual(data["usage_updates"], 2)

    def test_capture_rejects_missing_usage_and_counter_resets(self):
        for rows in [[], [{"type": "event_msg", "payload": {"type": "token_count", "info": None}}]]:
            trace = self.write_rows("empty.jsonl", rows)
            result = self.run_tool("capture-codex", trace, "--task-id", "x", "--pair-id", "1",
                                   "--model", "m", "--fixture-commit", "c", "--config-id", "config", "--cache-mode", "cold")
            self.assertEqual(result.returncode, 2)
            self.assertIn("ERROR:", result.stderr)

    def test_capture_blocks_counter_resets_and_parent_only_delegated_usage(self):
        def event(n):
            value = {"input_tokens": n, "cached_input_tokens": 0, "output_tokens": 0}
            return {"type": "event_msg", "payload": {"type": "token_count", "info": {
                "total_token_usage": value, "last_token_usage": value}}}
        for rows in [[event(100), event(50)], [event(100), {"type": "response_item", "payload": {
                "type": "function_call", "name": "functions.spawn_agent", "arguments": "{}"}}]]:
            with self.subTest(rows=rows):
                trace = self.write_rows("unsafe.jsonl", rows)
                result = self.run_tool("capture-codex", trace, "--task-id", "x", "--pair-id", "1",
                                       "--model", "m", "--fixture-commit", "c", "--config-id", "config", "--cache-mode", "cold")
                self.assertEqual(result.returncode, 2)
                self.assertIn("ERROR:", result.stderr)

    def test_text_report_includes_paired_variation_and_quality_counts(self):
        result = self.run_tool("compare", self.write_rows("before.jsonl", [self.row()]),
                               self.write_rows("after.jsonl", [self.row()]))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("median", result.stdout.lower())
        self.assertIn("range", result.stdout.lower())
        data = json.loads(self.compare([self.row()], [self.row(quality_passed=False)]).stdout)
        self.assertEqual(data["quality_counts"]["optimized"]["failed"], 1)
        self.assertEqual(data["quality_counts"]["baseline"]["passed"], 1)


if __name__ == "__main__":
    unittest.main()
