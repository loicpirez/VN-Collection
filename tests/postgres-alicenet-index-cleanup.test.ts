import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../db/postgres/migrations/0009_drop_legacy_alicenet_indexes.sql', import.meta.url),
  'utf8',
);

const legacyIndexes = [
  'idx_alicesoft_kobe_vn',
  'idx_alicesoft_kobe_unmatched',
  'idx_alicesoft_kobe_no_vndb',
  'idx_alicesoft_kobe_title',
  'idx_alicesoft_kobe_egs_resolve',
];

describe('PostgreSQL AliceNet legacy index cleanup', () => {
  it('is transactional and safe to replay', () => {
    expect(migration.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect((migration.match(/DROP INDEX IF EXISTS/g) ?? [])).toHaveLength(legacyIndexes.length);
  });

  it('drops every duplicate legacy index without touching canonical AliceNet indexes', () => {
    for (const index of legacyIndexes) expect(migration).toContain(`DROP INDEX IF EXISTS ${index};`);
    expect(migration).not.toMatch(/DROP INDEX IF EXISTS idx_alicenet_/);
  });
});
