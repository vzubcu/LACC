import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPT = (Path(__file__).resolve().parents[1]
          / "skills/lean-context-memory/scripts/session-totals.py")


class SessionTotalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def row(self, session, tokens, **extra):
        data = {
            "task_id": "auth-check",
            "pair_id": "1",
            "model": "claude-model-exact",
            "fixture_commit": "common-fixture-revision",
            "config_id": "rider-agent-fixed-settings",
            "cache_mode": "warm",
            "session_id": session,
            "source": "jetbrains_session_explorer",
            "quality_passed": True,
            "total_tokens": tokens,
        }
        data.update(extra)
        return data

    def compare(self, before, after):
        baseline = self.root / "baseline.jsonl"
        optimized = self.root / "optimized.jsonl"
        baseline.write_text("".join(json.dumps(r) + "\n" for r in before))
        optimized.write_text("".join(json.dumps(r) + "\n" for r in after))
        return subprocess.run([sys.executable, str(SCRIPT), str(baseline),
                               str(optimized), "--json"],
                              capture_output=True, text=True)

    def test_matched_jetbrains_totals_do_not_invent_breakdowns(self):
        result = self.compare([self.row("a", 10000)], [self.row("b", 7000)])
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertTrue(data["comparable"])
        self.assertEqual(data["savings_pct"], 30)
        self.assertTrue(data["pilot"])
        self.assertNotIn("input_tokens", data)
        self.assertNotIn("output_tokens", data)
        self.assertNotIn("cached_input_tokens", data)
        self.assertIn("Total tokens only", data["note"])

    def test_failed_or_unverified_quality_blocks_savings(self):
        for quality in (False, None):
            with self.subTest(quality=quality):
                result = self.compare([self.row("a", 10000)],
                                      [self.row("b", 100, quality_passed=quality)])
                self.assertEqual(result.returncode, 1)
                self.assertIsNone(json.loads(result.stdout)["savings_pct"])

    def test_invalid_mismatched_and_reused_sessions_are_rejected(self):
        cases = [
            [self.row("a", 1000)],
            [self.row("b", 1000, model="different-model")],
            [self.row("b", 1000, total_tokens=0)],
            [self.row("b", 1000, total_tokens=1.5)],
            [self.row("b", 1000, quality_passed=1)],
            [self.row("b", 1000, source="estimated")],
            [self.row("b", 1000, fixture_commit="other")],
        ]
        for optimized in cases:
            with self.subTest(optimized=optimized):
                result = self.compare([self.row("a", 1000)], optimized)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)

    def test_multiple_pairs_median_not_same_as_aggregate(self):
        before = [self.row("base1", 1000), self.row("base2", 3000, pair_id="2")]
        after = [self.row("lacc1", 500), self.row("lacc2", 2700, pair_id="2")]
        result = self.compare(before, after)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["savings_pct"], 20)
        self.assertEqual(data["median_paired_savings_pct"], 30)

    def test_session_reuse_across_different_pairs_is_rejected(self):
        before = [self.row("shared", 1000), self.row("baseline2", 2000, pair_id="2")]
        after = [self.row("optimized1", 500), self.row("shared", 1000, pair_id="2")]
        self.assertEqual(self.compare(before, after).returncode, 2)

    def test_mixed_models_across_pairs_are_rejected(self):
        before = [self.row("a1", 1000), self.row("a2", 2000, pair_id="2", model="different")]
        after = [self.row("b1", 500), self.row("b2", 1000, pair_id="2", model="different")]
        self.assertEqual(self.compare(before, after).returncode, 2)

    def test_duplicate_session_id_within_arm_is_rejected(self):
        before = [self.row("same", 1000), self.row("same", 1000, pair_id="2")]
        after = [self.row("other1", 500), self.row("other2", 500, pair_id="2")]
        self.assertEqual(self.compare(before, after).returncode, 2)


if __name__ == "__main__":
    unittest.main()
