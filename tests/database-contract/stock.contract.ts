import { describe, expect, it } from 'vitest';
import type { VnStockOfferInput } from '@/lib/db';
import type { StockProviderMaintenanceRepository } from '@/lib/db/repositories/stock-provider-maintenance';
import type { StockQueueRepository } from '@/lib/db/repositories/stock-queue';
import type { StockRepository } from '@/lib/db/repositories/stock';

/** Stable identifiers shared by the stock SQLite/PostgreSQL contract. */
export const STOCK_CONTRACT_IDS = {
  firstVn: 'v991401',
  secondVn: 'v991402',
  batch: 'stock-contract-batch',
} as const;

/** Engine-specific fixture writes that sit outside the stock repositories. */
export interface StockContractInspector {
  /** Persist one completed stock batch used by freshness diagnostics. */
  insertCompletedBatch(providers: readonly string[], startedAt: number): Promise<void>;
}

/** Harness that supplies freshly seeded stock repositories. */
export interface StockContractHarness {
  /** Run one assertion against a reset database. */
  withRepositories(run: (
    stock: StockRepository,
    queue: StockQueueRepository,
    maintenance: StockProviderMaintenanceRepository,
    inspect: StockContractInspector,
  ) => Promise<void>): Promise<void>;
}

function offer(overrides: Partial<VnStockOfferInput> = {}): VnStockOfferInput {
  return {
    vn_id: STOCK_CONTRACT_IDS.firstVn,
    provider: 'sofmap',
    provider_offer_id: 'sofmap-direct',
    source: 'direct',
    title: 'Contract game package',
    url: 'https://example.test/stock/direct',
    price: 3200,
    currency: 'JPY',
    availability: 'in_stock',
    availability_label: 'In stock',
    condition: 'used',
    edition_label: 'Standard edition',
    location_label: 'Akihabara',
    location_branch: 'Akihabara',
    source_release_id: 'r991401',
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
    list_price: 5000,
    category: 'PC game',
    store_code: 'akiba',
    product_id: null,
    page_kind: 'detail',
    ...overrides,
  };
}

function erogePriceExtras(): object {
  return {
    schemaVersion: 1,
    selectedEpId: 991401,
    searchQuery: 'contract title',
    refreshedAt: 400,
    candidates: [{
      epId: 991401,
      detail: {
        id: 991401,
        title: 'Contract title',
        downloadRetailers: [{
          retailerId: 1,
          retailerName: 'Download shop',
          productUrl: 'https://example.test/download',
          currentPrice: 1800,
        }],
        packageRetailers: [{
          retailerId: 2,
          retailerName: 'Package shop',
          productUrl: 'https://example.test/package',
          currentPrice: 2000,
        }],
      },
    }],
  };
}

/**
 * Register stock snapshot, metadata, queue, and freshness parity tests.
 *
 * @param label Engine name displayed by Vitest.
 * @param harness Reset and repository factory for the engine.
 * @returns Nothing; tests are registered with Vitest.
 */
export function registerStockRepositoryContract(label: string, harness: StockContractHarness): void {
  describe(`${label} stock repository contract`, () => {
    it('preserves snapshot ordering, replacement, summaries, and recent joins', async () => {
      await harness.withRepositories(async (stock) => {
        await stock.replaceProviderSnapshot(STOCK_CONTRACT_IDS.firstVn, 'sofmap', [offer()], {
          status: 'ok', message: null, fetched_at: 100, offer_count: 1,
        });
        await stock.replaceProviderSnapshot(STOCK_CONTRACT_IDS.firstVn, 'surugaya', [offer({
          provider: 'surugaya',
          provider_offer_id: 'surugaya-market',
          source: 'search',
          title: 'Contract marketplace package',
          url: 'https://example.test/stock/market',
          price: 2500,
          availability: 'limited',
          fetched_at: 200,
          product_id: 'market-1',
        })], {
          status: 'partial', message: 'One result', fetched_at: 200, offer_count: 1,
        });
        await stock.replaceProviderSnapshot(STOCK_CONTRACT_IDS.firstVn, 'mandarake', [offer({
          provider: 'mandarake',
          provider_offer_id: 'mandarake-merchandise',
          source: 'search',
          title: 'Unrelated merchandise',
          url: 'https://example.test/stock/merchandise',
          price: 500,
          fetched_at: 300,
          content_kind: 'merchandise',
        })], {
          status: 'ok', message: null, fetched_at: 300, offer_count: 1,
        });

        expect((await stock.listOffers(STOCK_CONTRACT_IDS.firstVn)).map((row) => row.provider_offer_id)).toEqual([
          'mandarake-merchandise',
          'sofmap-direct',
          'surugaya-market',
        ]);
        expect(await stock.listProviderStatuses(STOCK_CONTRACT_IDS.firstVn)).toMatchObject([
          { provider: 'mandarake', status: 'ok', fresh_offers_found: 1, cached_offers_available: 0 },
          { provider: 'sofmap', status: 'ok', fresh_offers_found: 1, cached_offers_available: 0 },
          { provider: 'surugaya', status: 'partial', message: 'One result', fresh_offers_found: 1 },
        ]);
        expect(Object.fromEntries(await stock.batchSummaries([STOCK_CONTRACT_IDS.firstVn]))).toEqual({
          [STOCK_CONTRACT_IDS.firstVn]: { available: 2, best_price: 3200 },
        });
        await expect(stock.batchSummaries([])).resolves.toEqual(new Map());
        await expect(stock.listRecentOffers(1)).resolves.toMatchObject([{
          provider_offer_id: 'mandarake-merchandise',
          vn_title: 'Stock Contract Alpha',
        }]);

        const replacement = offer({
          provider_offer_id: 'sofmap-replacement',
          title: 'Replacement package',
          url: 'https://example.test/stock/replacement',
          price: 3000,
          fetched_at: 400,
        });
        await stock.replaceProviderSnapshot(STOCK_CONTRACT_IDS.firstVn, 'sofmap', [replacement], {
          status: 'protected',
          message: 'Using cached offers',
          fetched_at: 400,
          offer_count: 2,
          blocked_kind: 'search_page',
          fresh_offers_found: 1,
          cached_offers_available: 1,
        }, { preserveExistingOffers: true });
        expect((await stock.listOffers(STOCK_CONTRACT_IDS.firstVn)).filter((row) => row.provider === 'sofmap')).toHaveLength(2);
        await stock.replaceProviderSnapshot(STOCK_CONTRACT_IDS.firstVn, 'sofmap', [replacement], {
          status: 'ok', message: null, fetched_at: 500, offer_count: 1,
        });
        expect((await stock.listOffers(STOCK_CONTRACT_IDS.firstVn)).filter((row) => row.provider === 'sofmap').map((row) => row.provider_offer_id)).toEqual(['sofmap-replacement']);
      });
    });

    it('round-trips aliases, manual sources, title cache, settings, and price extras', async () => {
      await harness.withRepositories(async (stock) => {
        await stock.upsertAlias(STOCK_CONTRACT_IDS.firstVn, 'Alias One');
        await stock.upsertAlias(STOCK_CONTRACT_IDS.firstVn, 'Alias Two');
        expect(new Set((await stock.listAliases(STOCK_CONTRACT_IDS.firstVn)).map((row) => row.alias_term))).toEqual(
          new Set(['Alias One', 'Alias Two']),
        );
        await stock.deleteAlias(STOCK_CONTRACT_IDS.firstVn, 'Alias One');
        await expect(stock.listAliases(STOCK_CONTRACT_IDS.firstVn)).resolves.toMatchObject([{ alias_term: 'Alias Two' }]);

        const source = await stock.upsertSource({
          vn_id: STOCK_CONTRACT_IDS.firstVn,
          provider: 'sofmap',
          url: 'https://example.test/manual-source',
          release_id: 'r991401',
          product_id: 'source-1',
        });
        expect(source.id).toBeGreaterThan(0);
        const updatedSource = await stock.upsertSource({
          vn_id: STOCK_CONTRACT_IDS.firstVn,
          provider: 'surugaya',
          url: 'https://example.test/manual-source',
          product_id: 'source-2',
        });
        expect(updatedSource).toMatchObject({ id: source.id, provider: 'surugaya', release_id: null, product_id: 'source-2' });
        await expect(stock.deleteSource(STOCK_CONTRACT_IDS.firstVn, source.id + 1000)).resolves.toBe(false);
        await expect(stock.deleteSource(STOCK_CONTRACT_IDS.firstVn, source.id)).resolves.toBe(true);
        await expect(stock.listSources(STOCK_CONTRACT_IDS.firstVn)).resolves.toEqual([]);

        await stock.setCachedTitleResolution('contract query', STOCK_CONTRACT_IDS.firstVn, 'Initial title');
        await stock.setCachedTitleResolution('contract query', STOCK_CONTRACT_IDS.secondVn, 'Updated title');
        await expect(stock.getCachedTitleResolution('contract query')).resolves.toEqual({
          vnId: STOCK_CONTRACT_IDS.secondVn,
          title: 'Updated title',
        });
        await expect(stock.getCachedTitleResolution('missing query')).resolves.toBeNull();
        await expect(stock.disabledProviders()).resolves.toEqual(new Set(['sofmap']));
        await expect(stock.retryWithoutProxy()).resolves.toBe(true);

        await expect(stock.setProviderExtras(STOCK_CONTRACT_IDS.secondVn, 'sofmap', {})).resolves.toBe(false);
        await expect(stock.setProviderExtras(STOCK_CONTRACT_IDS.secondVn, 'eroge_price', erogePriceExtras())).resolves.toBe(true);
        await expect(stock.getErogePriceExtras(STOCK_CONTRACT_IDS.secondVn)).resolves.toMatchObject({ selectedEpId: 991401 });
        expect(Object.fromEntries(await stock.batchSummaries([STOCK_CONTRACT_IDS.secondVn]))).toEqual({
          [STOCK_CONTRACT_IDS.secondVn]: { available: 2, best_price: 1800 },
        });
        await expect(stock.clearProviderExtras(STOCK_CONTRACT_IDS.secondVn, 'eroge_price')).resolves.toBe(true);
        await expect(stock.getErogePriceExtras(STOCK_CONTRACT_IDS.secondVn)).resolves.toBeNull();
      });
    });

    it('keeps stock queues and provider freshness deterministic', async () => {
      await harness.withRepositories(async (stock, queue, maintenance, inspect) => {
        await stock.replaceProviderSnapshot(STOCK_CONTRACT_IDS.firstVn, 'sofmap', [], {
          status: 'no_results', message: null, fetched_at: 100, offer_count: 0,
        });
        await stock.replaceProviderSnapshot(STOCK_CONTRACT_IDS.firstVn, 'mandarake', [], {
          status: 'no_results', message: null, fetched_at: 200, offer_count: 0,
        });
        await stock.replaceProviderSnapshot(STOCK_CONTRACT_IDS.secondVn, 'surugaya', [], {
          status: 'ok', message: null, fetched_at: 300, offer_count: 0,
        });
        await inspect.insertCompletedBatch(['sofmap', 'surugaya'], 250);

        await expect(queue.list('collection', 1, 0)).resolves.toEqual({
          entries: [{ vn_id: STOCK_CONTRACT_IDS.firstVn, title: 'Stock Contract Alpha' }],
          total: 2,
        });
        await expect(queue.list('reading_queue', 10, 0)).resolves.toEqual({
          entries: [
            { vn_id: STOCK_CONTRACT_IDS.secondVn, title: 'Stock Contract Beta' },
            { vn_id: STOCK_CONTRACT_IDS.firstVn, title: 'Stock Contract Alpha' },
          ],
          total: 2,
        });
        expect((await queue.list('recent_stock', 10, 0)).entries.map((entry) => entry.vn_id)).toEqual([
          STOCK_CONTRACT_IDS.firstVn,
          STOCK_CONTRACT_IDS.secondVn,
        ]);
        expect((await queue.list('recent_checked', 10, 0)).entries.map((entry) => entry.vn_id)).toEqual([
          STOCK_CONTRACT_IDS.secondVn,
          STOCK_CONTRACT_IDS.firstVn,
        ]);
        await expect(queue.titlesFor([STOCK_CONTRACT_IDS.firstVn, 'v991499'])).resolves.toEqual(new Map([
          [STOCK_CONTRACT_IDS.firstVn, 'Stock Contract Alpha'],
          ['v991499', null],
        ]));
        await expect(queue.titlesFor([])).resolves.toEqual(new Map());

        const freshness = await maintenance.listFreshness();
        expect(freshness.find((row) => row.provider === 'sofmap')).toMatchObject({
          latest_status_at: 100,
          status_rows: 1,
          last_batch_started_at: 250,
          updated_after_last_batch: false,
        });
        expect(freshness.find((row) => row.provider === 'surugaya')).toMatchObject({
          latest_status_at: 300,
          status_rows: 1,
          last_batch_started_at: 250,
          updated_after_last_batch: true,
        });
        expect(freshness.find((row) => row.provider === 'melonbooks')).toMatchObject({
          latest_status_at: null,
          status_rows: 0,
          last_batch_started_at: null,
          updated_after_last_batch: null,
        });
      });
    });

    it('clears cached offers and statuses together', async () => {
      await harness.withRepositories(async (stock) => {
        await stock.replaceProviderSnapshot(STOCK_CONTRACT_IDS.firstVn, 'sofmap', [offer()], {
          status: 'ok', message: null, fetched_at: 100, offer_count: 1,
        });
        await expect(stock.clearCache(STOCK_CONTRACT_IDS.firstVn)).resolves.toEqual({ offers: 1, statuses: 1 });
        await expect(stock.listOffers(STOCK_CONTRACT_IDS.firstVn)).resolves.toEqual([]);
        await expect(stock.listProviderStatuses(STOCK_CONTRACT_IDS.firstVn)).resolves.toEqual([]);
      });
    });
  });
}
