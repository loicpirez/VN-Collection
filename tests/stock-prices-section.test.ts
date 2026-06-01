import { describe, expect, it } from 'vitest';
import type { ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';
import {
  extrasFromStockSnapshot,
  fetchStockPriceExtras,
  type StockSnapshotForPrices,
} from '@/lib/stock-prices';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function extras(refreshedAt: number): ErogePriceExtrasV1 {
  return {
    schemaVersion: 1,
    candidates: [{
      epId: 90001,
      gameUrl: 'https://eroge-price.com/games/90001',
      detail: {
        id: 90001,
        title: 'Fixture',
        maker: null,
        genres: [],
        mainStaff: { scenario: [], illustration: [], voice: [], music: [], singer: [] },
        releaseDate: null,
        coverImageUrl: null,
        description: null,
        officialSiteUrl: null,
        brandSiteUrl: null,
        platform: null,
        ageRating: null,
        hasDownload: false,
        hasPackage: true,
        fanzaDownloadCid: null,
        fanzaPackageCid: null,
        downloadRetailers: [],
        packageRetailers: [],
      },
      priceStats: {
        allTimeMin: null,
        allTimeMax: null,
        allTimeMinNote: null,
        allTimeMaxNote: null,
        thirtyDayMin: null,
        thirtyDayMinNote: null,
      },
      priceHistory: [],
      related: { connections: [], sameBrand: [] },
      fetchedAt: refreshedAt,
    }],
    selectedEpId: 90001,
    searchQuery: null,
    refreshedAt,
  };
}

function snapshotResponse(value: ErogePriceExtrasV1): Response {
  const snapshot: StockSnapshotForPrices = {
    statuses: [{ provider: 'eroge_price', extras_json: JSON.stringify(value) }],
  };
  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('stock price snapshot loading', () => {
  it('parses version-one extras and rejects unusable payloads', () => {
    const valid = extras(1);
    expect(extrasFromStockSnapshot({
      statuses: [{ provider: 'eroge_price', extras_json: JSON.stringify(valid) }],
    })).toEqual(valid);
    expect(extrasFromStockSnapshot({
      statuses: [{ provider: 'eroge_price', extras_json: '{"schemaVersion":2}' }],
    })).toBeNull();
    expect(extrasFromStockSnapshot({
      statuses: [{ provider: 'eroge_price', extras_json: '{' }],
    })).toBeNull();
  });

  it('does not let an aborted stale response replace the active VN payload', async () => {
    const responses = new Map<string, ReturnType<typeof deferred<Response>>>();
    const request: typeof fetch = (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const pending = deferred<Response>();
      responses.set(url, pending);
      return pending.promise;
    };
    let activeExtras: ErogePriceExtrasV1 | null = null;
    const staleController = new AbortController();
    const currentController = new AbortController();

    const stale = fetchStockPriceExtras('v1', staleController.signal, request).then((value) => {
      if (!staleController.signal.aborted) activeExtras = value;
    });
    staleController.abort();
    const current = fetchStockPriceExtras('v2', currentController.signal, request).then((value) => {
      if (!currentController.signal.aborted) activeExtras = value;
    });

    responses.get('/api/vn/v2/stock')!.resolve(snapshotResponse(extras(2)));
    await current;
    expect(activeExtras).toEqual(extras(2));

    responses.get('/api/vn/v1/stock')!.resolve(snapshotResponse(extras(1)));
    await stale;
    expect(activeExtras).toEqual(extras(2));
  });
});
