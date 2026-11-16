// BF-2c: pure Git -z record parsing for Windows, Linux and macOS.
// Git's NUL format avoids quoting/escaping filenames with whitespace or tabs.
const text = buffer => Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer ?? '');
const eligible = p => p !== 'memory' && !p.startsWith('memory/');
export const safeGitPath = p => p.replace(/[\u0000-\u001f\u007f-\u009f]/g, c =>
  c === '\n' ? '\\n' : c === '\t' ? '\\t' : c === '\r' ? '\\r' : '?');

export function parsePorcelainZ(buffer) {
  const tokens = text(buffer).split('\0');
  if (tokens.at(-1) !== '') throw Error('incomplete Git status -z output');
  const rows = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const record = tokens[i];
    if (record.length < 4 || record[2] !== ' ') throw Error('invalid Git status record');
    const status = record.slice(0, 2);
    const name = record.slice(3);
    if (!name) throw Error('empty Git status path');
    let previous = null;
    if (/[RC]/.test(status)) {
      previous = tokens[++i];
      if (!previous) throw Error('missing Git rename/copy source');
    }
    rows.push({ status, path: name, previous });
  }
  return rows;
}

export function parseDiffNameStatusZ(buffer) {
  const tokens = text(buffer).split('\0');
  if (tokens.at(-1) !== '') throw Error('incomplete Git diff -z output');
  const rows = [];
  for (let i = 0; i < tokens.length - 1;) {
    const status = tokens[i++];
    if (!/^[ACDMRTUXB][0-9]*$/.test(status)) throw Error('invalid Git diff status');
    const before = tokens[i++];
    if (!before) throw Error('empty Git diff path');
    const after = /^[RC]/.test(status) ? tokens[i++] : null;
    if (/^[RC]/.test(status) && !after) throw Error('missing Git diff rename/copy target');
    rows.push({ status, path: after ?? before, previous: after ? before : null });
  }
  return rows;
}

export function changesOutsideMemory(rows) {
  return rows.filter(row =>
    eligible(row.path) || (row.previous !== null && eligible(row.previous)));
}
export function formatGitChanges(rows, name, max = 18) {
  let output = name + ': ' + rows.length + ' paths\n';
  for (const row of rows.slice(0, max)) {
    const where = row.previous === null ? row.path :
      row.previous + ' -> ' + row.path;
    output += '- ' + safeGitPath(where) + '\n';
  }
  if (rows.length > max)
    output += '... ' + (rows.length - max) + ' paths omitted; inspect full Git status/diff locally.\n';
  return output;
}
