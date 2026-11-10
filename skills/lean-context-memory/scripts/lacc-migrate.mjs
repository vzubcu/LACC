// Lossless, opt-in memory snapshot before human-reviewed legacy migration.
// No automatic fact rewriting, auto-archiving or semantic "repair".
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { emitLimited, inventory, LIMITS, localPath, topicPaths, verifySources, conflicts } from './lacc-core.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_SNAPSHOT = 16 * 1048576;
const MAX_FILE = 1048576;
const BACKUPS = 'memory/archive/lacc-snapshots';

function selectedFiles(root) {
  const relative = ['memory/ACTIVE_STATE.md', 'memory/MEMORY_INDEX.md'];
  for (const file of topicPaths(root))
    relative.push(path.relative(root, file).split(path.sep).join('/'));
  relative.sort();
  const files = [];
  let total = 0;
  for (const name of relative) {
    const file = localPath(root, name);
    if (!fs.statSync(file).isFile()) throw Error('non-file memory source: ' + name);
    const size = fs.statSync(file).size;
    if (size > MAX_FILE || total + size > MAX_SNAPSHOT)
      throw Error('snapshot too large; narrow/migrate manually: ' + name);
    const bytes = fs.readFileSync(file);
    total += bytes.length;
    files.push({ path: name, size: bytes.length, sha256: sha(bytes) });
  }
  return { files, total, digest: sha(Buffer.from(JSON.stringify(files), 'utf8')) };
}
export function migrationAudit(root, maxBytes) {
  const items = inventory(root, { bounded: true, maximumFacts: 1000 });
  const checked = items.facts.slice(0, 64);
  const statuses = verifySources(root, checked);
  const suspicious = [];
  for (const row of items.invalid) suspicious.push({ code: 'invalid-fact', location: row.location });
  for (const row of items.unsupported) suspicious.push({ code: 'legacy-note', location: row.location });
  for (const row of checked) {
    if (row.state !== 'confirmed') suspicious.push({ code: 'pending-review', location: row.location });
    for (const issue of statuses.get(row.location) ?? [])
      suspicious.push({ code: issue.code, location: row.location });
  }
  for (const [key] of conflicts(items.facts))
    suspicious.push({ code: 'potential-conflict', location: 'key=' + key });
  const incomplete = items.incomplete || items.facts.length > checked.length;
  const counts = {};
  for (const item of suspicious) counts[item.code] = (counts[item.code] ?? 0) + 1;
  let snapshot;
  try {
    const manifest = selectedFiles(root);
    snapshot = { digest: manifest.digest, files: manifest.files.length, total_bytes: manifest.total };
  } catch (error) {
    snapshot = { unavailable: true, reason: error.message };
  }
  const result = {
    status: incomplete ? 'incomplete' : suspicious.length ? 'review' : 'healthy',
    records_scanned: items.facts.length,
    records_git_checked: checked.length,
    scan_incomplete: incomplete,
    counts, total_issues: suspicious.length,
    snapshot, items: suspicious.slice(0, 30),
    output_truncated: suspicious.length > 30,
    note: 'Read-only. Legacy notes are unverified, not necessarily false. Snapshot does not change canonical memory.',
  };
  return { text: emitLimited(result, maxBytes), code: incomplete || suspicious.length ? 1 : 0 };
}
export function migrationBackup(root, { expect, apply, maxBytes } = {}) {
  const preview = selectedFiles(root);
  const summary = {
    status: 'preview', expected_digest: preview.digest,
    file_count: preview.files.length, total_bytes: preview.total,
    destination: BACKUPS + '/' + preview.digest,
    applies_only_if_digest_matches: true,
    note: 'Backup only; no canonical fact is edited, revalidated or removed. Keep archives private and out of Git.',
  };
  if (!apply) return { text: emitLimited(summary, maxBytes), code: 0 };
  if (!/^[a-f0-9]{64}$/.test(expect ?? '') || expect !== preview.digest)
    throw Error('backup requires --apply and exact --expect digest from current preview');
  const parent = localPath(root, BACKUPS);
  fs.mkdirSync(parent, { recursive: true });
  const snapRel = BACKUPS + '/' + preview.digest;
  const snapDir = localPath(root, snapRel);
  const manifestPath = localPath(root, snapRel + '/manifest.json');
  if (fs.existsSync(snapDir)) {
    if (!fs.existsSync(manifestPath)) throw Error('incomplete backup directory exists; inspect manually');
    const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (existing.digest !== preview.digest ||
        JSON.stringify(existing.files) !== JSON.stringify(preview.files))
      throw Error('existing backup has a different manifest');
    return { text: emitLimited({ ...summary, status: 'existing' }, maxBytes), code: 0 };
  }
  fs.mkdirSync(snapDir);
  // Exclusive writes, manifest LAST: an interrupted backup cannot look complete.
  for (const entry of preview.files) {
    const source = localPath(root, entry.path);
    const destination = localPath(root, snapRel + '/files/' + entry.path);
    const data = fs.readFileSync(source);
    if (sha(data) !== entry.sha256) throw Error('source changed while backing up: ' + entry.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data, { flag: 'wx', mode: 0o600 });
    if (sha(fs.readFileSync(destination)) !== entry.sha256)
      throw Error('backup verification failed: ' + entry.path);
  }
  if (selectedFiles(root).digest !== preview.digest)
    throw Error('source changed during backup; incomplete snapshot requires review');
  const manifest = JSON.stringify({ schema: 1, digest: preview.digest, files: preview.files }, null, 2) + '\n';
  fs.writeFileSync(manifestPath, manifest, { flag: 'wx', mode: 0o600 });
  return { text: emitLimited({ ...summary, status: 'backed-up' }, maxBytes), code: 0 };
}
export function migrationInspect(root, { snapshot, maxBytes } = {}) {
  if (!/^[a-f0-9]{64}$/.test(snapshot ?? '')) throw Error('use --snapshot with a 64-character backup digest');
  const relative = BACKUPS + '/' + snapshot;
  const manifestPath = localPath(root, relative + '/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schema !== 1 || manifest.digest !== snapshot || !Array.isArray(manifest.files))
    throw Error('invalid snapshot manifest');
  let bytes = 0;
  const rows = [];
  for (const entry of manifest.files) {
    if (!entry || !entry.path?.startsWith('memory/') || entry.path.startsWith('memory/archive/') ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        !Number.isSafeInteger(entry.size) || entry.size < 0) throw Error('unsafe snapshot manifest');
    const file = localPath(root, relative + '/files/' + entry.path);
    const data = fs.readFileSync(file);
    if (data.length !== entry.size || sha(data) !== entry.sha256)
      throw Error('backup file no longer matches manifest: ' + entry.path);
    bytes += data.length;
    rows.push({ path: entry.path, size: entry.size, sha256: entry.sha256 });
  }
  if (sha(Buffer.from(JSON.stringify(rows), 'utf8')) !== snapshot)
    throw Error('snapshot digest mismatch');
  return { text: emitLimited({ status: 'verified', snapshot, files: rows.length,
    total_bytes: bytes, note: 'Backup verified. Recovery requires deliberate manual copy; no overwrites performed.' },
    maxBytes), code: 0 };
}
