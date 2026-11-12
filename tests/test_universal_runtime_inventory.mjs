import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateUniversalRuntimeInventory } from './universal_runtime_inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'tests/fixtures/universal-runtime-v4-inventory.json'), 'utf8'));

test('UR-4 inventories every shipped Bash/Python script without claiming parity', () => {
  const result = validateUniversalRuntimeInventory(root, manifest);
  assert.equal(result.status, 'INVENTORIED_NOT_MIGRATED');
  assert.equal(result.total, 18);
  assert.equal(result.bash, 5);
  assert.equal(result.python, 13);
  assert.equal(result.candidates, 6);
  assert.equal(result.gaps, 10);
  assert.equal(result.libraries, 2);
});
test('missing, duplicate, or unreviewed legacy scripts fail the migration gate', () => {
  for (const modify of [
    rows => rows.pop(),
    rows => rows.push({...rows[0]}),
    rows => rows[0].path = 'skills/lean-context-memory/scripts/../unsafe.py',
    rows => rows[0].migration = 'verified',
    rows => rows[0].node_command = 'init',
  ]) {
    const sample = structuredClone(manifest);
    modify(sample.legacy);
    assert.throws(() => validateUniversalRuntimeInventory(root, sample), /UR-4/);
  }
});
test('a matching CLI command name is not declared equivalent to legacy behavior', () => {
  assert.ok(manifest.legacy.every(row => row.migration !== 'verified'));
  assert.ok(manifest.policy.includes('No deletion'));
  const sample = structuredClone(manifest);
  const candidate = sample.legacy.find(row => row.migration === 'candidate-unverified');
  candidate.node_command = 'nonexistent-command';
  assert.throws(() => validateUniversalRuntimeInventory(root, sample),
    /candidate CLI dispatch absent/);
});
