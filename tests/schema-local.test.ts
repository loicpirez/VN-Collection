/**
 * Tests for `listLocalSqliteSchema()` — the read-only schema enumerator
 * powering the `/schema` admin browser.
 *
 * The function is read-only and its only inputs are table names already
 * coming from `sqlite_master`. Even so, the helper escapes embedded
 * double-quote characters before interpolating the table name into the
 * `PRAGMA table_info(...)` call, so a future contributor adding a
 * misnamed table can't crash the page.
 */
import { describe, it, expect } from 'vitest';
import { getDatabaseSchemaSnapshot, listLocalSqliteSchema } from '@/lib/schema-local';

describe('listLocalSqliteSchema', () => {
  it('returns a provider-neutral SQLite snapshot without PostgreSQL diagnostics', async () => {
    const snapshot = await getDatabaseSchemaSnapshot();
    expect(snapshot.backend).toBe('sqlite');
    expect(snapshot.migrationVersion).toBeNull();
    expect(snapshot.pool).toBeNull();
    expect(snapshot.tables.some((table) => table.name === 'collection')).toBe(true);
  });

  it('returns the core canonical tables', async () => {
    const schema = await listLocalSqliteSchema();
    const names = new Set(schema.map((t) => t.name));
    expect(names.has('vn')).toBe(true);
    expect(names.has('collection')).toBe(true);
    expect(names.has('app_setting')).toBe(true);
  });

  it('lists collection columns including vn_id and status', async () => {
    const schema = await listLocalSqliteSchema();
    const collection = schema.find((t) => t.name === 'collection');
    expect(collection).toBeTruthy();
    const colNames = new Set(collection!.columns.map((c) => c.name));
    expect(colNames.has('vn_id')).toBe(true);
    expect(colNames.has('status')).toBe(true);
  });

  it('lists vn columns including id and title', async () => {
    const schema = await listLocalSqliteSchema();
    const vn = schema.find((t) => t.name === 'vn');
    expect(vn).toBeTruthy();
    const colNames = new Set(vn!.columns.map((c) => c.name));
    expect(colNames.has('id')).toBe(true);
    expect(colNames.has('title')).toBe(true);
  });

  it('excludes sqlite_master and other sqlite_% internal tables', async () => {
    const schema = await listLocalSqliteSchema();
    for (const t of schema) {
      expect(t.name.startsWith('sqlite_')).toBe(false);
    }
  });

  it('returns tables sorted case-insensitively', async () => {
    const schema = await listLocalSqliteSchema();
    const sorted = [...schema].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    expect(schema.map((t) => t.name)).toEqual(sorted.map((t) => t.name));
  });
});
