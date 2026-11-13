#!/usr/bin/env node
// BF-7 cross-OS Bash-free acceptance: metadata inventory, NOT attestation.
// Input: three native --bash-free --installer reports plus POSIX full legacy
// reports (same SHA). Does not require Bash on native Windows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const keys = {
  '--windows': 'win32', '--linux': 'linux', '--macos': 'darwin',
  '--linux-legacy': 'linux', '--macos-legacy': 'darwin',
};
const expected = fs.readdirSync(path.join(root, 'tests'))
  .filter(x => /^test_[a-z0-9_-]+\.mjs$/i.test(x)).sort();
const result = {
  schema: 1, type: 'BF-7 native Bash-free evidence inventory',
  candidate_sha: null, candidate_branch: null,
  core: { win32: 'UNVERIFIED', linux: 'UNVERIFIED', darwin: 'UNVERIFIED' },
  legacy_posix: { linux: 'UNVERIFIED', darwin: 'UNVERIFIED' },
  expected_node_suites: expected.length,
  automated_evidence: 'INCOMPLETE_OR_FAIL',
  release_gate: 'NOT_PASSED',
  host_generated_answers: 'UNVERIFIED', host_delivery: 'not-observed',
  warnings: [], issues: [],
  note: 'Operator-supplied JSON is not independently authenticated and never certifies native OS, host delivery, or final release.',
};
function inspect(file, platform, legacy) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() ||
      stat.size < 30 || stat.size > 1024 * 1024)
    throw Error('unsafe type or size (limit 1 MiB)');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data?.schema !== 1 || data.scope !== 'one-local-native-host' ||
      data.platform !== platform || !/^[a-f0-9]{40}$/i.test(data.head ?? ''))
    throw Error('wrong schema, native platform or SHA');
  if (data.repo_status_before !== 'clean' || data.repo_status_after !== 'clean')
    throw Error('checkout dirty before or after tests');
  const node = /^v(\d+)\.(\d+)\.(\d+)$/.exec(data.node ?? '');
  if (!node || Number(node[1]) < 22 ||
      Number(node[1]) === 22 && Number(node[2]) < 20)
    throw Error('Node 22.20+ is required for BF installer acceptance');
  const suites = Array.isArray(data.suite_results) ? data.suite_results : [];
  const nameSet = new Set();
  for (const suite of suites) {
    if (!suite || typeof suite.suite !== 'string' || nameSet.has(suite.suite))
      throw Error('invalid or repeated suite results');
    nameSet.add(suite.suite);
  }
  for (const name of expected) {
    const s = suites.find(x => x.suite === name);
    if (!s || s.status !== 'PASS' || s.exit_code !== 0 ||
        !Number.isSafeInteger(s.tests) || s.tests < 1 ||
        s.failed !== 0 || s.skipped !== 0 ||
        s.passed !== s.tests)
      throw Error('missing, skipped or failing Node suite: ' + name);
  }
  if (data.node_core_status !== 'PASS')
    throw Error('native Node core verdict not PASS');
  if (!legacy) {
    if (data.installer_check !== 'PASS')
      throw Error('BF-5 installer smoke not confirmed');
    const py = suites.find(x => x.suite === 'python-unittest');
    if (!py || !['UNVERIFIED', 'PASS'].includes(py.status))
      throw Error('missing honest Python legacy status');
  } else {
    const py = suites.find(x => x.suite === 'python-unittest');
    if (!py || py.status !== 'PASS' || py.exit_code !== 0 ||
        !Number.isSafeInteger(py.tests) || py.tests < 1 || py.skipped !== 0)
      throw Error('legacy Python/Bash suite not executed without skips');
  }
  return { head: data.head.toLowerCase(), branch: data.branch };
}
const input = new Map();
for (let i = 0; i < args.length;) {
  const key = args[i++], file = args[i++];
  if (!Object.hasOwn(keys, key) || !file || file.startsWith('--') ||
      input.has(key)) {
    result.issues.push('Invalid, missing or duplicated option: ' + (key ?? 'none'));
    continue;
  }
  input.set(key, file);
}
const evidence = [];
for (const [key, platform] of Object.entries(keys)) {
  const file = input.get(key);
  if (!file) { result.issues.push('Missing required ' + key); continue; }
  const legacy = key.endsWith('-legacy');
  try {
    const validated = inspect(file, platform, legacy);
    evidence.push(validated);
    if (legacy) result.legacy_posix[platform] = 'REPORTED_PASS';
    else result.core[platform] = 'REPORTED_PASS';
  } catch (e) {
    result.issues.push('Rejected ' + key + ' (' + path.basename(file) +
      '): ' + e.message);
  }
}
if (evidence.length === Object.keys(keys).length) {
  const shas = new Set(evidence.map(x => x.head));
  const branches = new Set(evidence.map(x => x.branch));
  if (shas.size !== 1) result.issues.push('Different SHA across native reports');
  if (branches.size !== 1) result.issues.push('Different branch across native reports');
  if (shas.size === 1) result.candidate_sha = evidence[0].head;
  if (branches.size === 1) result.candidate_branch = evidence[0].branch;
}
if (result.issues.length === 0 && evidence.length === Object.keys(keys).length) {
  result.automated_evidence = 'REPORTED_PASS_PENDING_INDEPENDENT_REVIEW';
  if (result.candidate_branch !== 'develop')
    result.warnings.push('Candidate branch not develop; revalidate after integration');
}
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (result.automated_evidence !== 'REPORTED_PASS_PENDING_INDEPENDENT_REVIEW')
  process.exitCode = 1;
