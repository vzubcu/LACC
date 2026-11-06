"""Offline regression tests for advisory self-healing diagnostics and keyed facts."""
import json
import re

from test_memory_tools import ProjectCase


class MemoryDoctorTests(ProjectCase):
    def keyed(self, claim, key="auth.tenant.isolation", source="src/tenant.ts", revision=None, state=None):
        tick = chr(96)
        record = (f"- {claim} | source: {tick}{source}{tick} | "
                  f"verified: {tick}{revision or self.commit}{tick} | key: {key}")
        return record + (" | state: review" if state else "") + "\n"

    def doctor(self, *args):
        return self.run_tool("memory-doctor.py", self.root, "--json", *args)

    def payload(self, *args):
        result = self.doctor(*args)
        self.assertIn(result.returncode, (0, 1), result.stderr)
        return result.returncode, json.loads(result.stdout)

    def test_clean_facts_yield_healthy_read_only_report(self):
        before = self.snapshot()
        code, data = self.payload()
        self.assertEqual(code, 0)
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["total_issues"], 0)
        self.assertEqual(data["facts_scanned"], 1)
        self.assertEqual(self.snapshot(), before)

    def test_changed_source_emits_review_advice_and_blocks_search(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" + self.keyed("Tenant isolation is required"))
        self.write("src/tenant.ts", "export const isolated = false;\n")
        before = self.snapshot()
        code, data = self.payload()
        self.assertEqual(code, 1)
        self.assertIn("changed-source", data["counts"])
        self.assertEqual(data["items"][0]["code"], "changed-source")
        self.assertIn("Inspect current source", data["items"][0]["action"])
        search = self.run_tool("memory-search.py", self.root, "--query", "tenant isolation", "--json")
        self.assertEqual(search.returncode, 0, search.stderr)
        self.assertEqual(json.loads(search.stdout)["results"], [])
        self.assertEqual(self.snapshot(), before)

    def test_keyed_potential_conflict_is_not_auto_resolved(self):
        first = self.keyed("Tenant isolation must remain enabled")
        second = self.keyed("Tenant isolation may be disabled")
        self.write("memory/topics/architecture.md", "# Architecture\n" + first + second)
        code, data = self.payload()
        self.assertEqual(code, 1)
        conflict = next(x for x in data["items"] if x["code"] == "potential-conflict")
        self.assertEqual(conflict["key"], "auth.tenant.isolation")
        self.assertEqual(conflict["related_count"], 2)
        self.assertIn("reconcile manually", conflict["action"])
        self.assertIn("potential-conflict", self.health().stdout)

        normal = self.run_tool("memory-search.py", self.root, "--query", "tenant isolation", "--json")
        self.assertEqual(normal.returncode, 0, normal.stderr)
        self.assertEqual(json.loads(normal.stdout)["results"], [])
        review = self.run_tool("memory-search.py", self.root,
                               "--query", "tenant isolation", "--include-review", "--json")
        rows = json.loads(review.stdout)["results"]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(x["potential_conflict"] and x["review_required"] for x in rows))

    def test_identical_assertions_with_same_key_are_not_semantic_conflicts(self):
        fact = self.keyed("Tenant isolation is enforced")
        self.write("memory/topics/architecture.md", "# Architecture\n" + fact)
        self.write("memory/topics/decisions.md", "# Decisions\n" + fact)
        code, data = self.payload()
        self.assertEqual(code, 0)
        self.assertNotIn("potential-conflict", data["counts"])

    def test_review_state_produces_pending_review_even_when_code_unchanged(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" + self.keyed("Tenant isolation is enforced", state=True))
        code, data = self.payload()
        self.assertEqual(code, 1)
        self.assertIn("pending-review", data["counts"])

    def test_invalid_key_fails_validation_and_does_not_bypass_review(self):
        for key in ("UPPER.CASE", "bad key", "../outside", "a" * 100):
            with self.subTest(key=key):
                self.write("memory/topics/architecture.md",
                           "# Architecture\n" + self.keyed("Tenant isolation is enforced", key=key))
                code, data = self.payload()
                self.assertEqual(code, 1)
                self.assertIn("invalid-fact", data["counts"])
                self.assertIn("invalid-key", self.health().stdout)
                result = self.run_tool("memory-search.py", self.root, "--query", "tenant", "--json")
                self.assertEqual(json.loads(result.stdout)["results"], [])

    def test_missing_source_and_unavailable_commit_are_not_repaired(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" +
                   self.keyed("Tenant isolation is enforced", source="missing/source.ts") +
                   self.keyed("Tenant session locks exist", revision="deadbee"))
        code, data = self.payload()
        self.assertEqual(code, 1)
        self.assertIn("missing-source", data["counts"])
        self.assertIn("unavailable-commit", data["counts"])
        self.assertFalse((self.root / "missing/source.ts").exists())

    def test_staged_index_edit_is_detected_even_with_original_worktree(self):
        self.write("src/tenant.ts", "export const isolated = false;\n")
        self.git("add", "src/tenant.ts")
        self.write("src/tenant.ts", "export const isolated = true;\n")
        code, data = self.payload()
        self.assertEqual(code, 1)
        self.assertIn("changed-source", data["counts"])

    def test_revalidation_retains_key_but_requires_explicit_review(self):
        self.write("memory/topics/architecture.md", "# Architecture\n" +
                   self.keyed("Tenant isolation is enforced", state=True))
        self.write("src/tenant.ts", "export const isolated = true;\n// documented\n")
        self.git("add", "src/tenant.ts")
        self.git("commit", "-qm", "update tenant source")
        before = self.run_tool("memory-maintain.py", "revalidate", self.root,
                               "--topic", "architecture.md", "--line", "2")
        self.assertEqual(before.returncode, 2)
        preview = self.run_tool("memory-maintain.py", "revalidate", self.root,
                                "--topic", "architecture.md", "--line", "2", "--reviewed")
        self.assertEqual(preview.returncode, 0, preview.stderr)
        digest = re.search(r"Plan: ([0-9a-f]{64})", preview.stdout).group(1)
        result = self.run_tool("memory-maintain.py", "revalidate", self.root,
                               "--topic", "architecture.md", "--line", "2", "--reviewed",
                               "--apply", "--expect", digest)
        self.assertEqual(result.returncode, 0, result.stderr)
        text = (self.root / "memory/topics/architecture.md").read_text()
        self.assertIn("| key: auth.tenant.isolation", text)
        self.assertNotIn("| state: review", text)
        self.assertEqual(self.health().returncode, 0, self.health().stdout)

    def test_truncation_is_explicit_without_cutting_json(self):
        self.write("src/tenant.ts", "export const isolated = false;\n")
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" + "".join(
                       f"- Tenant policy claim {n} | source: {chr(96)}src/tenant.ts{chr(96)} | verified: {chr(96)}{self.commit}{chr(96)}\n"
                       for n in range(25)))
        result = self.doctor("--max-bytes", "512", "--limit", "10")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertLessEqual(len(result.stdout.encode("utf-8")), 512)
        data = json.loads(result.stdout)
        self.assertTrue(data["output_truncated"])
        self.assertEqual(data["total_issues"], 25)

    def test_large_fact_inventory_reports_incomplete_coverage(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" + "".join(
                       f"- Tenant isolation rule {n} | source: {chr(96)}src/tenant.ts{chr(96)} | verified: {chr(96)}{self.commit}{chr(96)}\n"
                       for n in range(1001)))
        code, data = self.payload("--limit", "1")
        self.assertEqual(code, 1)
        self.assertTrue(data["scan_incomplete"])
        self.assertEqual(data["status"], "incomplete")
        self.assertEqual(data["facts_scanned"], 1000)

    def test_symlink_topic_fails_closed_without_following_it(self):
        target = self.write("source.md", "# Source\n" + self.fact)
        (self.root / "memory/topics/linked.md").symlink_to(target)
        result = self.doctor()
        self.assertEqual(result.returncode, 2)
        self.assertIn("unsafe", result.stderr.lower())


if __name__ == "__main__":
    import unittest
    unittest.main()
