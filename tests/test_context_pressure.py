import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "skills/lean-context-memory/scripts/context-pressure.py"


class ContextPressureTests(unittest.TestCase):
    def run_tool(self, *args, stdin=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            input=stdin, text=True, capture_output=True
        )

    def json_run(self, tokens, window=1000, *extra):
        result = self.run_tool("--input-tokens", str(tokens), "--context-window", str(window), "--json", *extra)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_default_thresholds_are_advisory(self):
        cases = [(699, "normal"), (700, "checkpoint"), (800, "compact_recommended"), (900, "urgent")]
        for tokens, expected in cases:
            with self.subTest(tokens=tokens):
                data = self.json_run(tokens)
                self.assertEqual(data["status"], expected)
                self.assertFalse(data["auto_compact"])

    def test_custom_thresholds_are_supported(self):
        data = self.json_run(650, 1000, "--checkpoint-at", "50", "--compact-at", "60", "--urgent-at", "70")
        self.assertEqual(data["status"], "compact_recommended")

    def test_codex_trace_uses_latest_reported_request_input(self):
        rows = [
            {"type": "event_msg", "payload": {"type": "token_count", "info": {
                "total_token_usage": {"input_tokens": 100, "cached_input_tokens": 20, "output_tokens": 10},
                "last_token_usage": {"input_tokens": 650, "cached_input_tokens": 100, "output_tokens": 10}}}},
            {"type": "event_msg", "payload": {"type": "token_count", "info": {
                "total_token_usage": {"input_tokens": 200, "cached_input_tokens": 30, "output_tokens": 20},
                "last_token_usage": {"input_tokens": 810, "cached_input_tokens": 200, "output_tokens": 10}}}},
        ]
        with tempfile.TemporaryDirectory() as directory:
            trace = Path(directory) / "session.jsonl"
            trace.write_text("".join(json.dumps(row) + "\n" for row in rows))
            result = self.run_tool("--codex-trace", str(trace), "--context-window", "1000", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["used_tokens"], 810)
        self.assertEqual(data["metric"], "request_input_proxy")
        self.assertEqual(data["status"], "compact_recommended")

    def test_stdin_trace_is_supported_without_discovery(self):
        row = {"type": "event_msg", "payload": {"type": "token_count", "info": {
            "last_token_usage": {"input_tokens": 910}}}}
        result = self.run_tool("--codex-trace", "-", "--context-window", "1000", "--json",
                               stdin=json.dumps(row) + "\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "urgent")


    def test_codex_trace_prioritizes_active_context_total_and_host_window(self):
        rows = [
            {"type": "event_msg", "payload": {"type": "token_count", "info": {
                "model_context_window": 1000,
                "total_token_usage": {"total_tokens": 8800},
                "last_token_usage": {"total_tokens": 750, "input_tokens": 920}}}},
            {"type": "event_msg", "payload": {"type": "token_count", "info": {
                "model_context_window": 1000,
                "total_token_usage": {"total_tokens": 9600},
                "last_token_usage": {"total_tokens": 820, "input_tokens": 100}}}},
        ]
        result = self.run_tool("--codex-trace", "-", "--json",
                               stdin="".join(json.dumps(x) + "\n" for x in rows))
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["metric"], "active_context_tokens")
        self.assertEqual(data["used_tokens"], 820)
        self.assertEqual(data["status"], "compact_recommended")
        self.assertEqual(data["context_window_tokens"], 1000)

    def test_explicit_active_context_is_not_called_request_input(self):
        result = self.run_tool("--used-context-tokens", "700", "--context-window", "1000", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["metric"], "active_context_tokens")
        self.assertEqual(data["status"], "checkpoint")

    def test_trace_mismatched_window_is_rejected(self):
        row = {"type": "event_msg", "payload": {"type": "token_count", "info": {
            "model_context_window": 1000, "last_token_usage": {"total_tokens": 700}}}}
        result = self.run_tool("--codex-trace", "-", "--context-window", "1200",
                               stdin=json.dumps(row) + "\n")
        self.assertEqual(result.returncode, 2)
        self.assertIn("disagrees", result.stderr)

    def test_invalid_or_unknown_usage_fails_instead_of_guessing(self):
        cases = [
            ("--input-tokens", "10", "--context-window", "0"),
            ("--input-tokens", "10", "--context-window", "1000",
             "--checkpoint-at", "80", "--compact-at", "70", "--urgent-at", "90"),
        ]
        for args in cases:
            with self.subTest(args=args):
                result = self.run_tool(*args)
                self.assertEqual(result.returncode, 2)
                self.assertIn("ERROR:", result.stderr)

    def test_trace_without_usage_fails_instead_of_guessing(self):
        result = self.run_tool("--codex-trace", "-", "--context-window", "1000",
                               stdin='{"type":"event_msg","payload":{"type":"other"}}\n')
        self.assertEqual(result.returncode, 2)
        self.assertIn("no usable Codex token_count", result.stderr)


if __name__ == "__main__":
    unittest.main()
