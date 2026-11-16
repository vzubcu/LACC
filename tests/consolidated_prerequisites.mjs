// RD-5 native prerequisite classification: evidence-only, no execution here.
export function classifyBashProbe(result) {
  if (!result || typeof result !== 'object') throw Error('invalid Bash probe');
  const available = !result.error && result.code === 0 &&
    result.stdout === 'LACC_BASH_OK';
  return {
    status: available ? 'AVAILABLE' : 'BLOCKED',
    error_code: typeof result.error === 'string' ? result.error.slice(0, 80) : null,
    exit_code: Number.isInteger(result.code) ? result.code : null,
    reason: available ? null : 'bash-execution-unavailable',
  };
}
export function installerNodeSupported(version) {
  const parts = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  if (!parts) return false;
  const major = Number(parts[1]), minor = Number(parts[2]);
  return major > 22 || (major === 22 && minor >= 20);
}
