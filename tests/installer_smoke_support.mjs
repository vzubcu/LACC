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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  inspectEvenIfConfigured = false,
} = {}) {
  if (platform !== 'win32') return { status: 'not-windows' };
  // Keep explicit npm/user settings at higher priority. Never mutate
  // machine/user npmrc or environment variables in the parent process.
  if (!inspectEvenIfConfigured && ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy',
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


const PROXY_ENV = new Set([
  'https_proxy', 'http_proxy', 'all_proxy', 'no_proxy',
  'npm_config_proxy', 'npm_config_https_proxy', 'npm_config_registry',
  'npm_config_userconfig', 'npm_config_globalconfig',
]);
const SAFE_NPMRC_KEYS = new Set([
  'proxy', 'https-proxy', 'noproxy', 'registry',
  'strict-ssl', 'cafile',
]);
function publicNpmrcKeyNames(file, io = fs) {
  if (!file) return { status: 'not-specified', keys: [] };
  try {
    const stat = io.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024)
      return { status: 'unreadable', keys: [] };
    const text = io.readFileSync(file, 'utf8');
    const keys = new Set();
    for (const line of text.split(/\r?\n/)) {
      // Never expose values, including auth tokens, URLs or proxy credentials.
      const key = line.match(/^\s*([a-z][a-z-]*)\s*=/i)?.[1]?.toLowerCase();
      if (SAFE_NPMRC_KEYS.has(key)) keys.add(key);
    }
    return { status: 'readable', keys: [...keys].sort() };
  } catch (e) {
    return { status: e?.code === 'ENOENT' ? 'absent' : 'unreadable', keys: [] };
  }
}
export function proxyConfigurationDiagnostics({
  env = process.env, platform = process.platform, cwd = process.cwd(),
  home = os.homedir(), io = fs, spawn = spawnSync,
} = {}) {
  const configured = Object.keys(env)
    .filter(key => PROXY_ENV.has(key.toLowerCase()) && Boolean(env[key]))
    .map(key => key.toUpperCase()).sort();
  const userConfigVar = Object.keys(env).find(key =>
    key.toLowerCase() === 'npm_config_userconfig' && env[key]);
  const userConfigPath = userConfigVar ? env[userConfigVar] : path.join(home, '.npmrc');
  const project = publicNpmrcKeyNames(path.join(cwd, '.npmrc'), io);
  const user = publicNpmrcKeyNames(userConfigPath, io);
  // Query Windows only for an explicit diagnostic; do not change npm env.
  const windows = resolveWindowsSystemProxy({
    platform, env, spawn, inspectEvenIfConfigured: true,
  });
  return {
    diagnostic_scope: 'environment-and-project-user-npmrc-only',
    proxy_env_keys: configured,
    project_npmrc: project,
    user_npmrc: user,
    windows_system_proxy: windows.status,
    windows_system_matches_explicit_proxy: (() => {
      if (windows.status !== 'discovered') return 'not-compared';
      const keys = Object.keys(env).filter(k =>
        ['https_proxy', 'http_proxy'].includes(k.toLowerCase()) && env[k]);
      if (keys.length === 0) return 'no-explicit-env-proxy';
      try {
        return keys.some(k => new URL(env[k]).origin === windows.proxyUrl)
          ? 'yes' : 'no';
      } catch { return 'unavailable'; }
    })(),
    registry_reachability: 'NOT_TESTED',
    proxy_authentication: 'NOT_TESTED',
    note: 'Values, proxy endpoints and credentials are not displayed. npm global/built-in config is not inspected. No settings changed.',
  };
}


// Opt-in only: override competing environment/user .npmrc proxy values for
// a single npm child. Do not export credentials, alter NO_PROXY, registry,
// trust settings, parent environment or system configuration.
export function windowsSystemProxyChildEnv(env, resolved) {
  if (!resolved || resolved.status !== 'discovered')
    throw Error('Windows system proxy was not discovered');
  const parsed = new URL(resolved.proxyUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname !== '/')
    throw Error('Windows proxy endpoint is unsupported');
  const target = {};
  for (const [key, value] of Object.entries(env)) {
    if (/^(?:https?_proxy|all_proxy|npm_config_(?:https_proxy|proxy))$/i.test(key))
      continue;
    target[key] = value;
  }
  const url = parsed.origin;
  // npm_config_* takes precedence over user .npmrc and is explicit for npm.
  // Standard env is also provided for underlying fetch implementations.
  target.HTTPS_PROXY = url;
  target.HTTP_PROXY = url;
  target.npm_config_https_proxy = url;
  target.npm_config_proxy = url;
  return target;
}
