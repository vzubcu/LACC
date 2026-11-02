import json
import re
from test_memory_tools import ProjectCase


class MaintenanceTests(ProjectCase):
    def test_compaction_preserves_discoverability_across_topics(self):
        self.write('memory/topics/security.md', '# Security\n' + self.fact)
        before = self.snapshot()
        result = self.run_tool('memory-maintain.py', 'compact', self.root)
        self.assertEqual(result.returncode, 0, result.stderr)
        digest = re.search(r'Plan: ([0-9a-f]{64})', result.stdout).group(1)
        applied = self.run_tool('memory-maintain.py', 'compact', self.root, '--apply', '--expect', digest)
        self.assertEqual(applied.returncode, 0, applied.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_large_stored_topic_is_allowed_but_recall_is_bounded(self):
        self.write('memory/topics/large.md', '# ' + 'ț' * 10000 + '\n')
        self.assertEqual(self.health().returncode, 0, self.health().stdout)
        result = self.run_tool('memory-read.py', self.root, '--topic', 'large.md', '--max-bytes', '1024')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLessEqual(len(result.stdout.encode()), 1024)
        self.assertIn('TRUNCATED', result.stdout)
        self.assertEqual(self.run_tool('memory-read.py', self.root, '--topic', '../../outside').returncode, 2)

    def test_compaction_is_previewed_and_preserves_the_remaining_evidence(self):
        self.write('memory/topics/architecture.md', '# Architecture\n' + self.fact + self.fact)
        before = self.snapshot()
        result = self.run_tool('memory-maintain.py', 'compact', self.root, '--dry-run')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.snapshot(), before)
        digest = re.search(r'Plan: ([0-9a-f]{64})', result.stdout).group(1)
        applied = self.run_tool('memory-maintain.py', 'compact', self.root, '--apply', '--expect', digest)
        self.assertEqual(applied.returncode, 0, applied.stderr)
        self.assertEqual((self.root/'memory/topics/architecture.md').read_text().count(self.fact), 1)
        self.assertEqual(self.health().returncode, 0)

    def test_changed_preview_and_symlink_cannot_be_applied(self):
        self.write('memory/topics/architecture.md', '# Architecture\n' + self.fact + self.fact)
        result = self.run_tool('memory-maintain.py', 'compact', self.root)
        self.assertEqual(result.returncode, 0, result.stderr)
        digest = re.search(r'Plan: ([0-9a-f]{64})', result.stdout).group(1)
        self.write('memory/topics/new.md', '# Added concurrently\n')
        before = self.snapshot()
        result = self.run_tool('memory-maintain.py', 'compact', self.root, '--apply', '--expect', digest)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(before, self.snapshot())
        (self.root/'memory/topics/link.md').symlink_to(self.root/'src/tenant.ts')
        result = self.run_tool('memory-maintain.py', 'compact', self.root)
        self.assertEqual(result.returncode, 2)

    def test_revalidation_requires_review_and_updates_only_selected_fact(self):
        self.write('src/tenant.ts', 'export const isolated = true;\n// unrelated comment\n')
        self.git('add', 'src/tenant.ts')
        self.git('commit', '-qm', 'comment')
        new = self.git('rev-parse', 'HEAD').stdout.strip()
        args = ('revalidate', self.root, '--topic', 'architecture.md', '--line', '2')
        self.assertEqual(self.run_tool('memory-maintain.py', *args).returncode, 2)
        result = self.run_tool('memory-maintain.py', *args, '--reviewed')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(new, (self.root/'memory/topics/architecture.md').read_text())
        digest = re.search(r'Plan: ([0-9a-f]{64})', result.stdout).group(1)
        result = self.run_tool('memory-maintain.py', *args, '--reviewed', '--apply', '--expect', digest)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(new, (self.root/'memory/topics/architecture.md').read_text())
        self.write('src/tenant.ts', 'uncommitted source')
        self.assertEqual(self.run_tool('memory-maintain.py', *args, '--reviewed').returncode, 2)
