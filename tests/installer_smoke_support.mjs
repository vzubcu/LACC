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


import { spawnSync } from 'node:child_process';

// Resolve the effective proxy for exactly the pinned registry URL. On Windows,
// the current user's WinINET proxy can originate from manual settings,
// auto-detection (WPAD) or PAC. This does not provide Windows SSO credentials.
const WINDOWS_PROXY_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$uri = [Uri]'https://registry.npmjs.org/skills'",
  "$proxy = [Net.WebRequest]::GetSystemWebProxy()",
  "if ($null -eq $proxy -or $proxy.IsBypassed($uri)) { [Console]::Out.Write('DIRECT'); exit 0 }",
  "$chosen = $proxy.GetProxy($uri)",
  "if ($null -eq $chosen -or $chosen.AbsoluteUri -eq $uri.AbsoluteUri) { [Console]::Out.Write('DIRECT') } else { [Console]::Out.Write($chosen.AbsoluteUri) }",
].join('; ');

export function resolveWindowsSystemProxy({
  platform = process.platform, env = process.env, spawn = spawnSync,
} = {}) {
  if (platform !== 'win32') return { status: 'not-windows' };
  // Keep explicit npm/user settings at higher priority. Never mutate
  // machine/user npmrc or environment variables in the parent process.
  if (['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy',
    'npm_config_https_proxy', 'npm_config_proxy',
    'NPM_CONFIG_HTTPS_PROXY', 'NPM_CONFIG_PROXY'].some(k => env[k])) {
    return { status: 'already-configured' };
  }
  let result;
  try {
    result = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_PROXY_SCRIPT],
      { env, windowsHide: true, encoding: 'utf8',
        timeout: 12000, maxBuffer: 16384 });
  } catch { return { status: 'discovery-unavailable' }; }
  if (result.error || result.status !== 0 ||
      typeof result.stdout !== 'string') {
    return { status: 'discovery-unavailable' };
  }
  const answer = result.stdout.trim();
  if (answer === 'DIRECT' || answer === '') return { status: 'direct' };
  try {
    const parsed = new URL(answer);
    if (!['http:', 'https:'].includes(parsed.protocol) ||
        !parsed.hostname || parsed.username || parsed.password ||
        parsed.search || parsed.hash || parsed.pathname !== '/') {
      return { status: 'proxy-unsupported' };
    }
    // Keep the proxy URL private. Never place it in a diagnostic string;
    // caller may pass it ONLY to the isolated npm subprocess environment.
    return { status: 'discovered', proxyUrl: parsed.origin };
  } catch { return { status: 'proxy-unsupported' }; }
}
