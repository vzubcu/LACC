"""Focused end-to-end checks for batched Git provenance and machine-readable health."""
import json
import os
import stat
import unittest

from test_memory_tools import ProjectCase


class BatchedHealthTests(ProjectCase):
    def test_healthy_json_is_read_only_and_reports_counts(self):
        before = self.snapshot()
        result = self.run_tool("memory-health.py", self.root, "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "healthy")
        self.assertEqual(payload["findings_total"], 0)
        self.assertEqual(payload["topics"], 1)
        self.assertIsInstance(payload["topic_bytes"], int)
        self.assertEqual(payload["findings"], [])
        self.assertEqual(before, self.snapshot())

    def test_json_review_keeps_nonzero_exit_and_precise_findings(self):
        self.write("src/tenant.ts", "export const isolated = false;\n")
        result = self.run_tool("memory-health.py", self.root, "--json")
        self.assertEqual(result.returncode, 1, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "review")
        self.assertGreaterEqual(payload["findings_total"], 1)
        self.assertTrue(any(item["code"] == "changed-source"
                            and "src/tenant.ts" in item["location"]
                            for item in payload["findings"]))

    def test_invalid_budget_returns_json_error_and_exit_two(self):
        self.write("memory/.memory-budget.json", "{invalid")
        result = self.run_tool("memory-health.py", self.root, "--json")
        self.assertEqual(result.returncode, 2, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "error")

    def test_changed_staged_source_is_detected_with_clean_worktree(self):
        self.write("src/tenant.ts", "export const isolated = false;\n")
        self.git("add", "src/tenant.ts")
        self.write("src/tenant.ts", "export const isolated = true;\n")
        self.assertIn("changed-source", self.health().stdout)

    def test_assume_unchanged_flag_cannot_hide_modified_worktree(self):
        self.git("update-index", "--assume-unchanged", "src/tenant.ts")
        try:
            self.write("src/tenant.ts", "export const isolated = false;\n")
            result = self.health()
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn("changed-source", result.stdout)
        finally:
            self.git("update-index", "--no-assume-unchanged", "src/tenant.ts")

    def test_many_sources_and_literal_pathspecs_are_verified(self):
        paths = []
        for i in range(135):  # Exercises both 128-entry and remainder ls-tree batches.
            path = f"src/part{i}.ts"
            self.write(path, f"export const n = {i};\n")
            paths.append(path)
        special = "src/[value].ts"
        self.write(special, "export const special = true;\n")
        paths.append(special)
        self.git("add", "src")
        self.git("commit", "-qm", "more source files")
        revision = self.git("rev-parse", "HEAD").stdout.strip()
        self.write("memory/topics/architecture.md", "# Architecture\n" + "".join(
            f"- Contract in {path} | source: \x60{path}\x60 | verified: \x60{revision}\x60\n"
            for path in paths))
        self.assertEqual(self.health().returncode, 0, self.health().stdout)
        self.write(special, "export const special = false;\n")
        result = self.health()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("changed-source", result.stdout)
        self.assertIn(special, result.stdout)

    @unittest.skipIf(os.name == "nt", "POSIX executable mode not portable on Windows")
    def test_staged_mode_only_change_requires_review(self):
        path = self.root / "src/tenant.ts"
        path.chmod(path.stat().st_mode | stat.S_IXUSR)
        self.git("add", "src/tenant.ts")
        self.assertIn("changed-source", self.health().stdout)

    def test_multiple_revisions_of_same_unchanged_source(self):
        self.write("src/unrelated.ts", "export const unrelated = true;\n")
        self.git("add", "src/unrelated.ts")
        self.git("commit", "-qm", "unrelated commit")
        new_revision = self.git("rev-parse", "HEAD").stdout.strip()
        self.write("memory/topics/architecture.md", "# Architecture\n" +
                   self.fact +
                   f"- Second distinct claim about tenant guards | source: \x60src/tenant.ts\x60 | verified: \x60{new_revision}\x60\n")
        result = self.health()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
