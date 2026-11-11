#!/usr/bin/env node
// RD-5/CR-5: conservative, read-only aggregation of local reports.
// Untrusted JSON summaries are not remote attestation or host-delivery proof.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platforms = ['win32', 'linux', 'darwin'];
const paths = process.argv.slice(2);
const expected = fs.readdirSync(path.join(root, 'tests'))
  .filter(name => /^test_[a-z0-9_-]+\.mjs$/i.test(name)).sort();
const out = {
  schema: 1, type: 'RD-5/CR-5 local-report inventory',
  platforms: Object.fromEntries(platforms.map(p => [p, 'UNVERIFIED'])),
  expected_node_suites: expected.length,
  recorded_commits: [],
  issues: [],
  host_agent_responses: 'UNVERIFIED',
  host_delivery: 'not-observed',
  cross_os_automated_evidence: 'INCOMPLETE',
  release_gate: 'NOT_PASSED',
  note: 'JSON supplied by operators is not independently authenticated or real-agent answer evidence.',
};
const seen = new Map();
if (!paths.length) out.issues.push('No local evidence files supplied.');
for (const input of paths) {
  try {
    const stat = fs.lstatSync(input);
    if (!stat.isFile() || stat.size > 1024 * 1024 || stat.size < 30)
      throw Error('invalid size/type (1 MiB maximum)');
    const r = JSON.parse(fs.readFileSync(input, 'utf8'));
    if (r?.schema !== 1 || r.scope !== 'one-local-native-host' ||
        !platforms.includes(r.platform) || !/^[a-f0-9]{40}$/i.test(r.head ?? ''))
      throw Error('invalid schema/platform/commit');
    if (seen.has(r.platform)) throw Error('duplicate platform (select one authoritative report)');
    seen.set(r.platform, r);
    out.recorded_commits.push({ platform: r.platform, sha: r.head });
    const suites = Array.isArray(r.suite_results) ? r.suite_results : [];
    const node = new Map(suites.filter(s => expected.includes(s.suite))
      .map(s => [s.suite, s]));
    const missing = expected.filter(name => !node.has(name));
    const failed = expected.filter(name => {
      const suite = node.get(name);
      return suite && (suite.status !== 'PASS' || suite.exit_code !== 0 ||
        suite.failed !== 0 || suite.skipped !== 0 ||
        !Number.isSafeInteger(suite.tests) || suite.tests < 1 ||
        suite.passed !== suite.tests);
    });
    const noNode = !/^v(?:2[2-9]|[3-9]\d)\./.test(r.node ?? '');
    if (noNode) out.issues.push(r.platform + ': Node version below 22+ or unreported');
    if (missing.length) out.issues.push(r.platform + ': missing Node suites: ' + missing.join(', '));
    if (failed.length) out.issues.push(r.platform + ': not passing: ' + failed.join(', '));
    if (r.branch !== 'develop') out.issues.push(r.platform + ': not validated on develop');
    if (r.repo_status_before !== 'clean' || r.repo_status_after !== 'clean')
      out.issues.push(r.platform + ': checkout not clean before/after run');
    out.platforms[r.platform] = missing.length || failed.length || noNode ||
      r.branch !== 'develop' || r.repo_status_before !== 'clean' ||
      r.repo_status_after !== 'clean' ? 'INCOMPLETE_OR_FAIL' :
      'NODE_SUITES_REPORTED_PASS';
  } catch (e) {
    out.issues.push('Rejected report ' + path.basename(input) + ': ' + e.message);
  }
}
if (seen.size > 1 && new Set([...seen.values()].map(r => r.head)).size !== 1)
  out.issues.push('Different commit SHAs across platforms.');
for (const p of platforms) if (!seen.has(p))
  out.issues.push('Missing native ' + p + ' report.');
const python = [...seen.values()].some(r => r.suite_results?.some(s =>
  s.suite === 'python-unittest' && s.status === 'PASS' &&
  s.exit_code === 0 && Number.isSafeInteger(s.tests) && s.tests > 0 &&
  s.skipped === 0));
if (!python) out.issues.push('Python unit tests not confirmed on any platform.');
const installer = [...seen.values()].some(r => r.installer_check === 'PASS');
if (!installer) out.issues.push('Installer smoke not confirmed on any platform.');
const automated = out.issues.length === 0 &&
  platforms.every(p => out.platforms[p] === 'NODE_SUITES_REPORTED_PASS');
out.cross_os_automated_evidence = automated
  ? 'REPORTED_PASS_REQUIRES_INDEPENDENT_REVIEW' : 'INCOMPLETE_OR_FAIL';
// Never issue a release PASS: real emitted answers and independent host
// observation still require separate CR-5 acceptance.
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
if (!automated) process.exitCode = 1;
