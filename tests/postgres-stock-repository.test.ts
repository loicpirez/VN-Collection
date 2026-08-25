import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VnStockOfferInput } from '@/lib/db';

const { clientQueryMock, postgresQueryMock, settingGetMock, withTransactionMock } = vi.hoisted(() => ({
  clientQueryMock: vi.fn(),
  postgresQueryMock: vi.fn(),
  settingGetMock: vi.fn(),
  withTransactionMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: postgresQueryMock,
  withPostgresTransaction: withTransactionMock,
}));

vi.mock('@/lib/db/repositories/app-setting', () => ({
  getAppSettingRepository: () => ({ get: settingGetMock }),
}));

import { createPostgresStockRepository } from '@/lib/db/repositories/stock';

function offer(overrides: Partial<VnStockOfferInput> = {}): VnStockOfferInput {
  return {
    vn_id: 'v90001',
    provider: 'sofmap',
    provider_offer_id: 'offer-1',
    source: 'direct',
    title: 'Stock fixture',
    url: 'https://example.test/offer-1',
    price: 3200,
    currency: 'JPY',
    availability: 'in_stock',
    availability_label: 'In stock',
    condition: 'used',
    edition_label: null,
    location_label: 'Branch',
    location_branch: 'Branch',
    source_release_id: null,
    jan: null,
    fetched_at: 100,
    error: null,
    content_kind: 'game_package',
    platform: 'win',
    edition_kind: 'standard',
    series_relation: 'exact_game',
    match_confidence: 'high',
    match_score: 100,
    match_warnings_json: '[]',
    marketplace_price: null,
    marketplace_count: null,
    list_price: null,
    category: null,
    store_code: null,
    product_id: null,
    page_kind: 'detail',
    ...overrides,
  };
}

function validExtras(price: number | null = 1800, selectedEpId = 70001): object {
  return {
    schemaVersion: 1,
    selectedEpId,
    searchQuery: 'fixture',
    refreshedAt: 100,
    candidates: [{
      epId: 70001,
      detail: {
        id: 70001,
        title: 'Price fixture',
        downloadRetailers: [{
          retailerId: 1,
          retailerName: 'Retailer A',
          productUrl: 'https://example.test/download',
          currentPrice: price,
        }],
        packageRetailers: [{
          retailerId: 2,
          retailerName: 'Retailer B',
          productUrl: 'https://example.test/package',
          currentPrice: price === null ? null : price + 200,
        }],
      },
    }],
  };
}

describe('PostgreSQL stock repository', () => {
  beforeEach(() => {
    clientQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    postgresQueryMock.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    settingGetMock.mockReset().mockResolvedValue(null);
    withTransactionMock.mockReset().mockImplementation(async (callback) => callback({ query: clientQueryMock }));
  });

  it('replaces and preserves provider snapshots transactionally', async () => {
    const repository = createPostgresStockRepository();
    await repository.replaceProviderSnapshot('v90001', 'sofmap', [offer()], {
      status: 'ok',
      message: null,
      fetched_at: 100,
      offer_count: 1,
    });
    expect(clientQueryMock.mock.calls[0]?.[0]).toContain('DELETE FROM vn_stock_offer');
    expect(clientQueryMock.mock.calls[1]?.[0]).toContain('INSERT INTO vn_stock_offer');
    expect(clientQueryMock.mock.calls[2]?.[1]).toEqual(['v90001', 'sofmap', 'ok', null, 100, 1, null, 1, 0]);

    clientQueryMock.mockClear();
    await repository.replaceProviderSnapshot('v90001', 'sofmap', [], {
      status: 'protected',
      message: 'blocked',
      fetched_at: 200,
      offer_count: 2,
      blocked_kind: 'search_page',
      fresh_offers_found: 0,
      cached_offers_available: 2,
    }, { preserveExistingOffers: true });
    expect(clientQueryMock).toHaveBeenCalledOnce();
    expect(clientQueryMock.mock.calls[0]?.[1]).toEqual(['v90001', 'sofmap', 'protected', 'blocked', 200, 2, 'search_page', 0, 2]);
  });

  it('reads offers, statuses, recent rows, aliases, and sources', async () => {
    const rows = [{ marker: 'row' }];
    postgresQueryMock.mockResolvedValue({ rows, rowCount: 1 });
    const repository = createPostgresStockRepository();

    await expect(repository.listOffers('v90001')).resolves.toBe(rows);
    await expect(repository.listProviderStatuses('v90001')).resolves.toBe(rows);
    await expect(repository.listRecentOffers(10)).resolves.toBe(rows);
    await expect(repository.listAliases('v90001')).resolves.toBe(rows);
    await expect(repository.listSources('v90001')).resolves.toBe(rows);
    expect(postgresQueryMock.mock.calls[2]?.[1]).toEqual([10]);
  });

  it('validates, stores, reads, and clears Eroge Price extras', async () => {
    const repository = createPostgresStockRepository();
    await expect(repository.setProviderExtras('v90001', 'sofmap', {})).resolves.toBe(false);
    const circular: { self?: object } = {};
    circular.self = circular;
    await expect(repository.setProviderExtras('v90001', 'eroge_price', circular)).resolves.toBe(false);
    await expect(repository.setProviderExtras('v90001', 'eroge_price', {})).resolves.toBe(false);
    await expect(repository.setProviderExtras('v90001', 'eroge_price', validExtras())).resolves.toBe(true);

    postgresQueryMock.mockResolvedValueOnce({ rows: [{ extras_json: JSON.stringify(validExtras()) }], rowCount: 1 });
    await expect(repository.getErogePriceExtras('v90001')).resolves.toMatchObject({ selectedEpId: 70001 });
    postgresQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(repository.getErogePriceExtras('v90002')).resolves.toBeNull();
    postgresQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(repository.clearProviderExtras('v90001', 'eroge_price')).resolves.toBe(true);
    postgresQueryMock.mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.clearProviderExtras('v90002', 'eroge_price')).resolves.toBe(false);
  });

  it('builds direct summaries and valid fallback summaries', async () => {
    const repository = createPostgresStockRepository();
    await expect(repository.batchSummaries([])).resolves.toEqual(new Map());

    postgresQueryMock
      .mockResolvedValueOnce({ rows: [{ vn_id: 'v90001', available: 2, best_price: 2500 }] })
      .mockResolvedValueOnce({ rows: [
        { vn_id: 'v90002', extras_json: '{bad' },
        { vn_id: 'v90003', extras_json: JSON.stringify(validExtras(null)) },
        { vn_id: 'v90004', extras_json: JSON.stringify(validExtras(1800, 99999)) },
        { vn_id: 'v90005', extras_json: JSON.stringify(validExtras(1800)) },
      ] });
    const summaries = await repository.batchSummaries(['v90001', 'v90002', 'v90003', 'v90004', 'v90005']);

    expect(String(postgresQueryMock.mock.calls[0]?.[0])).toContain('FROM alicenet_stock');
    expect(postgresQueryMock.mock.calls[0]?.[1]).toEqual([
      ['v90001', 'v90002', 'v90003', 'v90004', 'v90005'],
      'alicenet',
    ]);
    expect(summaries.get('v90001')).toEqual({ available: 2, best_price: 2500 });
    expect(summaries.has('v90002')).toBe(false);
    expect(summaries.has('v90003')).toBe(false);
    expect(summaries.get('v90004')).toEqual({ available: 2, best_price: 1800 });
    expect(summaries.get('v90005')).toEqual({ available: 2, best_price: 1800 });

    postgresQueryMock.mockReset().mockResolvedValueOnce({ rows: [{ vn_id: 'v90001', available: 1, best_price: 1000 }] });
    await repository.batchSummaries(['v90001']);
    expect(postgresQueryMock).toHaveBeenCalledOnce();
  });

  it('writes aliases and sources and reports missing source rows', async () => {
    const repository = createPostgresStockRepository();
    await repository.upsertAlias('v90001', 'Alias');
    await repository.deleteAlias('v90001', 'Alias');

    postgresQueryMock.mockResolvedValueOnce({ rows: [{ id: 4, vn_id: 'v90001', provider: 'sofmap', url: 'https://example.test/source' }] });
    await expect(repository.upsertSource({ vn_id: 'v90001', provider: 'sofmap', url: 'https://example.test/source' })).resolves.toMatchObject({ id: 4 });
    postgresQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(repository.upsertSource({ vn_id: 'v90002', provider: 'sofmap', url: 'https://example.test/missing', release_id: 'r90001', product_id: 'p1' })).rejects.toThrow('stock source upsert failed');
    postgresQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await expect(repository.deleteSource('v90001', 4)).resolves.toBe(true);
    postgresQueryMock.mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.deleteSource('v90001', 5)).resolves.toBe(false);
  });

  it('normalizes stock settings, cache counts, and title-resolution rows', async () => {
    const repository = createPostgresStockRepository();
    await expect(repository.disabledProviders()).resolves.toEqual(new Set());
    settingGetMock.mockResolvedValueOnce('{bad');
    await expect(repository.disabledProviders()).resolves.toEqual(new Set());
    settingGetMock.mockResolvedValueOnce('{"provider":"sofmap"}');
    await expect(repository.disabledProviders()).resolves.toEqual(new Set());
    settingGetMock.mockResolvedValueOnce(JSON.stringify(['sofmap', 'invalid', 4]));
    await expect(repository.disabledProviders()).resolves.toEqual(new Set(['sofmap']));
    settingGetMock.mockResolvedValueOnce('1').mockResolvedValueOnce('0');
    await expect(repository.retryWithoutProxy()).resolves.toBe(true);
    await expect(repository.retryWithoutProxy()).resolves.toBe(false);

    clientQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 2 }).mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.clearCache('v90001')).resolves.toEqual({ offers: 2, statuses: 0 });
    clientQueryMock.mockResolvedValueOnce({ rows: [], rowCount: null }).mockResolvedValueOnce({ rows: [], rowCount: 3 });
    await expect(repository.clearCache('v90002')).resolves.toEqual({ offers: 0, statuses: 3 });

    postgresQueryMock.mockResolvedValueOnce({ rows: [{ vn_id: 'v90001', title: 'Resolved' }] });
    await expect(repository.getCachedTitleResolution('query')).resolves.toEqual({ vnId: 'v90001', title: 'Resolved' });
    postgresQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(repository.getCachedTitleResolution('missing')).resolves.toBeNull();
    await repository.setCachedTitleResolution('query', 'v90001', 'Resolved');
    expect(postgresQueryMock.mock.calls.at(-1)?.[1]).toEqual(['query', 'v90001', 'Resolved']);
  });
});
