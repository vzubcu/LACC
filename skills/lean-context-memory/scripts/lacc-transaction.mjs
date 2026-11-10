// Reviewed, recoverable multi-file HOT/WARM migration and snapshot restore.
// Cooperative locking + journal, not a filesystem-wide atomic transaction.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { git, gitText, localPath, privateStore, LIMITS } from './lacc-core.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const HEX = /^[a-f0-9]{64}$/, SHA40 = /^[a-f0-9]{40}$/;
const MAX_FILES = 128, MAX_FILE = 1048576, MAX_TOTAL = 16 * 1048576;
const STORE = 'memory/archive/lacc-transactions';
const SNAP = 'memory/archive/lacc-snapshots';
const LOCK = 'memory/.lacc-locks/migration-transaction.lock';
function target(name) {
  if (name === 'memory/ACTIVE_STATE.md' || name === 'memory/MEMORY_INDEX.md') return name;
  if (typeof name === 'string' && /^memory\/topics\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.md$/.test(name)) return name;
  throw Error('unsafe canonical target');
}
function read(root, name) {
  const file = localPath(root, name), stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_FILE) throw Error('missing or oversized file: ' + name);
  const bytes = fs.readFileSync(file);
  if (bytes.length > MAX_FILE) throw Error('oversized file: ' + name);
  return { bytes, mode: stat.mode & 0o777, digest: sha(bytes) };
}
function head(root) {
  const result = git(root, ['rev-parse', '--verify', 'HEAD']);
  const revision = result.ok ? gitText(result) : '';
  if (!SHA40.test(revision)) throw Error('Git HEAD required for migration');
  return revision;
}
function validate(name, bytes) {
  const contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (name === 'memory/ACTIVE_STATE.md' || name === 'memory/MEMORY_INDEX.md') {
    const [maxLines, maxBytes] = name.endsWith('ACTIVE_STATE.md')
      ? [LIMITS.stateLines, LIMITS.stateBytes] : [LIMITS.indexLines, LIMITS.indexBytes];
    const lines = contents.split(/\r\n|\r|\n/);
    if (bytes.length > maxBytes || lines.length - (lines.at(-1) === '' ? 1 : 0) > maxLines)
      throw Error('proposed HOT content exceeds limits: ' + name);
  }
}
function fromSnapshot(root, digest) {
  if (!HEX.test(digest ?? '')) throw Error('invalid snapshot identifier');
  const manifest = read(root, SNAP + '/' + digest + '/manifest.json');
  if (manifest.bytes.length > 128 * 1024) throw Error('oversized snapshot manifest');
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifest.bytes));
  if (data.schema !== 1 || data.digest !== digest || !Array.isArray(data.files) ||
      data.files.length < 1 || data.files.length > MAX_FILES) throw Error('invalid snapshot manifest');
  const rows = [], entries = [];
  let total = 0;
  for (const row of data.files) {
    const name = target(row?.path);
    if (!HEX.test(row?.sha256 ?? '') || !Number.isSafeInteger(row.size) ||
        row.size < 0 || row.size > MAX_FILE) throw Error('invalid snapshot entry');
    const source = SNAP + '/' + digest + '/files/' + name;
    const bytes = read(root, source);
    if (bytes.bytes.length !== row.size || bytes.digest !== row.sha256)
      throw Error('snapshot content mismatch: ' + name);
    total += row.size;
    if (total > MAX_TOTAL) throw Error('snapshot too large');
    rows.push({ path: name, size: row.size, sha256: row.sha256 });
    entries.push({ target: name, source });
  }
  if (sha(Buffer.from(JSON.stringify(rows), 'utf8')) !== digest ||
      new Set(rows.map(row => row.path)).size !== rows.length) throw Error('snapshot digest mismatch');
  return entries;
}
function fromPlan(root, name) {
  if (typeof name !== 'string' || !/^\.lacc-proposals\/[a-zA-Z0-9_/-]+\.json$/.test(name) ||
      name.split('/').includes('..') || name.includes('//'))
    throw Error('plan must be a safe .lacc-proposals/*.json');
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read(root, name).bytes));
  if (data.schema !== 1 || !Array.isArray(data.files) || data.files.length < 1 ||
      data.files.length > MAX_FILES) throw Error('invalid migration plan');
  return data.files.map(item => {
    const dest = target(item?.target), source = item?.proposal;
    if (typeof source !== 'string' ||
        !/^\.lacc-proposals\/[a-zA-Z0-9_./-]+\.md$/.test(source) ||
        source.split('/').includes('..') || source.includes('//'))
      throw Error('invalid plan proposal path');
    return { target: dest, source };
  });
}
function prepare(root, { plan, snapshot } = {}) {
  if (Boolean(plan) === Boolean(snapshot)) throw Error('provide exactly one of --plan or --snapshot');
  const entries = plan ? fromPlan(root, plan) : fromSnapshot(root, snapshot);
  if (new Set(entries.map(e => e.target)).size !== entries.length) throw Error('duplicate canonical target');
  let bytes = 0;
  const files = entries.map(entry => {
    const before = read(root, entry.target), after = read(root, entry.source);
    validate(entry.target, after.bytes);
    bytes += before.bytes.length + after.bytes.length;
    if (bytes > MAX_TOTAL) throw Error('transaction byte budget exceeded');
    return { target: entry.target, source: entry.source,
      before: before.digest, after: after.digest, size: after.bytes.length };
  }).sort((a, b) => a.target.localeCompare(b.target));
  const record = { schema: 1, mode: plan ? 'migration' : 'restore',
    head: head(root), input: plan ?? snapshot, files };
  return { ...record, expect: sha(Buffer.from(JSON.stringify(record), 'utf8')) };
}
export function transactionPreview(root, opts) {
  return { status: 'preview', ...prepare(root, opts), reviewed: false,
    note: 'Read-only. Review complete diff, provenance and current source; token binds all canonical and proposal bytes.' };
}
function locked(root, callback) {
  privateStore(root, 'memory/.lacc-locks');
  const file = localPath(root, LOCK);
  try { fs.mkdirSync(file); }
  catch (err) {
    if (err.code === 'EEXIST') throw Error('migration lock held; investigate, do not steal');
    throw err;
  }
  try { return callback(); } finally { fs.rmdirSync(file); }
}
function save(root, file, object) {
  const dest = localPath(root, file), temp = localPath(root, file + '.tmp-' + randomUUID());
  try {
    fs.writeFileSync(temp, JSON.stringify(object, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, dest);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function replace(root, name, bytes, mode, expected) {
  const file = localPath(root, name);
  if (read(root, name).digest !== expected) throw Error('canonical target changed: ' + name);
  const temp = localPath(root, name + '.lacc-' + randomUUID() + '.tmp');
  try {
    fs.writeFileSync(temp, bytes, { flag: 'wx', mode });
    if (read(root, name).digest !== expected) throw Error('noncooperating writer changed: ' + name);
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function journal(root, id) {
  if (!HEX.test(id ?? '')) throw Error('invalid transaction id');
  const base = STORE + '/' + id;
  const raw = fs.readFileSync(localPath(root, base + '/journal.json'));
  if (raw.length > 128 * 1024) throw Error('oversized journal');
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  if (data.schema !== 1 || data.id !== id || !Array.isArray(data.files) ||
      data.files.length > MAX_FILES ||
      !['prepared','applying','complete','recovering','recovered'].includes(data.status))
    throw Error('invalid transaction journal');
  if (new Set(data.files.map(x => target(x.target))).size !== data.files.length)
    throw Error('duplicate journal target');
  return { base, data };
}
function checkPreimages(root, base, files) {
  for (const row of files) {
    if (!HEX.test(row.before ?? '') || !HEX.test(row.after ?? ''))
      throw Error('invalid journal digest');
    const original = read(root, base + '/before/' + row.target);
    if (original.digest !== row.before) throw Error('corrupt rollback copy: ' + row.target);
    const current = read(root, row.target).digest;
    if (current !== row.before && current !== row.after)
      throw Error('unrecognized external edit; refusing recovery: ' + row.target);
  }
}
function recoverLocked(root, id, states) {
  const { base, data } = journal(root, id);
  if (!states.includes(data.status)) throw Error('cannot recover transaction with status ' + data.status);
  checkPreimages(root, base, data.files);
  data.status = 'recovering';
  save(root, base + '/journal.json', data);
  for (const row of [...data.files].reverse()) {
    const current = read(root, row.target);
    if (current.digest === row.before) continue;
    const old = read(root, base + '/before/' + row.target);
    replace(root, row.target, old.bytes, old.mode, row.after);
  }
  data.status = 'recovered';
  save(root, base + '/journal.json', data);
  return { status: 'recovered', transaction: id, files: data.files.length,
    note: 'Restored journal before-hashes. No semantic review was inferred.' };
}
export function transactionApply(root, { plan, snapshot, expect, reviewed } = {}) {
  if (!reviewed || !HEX.test(expect ?? ''))
    throw Error('apply requires --reviewed and exact --expect');
  return locked(root, () => {
    const info = prepare(root, { plan, snapshot });
    if (info.expect !== expect) throw Error('stale preview; no changes made');
    const id = info.expect;
    privateStore(root, 'memory/archive');
    const base = STORE + '/' + id;
    const dir = localPath(root, base);
    if (fs.existsSync(dir)) throw Error('transaction already exists; inspect/recover explicitly');
    fs.mkdirSync(dir, { recursive: true });
    for (const row of info.files) {
      const current = read(root, row.target);
      if (current.digest !== row.before) throw Error('canonical drift before backup');
      const dest = localPath(root, base + '/before/' + row.target);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, current.bytes, { flag: 'wx', mode: current.mode });
      if (read(root, base + '/before/' + row.target).digest !== row.before)
        throw Error('rollback copy mismatch');
    }
    const state = { schema: 1, id, mode: info.mode, head: info.head,
      status: 'prepared', files: info.files };
    save(root, base + '/journal.json', state);
    try {
      state.status = 'applying';
      save(root, base + '/journal.json', state);
      for (const row of state.files) {
        if (head(root) !== state.head) throw Error('Git HEAD changed during transaction');
        const next = read(root, row.source);
        if (next.digest !== row.after) throw Error('proposal changed during transaction');
        const old = read(root, base + '/before/' + row.target);
        replace(root, row.target, next.bytes, old.mode, row.before);
      }
      state.status = 'complete';
      save(root, base + '/journal.json', state);
      return { status: 'applied', transaction: id, mode: state.mode,
        files: state.files.length, journal: base + '/journal.json',
        note: 'Cooperative multi-file operation completed; run health. Not filesystem-atomic.' };
    } catch (error) {
      try { recoverLocked(root, id, ['prepared','applying','recovering']); }
      catch (failure) {
        throw Error('transaction interrupted: ' + error.message +
          '; manual recovery required: ' + failure.message + '; id=' + id);
      }
      throw Error('transaction aborted and rolled back: ' + error.message);
    }
  });
}
export function transactionInspect(root, id) {
  const { base, data } = journal(root, id);
  checkPreimages(root, base, data.files);
  return { status: data.status, id, mode: data.mode, head: data.head,
    files: data.files.length, note: 'Journal compared with known before/after content hashes.' };
}
export function transactionRecover(root, { id, reviewed } = {}) {
  if (!reviewed) throw Error('recovery requires --reviewed');
  return locked(root, () => recoverLocked(root, id, ['prepared','applying','recovering','recovered']));
}
