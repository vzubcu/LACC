import importlib.util
import contextlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
from unittest.mock import patch

from test_memory_tools import ProjectCase, TOOLS


class ReviewBoundaryTests(ProjectCase):
    def test_root_index_requires_module_path_not_just_import_word(self):
        self.write('index.ts', 'export const index = 1;\n')
        self.write('unrelated.ts', 'import { index } from "unrelated-package";\n')
        self.write('consumer.ts', 'import { index } from "./index";\n')
        result = self.run_tool('dep-graph.sh', 'index.ts')
        self.assertIn('consumer.ts', result.stdout)
        self.assertNotIn('unrelated.ts', result.stdout)

    def test_root_bin_source_is_searchable(self):
        self.write('bin/cli.py', 'handle("review.event")\n')
        result = self.run_tool('dep-graph.sh', 'src/tenant.ts', '--signal', 'review.event')
        self.assertIn('bin/cli.py', result.stdout)

    def test_invalid_utf8_recall_is_an_error_not_a_complete_selection(self):
        path = self.root/'memory/topics/invalid.md'
        path.write_bytes(b'Important constraint: \xff never trust input\n')
        result = self.run_tool('memory-read.py', self.root, '--topic', 'invalid.md')
        self.assertEqual(result.returncode, 2)
        self.assertNotIn('selection complete', result.stdout)

    def test_assume_unchanged_does_not_bypass_revalidation(self):
        self.git('update-index', '--assume-unchanged', 'src/tenant.ts')
        self.write('src/tenant.ts', 'export const isolated = false;\n')
        result = self.run_tool('memory-maintain.py', 'revalidate', self.root,
                               '--topic', 'architecture.md', '--line', '2', '--reviewed')
        self.assertEqual(result.returncode, 2)

    def test_assume_unchanged_does_not_bypass_health(self):
        self.git('update-index', '--assume-unchanged', 'src/tenant.ts')
        self.write('src/tenant.ts', 'export const isolated = false;\n')
        result = self.health()
        self.assertEqual(result.returncode, 1)
        self.assertIn('changed-source', result.stdout)

    def test_source_changed_during_apply_is_detected_before_topic_write(self):
        # Intercept diff formatting, after the first source check and before writes.
        self.write('src/tenant.ts', 'export const isolated = true;\n// checked change\n')
        self.git('add', 'src/tenant.ts')
        self.git('commit', '-qm', 'checked comment')
        args = ['memory-maintain.py', 'revalidate', str(self.root), '--topic', 'architecture.md', '--line', '2', '--reviewed']
        preview = self.run_tool('memory-maintain.py', *args[1:])
        self.assertEqual(preview.returncode, 0, preview.stderr)
        digest = re.search(r'Plan: ([0-9a-f]{64})', preview.stdout).group(1)
        before = (self.root/'memory/topics/architecture.md').read_bytes()
        sys.path.insert(0, str(TOOLS))
        self.addCleanup(sys.path.remove, str(TOOLS))
        spec = importlib.util.spec_from_file_location('maintenance_probe', TOOLS/'memory-maintain.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        original = module.difflib.unified_diff
        def intervening_edit(*items, **kwargs):
            self.write('src/tenant.ts', 'export const isolated = false;\n')
            return original(*items, **kwargs)
        with patch.object(sys, 'argv', args + ['--apply', '--expect', digest]), patch.object(module.difflib, 'unified_diff', intervening_edit), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(module.main(), 2)
        self.assertEqual((self.root/'memory/topics/architecture.md').read_bytes(), before)
