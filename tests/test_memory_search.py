"""Offline retrieval acceptance tests; no model calls, runners or external services."""
import json

from test_memory_tools import ProjectCase


class MemorySearchTests(ProjectCase):
    def search(self, query, *flags):
        return self.run_tool("memory-search.py", self.root, "--query", query, *flags)

    def data(self, query, *flags):
        result = self.search(query, "--json", *flags)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLessEqual(len(result.stdout.encode("utf-8")), 8192)
        return json.loads(result.stdout)

    def test_relevant_source_backed_fact_beats_unrelated_and_is_deterministic(self):
        tick = chr(96)
        self.write("src/auth.ts", "export const oidc = true;\n")
        self.git("add", "src/auth.ts")
        self.git("commit", "-qm", "auth setup")
        head = self.git("rev-parse", "HEAD").stdout.strip()
        self.write("memory/topics/security.md",
                   "# Security\n"
                   f"- OIDC Keycloak session persistence uses rotation | source: {tick}src/auth.ts{tick} | verified: {tick}{head}{tick}\n"
                   f"- Inventory exports are asynchronous | source: {tick}src/tenant.ts{tick} | verified: {tick}{self.commit}{tick}\n")
        before = self.snapshot()
        data = self.data("OIDC Keycloak session persistence")
        self.assertEqual(data["stats"]["returned"], 1)
        self.assertIn("OIDC Keycloak", data["results"][0]["fact"])
        self.assertEqual(data["results"][0]["freshness"], "source-unchanged")
        self.assertFalse(data["results"][0]["review_required"])
        self.assertEqual(data["results"][0]["location"], "memory/topics/security.md:2")
        self.assertEqual(data, self.data("OIDC Keycloak session persistence"))
        self.assertEqual(self.snapshot(), before)

    def test_changed_source_fails_closed_and_review_mode_labels_it(self):
        self.write("src/tenant.ts", "export const isolated = false;\n")
        default = self.data("tenant isolation")
        self.assertEqual(default["results"], [])
        self.assertGreaterEqual(default["stats"]["skipped_untrusted"], 1)
        reviewed = self.data("tenant isolation", "--include-review")
        self.assertEqual(len(reviewed["results"]), 1)
        self.assertEqual(reviewed["results"][0]["freshness"], "changed-source")
        self.assertTrue(reviewed["results"][0]["review_required"])
        self.assertIn("REVIEW", self.search("tenant isolation", "--include-review").stdout)

    def test_state_review_not_used_as_confirmed_even_with_unchanged_source(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" + self.fact.rstrip() + " | state: review\n")
        self.assertEqual(self.data("tenant isolation")["results"], [])
        rows = self.data("tenant isolation", "--include-review")["results"]
        self.assertEqual(rows[0]["state"], "review")
        self.assertEqual(rows[0]["freshness"], "source-unchanged")

    def test_missing_source_commit_and_non_git_do_not_bypass_evidence(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" + self.fact.replace("src/tenant.ts", "src/missing.ts"))
        self.assertEqual(self.data("tenant isolation")["results"], [])
        self.assertEqual(self.data("tenant isolation", "--include-review")["results"][0]["freshness"],
                         "unsafe-or-missing-source")
        self.write("memory/topics/architecture.md", "# Architecture\n" + self.fact)
        (self.root / ".git").rename(self.root / ".git-hidden")
        self.assertEqual(self.data("tenant isolation")["results"], [])
        rows = self.data("tenant isolation", "--include-review")["results"]
        self.assertEqual(rows[0]["freshness"], "unavailable-commit")

    def test_invalid_facts_and_fenced_examples_are_not_searchable(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n~~~text\n- OIDC secret should be exposed\n~~~\n"
                   "- OIDC unverified assertion\n" + self.fact)
        data = self.data("OIDC")
        self.assertEqual(data["results"], [])
        self.assertEqual(data["stats"]["invalid_facts"], 1)

    def test_limit_and_byte_budget_never_cut_a_fact_or_invalid_utf8(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" +
                   (f"- Tenant isolation Unicode ț ș î | source: {chr(96)}src/tenant.ts{chr(96)} | verified: {chr(96)}{self.commit}{chr(96)}\n" * 3))
        result = self.search("tenant isolation", "--limit", "2", "--max-bytes", "512", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLessEqual(len(result.stdout.encode("utf-8")), 512)
        data = json.loads(result.stdout)
        self.assertTrue(data["stats"]["output_truncated"])
        self.assertLessEqual(data["stats"]["returned"], 2)

    def test_literal_pipe_and_backticks_survive_ranked_retrieval(self):
        tick = chr(96)
        self.write("memory/topics/architecture.md",
                   "# Architecture\n"
                   f"- Test pipeline {tick}npm test | tee auth.log{tick} is used | source: {tick}src/tenant.ts{tick} | verified: {tick}{self.commit}{tick}\n")
        rows = self.data("npm test pipeline")["results"]
        self.assertEqual(len(rows), 1)
        self.assertIn("npm test | tee", rows[0]["fact"])

    def test_unsafe_symlinked_memory_is_rejected(self):
        outside = self.write("untrusted.md", "# External\n" + self.fact)
        (self.root / "memory/topics/malicious.md").symlink_to(outside)
        result = self.search("tenant isolation")
        self.assertEqual(result.returncode, 2)
        self.assertIn("unsafe", result.stderr.lower())

    def test_no_semantic_terms_is_rejected(self):
        for query in ("the and", "", "x" * 300):
            with self.subTest(query=query):
                self.assertEqual(self.search(query).returncode, 2)

    def test_candidate_verification_cap_is_disclosed(self):
        tick = chr(96)
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" +
                   "".join(f"- Tenant isolation rule {n} | source: {tick}src/tenant.ts{tick} | verified: {tick}{self.commit}{tick}\n"
                           for n in range(210)))
        data = self.data("tenant isolation")
        self.assertTrue(data["stats"]["verification_limited"])
        self.assertEqual(data["status"], "incomplete")
        self.assertEqual(data["stats"]["matched"], 210)

    def test_reinitialization_adds_new_topics_without_overwriting_existing_facts(self):
        before = (self.root / "memory/topics/architecture.md").read_bytes()
        result = self.run_tool("init-memory.sh", self.root, "--agent", "claude")
        self.assertEqual(result.returncode, 0, result.stderr)
        for name in ("decisions.md", "lessons.md"):
            path = self.root / "memory/topics" / name
            self.assertTrue(path.is_file())
            self.assertIn("No ", path.read_text())
        self.assertEqual(before, (self.root / "memory/topics/architecture.md").read_bytes())
        snapshot = self.snapshot()
        rerun = self.run_tool("init-memory.sh", self.root, "--agent", "claude")
        self.assertEqual(rerun.returncode, 0, rerun.stderr)
        self.assertEqual(snapshot, self.snapshot())
        self.assertEqual(self.health().returncode, 0, self.health().stdout)

    def test_incomplete_scan_does_not_clear_keyed_conflict_risk(self):
        tick = chr(96)
        keyed = (f"- Tenant isolation is enforced | source: {tick}src/tenant.ts{tick} "
                 f"| verified: {tick}{self.commit}{tick} | key: auth.tenant.isolation\n")
        self.write("memory/topics/architecture.md", "# Architecture\n" + keyed)
        # The oversized topic could contain a second claim with the same key.
        self.write("memory/topics/oversized.md", "# " + "X" * (1024 * 1024 + 1))
        result = self.run_tool("memory-search.py", self.root,
                               "--query", "tenant isolation", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["status"], "incomplete")
        self.assertEqual(data["results"], [])
        reviewed = self.run_tool("memory-search.py", self.root,
                                 "--query", "tenant isolation",
                                 "--include-review", "--json")
        row = json.loads(reviewed.stdout)["results"][0]
        self.assertTrue(row["conflict_check_incomplete"])
        self.assertTrue(row["review_required"])

    def test_quality_fixture_recall_at_five(self):
        tick = chr(96)
        self.write("memory/topics/decisions.md",
                   "# Decisions\n" +
                   f"- Decision OIDC session renewal follows refresh-token rotation because replay is unsafe | source: {tick}src/tenant.ts{tick} | verified: {tick}{self.commit}{tick}\n")
        self.write("memory/topics/lessons.md",
                   "# Lessons\n" +
                   f"- Lesson event consumers require compatibility checks before payload changes | source: {tick}src/tenant.ts{tick} | verified: {tick}{self.commit}{tick}\n")
        tasks = [("OIDC session renewal rotation", "decisions.md"),
                 ("event consumers payload compatibility", "lessons.md"),
                 ("tenant isolation", "architecture.md")]
        found = 0
        for query, topic in tasks:
            rows = self.data(query, "--limit", "5")["results"]
            if any(topic in row["location"] for row in rows):
                found += 1
        self.assertEqual(found, len(tasks))


if __name__ == "__main__":
    import unittest
    unittest.main()
