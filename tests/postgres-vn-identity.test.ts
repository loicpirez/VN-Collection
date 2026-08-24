import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, transactionMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  withPostgresTransaction: transactionMock,
}));

import { createPostgresVnIdentityRepository } from '@/lib/db/repositories/vn-identity';

describe('PostgreSQL VN identity repository', () => {
  beforeEach(() => {
    queryMock.mockReset().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM vn WHERE id = $1')) return { rows: [{ id: 'present' }], rowCount: 1 };
      if (sql.includes('SELECT place FROM collection_place_index')) return { rows: [{ place: 'Shelf A' }], rowCount: 1 };
      if (sql.includes('SELECT 1 FROM collection WHERE vn_id = $1')) return { rows: [{ exists: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    transactionMock.mockReset().mockImplementation(async (callback) => callback({ query: queryMock }));
  });

  it('moves every reference family and removes the synthetic VN last', async () => {
    await createPostgresVnIdentityRepository().migrate('egs_90001', 'v90002');

    const sql = queryMock.mock.calls.map(([text]) => String(text));
    expect(sql.some((text) => text.includes('UPDATE collection SET vn_id'))).toBe(true);
    expect(sql.some((text) => text.includes('INSERT INTO owned_release'))).toBe(true);
    expect(sql.some((text) => text.includes('UPDATE physical_bundle SET anchor_vn_id'))).toBe(true);
    expect(sql.some((text) => text.includes('UPDATE shelf_slot SET vn_id'))).toBe(true);
    expect(sql.some((text) => text.includes('UPDATE vn_stock_offer SET vn_id'))).toBe(true);
    expect(sql.some((text) => text.includes('INSERT INTO staff_credit_index'))).toBe(true);
    expect(sql.at(-1)).toBe('DELETE FROM vn WHERE id = $1');
    expect(queryMock).toHaveBeenCalledWith(
      'INSERT INTO collection_place_index (vn_id, place) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      ['v90002', 'Shelf A'],
    );
  });

  it('skips collection replacement when the source has no collection row', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM vn WHERE id = $1')) return { rows: [{ id: 'present' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await createPostgresVnIdentityRepository().migrate('egs_90003', 'v90004');

    const sql = queryMock.mock.calls.map(([text]) => String(text));
    expect(sql.some((text) => text.includes('UPDATE collection SET vn_id'))).toBe(false);
    expect(sql.at(-1)).toBe('DELETE FROM vn WHERE id = $1');
  });

  it('rejects missing target and source rows before mutation', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(createPostgresVnIdentityRepository().migrate('egs_90005', 'v90006'))
      .rejects.toThrow('target v90006 not in vn table');

    queryMock.mockReset()
      .mockResolvedValueOnce({ rows: [{ id: 'v90006' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(createPostgresVnIdentityRepository().migrate('egs_90005', 'v90006'))
      .rejects.toThrow('source egs_90005 not in vn table');
  });

  it('treats identical identifiers as a no-op', async () => {
    await expect(createPostgresVnIdentityRepository().migrate('v90007', 'v90007')).resolves.toBeUndefined();
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
