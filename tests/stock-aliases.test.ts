import { beforeEach, describe, expect, it } from 'vitest';
import { listStockAliases, upsertStockAlias, deleteStockAlias } from '@/lib/db';

const VN_ID = 'v99999';

beforeEach(() => {
  for (const row of listStockAliases(VN_ID)) {
    deleteStockAlias(VN_ID, row.alias_term);
  }
});

describe('stock alias CRUD', () => {
  it('returns empty list when no aliases exist', () => {
    expect(listStockAliases(VN_ID)).toEqual([]);
  });

  it('upserts an alias and lists it', () => {
    upsertStockAlias(VN_ID, 'サンプル');
    const rows = listStockAliases(VN_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].alias_term).toBe('サンプル');
    expect(rows[0].vn_id).toBe(VN_ID);
    expect(rows[0].created_at).toBeGreaterThan(0);
  });

  it('upsert is idempotent for the same term', () => {
    upsertStockAlias(VN_ID, 'サンプル');
    upsertStockAlias(VN_ID, 'サンプル');
    expect(listStockAliases(VN_ID)).toHaveLength(1);
  });

  it('stores multiple distinct aliases', () => {
    upsertStockAlias(VN_ID, 'term A');
    upsertStockAlias(VN_ID, 'term B');
    const terms = listStockAliases(VN_ID).map((r) => r.alias_term);
    expect(terms).toContain('term A');
    expect(terms).toContain('term B');
    expect(terms).toHaveLength(2);
  });

  it('deletes a specific alias without affecting others', () => {
    upsertStockAlias(VN_ID, 'keep');
    upsertStockAlias(VN_ID, 'remove');
    deleteStockAlias(VN_ID, 'remove');
    const terms = listStockAliases(VN_ID).map((r) => r.alias_term);
    expect(terms).toEqual(['keep']);
  });

  it('delete is a no-op for non-existent alias', () => {
    upsertStockAlias(VN_ID, 'existing');
    deleteStockAlias(VN_ID, 'nonexistent');
    expect(listStockAliases(VN_ID)).toHaveLength(1);
  });

  it('aliases are scoped to vn_id', () => {
    upsertStockAlias(VN_ID, 'shared term');
    upsertStockAlias('v88888', 'shared term');
    expect(listStockAliases(VN_ID)).toHaveLength(1);
    expect(listStockAliases('v88888')).toHaveLength(1);
    deleteStockAlias(VN_ID, 'shared term');
    expect(listStockAliases(VN_ID)).toHaveLength(0);
    expect(listStockAliases('v88888')).toHaveLength(1);
    deleteStockAlias('v88888', 'shared term');
  });
});
