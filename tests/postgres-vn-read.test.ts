import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postgresQueryMock } = vi.hoisted(() => ({
  postgresQueryMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: postgresQueryMock,
}));

import { createPostgresVnReadRepository } from '@/lib/db/repositories/vn-read';
import type { CollectionItemDatabaseRow } from '@/lib/db/collection-item-mapper';

function itemRow(overrides: Partial<CollectionItemDatabaseRow> = {}): CollectionItemDatabaseRow {
  return {
    id: 'v90010',
    title: 'Collection item',
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    image_violence: null,
    released: '2024-01-02',
    olang: 'ja',
    languages: '["ja"]',
    platforms: '["win"]',
    length_minutes: 120,
    length: 2,
    rating: 80,
    votecount: 10,
    description: 'Description',
    developers: '[{"id":"p1","name":"Developer"}]',
    publishers: '[]',
    tags: '[]',
    screenshots: '[]',
    release_images: '[]',
    local_image: null,
    local_image_thumb: null,
    custom_cover: null,
    banner_image: null,
    banner_position: null,
    cover_rotation: 90,
    banner_rotation: 270,
    relations: '[]',
    aliases: '[]',
    extlinks: '[]',
    length_votes: 5,
    average: 79,
    has_anime: 1,
    devstatus: 0,
    titles: '[]',
    editions: '[]',
    staff: '[]',
    va: '[]',
    fetched_at: 100,
    status: 'completed',
    user_rating: 90,
    playtime_minutes: 130,
    started_date: null,
    finished_date: '2024-02-03',
    notes: null,
    favorite: 1,
    location: 'physical',
    edition_type: 'standard',
    edition_label: null,
    physical_location: '["Shelf A"]',
    box_type: 'dvd',
    download_url: null,
    dumped: 1,
    dumped_ignored: 0,
    custom_description: null,
    added_at: 1,
    updated_at: 2,
    ...overrides,
  };
}

describe('PostgreSQL stock VN reader', () => {
  beforeEach(() => {
    postgresQueryMock.mockReset();
  });

  it('decodes valid title and external-link JSON', async () => {
    postgresQueryMock.mockResolvedValue({
      rows: [{
        title: 'Primary title',
        alttitle: 'Alternate title',
        titles: JSON.stringify([{ lang: 'ja', title: 'Primary title', latin: null, official: true, main: true }]),
        extlinks: JSON.stringify([{ url: 'https://example.test/item', label: 'site', name: 'Site' }]),
      }],
    });

    await expect(createPostgresVnReadRepository().getStockContext('v90001')).resolves.toEqual({
      title: 'Primary title',
      alttitle: 'Alternate title',
      titles: [{ lang: 'ja', title: 'Primary title', latin: null, official: true, main: true }],
      extlinks: [{ url: 'https://example.test/item', label: 'site', name: 'Site' }],
    });
  });

  it('decodes one collection item and enriches it with series and EGS data', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [itemRow()] })
      .mockResolvedValueOnce({ rows: [{ id: 4, name: 'Series A' }] })
      .mockResolvedValueOnce({
        rows: [{
          egs_id: 10,
          median: 82,
          average: 80,
          count: 100,
          playtime_median_minutes: 150,
          source: 'manual',
          okazu: 0,
          erogame: 1,
        }],
      });

    const item = await createPostgresVnReadRepository().getCollectionItem('v90010');

    expect(item).toMatchObject({
      id: 'v90010',
      languages: ['ja'],
      platforms: ['win'],
      physical_location: ['Shelf A'],
      favorite: true,
      dumped: true,
      cover_rotation: 90,
      banner_rotation: 270,
      series: [{ id: 4, name: 'Series A' }],
      egs: {
        egs_id: 10,
        median: 82,
        average: 80,
        count: 100,
        playtime_median_minutes: 150,
        source: 'manual',
        okazu: false,
        erogame: true,
      },
    });
    expect(postgresQueryMock.mock.calls[0]?.[0]).toContain('FROM vn v LEFT JOIN collection c');
  });

  it('returns null without enrichment queries and reads the EGS-only marker', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ egs_only: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = createPostgresVnReadRepository();

    await expect(repository.getCollectionItem('v90011')).resolves.toBeNull();
    await expect(repository.isEgsOnly('egs_10')).resolves.toBe(true);
    await expect(repository.isEgsOnly('v90011')).resolves.toBe(false);
    expect(postgresQueryMock).toHaveBeenCalledTimes(3);
  });

  it('falls back safely for malformed JSON and missing rows', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ title: 'Malformed', alttitle: null, titles: '[1]', extlinks: '[1]' }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = createPostgresVnReadRepository();

    await expect(repository.getStockContext('v90002')).resolves.toEqual({
      title: 'Malformed',
      alttitle: null,
      titles: [],
      extlinks: [],
    });
    await expect(repository.getStockContext('v90003')).resolves.toBeNull();
  });

  it('escapes wildcard characters in local title searches', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ id: 'v90004', title: 'Resolved' }] })
      .mockResolvedValueOnce({ rows: [] });
    const repository = createPostgresVnReadRepository();

    await expect(repository.findTitleMatch('A%_\\B')).resolves.toEqual({ vnId: 'v90004', title: 'Resolved' });
    expect(postgresQueryMock.mock.calls[0]?.[1]).toEqual(['%a\\%\\_\\\\b%']);
    expect(postgresQueryMock.mock.calls[0]?.[0]).toContain('app_search_normalize(title)');
    await expect(repository.findTitleMatch('Absent')).resolves.toBeNull();
  });

  it('returns collection items without EGS data and preserves nullable EGS flags', async () => {
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [itemRow({ id: 'v90020' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [itemRow({ id: 'v90021' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        egs_id: 11,
        median: null,
        average: null,
        count: null,
        playtime_median_minutes: null,
        source: 'search',
        okazu: 1,
        erogame: null,
      }] })
      .mockResolvedValueOnce({ rows: [itemRow({ id: 'v90022' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        egs_id: 12,
        median: null,
        average: null,
        count: null,
        playtime_median_minutes: null,
        source: 'search',
        okazu: null,
        erogame: 0,
      }] });
    const repository = createPostgresVnReadRepository();

    await expect(repository.getCollectionItem('v90020')).resolves.toMatchObject({ egs: null });
    await expect(repository.getCollectionItem('v90021')).resolves.toMatchObject({
      egs: { okazu: true, erogame: null },
    });
    await expect(repository.getCollectionItem('v90022')).resolves.toMatchObject({
      egs: { okazu: null, erogame: false },
    });
  });

  it('reads covers, tags, raw payloads, and fetched timestamps including empty inputs', async () => {
    const repository = createPostgresVnReadRepository();
    await expect(repository.getCovers([])).resolves.toEqual([]);
    postgresQueryMock.mockResolvedValueOnce({ rows: [{
      id: 'v90030',
      image_url: 'https://example.test/cover.jpg',
      image_thumb: null,
      image_sexual: 0,
      local_image: null,
      local_image_thumb: null,
    }] });
    await expect(repository.getCovers(['v90030'])).resolves.toHaveLength(1);

    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{
        tags: JSON.stringify([
          { id: 'G10' },
          { id: 'g10' },
          { id: 'bad' },
          null,
        ]),
      }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.getTagIds('v90030')).resolves.toEqual(['g10']);
    await expect(repository.getTagIds('v90031')).resolves.toEqual([]);

    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ raw: '{"id":"v90030"}' }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.getRawPayload('v90030')).resolves.toBe('{"id":"v90030"}');
    await expect(repository.getRawPayload('v90031')).resolves.toBeNull();

    await expect(repository.getFetchedAtMany([])).resolves.toEqual(new Map());
    postgresQueryMock.mockResolvedValueOnce({ rows: [
      { id: 'v90030', fetched_at: 10 },
      { id: 'v90031', fetched_at: 20 },
    ] });
    await expect(repository.getFetchedAtMany(['v90030', 'v90031'])).resolves.toEqual(
      new Map([['v90030', 10], ['v90031', 20]]),
    );
  });
});
