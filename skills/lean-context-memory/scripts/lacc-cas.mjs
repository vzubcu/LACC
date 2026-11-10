// Optimistic, single-file compare-and-swap for reviewed canonical Markdown.
// Deliberately not a semantic validator, a distributed lock or a multi-file transaction.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { git, gitText, localPath, privateStore, LIMITS } from './lacc-core.mjs';

const sha = data => createHash('sha256').update(data).digest('hex');
const HEX = /^[a-f0-9]{64}$/;
const MAX_PROPOSAL = 1024 * 1024;
function targetPath(name) {
  if (name === 'memory/ACTIVE_STATE.md' || name === 'memory/MEMORY_INDEX.md') return name;
  if (/^memory\/topics\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.md$/.test(name))
    return name;
  throw Error('target must be ACTIVE_STATE, MEMORY_INDEX, or a safe topic markdown path');
}
function checkedHead(root) {
  const r = git(root, ['rev-parse', '--verify', 'HEAD']);
  if (!r.ok || !/^[a-f0-9]{40}$/.test(gitText(r)))
    throw Error('current Git HEAD unavailable; canonical write refused');
  return gitText(r);
}
function readFile(root, relative) {
  const file = localPath(root, relative);
  const st = fs.statSync(file);
  if (!st.isFile() || st.size > MAX_PROPOSAL) throw Error('invalid or oversized file: ' + relative);
  return { file, st, bytes: fs.readFileSync(file) };
}
function proposal(root, dest, proposalName) {
  const name = targetPath(dest);
  if (typeof proposalName !== 'string' || !proposalName.startsWith('.lacc-proposals/'))
    throw Error('proposal must be project-relative under .lacc-proposals/');
  const current = readFile(root, name);
  const next = readFile(root, proposalName);
  const content = new TextDecoder('utf-8', { fatal: true }).decode(next.bytes);
  if (name === 'memory/ACTIVE_STATE.md' || name === 'memory/MEMORY_INDEX.md') {
    const limit = name.endsWith('ACTIVE_STATE.md')
      ? [LIMITS.stateLines, LIMITS.stateBytes] : [LIMITS.indexLines, LIMITS.indexBytes];
    const rows = content.split(/\r\n|\n|\r/);
    if (rows.length - (rows.at(-1) === '' ? 1 : 0) > limit[0] || next.bytes.length > limit[1])
      throw Error('proposed HOT memory exceeds size limits');
  }
  if (name.startsWith('memory/topics/') && next.bytes.length > LIMITS.topicBytes)
    throw Error('proposed topic exceeds scan budget');
  const head = checkedHead(root);
  const record = {
    target: name, proposal: proposalName, head,
    before_sha256: sha(current.bytes), after_sha256: sha(next.bytes),
  };
  return { ...record, expect: sha(Buffer.from(JSON.stringify(record), 'utf8')) };
}
export function canonicalPreview(root, { file, contentFile } = {}) {
  const p = proposal(root, file, contentFile);
  return {
    status: 'preview', ...p,
    reviewed: false,
    note: 'Preview only. Review the proposed diff and every new/changed source fact. The expect token is invalidated by any source/proposal/HEAD change.',
  };
}
export function canonicalApply(root, { file, contentFile, expect, reviewed } = {}) {
  if (!reviewed || !HEX.test(expect ?? ''))
    throw Error('apply requires --reviewed and exact --expect preview token');
  // Exclusive per-target lock. Never remove another agent's lock or auto-steal.
  // Used before re-reading the current file and proposal, preventing competing
  // LACC writers from interleaving the compare-and-swap.
  const dest = targetPath(file);
  const locks = 'memory/.lacc-locks';
  privateStore(root, locks);
  const lock = localPath(root, locks + '/' + sha(dest) + '.lock');
  let acquired = false;
  try {
    fs.mkdirSync(lock);
    acquired = true;
  } catch (err) {
    if (err.code === 'EEXIST') throw Error('canonical file locked by another writer; no changes made');
    throw err;
  }
  try {
    const p = proposal(root, dest, contentFile);
    if (p.expect !== expect) throw Error('stale preview: canonical file, proposal or Git HEAD changed');
    const before = readFile(root, dest);
    const next = readFile(root, contentFile);
    if (sha(before.bytes) !== p.before_sha256 || sha(next.bytes) !== p.after_sha256)
      throw Error('source changed during CAS preparation');
    // Make an exact, private, digest-indexed copy for explicit manual rollback.
    // A failure here aborts before changing the canonical file.
    const backups = 'memory/archive/lacc-cas';
    privateStore(root, 'memory/archive');
    const relative = backups + '/' + p.before_sha256;
    const backup = localPath(root, relative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    try {
      fs.writeFileSync(backup, before.bytes, { flag: 'wx', mode: 0o600 });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (sha(fs.readFileSync(backup)) !== p.before_sha256)
        throw Error('existing rollback copy is invalid');
    }
    // Temp file is on same filesystem; replacement is an atomic rename on
    // supported filesystems. No truncation-in-place or last-writer-wins.
    const temp = localPath(root, dest + '.lacc-' + randomUUID() + '.tmp');
    try {
      fs.writeFileSync(temp, next.bytes, { flag: 'wx', mode: before.st.mode & 0o777 });
      // File digest rechecked while lock is held; non-LACC writers are not
      // locked by this protocol and require separate coordination.
      if (sha(fs.readFileSync(before.file)) !== p.before_sha256 ||
          checkedHead(root) !== p.head)
        throw Error('canonical target changed before atomic replacement');
      fs.renameSync(temp, before.file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
    return {
      status: 'applied', target: dest, before_sha256: p.before_sha256,
      after_sha256: p.after_sha256, head: p.head, rollback_copy: relative,
      note: 'Reviewed CAS write only. Semantic/source provenance must still pass health; rollback is deliberate/manual.',
    };
  } finally {
    if (acquired) fs.rmdirSync(lock);
  }
}
