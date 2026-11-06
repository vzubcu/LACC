"""Regression probes for reviewed memory correctness, privacy and portability."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import unittest

from test_memory_tools import ProjectCase


class SafetyRegressionTests(ProjectCase):
    def test_fenced_bullets_are_examples_not_facts(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n" + "~~~text\n- Example without evidence\n~~~\n" + self.fact)
        result = self.health()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_pipe_inside_inline_command_keeps_fact_metadata_intact(self):
        self.write("memory/topics/architecture.md",
                   "# Architecture\n- Run \x60npm test | tee test.log\x60"
                   f" | source: \x60src/tenant.ts\x60 | verified: \x60{self.commit}\x60\n")
        result = self.health()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_index_bytes_and_topic_pointer_are_checked(self):
        self.write("memory/MEMORY_INDEX.md", "# Index\n- \x60topics/architecture.md\x60\n")
        self.assertEqual(self.health().returncode, 0)
        self.write("memory/MEMORY_INDEX.md", "# Index\n- \x60topics/gone.md\x60\n")
        self.assertIn("missing-topic-pointer", self.health().stdout)
        self.write("memory/MEMORY_INDEX.md", "# " + "A" * 4200 + "\n")
        self.assertIn("index-bytes", self.health().stdout)

    def test_hot_read_protects_checkpoint_from_long_index(self):
        self.write("memory/MEMORY_INDEX.md", "# Index\n" + "A" * 15000)
        result = self.run_tool("memory-read.py", self.root)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Last Synced Commit", result.stdout)
        self.assertIn("TRUNCATED", result.stdout)

    def test_broad_dependency_scan_excludes_private_files(self):
        self.write(".env.production", "checkout.ready = SECRET_ENV_VALUE\n")
        self.write(".npmrc", "checkout.ready = SECRET_NPM_VALUE\n")
        self.write("config/credentials.pem", "checkout.ready = SECRET_PEM_VALUE\n")
        self.write(".ssh/id_rsa", "checkout.ready = SECRET_SSH_VALUE\n")
        result = self.run_tool("dep-graph.sh", "src/tenant.ts", "--signal", "checkout.ready")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("SECRET_", result.stdout)
        self.assertNotIn("credentials.pem", result.stdout)

    def test_signature_extractor_rejects_external_paths_and_accepts_bom(self):
        self.write("example.py", "\ufeffclass Example:\n    pass\n")
        result = self.run_tool("ast-skeleton.sh", "example.py")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("class Example", result.stdout)
        outside = self.root.parent / (self.root.name + "-outside.py")
        try:
            outside.write_text("class Outside: pass\n")
            result = self.run_tool("ast-skeleton.sh", str(outside))
            self.assertEqual(result.returncode, 2)
        finally:
            outside.unlink(missing_ok=True)

    def test_formfeed_does_not_shift_editor_line_numbers(self):
        self.write("example.ts", "// odd\fcomment\nexport class Example {}\n")
        result = self.run_tool("ast-skeleton.sh", "example.ts")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("2: export class Example", result.stdout)

    def test_explicit_codex_does_not_edit_other_native_agents(self):
        native = self.write("CLAUDE.md", "# User-written Claude instructions\n")
        result = self.run_tool("init-memory.sh", self.root, "--agent", "codex")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(native.read_text(), "# User-written Claude instructions\n")

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks unavailable")
    def test_auto_bootstrap_skips_symlinked_native_instructions(self):
        native = self.root / "CLAUDE.md"
        native.symlink_to("AGENTS.md")
        result = self.run_tool("init-memory.sh", self.root, "--agent", "auto")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(native.is_symlink())
        self.assertIn("[SKIP]", result.stdout)
        self.assertIn("LEAN-CONTEXT-MEMORY:START", (self.root / "AGENTS.md").read_text())

    def test_bootstrap_hashes_actual_utf8_bytes(self):
        result = self.run_tool("init-memory.sh", self.root, "--agent", "codex")
        self.assertEqual(result.returncode, 0, result.stderr)
        metadata = json.loads((self.root / "memory/.bootstrap.json").read_text())
        self.assertEqual(metadata["AGENTS.md"],
                         hashlib.sha256((self.root / "AGENTS.md").read_bytes()).hexdigest())

    @unittest.skipIf(os.name == "nt", "POSIX file modes differ on Windows")
    def test_compact_preserves_file_permissions_and_crlf(self):
        topic = self.root / "memory/topics/architecture.md"
        topic.write_bytes(("# Architecture\r\n" + self.fact.replace("\n", "\r\n") * 2).encode())
        topic.chmod(0o644)
        preview = self.run_tool("memory-maintain.py", "compact", self.root)
        self.assertEqual(preview.returncode, 0, preview.stderr)
        digest = re.search(r"Plan: ([0-9a-f]{64})", preview.stdout).group(1)
        result = self.run_tool("memory-maintain.py", "compact", self.root, "--apply", "--expect", digest)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(stat.S_IMODE(topic.stat().st_mode), 0o644)
        self.assertEqual(topic.read_bytes(), ("# Architecture\r\n" + self.fact.replace("\n", "\r\n")).encode())


if __name__ == "__main__":
    unittest.main()
