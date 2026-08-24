import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionItemDatabaseRow } from '@/lib/db/collection-item-mapper';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.transaction,
}));

import { createPostgresCollectionListRepository } from '@/lib/db/repositories/collection-list';

function itemRow(id: string, overrides: Partial<CollectionItemDatabaseRow> = {}): CollectionItemDatabaseRow {
  return {
    id,
    title: `Title ${id}`,
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    image_violence: null,
    released: null,
    olang: null,
    languages: '[]',
    platforms: '[]',
    length_minutes: null,
    length: null,
    rating: null,
    votecount: null,
    description: null,
    developers: '[]',
    publishers: '[]',
    tags: '[]',
    screenshots: '[]',
    release_images: '[]',
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 0,
    banner_rotation: 0,
    relations: '[]',
    aliases: '[]',
    extlinks: '[]',
    length_votes: null,
    average: null,
    has_anime: null,
    devstatus: null,
    titles: '[]',
    editions: '[]',
    staff: '[]',
    va: '[]',
    fetched_at: 1,
    status: 'planning',
    user_rating: null,
    playtime_minutes: 0,
    started_date: null,
    finished_date: null,
    notes: null,
    favorite: 0,
    location: 'unknown',
    edition_type: 'none',
    edition_label: null,
    physical_location: null,
    box_type: 'none',
    download_url: null,
    dumped: 0,
    dumped_ignored: 0,
    custom_description: null,
    added_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

describe('PostgreSQL collection list branch behavior', () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.transaction.mockReset().mockImplementation(async (work) => work({ query: mocks.clientQuery }));
  });

  it('uses public defaults and returns early for explicitly empty identities', async () => {
    const repository = createPostgresCollectionListRepository();

    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.list({ vnIds: [] })).resolves.toEqual([]);
    await expect(repository.listCards()).resolves.toEqual([]);
    await expect(repository.list({ limit: 0, offset: 0 })).resolves.toEqual([]);

    expect(mocks.postgresQuery).toHaveBeenCalledTimes(3);
  });

  it('builds the complete filter surface including negative booleans and bounded paging', async () => {
    const repository = createPostgresCollectionListRepository();
    await repository.list({
      status: 'completed',
      q: 'A%_\\B',
      producer: 'p90001',
      publisher: 'p90002',
      tag: 'g90001',
      place: 'Shelf A',
      edition: 'physical',
      yearMin: 2000,
      yearMax: 2030,
      ratingMin: 10,
      ratingMax: 90,
      playtimeMinHours: 1,
      playtimeMaxHours: 100,
      dumped: false,
      onlyEgsOnly: false,
      matchVndb: false,
      matchEgs: false,
      fanDisc: false,
      hasNotes: false,
      hasCustomCover: false,
      hasBanner: false,
      isFavorite: false,
      hasReleased: false,
      excludeNsfw: true,
      isNsfw: false,
      nsfwThreshold: undefined,
      isNukige: false,
      inReadingQueue: false,
      inList: false,
      aspect: 'unknown',
      aspects: ['16:9'],
      vnIds: ['v90001'],
      series: 3,
      sort: 'producer',
      order: 'asc',
      limit: Number.POSITIVE_INFINITY,
      offset: Number.NaN,
      _projection: 'full-no-raw',
    });

    const [sql, values] = mocks.postgresQuery.mock.calls[0] as [string, readonly unknown[]];
    expect(sql).toContain('developer_sort');
    expect(sql).toContain('selected_series');
    expect(sql).toContain('NOT (');
    expect(sql).toContain('LIMIT');
    expect(values).toContain(10_000);
    expect(values).toContain(0);

    await repository.list({
      sort: 'publisher',
      limit: 20_000,
      offset: 20_000_000,
      isNsfw: true,
      nsfwThreshold: 2,
    });
    expect(String(mocks.postgresQuery.mock.calls[1]?.[0])).toContain('publisher_sort');
    expect(mocks.postgresQuery.mock.calls[1]?.[1]).toContain(10_000);
    expect(mocks.postgresQuery.mock.calls[1]?.[1]).toContain(10_000_000);
  });

  it('enriches series, places, EGS summaries, and manual or derived aspect values', async () => {
    mocks.postgresQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM collection c JOIN vn v')) {
        return {
          rows: [
            itemRow('v90001'),
            itemRow('v90002', { physical_location: '["Existing"]' }),
            itemRow('v90003'),
          ],
        };
      }
      if (sql.includes('FROM series_vn JOIN series')) {
        return { rows: [
          { vn_id: 'v90001', id: 1, name: 'Series A' },
          { vn_id: 'v90001', id: 2, name: 'Series B' },
        ] };
      }
      if (sql.includes('FROM egs_game WHERE')) {
        return { rows: [
          {
            vn_id: 'v90001',
            egs_id: 10,
            median: 80,
            average: 79,
            count: 12,
            playtime_median_minutes: 240,
            source: 'manual',
            okazu: null,
            erogame: 1,
          },
          {
            vn_id: 'v90002',
            egs_id: 11,
            median: null,
            average: null,
            count: null,
            playtime_median_minutes: null,
            source: 'search',
            okazu: 0,
            erogame: null,
          },
        ] };
      }
      if (sql.includes('FROM collection_place_index')) {
        return { rows: [
          { vn_id: 'v90001', place: 'Shelf A' },
          { vn_id: 'v90001', place: 'Shelf B' },
        ] };
      }
      if (sql.includes('FROM vn_aspect_override')) {
        return { rows: [
          { vn_id: 'v90001', aspect_key: '4:3' },
          { vn_id: 'v90002', aspect_key: 'unknown' },
          { vn_id: 'v90003', aspect_key: 'invalid' },
        ] };
      }
      if (sql.includes('FROM owned_release owned')) {
        return { rows: [
          { vn_id: 'v90001', aspect_key: '16:9' },
          { vn_id: 'v90002', aspect_key: '16:10' },
          { vn_id: 'v90003', aspect_key: null },
        ] };
      }
      if (sql.includes('FROM release_resolution_cache')) {
        return { rows: [
          { vn_id: 'v90002', aspect_key: '16:10' },
          { vn_id: 'v90002', aspect_key: '4:3' },
          { vn_id: 'v90003', aspect_key: 'unknown' },
        ] };
      }
      return { rows: [] };
    });

    const items = await createPostgresCollectionListRepository().list({ sort: 'updated_at' });

    expect(items[0]).toMatchObject({
      series: [{ id: 1, name: 'Series A' }, { id: 2, name: 'Series B' }],
      physical_location: ['Shelf A', 'Shelf B'],
      aspect_keys: ['4:3'],
      egs: { okazu: null, erogame: true },
    });
    expect(items[1]?.physical_location).toEqual(['Existing']);
    expect(items[1]?.egs).toMatchObject({ okazu: false, erogame: null });
    expect(new Set(items[1]?.aspect_keys)).toEqual(new Set(['16:10', '4:3']));
    expect(items[2]).toMatchObject({ aspect_keys: ['unknown'], egs: null });
  });

  it('maps facets, counters, membership, queue, and EGS fallback values', async () => {
    const repository = createPostgresCollectionListRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v1', count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v2' }] })
      .mockResolvedValueOnce({ rows: [{ tag_id: 'g1', tag_name: 'Tag', tag_category: null, tag_count: 3 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'completed', count: 2 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        vn_id: 'v1',
        egs_id: null,
        median: null,
        average: null,
        count: null,
        playtime_median_minutes: null,
        source: 'search',
        okazu: 0,
        erogame: null,
      }] });

    await expect(repository.listMembershipCounts()).resolves.toEqual(new Map([['v1', 2]]));
    await expect(repository.readingQueueIds()).resolves.toEqual(new Set(['v2']));
    await expect(repository.listTags()).resolves.toEqual([
      { id: 'g1', name: 'Tag', category: null, count: 3 },
    ]);
    await expect(repository.stats()).resolves.toEqual({
      total: 0,
      byStatus: [{ status: 'completed', n: 2 }],
      playtime_minutes: 0,
    });
    await expect(repository.egsSummaries([])).resolves.toEqual(new Map());
    await expect(repository.egsSummaries(['v1'])).resolves.toEqual(new Map([['v1', {
      egs_id: null,
      median: null,
      average: null,
      count: null,
      playtime_median_minutes: null,
      source: 'search',
      okazu: false,
      erogame: null,
    }]]));

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{
      vn_id: 'v2',
      egs_id: 2,
      median: null,
      average: null,
      count: null,
      playtime_median_minutes: null,
      source: null,
      okazu: null,
      erogame: 1,
    }] });
    await expect(repository.egsSummaries(['v2'])).resolves.toEqual(new Map([['v2', {
      egs_id: 2,
      median: null,
      average: null,
      count: null,
      playtime_median_minutes: null,
      source: null,
      okazu: null,
      erogame: true,
    }]]));
  });

  it('materializes release and screenshot aspects while rejecting malformed candidates', async () => {
    const screenshotRows = [
      { id: 'v1', screenshots: '{broken' },
      { id: 'v2', screenshots: '{}' },
      {
        id: 'v3',
        screenshots: JSON.stringify([
          null,
          {},
          { dims: 'bad' },
          { dims: [1] },
          { dims: ['wide', 9] },
          { dims: [0, 0] },
          { dims: [1920, 1080] },
          { dims: [1280, 720] },
          { dims: [800, 600] },
        ]),
      },
      { id: 'v4', screenshots: JSON.stringify([{ dims: [0, 0] }]) },
    ];
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT release_id, vn_id, resolution')) {
        return { rows: [
          { release_id: 'r1', vn_id: 'v1', resolution: 'invalid' },
          { release_id: 'r2', vn_id: 'v2', resolution: '1920x1080' },
        ] };
      }
      if (sql.includes('SELECT v.id AS vn_id')) return { rows: [{ vn_id: 'v2' }] };
      if (sql.includes('SELECT id, screenshots FROM vn')) return { rows: screenshotRows };
      return { rows: [], rowCount: 1 };
    });
    const repository = createPostgresCollectionListRepository();

    await expect(repository.prepareAspectData([])).resolves.toBeUndefined();
    await expect(repository.prepareAspectData(['v1', 'v2', 'v3', 'v4'])).resolves.toBeUndefined();

    const insertCalls = mocks.clientQuery.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO release_resolution_cache'),
    );
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0]?.[1]).toContain('r2');
    expect(insertCalls[1]?.[1]).toContain('screenshot:v3');

    mocks.clientQuery.mockReset().mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT release_id, vn_id, resolution')) return { rows: [] };
      if (sql.includes('SELECT v.id AS vn_id')) return { rows: [{ vn_id: 'v5' }] };
      return { rows: [], rowCount: 1 };
    });
    await expect(repository.prepareAspectData(['v5'])).resolves.toBeUndefined();
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('SELECT id, screenshots'))).toBe(false);
  });
});
