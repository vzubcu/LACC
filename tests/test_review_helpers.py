import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import time
import unittest

from test_memory_tools import ProjectCase, TOOLS
from legacy_bash_support import require_legacy_bash


class HelperReviewTests(ProjectCase):
    def test_nested_source_directories_remain_searchable(self):
        for folder in ('memory', 'build', 'bin'):
            self.write('src/' + folder + '/consumer.py', 'on("review.event")\n')
        result = self.run_tool('dep-graph.sh', 'src/tenant.ts', '--signal', 'review.event')
        self.assertEqual(result.returncode, 0, result.stderr)
        for folder in ('memory', 'build', 'bin'):
            self.assertIn('src/' + folder + '/consumer.py', result.stdout)

    def test_qualified_import_outranks_generic_index_prose(self):
        self.write('src/index.ts', 'export const n = 1;\n')
        self.write('src/client.ts', 'import { n } from "./index";\n')
        for i in range(45):
            self.write(f'docs/page{i}.md', 'An index of useful things.\n')
        result = self.run_tool('dep-graph.sh', 'src/index.ts')
        self.assertIn('src/client.ts', result.stdout)
        self.assertNotIn('REFERENCE docs/', result.stdout)

    def test_scan_budget_and_exclusions_are_disclosed(self):
        self.write('build/generated.ts', 'ignored\n')
        self.write('src/large.ts', 'a' * 800)
        result = self.run_tool('dep-graph.sh', 'src/tenant.ts', '--scan-bytes', '512')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('scan budget', result.stdout.lower())
        self.assertIn('excluded', result.stdout.lower())
        self.assertIn('incomplete', result.stdout.lower())

    def test_stdin_slice_cleans_temp_and_validates_limit(self):
        require_legacy_bash(self)
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(['bash', str(TOOLS/'ctx-slice.sh'), '-', '2'], input='one\ntwo\nthree\n',
                                    env=dict(os.environ, TMPDIR=directory), text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(list(Path(directory).iterdir()), [])
            self.assertIn('one', result.stdout)
            self.assertIn('three', result.stdout)
        result = self.run_tool('ctx-slice.sh', '-', 'bad')
        self.assertEqual(result.returncode, 2)

    def test_saved_stdin_slice_is_private(self):
        require_legacy_bash(self)
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(['bash', str(TOOLS/'ctx-slice.sh'), '-', '2', '--keep'], input='one\ntwo\nthree\n',
                                    env=dict(os.environ, TMPDIR=directory), text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            files = list(Path(directory).iterdir())
            self.assertEqual(len(files), 1)
            self.assertEqual(stat.S_IMODE(files[0].stat().st_mode), 0o600)
            self.assertEqual(files[0].read_text(), 'one\ntwo\nthree\n')

    def test_interrupted_stdin_slice_does_not_spool_by_default(self):
        require_legacy_bash(self)
        with tempfile.TemporaryDirectory() as directory:
            process = subprocess.Popen(['bash', str(TOOLS/'ctx-slice.sh'), '-', '2'],
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       env=dict(os.environ, TMPDIR=directory))
            try:
                time.sleep(0.1)
                self.assertEqual(list(Path(directory).iterdir()), [])
                process.terminate()
                process.communicate(timeout=3)
                self.assertEqual(list(Path(directory).iterdir()), [])
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate()

    def test_real_signatures_are_extracted_and_decorators_are_bounded(self):
        self.write('example.py', 'class Example:\n    def run(self):\n        return 1\n')
        result = self.run_tool('ast-skeleton.sh', 'example.py')
        self.assertIn('class Example', result.stdout)
        self.assertIn('def run', result.stdout)
        self.write('example.ts', '@Field()\n' * 100 + 'export class Example {}\n')
        result = self.run_tool('ast-skeleton.sh', 'example.ts')
        self.assertIn('class Example', result.stdout)
        self.assertNotIn('@Field()', result.stdout)
