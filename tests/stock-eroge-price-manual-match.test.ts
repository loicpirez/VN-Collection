/**
 * Tests for the manual-matching endpoint.
 *
 * The operator can pin which Eroge Price candidate is treated as
 * "primary" via PATCH `/api/vn/[id]/stock/eroge-price`. The route
 * must:
 *   1. Reject invalid VN ids (regex gate)
 *   2. Reject missing / non-numeric `ep_id`
 *   3. Return 404 when no extras blob exists yet for this VN
 *   4. Reject an `ep_id` that isn't in the stored candidates list
 *   5. Persist the new `selectedEpId` AND only mutate that field
 *      (leave bundles, schemaVersion, refreshedAt, searchQuery
 *      unchanged)
 */
import { describe, expect, it } from 'vitest';
import { PATCH } from '@/app/api/vn/[id]/stock/eroge-price/route';
import { getStockProviderExtras, setStockProviderExtras } from '@/lib/db';
import type { ErogePriceBundle, ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';

function makePatch(vnId: string, body?: unknown): Request {
  return new Request(`http://localhost/api/vn/${vnId}/stock/eroge-price`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', host: '127.0.0.1' },
    body: body ? JSON.stringify(body) : '',
  });
}

function fakeBundle(epId: number, title: string): ErogePriceBundle {
  return {
    epId,
    gameUrl: `https://eroge-price.com/games/${epId}`,
    detail: {
      id: epId,
      title,
      maker: 'Studio Placeholder',
      genres: [],
      mainStaff: { scenario: [], illustration: [], voice: [], music: [], singer: [] },
      releaseDate: '2099-01-01T00:00:00.000Z',
      coverImageUrl: null,
      description: null,
      officialSiteUrl: null,
      brandSiteUrl: null,
      platform: 'PC',
      ageRating: 'R18',
      hasDownload: true,
      hasPackage: false,
      fanzaDownloadCid: null,
      fanzaPackageCid: null,
      downloadRetailers: [],
      packageRetailers: [],
    },
    priceStats: {
      allTimeMin: null,
      allTimeMinNote: null,
      allTimeMax: null,
      allTimeMaxNote: null,
      thirtyDayMin: null,
      thirtyDayMinNote: null,
    },
    priceHistory: [],
    related: { connections: [], sameBrand: [] },
    fetchedAt: Date.now(),
  };
}

function seedExtras(vnId: string): ErogePriceExtrasV1 {
  const extras: ErogePriceExtrasV1 = {
    schemaVersion: 1,
    candidates: [fakeBundle(99001, 'Placeholder A'), fakeBundle(99002, 'Placeholder B')],
    selectedEpId: 99001,
    searchQuery: 'placeholder',
    refreshedAt: 1700000000000,
  };
  setStockProviderExtras(vnId, 'eroge_price', extras);
  return extras;
}

describe('PATCH /api/vn/[id]/stock/eroge-price — manual matching', () => {
  it('rejects an invalid VN id', async () => {
    const res = await PATCH(makePatch('bad', { ep_id: 99001 }) as never, {
      params: Promise.resolve({ id: 'bad' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid id/);
  });

  it('rejects missing ep_id', async () => {
    const res = await PATCH(makePatch('v90001', {}) as never, {
      params: Promise.resolve({ id: 'v90001' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ep_id/);
  });

  it('rejects a non-integer ep_id', async () => {
    const res = await PATCH(makePatch('v90002', { ep_id: 'not-a-number' }) as never, {
      params: Promise.resolve({ id: 'v90002' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 when no extras stored yet', async () => {
    const res = await PATCH(makePatch('v90003', { ep_id: 99001 }) as never, {
      params: Promise.resolve({ id: 'v90003' }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects an ep_id not in the candidates list', async () => {
    const vn = 'v90004';
    seedExtras(vn);
    const res = await PATCH(makePatch(vn, { ep_id: 88888 }) as never, {
      params: Promise.resolve({ id: vn }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not in candidates/);
    expect(body.candidates).toEqual([99001, 99002]);
  });

  it('persists the new selectedEpId and only mutates that field', async () => {
    const vn = 'v90005';
    const seeded = seedExtras(vn);
    const res = await PATCH(makePatch(vn, { ep_id: 99002 }) as never, {
      params: Promise.resolve({ id: vn }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).selectedEpId).toBe(99002);

    const persisted = getStockProviderExtras<ErogePriceExtrasV1>(vn, 'eroge_price');
    expect(persisted?.selectedEpId).toBe(99002);
    // Bundles / schema / refreshedAt / search query must be unchanged.
    expect(persisted?.schemaVersion).toBe(seeded.schemaVersion);
    expect(persisted?.refreshedAt).toBe(seeded.refreshedAt);
    expect(persisted?.searchQuery).toBe(seeded.searchQuery);
    expect(persisted?.candidates.map((c) => c.epId)).toEqual(
      seeded.candidates.map((c) => c.epId),
    );
  });

  it('round-trips between candidates', async () => {
    const vn = 'v90006';
    seedExtras(vn);
    for (const id of [99002, 99001, 99002]) {
      const res = await PATCH(makePatch(vn, { ep_id: id }) as never, {
        params: Promise.resolve({ id: vn }),
      });
      expect(res.status).toBe(200);
      const persisted = getStockProviderExtras<ErogePriceExtrasV1>(vn, 'eroge_price');
      expect(persisted?.selectedEpId).toBe(id);
    }
  });
});
