// BF-5: diagnose ONLY pinned installer prerequisite failures.
// Distinguish blocked registry/proxy/network from defects in LACC itself.
// No credentials, URLs, environment values or raw npm stderr are emitted.
const codes = Object.freeze([
  ['npm-proxy-auth-required', /\bE407\b|\b407\s+Proxy Authentication Required\b/i],
  ['npm-registry-auth-required', /\bE401\b|\b401\s+Unauthorized\b/i],
  ['npm-registry-access-denied', /\bE403\b|\b403\s+Forbidden\b/i],
  ['npm-network-unavailable', /\b(?:ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|ERR_SOCKET_TIMEOUT)\b/i],
  ['npm-registry-tls-untrusted', /\b(?:SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED|UNABLE_TO_GET_ISSUER_CERT_LOCALLY)\b/i],
]);
export function classifyPinnedInstallerFailure({ stderr = '', stdout = '' } = {}) {
  // Output from a subprocess is untrusted. Cap processing and emit only codes.
  const text = String(stderr).slice(-8192) + '\n' + String(stdout).slice(-2048);
  return codes.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}
