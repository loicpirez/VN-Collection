import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clientQueryMock, postgresQueryMock, withTransactionMock } = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  postgresQueryMock: vi.fn(),
  withTransactionMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: postgresQueryMock,
  withPostgresTransaction: withTransactionMock,
}));

import { createPostgresCollectionCoreRepository } from '@/lib/db/repositories/collection-core';

describe('PostgreSQL collection core repository', () => {
  beforeEach(() => {
    vi.useRealTimers();
    clientQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    postgresQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    withTransactionMock.mockReset().mockImplementation(async (callback) => callback({ query: clientQueryMock }));
  });

  it('adds a complete row and rebuilds deduplicated collection places', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT vn_id FROM collection')) return { rows: [] };
      if (sql.includes('UNION ALL')) {
        return {
          rows: [
            { physical_location: '["Shelf","Shelf"]' },
            { physical_location: 'Box, Drawer' },
            { physical_location: '{"invalid":true}' },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const repository = createPostgresCollectionCoreRepository();

    await repository.add('v90001', {
      status: 'completed',
      user_rating: 90,
      playtime_minutes: 120,
      started_date: '2026-01-01',
      finished_date: '2026-01-02',
      notes: 'Notes',
      favorite: true,
      location: 'jp',
      edition_type: 'limited',
      edition_label: 'First press',
      physical_location: [' Shelf ', 'Box'],
      box_type: 'large',
      download_url: 'https://example.test/download',
      dumped: true,
      dumped_ignored: true,
      custom_description: 'Custom synopsis',
    });

    const insert = clientQueryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO collection ('));
    expect(insert?.[1]).toEqual([
      'v90001', 'completed', 90, 120, '2026-01-01', '2026-01-02', 'Notes', 1,
      'jp', 'limited', 'First press', '["Shelf","Box"]', 'large',
      'https://example.test/download', 1, 1, 'Custom synopsis', 1_700_000_000_000, 1_700_000_000_000,
    ]);
    const placeCalls = clientQueryMock.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO collection_place_index'));
    expect(placeCalls.map((call) => call[1]?.[1])).toEqual(['Shelf', 'Box', 'Drawer']);
  });

  it('uses collection defaults for a minimal new row', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(25);
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT vn_id FROM collection')) return { rows: [] };
      return { rows: [], rowCount: 1 };
    });

    await createPostgresCollectionCoreRepository().add('v90002');

    const insert = clientQueryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO collection ('));
    expect(insert?.[1]).toEqual([
      'v90002', 'planning', null, 0, null, null, null, 0, 'unknown', 'none', null,
      null, 'none', null, 0, 0, null, 25, 25,
    ]);
  });

  it('patches an existing row and writes every changed activity kind', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_800_000_000_000);
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT vn_id FROM collection')) return { rows: [{ vn_id: 'v90003' }] };
      if (sql.includes('SELECT status, user_rating')) {
        return {
          rows: [{
            status: 'planning', user_rating: 50, playtime_minutes: 10, favorite: 0,
            started_date: null, finished_date: null,
          }],
        };
      }
      if (sql.includes('UNION ALL')) return { rows: [{ physical_location: '["New shelf"]' }] };
      return { rows: [], rowCount: 1 };
    });
    const repository = createPostgresCollectionCoreRepository();

    await repository.add('v90003', {
      status: 'completed',
      user_rating: 80,
      playtime_minutes: 90,
      started_date: '2026-01-01',
      finished_date: '2026-02-01',
      notes: 'Updated note',
      favorite: true,
      location: 'en',
      edition_type: 'standard',
      edition_label: 'Download',
      physical_location: ['New shelf'],
      box_type: 'dvd_case',
      download_url: null,
      dumped: false,
      dumped_ignored: false,
      custom_description: 'Updated synopsis',
    });

    const update = clientQueryMock.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE collection SET'));
    expect(String(update?.[0])).toContain('custom_description = $16');
    const activityCalls = clientQueryMock.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO vn_activity'));
    expect(activityCalls.map((call) => call[1]?.[1])).toEqual([
      'status', 'rating', 'playtime', 'favorite', 'started', 'finished', 'note',
    ]);
    expect(activityCalls.map((call) => JSON.parse(String(call[1]?.[2])))).toContainEqual({ from: 10, to: 90, delta: 80 });
  });

  it('skips an empty patch without querying and tolerates an absent update target', async () => {
    const repository = createPostgresCollectionCoreRepository();
    await repository.update('v90004', {});
    expect(clientQueryMock).not.toHaveBeenCalled();

    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT status, user_rating')) return { rows: [] };
      return { rows: [], rowCount: 0 };
    });
    await repository.update('v90004', { status: 'dropped' });
    expect(clientQueryMock.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO vn_activity'))).toBe(false);
  });

  it('does not log unchanged values and records a cleared note length', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT status, user_rating')) {
        return {
          rows: [{
            status: 'planning', user_rating: null, playtime_minutes: 0, favorite: 0,
            started_date: null, finished_date: null,
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    });
    const repository = createPostgresCollectionCoreRepository();

    await repository.update('v90005', {
      status: 'planning', user_rating: null, playtime_minutes: 0, favorite: false,
      started_date: null, finished_date: null, notes: null,
    });

    const activityCalls = clientQueryMock.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO vn_activity'));
    expect(activityCalls).toHaveLength(1);
    expect(activityCalls[0]?.[1]).toEqual(['v90005', 'note', '{"length":0}', expect.any(Number)]);
  });

  it('clears nullable activity fields and enables dump flags without a note activity', async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT status, user_rating')) {
        return {
          rows: [{
            status: 'completed', user_rating: 75, playtime_minutes: 30, favorite: 1,
            started_date: '2025-01-01', finished_date: '2025-02-01',
          }],
        };
      }
      return { rows: [], rowCount: 1 };
    });

    await createPostgresCollectionCoreRepository().update('v90005', {
      user_rating: null,
      started_date: null,
      finished_date: null,
      dumped: true,
      dumped_ignored: true,
    });

    const update = clientQueryMock.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE collection SET'));
    expect(update?.[1]?.slice(0, 5)).toEqual([null, null, null, 1, 1]);
    const activityCalls = clientQueryMock.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO vn_activity'));
    expect(activityCalls.map((call) => call[1]?.[1])).toEqual(['rating', 'started', 'finished']);
  });

  it('removes membership and dependent personal-list rows in one transaction', async () => {
    await createPostgresCollectionCoreRepository().remove('v90006');
    expect(clientQueryMock.mock.calls.map(([sql]) => String(sql))).toEqual([
      'DELETE FROM collection_place_index WHERE vn_id = $1',
      'DELETE FROM collection WHERE vn_id = $1',
      'DELETE FROM user_list_vn WHERE vn_id = $1',
    ]);
  });

  it('checks one or many collection memberships without empty-list queries', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90001' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90001' }, { vn_id: 'v90003' }] });
    const repository = createPostgresCollectionCoreRepository();

    await expect(repository.contains('v90001')).resolves.toBe(true);
    await expect(repository.contains('v90002')).resolves.toBe(false);
    await expect(repository.containsMany([])).resolves.toEqual(new Set());
    await expect(repository.containsMany(['v90001', 'v90002', 'v90003'])).resolves.toEqual(new Set(['v90001', 'v90003']));
    expect(postgresQueryMock).toHaveBeenLastCalledWith(
      'SELECT vn_id FROM collection WHERE vn_id = ANY($1::text[])',
      [['v90001', 'v90002', 'v90003']],
    );
  });

  it('sets, resets, and reads collection ordering', async () => {
    const repository = createPostgresCollectionCoreRepository();
    await repository.setCustomOrder([]);
    expect(withTransactionMock).not.toHaveBeenCalled();

    await repository.setCustomOrder(['v90002', 'v90001']);
    expect(clientQueryMock.mock.calls.map((call) => call[1])).toEqual([[1, 'v90002'], [2, 'v90001']]);

    postgresQueryMock
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90002' }, { vn_id: 'v90001' }] });
    await repository.resetCustomOrder();
    await expect(repository.listIds()).resolves.toEqual(['v90002', 'v90001']);
    expect(postgresQueryMock).toHaveBeenNthCalledWith(1, 'UPDATE collection SET custom_order = 0');
    expect(postgresQueryMock).toHaveBeenNthCalledWith(2, 'SELECT vn_id FROM collection');
  });

  it('normalizes custom descriptions and rejects malformed source preferences', async () => {
    const repository = createPostgresCollectionCoreRepository();
    await repository.setCustomDescription('v90040', null);
    await repository.setCustomDescription('v90040', '   ');
    await repository.setCustomDescription('v90040', `  ${'x'.repeat(8_100)}  `);
    expect(postgresQueryMock.mock.calls.slice(0, 3).map((call) => call[1]?.[0])).toEqual([
      null,
      null,
      'x'.repeat(8_000),
    ]);

    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ source_pref: '{malformed' }] })
      .mockResolvedValueOnce({ rows: [{ source_pref: '[]' }] })
      .mockResolvedValueOnce({ rows: [{ source_pref: '{"title":"vndb","rating":"invalid","other":"egs"}' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.getSourcePreferences('v90040')).resolves.toEqual({});
    await expect(repository.getSourcePreferences('v90040')).resolves.toEqual({});
    await expect(repository.getSourcePreferences('v90040')).resolves.toEqual({ title: 'vndb' });
    await expect(repository.getSourcePreferences('v90040')).resolves.toEqual({});

    await repository.setSourcePreferences('v90040', { title: 'auto', rating: 'egs' });
    await repository.setSourcePreferences('v90040', { title: 'auto' });
    expect(postgresQueryMock.mock.calls.at(-2)?.[1]?.[0]).toBe('{"rating":"egs"}');
    expect(postgresQueryMock.mock.calls.at(-1)?.[1]?.[0]).toBeNull();
  });
});
