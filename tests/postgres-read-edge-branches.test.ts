import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.transaction,
}));

import { createPostgresDiscoveryRepository } from '@/lib/db/repositories/discovery';
import { createPostgresEgsOverviewRepository } from '@/lib/db/repositories/egs-overview';
import { createPostgresEgsRepository } from '@/lib/db/repositories/egs';
import { createPostgresQuoteRepository } from '@/lib/db/repositories/quote';
import { createPostgresRecommendationReadRepository } from '@/lib/db/repositories/recommendation-read';
import { createPostgresVnRouteRepository } from '@/lib/db/repositories/vn-route';

describe('PostgreSQL read repository edge branches', () => {
  beforeEach(() => {
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.transaction.mockReset().mockImplementation(async (callback) => callback({ query: mocks.clientQuery }));
  });

  it('keeps empty discovery and EGS overview aggregates stable', async () => {
    await expect(createPostgresDiscoveryRepository().countStaffFullCache()).resolves.toBe(0);
    await expect(createPostgresEgsOverviewRepository().load()).resolves.toEqual({
      links: [],
      unlinkedRows: [],
      unmatched: 0,
    });
  });

  it('normalizes quote pagination and persists a quote without a character', async () => {
    const repository = createPostgresQuoteRepository();
    const localQuote = {
      quote_id: 'q90001',
      vn_id: 'v90001',
      vn_title: 'Quoted VN',
      quote: 'Text',
      score: 1,
      character_id: null,
      character_name: null,
      character_local_image: null,
      vn_image_url: null,
      vn_local_image: null,
      vn_local_image_thumb: null,
    };
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [localQuote], rowCount: 1 });

    await expect(repository.list(undefined, undefined, Number.NaN)).resolves.toEqual([]);
    expect(mocks.postgresQuery.mock.calls[0]?.[1]).toEqual([200, 0]);
    await expect(repository.randomLocal()).resolves.toEqual(localQuote);
    await expect(repository.randomLocal()).resolves.toBeNull();
    await repository.replaceForVn('v90001', [{ id: 'q90001', quote: 'Text', score: 1, character: null }]);
    expect(mocks.clientQuery.mock.calls[1]?.[1]).toEqual([
      'q90001', 'v90001', 'Text', 1, null, null, expect.any(Number),
    ]);
  });

  it('decodes thumbnail-only recommendation seeds and invalid limits', async () => {
    const repository = createPostgresRecommendationReadRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'v90001',
          title: 'Seed',
          alttitle: null,
          released: null,
          image_url: null,
          image_thumb: '/thumb.jpg',
          image_sexual: null,
          developers: '[]',
        }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(repository.seedChip('v90001')).resolves.toMatchObject({
      image: { url: '', thumbnail: '/thumb.jpg' },
    });
    await expect(repository.topRated(70, Number.NaN)).resolves.toEqual([]);
    expect(mocks.postgresQuery.mock.calls[1]?.[1]).toEqual([70, 3]);

    mocks.postgresQuery.mockResolvedValueOnce({
      rows: [{
        id: 'v90002',
        title: 'Full image seed',
        alttitle: null,
        released: null,
        image_url: '/full.jpg',
        image_thumb: null,
        image_sexual: null,
        developers: '[]',
      }],
      rowCount: 1,
    });
    await expect(repository.seedChip('v90002')).resolves.toMatchObject({
      image: { url: '/full.jpg', thumbnail: '/full.jpg' },
    });
  });

  it('handles missing EGS cover sources and omitted optional local images', async () => {
    const repository = createPostgresEgsRepository();
    await expect(repository.getCoverSource(90001)).resolves.toBeNull();
    await repository.upsertForVn({
      vn_id: 'v90001',
      egs_id: null,
      gamename: null,
      gamename_furigana: null,
      brand_id: null,
      brand_name: null,
      model: null,
      description: null,
      image_url: null,
      okazu: null,
      erogame: null,
      raw_json: null,
      median: null,
      average: null,
      dispersion: null,
      count: null,
      sellday: null,
      playtime_median_minutes: null,
      source: null,
    });
    expect(mocks.postgresQuery.mock.calls[1]?.[1]?.[9]).toBeNull();
  });

  it('does not infer a completion date when one is supplied explicitly', async () => {
    const repository = createPostgresVnRouteRepository();
    mocks.postgresQuery.mockResolvedValueOnce({
      rows: [{
        id: 1,
        vn_id: 'v90001',
        name: 'Route',
        completed: 0,
        completed_date: null,
        order_index: 0,
        notes: null,
        created_at: 1,
        updated_at: 2,
      }],
      rowCount: 1,
    });

    await expect(repository.update(1, { completed: false, completed_date: null })).resolves.toMatchObject({
      completed: false,
      completed_date: null,
    });
    expect(String(mocks.postgresQuery.mock.calls[0]?.[0])).toContain('completed_date = $2');
  });
});
