// Native Node 22+ test output normalization. Never turn a missing summary
// into PASS. Supports TAP ("# tests") and spec ("ℹ tests") as a safeguard,
// though the RD-5 runner explicitly requests TAP.
const FIELDS = ['tests', 'pass', 'fail', 'skipped', 'cancelled', 'todo'];
export function parseNodeTestSummary(output) {
  if (typeof output !== 'string') throw Error('expected Node test output text');
  const stripped = output.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
  const totals = new Map();
  let reporter = 'unknown';
  for (const raw of stripped.split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/^(#|ℹ|ℹ️)\s+(tests|pass|fail|skip|skipped|cancelled|todo)\s+(\d+)$/u);
    if (!match) continue;
    reporter = match[1] === '#' ? 'tap' : 'spec';
    const name = match[2] === 'skip' ? 'skipped' : match[2];
    totals.set(name, Number(match[3]));
  }
  const parsed = Object.fromEntries(FIELDS.map(key =>
    [key === 'pass' ? 'passed' : key === 'fail' ? 'failed' : key,
      totals.get(key) ?? null]));
  const valid = FIELDS.every(key => Number.isSafeInteger(totals.get(key))) &&
    parsed.tests > 0 && parsed.failed >= 0 &&
    parsed.passed + parsed.failed + parsed.skipped + parsed.cancelled +
      parsed.todo === parsed.tests;
  return {
    ...parsed,
    reporter,
    complete: valid,
    incomplete_reason: !valid ? 'missing-or-inconsistent-node-test-summary' :
      parsed.skipped > 0 || parsed.todo > 0
        ? 'skipped-or-todo-tests-require-review' : null,
  };
}
