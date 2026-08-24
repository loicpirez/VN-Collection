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

import { createPostgresPlaceRepository } from '@/lib/db/repositories/place';
import { createPostgresProducerRepository } from '@/lib/db/repositories/producer';

function placeRow(overrides: Record<string, object | string | number | null> = {}) {
  return {
    id: 1,
    name: 'Store',
    name_ja: null,
    kind: 'shop',
    address: null,
    lat: null,
    lng: null,
    url: null,
    notes: null,
    created_at: 1,
    updated_at: 2,
    provider_labels: null,
    stock_count: 0,
    stock_updated_at: undefined,
    ...overrides,
  };
}

function producerStat(overrides: Record<string, object | string | number | null> = {}) {
  return {
    id: 'p90001',
    name: 'p90001',
    original: null,
    lang: null,
    type: null,
    description: null,
    aliases: '[]',
    extlinks: '[]',
    logo_path: null,
    fetched_at: 0,
    vn_count: 1,
    avg_user_rating: null,
    avg_rating: null,
    name_sources: null,
    ...overrides,
  };
}

describe('PostgreSQL place and producer edge branches', () => {
  beforeEach(() => {
    clientQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    postgresQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    withTransactionMock.mockReset().mockImplementation(async (callback) => callback({ query: clientQueryMock }));
  });

  it('normalizes nullable place aggregates and handles a missing detail row', async () => {
    const repository = createPostgresPlaceRepository();
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [placeRow()] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ provider_labels: [], stock_updated_at: null }),
    ]);
    await expect(repository.get(99)).resolves.toBeNull();
  });

  it('skips empty place patches and emits each availability predicate', async () => {
    const repository = createPostgresPlaceRepository();
    await repository.update(1, {});
    expect(postgresQueryMock).not.toHaveBeenCalled();

    postgresQueryMock.mockResolvedValue({ rows: [] });
    await repository.listOffers(1);
    await repository.listOffers(1, 'all');
    await repository.listOffers(1, 'out_of_stock');
    expect(String(postgresQueryMock.mock.calls[0]?.[0])).toContain("availability IN ('in_stock', 'limited')");
    expect(String(postgresQueryMock.mock.calls[1]?.[0])).not.toContain('AND stock.availability');
    expect(String(postgresQueryMock.mock.calls[2]?.[0])).toContain("availability = 'out_of_stock'");
  });

  it('falls back to producer ids and applies every deterministic stats tie breaker', async () => {
    postgresQueryMock.mockResolvedValueOnce({ rows: [
      producerStat({ id: 'p90004', name: 'Fourth', vn_count: 2 }),
      producerStat({ id: 'p90003', name: 'Same', vn_count: 1 }),
      producerStat({ id: 'p90002', name: 'Same', vn_count: 1 }),
      producerStat({ id: 'p90001', name: 'p90001', vn_count: 1, name_sources: ['[]'] }),
      producerStat({ id: 'p90005', name: 'p90005', vn_count: 0, name_sources: null }),
    ] });

    const stats = await createPostgresProducerRepository().listDeveloperStats();
    expect(stats.map((row) => row.id)).toEqual(['p90004', 'p90001', 'p90002', 'p90003', 'p90005']);
    expect(stats.find((row) => row.id === 'p90001')?.name).toBe('p90001');
  });

  it('decodes invalid producer metadata and persists minimal optional fields', async () => {
    const repository = createPostgresProducerRepository();
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [producerStat({ aliases: '[1]', extlinks: '[1]' })] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.get('p90001')).resolves.toMatchObject({ aliases: [], extlinks: [] });
    await expect(repository.get('p99999')).resolves.toBeNull();

    await repository.upsert({ id: 'p90002', name: 'Minimal' });
    expect(postgresQueryMock.mock.calls[2]?.[1]?.slice(2, 8)).toEqual([
      null,
      null,
      null,
      null,
      '[]',
      '[]',
    ]);
  });

  it('returns empty and populated producer ownership projections', async () => {
    const repository = createPostgresProducerRepository();
    postgresQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'v90001',
        developers: '[{"id":"p90001","name":"Developer"}]',
        publishers: '[{"id":"p90002","name":"Publisher"}]',
      }] });
    await expect(repository.ownershipSummary('p90001')).resolves.toEqual({
      ownedIds: new Set(),
      sample: null,
    });
    await expect(repository.ownershipSummary('p90001')).resolves.toEqual({
      ownedIds: new Set(['v90001']),
      sample: {
        developers: [{ id: 'p90001', name: 'Developer' }],
        publishers: [{ id: 'p90002', name: 'Publisher' }],
      },
    });
  });
});
