import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  transaction: vi.fn(),
  readConfig: vi.fn(),
  prepare: vi.fn(),
  run: vi.fn(),
  get: vi.fn(),
  materializeMeta: vi.fn(),
  materializeAspects: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.transaction,
}));
vi.mock('@/lib/db/postgres-config', () => ({ readDatabaseConfig: mocks.readConfig }));
vi.mock('@/lib/db', () => ({
  db: { prepare: mocks.prepare },
  materializeReleaseMetaForCollectionVns: mocks.materializeMeta,
  materializeReleaseAspectsForVn: mocks.materializeAspects,
}));

import {
  createPostgresReleaseMetadataRepository,
  getReleaseMetadataRepository,
} from '@/lib/db/repositories/release-metadata';

function release(
  id: string,
  vnId: string,
  resolution: [number, number] | string | null,
  uncensored: boolean | null = null,
) {
  return {
    id,
    title: `Release ${id}`,
    alttitle: null,
    languages: [],
    platforms: ['win'],
    media: [],
    released: null,
    minage: null,
    patch: false,
    freeware: false,
    uncensored,
    official: true,
    has_ero: false,
    resolution,
    engine: null,
    voiced: null,
    notes: null,
    gtin: null,
    catalog: null,
    producers: [],
    extlinks: [],
    vns: [{ id: vnId, rtype: 'complete' }],
    images: [],
  };
}

describe('release-metadata repository', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.transaction.mockReset().mockImplementation(async (callback) => callback({ query: mocks.clientQuery }));
    mocks.readConfig.mockReset().mockReturnValue({ backend: 'postgres' });
    mocks.run.mockReset().mockReturnValue({ changes: 0 });
    mocks.get.mockReset().mockReturnValue({ count: 0 });
    mocks.prepare.mockReset().mockReturnValue({ run: mocks.run, get: mocks.get });
    mocks.materializeMeta.mockReset().mockReturnValue(0);
    mocks.materializeAspects.mockReset();
  });

  it('clears PostgreSQL rows and handles an unavailable row count', async () => {
    const repository = createPostgresReleaseMetadataRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 3 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });

    await expect(repository.clear()).resolves.toBe(3);
    await expect(repository.clear()).resolves.toBe(0);
  });

  it('rejects empty identifiers and materializes valid cached releases', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const repository = createPostgresReleaseMetadataRepository();
    await expect(repository.materializeForVns(['bad', 'egs_90001'])).resolves.toBe(0);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.clientQuery.mockResolvedValueOnce({
      rows: [
        { body: 'not-json' },
        { body: '{}' },
        { body: JSON.stringify({ results: [
          null,
          release('r90001', 'v90001', [1920, 1080]),
          release('r90002', 'v90001', '1280x720', true),
          {
            ...release('r90004', 'v90001', null, false),
            patch: true,
            freeware: true,
            official: false,
            has_ero: true,
          },
          release('r90003', 'v90002', null, false),
        ] }) },
      ],
    });

    await expect(repository.materializeForVns(['v90001', 'V90001', 'egs_90001'])).resolves.toBe(3);
    const inserts = mocks.clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO release_meta_cache'));
    expect(inserts).toHaveLength(3);
    expect(inserts[0]?.[1]?.slice(0, 5)).toEqual(['r90001', 'v90001', 'Release r90001', null, '["win"]']);
    expect(inserts[0]?.[1]?.[10]).toBeNull();
    expect(inserts[1]?.[1]?.[10]).toBe(1);
    expect(inserts[2]?.[1]?.slice(8, 13)).toEqual([1, 1, 0, 0, 1]);
    expect(String(mocks.clientQuery.mock.calls.at(-1)?.[0])).toContain('UPDATE owned_release');
    expect(mocks.clientQuery.mock.calls.at(-1)?.[1]).toEqual([['v90001']]);
  });

  it('materializes matching release aspects and short-circuits known data', async () => {
    const repository = createPostgresReleaseMetadataRepository();
    await expect(repository.materializeAspectsForVn('egs_90001')).resolves.toBe(0);

    mocks.clientQuery.mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(repository.materializeAspectsForVn('v90001')).resolves.toBe(0);

    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ body: JSON.stringify({ results: [
        release('r90004', 'v90002', [800, 600]),
        release('r90005', 'v90001', [1920, 1080]),
        release('r90006', 'v90001', null),
      ] }) }] });
    await expect(repository.materializeAspectsForVn('v90001')).resolves.toBe(2);

    const inserts = mocks.clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO release_resolution_cache'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.[1]).toEqual(['r90005', 'v90001', 1920, 1080, '1920x1080', '16:9', expect.any(Number)]);
    expect(inserts[1]?.[1]).toEqual(['r90006', 'v90001', null, null, null, 'unknown', expect.any(Number)]);
  });

  it('delegates SQLite operations and clamps a negative aspect delta', async () => {
    mocks.readConfig.mockReturnValue({ backend: 'sqlite' });
    mocks.run.mockReturnValue({ changes: 4 });
    mocks.materializeMeta.mockReturnValue(5);
    mocks.get
      .mockReturnValueOnce({ count: 2 })
      .mockReturnValueOnce({ count: 7 })
      .mockReturnValueOnce({ count: 9 })
      .mockReturnValueOnce({ count: 3 });
    const repository = getReleaseMetadataRepository();

    await expect(repository.clear()).resolves.toBe(4);
    await expect(repository.materializeForVns(['v90001'])).resolves.toBe(5);
    await expect(repository.materializeAspectsForVn('v90001')).resolves.toBe(5);
    await expect(repository.materializeAspectsForVn('v90002')).resolves.toBe(0);
    expect(mocks.materializeMeta).toHaveBeenCalledWith(['v90001']);
    expect(mocks.materializeAspects).toHaveBeenCalledTimes(2);
  });

  it('caches the selected PostgreSQL repository', () => {
    const first = getReleaseMetadataRepository();
    expect(getReleaseMetadataRepository()).toBe(first);
  });
});
