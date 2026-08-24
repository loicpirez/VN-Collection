import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionExportPayload } from '@/lib/db';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  rebuildPlaces: vi.fn(),
  transaction: vi.fn(),
  upsertVn: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  withPostgresTransaction: mocks.transaction,
}));

vi.mock('@/lib/db/repositories/collection-core', () => ({
  rebuildPostgresCollectionPlaceIndex: mocks.rebuildPlaces,
}));

vi.mock('@/lib/db/repositories/vn-write', () => ({
  upsertPostgresVn: mocks.upsertVn,
}));

import { createPostgresCollectionTransferRepository } from '@/lib/db/repositories/collection-transfer';

function collectionEntry(vnId: string): CollectionExportPayload['collection'][number] {
  return {
    vn_id: vnId,
    status: 'planning',
    user_rating: null,
    playtime_minutes: null,
    started_date: null,
    finished_date: null,
    notes: null,
    favorite: null,
    location: null,
    edition_type: null,
    edition_label: null,
    physical_location: null,
    added_at: null,
    updated_at: null,
  };
}

function series(id: number, name: string): CollectionExportPayload['series'][number] {
  return {
    id,
    name,
    description: null,
    cover_path: null,
    banner_path: null,
    created_at: 1,
    updated_at: 2,
  };
}

describe('PostgreSQL collection transfer branch behavior', () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.rebuildPlaces.mockReset().mockResolvedValue(undefined);
    mocks.upsertVn.mockReset().mockResolvedValue(undefined);
    mocks.transaction.mockReset().mockImplementation(async (work) => work({ query: mocks.clientQuery }));
  });

  it('exports valid raw payloads and safely drops malformed or absent raw JSON', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM vn WHERE')) {
        return { rows: [
          { id: 'v1', title: 'One', raw: null, fetched_at: 1 },
          { id: 'v2', title: 'Two', raw: '{"id":"v2","title":"Two"}', fetched_at: 2 },
          { id: 'v3', title: 'Three', raw: '{broken', fetched_at: 3 },
          { id: 'v4', title: 'Four', raw: '[]', fetched_at: 4 },
        ] };
      }
      if (sql.includes('FROM collection ORDER BY')) return { rows: [collectionEntry('v1')] };
      if (sql.includes('FROM series ORDER BY')) return { rows: [series(1, 'Series A')] };
      if (sql.includes('FROM series_vn')) return { rows: [{ series_id: 1, vn_id: 'v1', order_index: 0 }] };
      return { rows: [] };
    });

    const payload = await createPostgresCollectionTransferRepository().exportData();

    expect(payload.version).toBe(2);
    expect(payload.vns.map((row) => row.raw)).toEqual([
      null,
      { id: 'v2', title: 'Two' },
      null,
      null,
    ]);
    expect(payload.collection).toHaveLength(1);
    expect(payload.series_vn).toHaveLength(1);
  });

  it('imports independent rows with savepoint recovery and series id remapping', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    mocks.upsertVn.mockImplementation(async (_client, vn: { id: string }) => {
      if (vn.id === 'v4') throw new Error('synthetic VN failure');
    });
    mocks.rebuildPlaces.mockImplementation(async (_client, vnId: string) => {
      if (vnId === 'v6') throw new Error('synthetic collection failure');
    });
    mocks.clientQuery.mockImplementation(async (sql: string, values?: readonly unknown[]) => {
      if (sql.startsWith('SELECT id FROM series')) {
        if (values?.[0] === 'Existing') return { rows: [{ id: 101 }] };
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO series (')) {
        if (values?.[0] === 'Created') return { rows: [{ id: 202 }] };
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO series_vn') && values?.[0] === 202) {
        throw new Error('synthetic link failure');
      }
      return { rows: [], rowCount: 1 };
    });
    const payload: CollectionExportPayload = {
      version: 2,
      exported_at: 1,
      vns: [
        { id: 'v1', title: 'One', raw: null, fetched_at: 1 },
        { id: 'v2', title: '', raw: { id: 'v2', title: 'Raw title' } },
        { id: 'v3', title: '', raw: null },
        { id: 'v4', title: 'Failure', raw: null },
      ],
      collection: [collectionEntry('v5'), collectionEntry('v6')],
      series: [
        series(1, 'Existing'),
        series(2, 'Created'),
        series(3, 'Missing identifier'),
      ],
      series_vn: [
        { series_id: 1, vn_id: 'v1', order_index: null },
        { series_id: 2, vn_id: 'v2', order_index: 4 },
        { series_id: 3, vn_id: 'v3' },
        { series_id: 99, vn_id: 'v9' },
      ],
    };

    const summary = await createPostgresCollectionTransferRepository().importData(payload);

    expect(summary).toEqual({
      vns_upserted: 3,
      collection_upserted: 1,
      series_created: 1,
      series_links: 1,
      errors: [
        'vn v4: import failed',
        'collection v6: import failed',
        'series Missing identifier: import failed',
        'series_vn 2/v2: import failed',
      ],
    });
    expect(mocks.upsertVn.mock.calls.map((call) => call[1].title)).toEqual([
      'One',
      'Raw title',
      'v3',
      'Failure',
    ]);
    const collectionInsert = mocks.clientQuery.mock.calls.find(([sql, values]) =>
      String(sql).includes('INSERT INTO collection') && values?.[0] === 'v5',
    );
    expect(collectionInsert?.[1]).toEqual([
      'v5', 'planning', null, 0, null, null, null, 0, 'unknown', 'none', null,
      null, 1000, 1000,
    ]);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).startsWith('ROLLBACK TO SAVEPOINT'))).toBe(true);
    vi.useRealTimers();
  });
});
