import hashlib
import json
from pathlib import Path
import subprocess
import unittest

from test_memory_tools import ProjectCase, TOOLS


class BootstrapReviewTests(ProjectCase):
    def test_bootstrap_has_no_fake_facts_and_uses_native_import(self):
        # Start from an application with no previous memory.
        import shutil
        shutil.rmtree(self.root/'memory')
        result = self.run_tool('init-memory.sh', self.root, '--agent', 'claude')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('@AGENTS.md', (self.root/'CLAUDE.md').read_text())
        health = self.run_tool('memory-health.py', self.root)
        self.assertEqual(health.returncode, 0, health.stdout)
        self.assertIn('UNSYNCED', (self.root/'memory/ACTIVE_STATE.md').read_text())
        sync = self.run_tool('sync-memory.sh', self.root)
        self.assertEqual(sync.returncode, 0, sync.stdout)
        self.assertIn('Working-tree drift: 0 paths', sync.stdout)
        self.assertNotIn('missing-provenance', sync.stdout)
        strict = self.run_tool('sync-memory.sh', self.root, '--strict')
        self.assertEqual(strict.returncode, 1)
        (self.root/'CLAUDE.md').write_text('user changed the file\n')
        self.assertIn('CLAUDE.md', self.run_tool('sync-memory.sh', self.root).stdout)

    def test_default_sync_is_advisory_and_skips_full_health_scan(self):
        self.write('memory/topics/broken.md', '- unverified fact\n')
        default = self.run_tool('sync-memory.sh', self.root)
        self.assertEqual(default.returncode, 0, default.stdout)
        self.assertNotIn('missing-provenance', default.stdout)
        self.assertEqual(self.run_tool('sync-memory.sh', self.root, '--strict').returncode, 1)
        self.assertEqual(self.run_tool('sync-memory.sh', self.root, '--stamp').returncode, 1)
