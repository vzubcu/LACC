import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBashProbe, installerNodeSupported } from './consolidated_prerequisites.mjs';

test('real Bash execution, not a PATH lookup, satisfies shell prerequisite', () => {
  assert.deepEqual(classifyBashProbe({
    error: null, code: 0, stdout: 'LACC_BASH_OK',
  }), {
    status: 'AVAILABLE', error_code: null, exit_code: 0, reason: null,
  });
});
test('Windows Bash/E_ACCESSDENIED, missing executable, wrong output remain BLOCKED', () => {
  const cases = [
    { error: null, code: 1, stdout: '', stderr: 'Bash/E_ACCESSDENIED' },
    { error: 'ENOENT', code: null, stdout: '' },
    { error: null, code: 0, stdout: '' },
    { error: null, code: 0, stdout: 'LACC_BASH_OK\n' },
  ];
  for (const result of cases) {
    const evidence = classifyBashProbe(result);
    assert.equal(evidence.status, 'BLOCKED');
    assert.equal(evidence.reason, 'bash-execution-unavailable');
  }
});
test('installer Node minimum rejects 22.16 and accepts 22.20, 22.21 and 24', () => {
  for (const version of ['v22.16.0', 'v22.19.9', 'v20.20.0', 'v21.9.0',
    '', 'vbad', 'v22.20', '22.20.0'])
    assert.equal(installerNodeSupported(version), false, version);
  for (const version of ['v22.20.0', 'v22.21.0', 'v23.0.0', 'v24.13.0'])
    assert.equal(installerNodeSupported(version), true, version);
});
test('no uncontrolled error values or false Bash positive', () => {
  assert.throws(() => classifyBashProbe(null), /invalid Bash probe/);
  assert.equal(classifyBashProbe({ error: 'X'.repeat(500), code: 0,
    stdout: 'LACC_BASH_OK' }).status, 'BLOCKED');
  assert.equal(classifyBashProbe({ error: 'X'.repeat(500), code: 0,
    stdout: 'LACC_BASH_OK' }).error_code.length, 80);
});
