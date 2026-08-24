import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../db/postgres/migrations/0008_normalized_json_indexes.sql', import.meta.url),
  'utf8',
);

describe('PostgreSQL normalized JSON indexes', () => {
  it('materializes VN relations and release platforms behind foreign keys', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS vn_relation_index');
    expect(migration).toContain('REFERENCES vn(id) ON DELETE CASCADE');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS release_platform_index');
    expect(migration).toContain('REFERENCES release_meta_cache(release_id) ON DELETE CASCADE');
  });

  it('synchronizes inserts and updates while tolerating quarantined JSON', () => {
    expect(migration).toContain('CREATE TRIGGER trg_sync_vn_relation_index');
    expect(migration).toContain('CREATE TRIGGER trg_sync_release_platform_index');
    expect(migration).toContain("pg_input_is_valid(NEW.relations, 'jsonb')");
    expect(migration).toContain("pg_input_is_valid(NEW.platforms, 'jsonb')");
  });

  it('backfills both derived indexes for an existing PostgreSQL database', () => {
    expect(migration).toContain('DELETE FROM vn_relation_index;');
    expect(migration).toContain('INSERT INTO vn_relation_index');
    expect(migration).toContain('DELETE FROM release_platform_index;');
    expect(migration).toContain('INSERT INTO release_platform_index');
  });
});
