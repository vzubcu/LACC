import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNodeTestSummary } from './consolidated_reporter.mjs';

test('Windows CRLF TAP with all passing test cases is PASS-eligible', () => {
  const lines = ['TAP version 13', '1..3', '# tests 3',
    '# suites 0', '# pass 3', '# fail 0', '# cancelled 0',
    '# skipped 0', '# todo 0', '# duration_ms 92.1'];
  const report = parseNodeTestSummary(lines.join('\r\n') + '\r\n');
  assert.equal(report.reporter, 'tap');
  assert.equal(report.complete, true);
  assert.equal(report.tests, 3);
  assert.equal(report.passed, 3);
  assert.equal(report.incomplete_reason, null);
});
test('spec reporter and ANSI sequences are parsed without treating pass as incomplete', () => {
  const output = ['ℹ tests 5', 'ℹ suites 0', 'ℹ pass 5',
    'ℹ fail 0', 'ℹ cancelled 0', 'ℹ skipped 0', 'ℹ todo 0'].join('\r\n');
  const report = parseNodeTestSummary('\x1b[32m' + output + '\x1b[0m');
  assert.equal(report.reporter, 'spec');
  assert.equal(report.complete, true);
  assert.equal(report.failed, 0);
});
test('real skipped or todo tests remain explicitly incomplete', () => {
  const summary = ['# tests 5', '# pass 3', '# fail 0',
    '# cancelled 0', '# skipped 1', '# todo 1'].join('\n');
  const report = parseNodeTestSummary(summary);
  assert.equal(report.complete, true);
  assert.equal(report.incomplete_reason, 'skipped-or-todo-tests-require-review');
});
test('partial or corrupted summary cannot masquerade as passing tests', () => {
  for (const s of [
    '# tests 9\n# pass 9\n# fail 0',
    '# tests 5\n# pass 6\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0',
    '# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0',
    '',
  ]) assert.equal(parseNodeTestSummary(s).complete, false);
});
