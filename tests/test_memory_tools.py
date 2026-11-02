import json
import os
import re
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


TOOLS = Path(__file__).resolve().parents[1] / "skills/lean-context-memory/scripts"


class ProjectCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="memory project ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Fixture")
        self.git("config", "user.email", "fixture@example.test")
        self.write("src/tenant.ts", "export const isolated = true;\n")
        self.git("add", ".")
        self.git("commit", "-qm", "initial fixture")
        self.commit = self.git("rev-parse", "HEAD").stdout.strip()
        self.write("memory/MEMORY_INDEX.md", "# Index\n")
        self.write("memory/ACTIVE_STATE.md", f"# State\n- **Last Synced Commit**: `{self.commit}`\n")
        self.fact = f"- Enforce tenant isolation | source: `src/tenant.ts` | verified: `{self.commit}`\n"
        self.write("memory/topics/architecture.md", "# Architecture\n" + self.fact)

    def write(self, path, text):
        dest = self.root / path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text, encoding="utf-8")
        return dest

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args], text=True, capture_output=True, check=True)

    def run_tool(self, name, *args):
        interpreter = sys.executable if name.endswith(".py") else "bash"
        return subprocess.run([interpreter, str(TOOLS / name), *args], cwd=self.root,
                              text=True, capture_output=True)

    def snapshot(self):
        return {str(p.relative_to(self.root)): p.read_bytes() for p in (self.root / "memory").rglob("*") if p.is_file()}

    def health(self):
        return self.run_tool("memory-health.py", str(self.root))


class MemoryHealthTests(ProjectCase):
    def test_confirmed_unchanged_source_is_healthy_without_writing_memory(self):
        before = self.snapshot()
        result = self.health()
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertIn("HEALTHY", result.stdout)
        self.assertEqual(self.snapshot(), before)

    def test_renamed_source_needs_review_until_provenance_is_corrected(self):
        self.git("mv", "src/tenant.ts", "src/tenant guard.ts")
        self.git("commit", "-qm", "rename source")
        result = self.health()
        self.assertEqual(result.returncode, 1)
        self.assertIn("missing-source", result.stdout)
        new_commit = self.git("rev-parse", "HEAD").stdout.strip()
        self.write("memory/topics/architecture.md", self.fact.replace("src/tenant.ts", "src/tenant guard.ts").replace(self.commit, new_commit))
        self.assertEqual(self.health().returncode, 0)

    def test_dirty_and_untracked_sources_require_review(self):
        self.write("src/tenant.ts", "export const isolated = false;\n")
        result = self.health()
        self.assertEqual(result.returncode, 1)
        self.assertIn("changed-source", result.stdout)
        self.write("src/new.ts", "export const x = 1;\n")
        self.write("memory/topics/architecture.md", self.fact.replace("src/tenant.ts", "src/new.ts"))
        self.assertIn("untracked-source", self.health().stdout)

    def test_fact_without_evidence_and_unavailable_commits_are_reported(self):
        self.write("memory/topics/architecture.md", "- Tenant isolation probably works\n")
        self.assertIn("missing-provenance", self.health().stdout)
        self.write("memory/topics/architecture.md", self.fact.replace(self.commit, "deadbee"))
        self.assertIn("unavailable-commit", self.health().stdout)

    def test_exact_duplicate_fact_text_is_reported_even_with_different_metadata(self):
        self.write("memory/topics/gotchas.md", self.fact.rstrip() + " | state: review\n")
        result = self.health()
        self.assertEqual(result.returncode, 1)
        self.assertIn("duplicate-fact", result.stdout)
        self.assertIn("pending-review", result.stdout)

    def test_over_budget_memory_is_reported_without_deleting_invariants(self):
        self.write('memory/.memory-budget.json', '{"topic_bytes": 4096}')
        self.write("memory/topics/gotchas.md", "# Old notes\n" + "old terminal output " * 400)
        before = self.snapshot()
        result = self.health()
        self.assertEqual(result.returncode, 1)
        self.assertIn("topic-budget", result.stdout)
        self.assertEqual(self.snapshot(), before)
        self.assertIn(b"Enforce tenant isolation", self.snapshot()["memory/topics/architecture.md"])

    def test_checkpoint_limits_count_utf8_bytes_and_lines(self):
        self.write("memory/ACTIVE_STATE.md", "x\n" * 31)
        self.assertIn("state-lines", self.health().stdout)
        self.write("memory/ACTIVE_STATE.md", "ț" * 1100)
        self.assertIn("state-bytes", self.health().stdout)
        self.write("memory/MEMORY_INDEX.md", "x\n" * 61)
        self.assertIn("index-lines", self.health().stdout)

    def test_custom_topic_and_aggregate_budgets_are_enforced(self):
        self.write("memory/.memory-budget.json", json.dumps({"topic_bytes": 1000, "topics_total_bytes": 1500}))
        self.write("memory/topics/a.md", "# " + "a" * 800)
        self.write("memory/topics/b.md", "# " + "b" * 800)
        self.assertIn("topics-total-budget", self.health().stdout)
        self.write("memory/.memory-budget.json", json.dumps({"topic_bytes": 2000, "topics_total_bytes": 4000}))
        self.assertEqual(self.health().returncode, 0)

    def test_invalid_budget_config_is_a_usage_error(self):
        for value in ['{"topic_bytes": true}', '{"topic_bytes": -1}', '{"unknown": 3}', '[]', '{oops']:
            with self.subTest(value=value):
                self.write("memory/.memory-budget.json", value)
                result = self.health()
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn("config", result.stderr.lower())

    def test_external_source_and_symlink_are_not_followed(self):
        self.write("memory/topics/architecture.md", self.fact.replace("src/tenant.ts", "../outside.ts"))
        self.assertIn("unsafe-source", self.health().stdout)
        (self.root / "src/link.ts").symlink_to(self.root / "src/tenant.ts")
        self.write("memory/topics/architecture.md", self.fact.replace("src/tenant.ts", "src/link.ts"))
        self.assertIn("unsafe-source", self.health().stdout)

    def test_non_utf8_memory_and_non_git_freshness_are_explicit(self):
        (self.root / "memory/topics/architecture.md").write_bytes(b"\xff")
        self.assertIn("unreadable-memory", self.health().stdout)
        self.write("memory/topics/architecture.md", self.fact)
        (self.root / ".git").rename(self.root / "git-metadata")
        self.assertIn("unverified-non-git", self.health().stdout)

    def test_many_findings_are_counted_before_report_is_truncated(self):
        self.write("memory/topics/architecture.md", "".join(f"- uncertain claim {i}\n" for i in range(50)))
        result = self.health()
        self.assertIn("50 findings", result.stdout)
        self.assertIn("omitted", result.stdout)
        self.assertLessEqual(len(result.stdout.splitlines()), 20)

    def test_symlinked_topic_directory_blocks_health_and_stamping(self):
        outside = self.root / "external-topics"
        outside.mkdir()
        (outside / "hidden.md").write_text("- unsupported claim\n" * 300)
        self.git("add", "external-topics")
        self.git("commit", "-qm", "fixture external notes")
        (self.root / "memory/topics/linked").symlink_to(outside, target_is_directory=True)
        result = self.health()
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn("unsafe-topic-directory", result.stdout)
        before = self.snapshot()
        self.assertEqual(self.run_tool("sync-memory.sh", str(self.root), "--stamp").returncode, 1)
        self.assertEqual(self.snapshot(), before)

    def test_entire_source_list_and_metadata_keys_must_be_valid(self):
        variants = [self.fact.replace("`src/tenant.ts` | verified", "`src/tenant.ts`, missing.ts | verified"),
                    self.fact.rstrip() + f" | verified: `{self.commit}`\n",
                    self.fact.rstrip() + " | source: `src/tenant.ts`\n"]
        for fact in variants:
            with self.subTest(fact=fact):
                self.write("memory/topics/architecture.md", fact)
                result = self.health()
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn("invalid-provenance", result.stdout)

    def test_staged_change_is_detected_when_worktree_matches_old_commit(self):
        self.write("src/tenant.ts", "export const isolated = false;\n")
        self.git("add", "src/tenant.ts")
        self.write("src/tenant.ts", "export const isolated = true;\n")
        self.assertIn("changed-source", self.health().stdout)

    def test_topic_prose_cannot_bypass_fact_provenance(self):
        self.write("memory/topics/architecture.md", "Tenant isolation probably works.\n")
        self.assertIn("invalid-fact-format", self.health().stdout)

    def test_source_pathspec_characters_are_literal(self):
        self.write("src/[guard].ts", "const guarded = true;\n")
        self.git("add", "src/[guard].ts")
        self.git("commit", "-qm", "literal filename")
        commit = self.git("rev-parse", "HEAD").stdout.strip()
        self.write("memory/topics/architecture.md", self.fact.replace("src/tenant.ts", "src/[guard].ts").replace(self.commit, commit))
        self.write("src/[guard].ts", "const guarded = false;\n")
        self.assertIn("changed-source", self.health().stdout)


class SyncTests(ProjectCase):
    def test_clean_committed_drift_is_reported_even_without_dirty_files(self):
        self.write("src/new.ts", "export const n = 1;\n")
        self.git("add", "src/new.ts")
        self.git("commit", "-qm", "external committed change")
        result = self.run_tool("sync-memory.sh", str(self.root), "--strict")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("src/new.ts", result.stdout)

    def test_dirty_staged_and_untracked_paths_are_reported(self):
        self.write("src/tenant.ts", "changed\n")
        self.git("add", "src/tenant.ts")
        self.write("src/untracked file.ts", "new\n")
        result = self.run_tool("sync-memory.sh", str(self.root), "--strict")
        self.assertEqual(result.returncode, 1)
        self.assertIn("src/untracked file.ts", result.stdout)

    def test_invalid_checkpoint_is_not_treated_as_synced(self):
        self.write("memory/ACTIVE_STATE.md", "- **Last Synced Commit**: `deadbee`\n")
        result = self.run_tool("sync-memory.sh", str(self.root), "--strict")
        self.assertEqual(result.returncode, 1)
        self.assertIn("unavailable", result.stdout.lower())

    def test_stamp_updates_real_commit_and_refuses_dirty_sources(self):
        self.write("README.md", "unrelated committed doc\n")
        self.git("add", "README.md")
        self.git("commit", "-qm", "new head")
        head = self.git("rev-parse", "HEAD").stdout.strip()
        result = self.run_tool("sync-memory.sh", str(self.root), "--stamp")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        content = (self.root / "memory/ACTIVE_STATE.md").read_text()
        self.assertIn(head, content)
        self.assertNotIn("\x01", content)
        before = self.snapshot()
        self.write("src/tenant.ts", "dirty\n")
        self.assertEqual(self.run_tool("sync-memory.sh", str(self.root), "--stamp").returncode, 1)
        self.assertEqual(self.snapshot(), before)

    def test_stamping_cannot_bypass_a_failed_health_check(self):
        self.write("memory/topics/architecture.md", "- unsupported claim\n")
        before = self.snapshot()
        result = self.run_tool("sync-memory.sh", str(self.root), "--stamp")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.snapshot(), before)

    def test_git_drift_display_reports_truncation(self):
        for i in range(45):
            self.write(f"src/new{i}.ts", "new\n")
        result = self.run_tool("sync-memory.sh", str(self.root))
        self.assertIn("45", result.stdout)
        self.assertIn("omitted", result.stdout)


class DependencyTests(ProjectCase):
    def setUp(self):
        super().setUp()
        self.write("src/producer.ts", 'import { dispatch } from "./bus";\ndispatch("checkout.ready", payload);\n')
        self.write("src/bus.ts", 'export function dispatch(topic: string, payload: unknown) {}\n')
        self.write("src/invoice-worker.ts", 'on("checkout.ready", payload => invoice(payload.taxCents));\n')

    def test_explicit_event_signal_finds_consumer_outside_direct_imports(self):
        direct = self.run_tool("dep-graph.sh", "src/producer.ts")
        self.assertNotIn("invoice-worker.ts:", direct.stdout)
        expanded = self.run_tool("dep-graph.sh", "src/producer.ts", "--signal", "checkout.ready")
        self.assertEqual(expanded.returncode, 0, expanded.stderr)
        self.assertIn("invoice-worker.ts:", expanded.stdout)
        self.assertIn("heuristic", expanded.stdout.lower())

    def test_search_limits_disclose_truncation_and_bound_utf8_output(self):
        for i in range(50):
            self.write(f"src/caller{i}.ts", 'import "./producer"; // ' + "ț" * 200 + "\n")
        result = self.run_tool("dep-graph.sh", "src/producer.ts", "--limit", "3", "--max-bytes", "1024")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("truncated", result.stdout.lower())
        self.assertLessEqual(len(result.stdout.encode()), 1024)
        self.assertIn("incomplete", result.stdout.lower())

    def test_signal_is_literal_and_duplicates_are_not_repeated(self):
        self.write("src/no-match.ts", 'on("checkoutXready", handler);\n')
        result = self.run_tool("dep-graph.sh", "src/producer.ts", "--signal", "checkout.ready", "--signal", "checkout.ready")
        self.assertEqual(result.stdout.count("invoice-worker.ts:"), 1)
        self.assertNotIn("no-match.ts:", result.stdout)

    def test_missing_file_and_invalid_limits_are_usage_errors(self):
        self.assertEqual(self.run_tool("dep-graph.sh", "missing.ts").returncode, 2)
        self.assertEqual(self.run_tool("dep-graph.sh", "src/producer.ts", "--limit", "0").returncode, 2)


class BootstrapTests(ProjectCase):
    def test_generated_helper_commands_quote_literal_installation_paths(self):
        with tempfile.TemporaryDirectory() as install_dir:
            for name in ["skill$UNSET_TEST_VARIABLE", "skill 'single' \"double\" $(touch INJECTED) `tick`"]:
                with self.subTest(name=name):
                    install = Path(install_dir) / name
                    shutil.copytree(TOOLS, install / "scripts")
                    shutil.copytree(TOOLS.parent / "templates", install / "templates")
                    shutil.copyfile(TOOLS.parent / "SKILL.md", install / "SKILL.md")
                    result = subprocess.run(["bash", str(install / "scripts/init-memory.sh"), str(self.root)],
                                            text=True, capture_output=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    line = next(line for line in (self.root / "AGENTS.md").read_text().splitlines() if "run " in line and "sync-memory.sh" in line)
                    match = re.search(r"run (`+)(.+?)\1;", line)
                    self.assertIsNotNone(match, line)
                    env = dict(os.environ)
                    env.pop("UNSET_TEST_VARIABLE", None)
                    command = match.group(2).strip()
                    follow = subprocess.run(["bash", "-c", command], cwd=self.root, env=env, text=True, capture_output=True)
                    self.assertEqual(follow.returncode, 0, follow.stdout + follow.stderr)
                    self.assertIn("Committed drift", follow.stdout)
                    self.assertFalse((self.root / "INJECTED").exists())

    def test_explicit_agent_targets_create_native_instruction_files(self):
        for agent, native in [("codex", "AGENTS.md"), ("claude", "CLAUDE.md"),
                              ("gemini", "GEMINI.md"), ("roo", ".roo/rules/lean-context-memory.md")]:
            with self.subTest(agent=agent):
                result = self.run_tool("init-memory.sh", str(self.root), "--agent", agent)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue((self.root / native).is_file(), native)

    def test_all_agents_are_idempotent_and_existing_rules_are_preserved(self):
        for native in ["CLAUDE.md", "GEMINI.md", ".roo/rules/lean-context-memory.md"]:
            self.write(native, "# Existing user rules\nDo not change this sentence.\n")
        for _ in range(2):
            result = self.run_tool("init-memory.sh", str(self.root), "--agent", "all")
            self.assertEqual(result.returncode, 0, result.stderr)
        for native in ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".roo/rules/lean-context-memory.md"]:
            text = (self.root / native).read_text()
            self.assertEqual(text.count("<!-- LEAN-CONTEXT-MEMORY:START -->"), 1)
            if native != "AGENTS.md":
                self.assertIn("Do not change this sentence.", text)

    def test_auto_updates_existing_gemini_and_roo_rules_without_creating_other_targets(self):
        for native in ["GEMINI.md", ".roo/rules/lean-context-memory.md"]:
            self.write(native, "# Native instructions\n")
        result = self.run_tool("init-memory.sh", str(self.root))
        self.assertEqual(result.returncode, 0, result.stderr)
        for native in ["GEMINI.md", ".roo/rules/lean-context-memory.md"]:
            self.assertIn("LEAN-CONTEXT-MEMORY:START", (self.root / native).read_text())
        self.assertFalse((self.root / "CLAUDE.md").exists())

    def test_invalid_agent_and_symlink_targets_fail_before_any_write(self):
        before = self.snapshot()
        result = self.run_tool("init-memory.sh", str(self.root), "--agent", "unknown")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(self.snapshot(), before)
        self.assertFalse((self.root / "AGENTS.md").exists())
        outside = self.write("elsewhere.md", "Preserve outside instructions.\n")
        (self.root / "CLAUDE.md").symlink_to(outside)
        result = self.run_tool("init-memory.sh", str(self.root), "--agent", "claude")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(outside.read_text(), "Preserve outside instructions.\n")
        self.assertFalse((self.root / "AGENTS.md").exists())

    def test_bootstrap_leaves_new_memory_unverified_until_populated(self):
        shutil.rmtree(self.root / "memory")
        result = self.run_tool("init-memory.sh", str(self.root))
        self.assertEqual(result.returncode, 0, result.stderr)
        state = (self.root / "memory/ACTIVE_STATE.md").read_text()
        self.assertIn("`UNSYNCED`", state)
        self.assertNotIn(self.commit, state)
        self.assertEqual(self.health().returncode, 0)

    def test_reinitialization_preserves_memory_and_existing_agent_instructions(self):
        self.write("AGENTS.md", "# User rules\nPreserve this instruction.\n")
        self.write("CLAUDE.md", "# Other agent rules\n")
        before = self.snapshot()
        for _ in range(2):
            result = self.run_tool("init-memory.sh", str(self.root))
            self.assertEqual(result.returncode, 0, result.stderr)
        after = self.snapshot()
        for name, content in before.items():
            self.assertEqual(after[name], content)
        for name in ["AGENTS.md", "CLAUDE.md"]:
            content = (self.root / name).read_text()
            self.assertEqual(content.count("<!-- LEAN-CONTEXT-MEMORY:START -->"), 1)
        self.assertIn("Preserve this instruction.", (self.root / "AGENTS.md").read_text())


if __name__ == "__main__":
    unittest.main()
