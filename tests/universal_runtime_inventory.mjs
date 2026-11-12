// UR-4 inventory gate. Static and read-only: no Git, Bash, Python, network
// or project modification. A candidate replacement is NOT proven equivalent.
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'skills/lean-context-memory/scripts/';
const ALLOWED_MIGRATION = new Set(['candidate-unverified', 'missing', 'library-review']);
const ALLOWED_RISKS = new Set(['low', 'medium', 'high', 'critical']);

export function validateUniversalRuntimeInventory(root, data) {
  if (!data || data.schema !== 1 || data.migration_state !== 'INVENTORY_ONLY' ||
      !Array.isArray(data.legacy) || data.legacy.length === 0)
    throw Error('UR-4 inventory schema/state invalid; no migration claim possible');
  const scripts = path.join(root, ...BASE.split('/').filter(Boolean));
  const actual = fs.readdirSync(scripts)
    .filter(name => name.endsWith('.sh') || name.endsWith('.py'))
    .map(name => BASE + name).sort();
  const declared = new Set();
  const counts = { bash: 0, python: 0, candidates: 0, gaps: 0, libraries: 0 };
  for (const entry of data.legacy) {
    if (!entry || typeof entry !== 'object' || typeof entry.path !== 'string' ||
        !/^skills\/lean-context-memory\/scripts\/[a-z0-9_-]+\.(?:sh|py)$/.test(entry.path) ||
        declared.has(entry.path) || !ALLOWED_MIGRATION.has(entry.migration) ||
        !ALLOWED_RISKS.has(entry.risk) ||
        typeof entry.contract !== 'string' || entry.contract.length < 12)
      throw Error('UR-4 malformed, duplicated, or prematurely verified inventory entry');
    declared.add(entry.path);
    const runtime = entry.path.endsWith('.sh') ? 'bash' : 'python';
    if (entry.runtime !== runtime || !['wrapper', 'tool', 'library'].includes(entry.role) ||
        (runtime === 'bash' && entry.role !== 'wrapper') ||
        (entry.role === 'library' && entry.migration !== 'library-review') ||
        (entry.migration === 'library-review' && entry.role !== 'library'))
      throw Error('UR-4 legacy language/role/migration mismatch');
    if (entry.migration === 'candidate-unverified') {
      if (typeof entry.node_command !== 'string' ||
          !/^[a-z][a-z-]*$/.test(entry.node_command))
        throw Error('UR-4 missing candidate command');
      counts.candidates++;
    } else if (entry.node_command !== null) {
      throw Error('UR-4 an unported entry may not claim a Node command');
    } else if (entry.migration === 'missing') counts.gaps++;
    else counts.libraries++;
    counts[runtime]++;
  }
  if (JSON.stringify(actual) !== JSON.stringify([...declared].sort()))
    throw Error('UR-4 inventory drift: every Bash/Python script must be accounted for');
  const cli = fs.readFileSync(path.join(scripts, 'lacc.mjs'), 'utf8');
  for (const entry of data.legacy.filter(row => row.migration === 'candidate-unverified')) {
    // This proves a CLI dispatch exists, not semantic parity with its predecessor.
    if (!cli.includes("command === '" + entry.node_command + "'"))
      throw Error('UR-4 candidate CLI dispatch absent: ' + entry.node_command);
  }
  return { status: 'INVENTORIED_NOT_MIGRATED', total: declared.size, ...counts };
}
