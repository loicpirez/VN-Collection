/**
 * Hermetic coverage for the public-read places sub-routes that previously
 * had no test importing them: places/[id]/other-branches, places/[id]/stock,
 * places/provider-map, places/unassigned. These are `PUBLIC_READ_ROUTE`
 * (no auth gate), so they assert invalid-id / not-found / success branches.
 *
 * The places/[id]/stock route calls `fetchAuthenticatedWishlist`; that is
 * mocked at the function level so no real token or network is used. Fixtures
 * are seeded through the real DB layer with synthetic ids and torn down per
 * test. Each case asserts exactly one HTTP status plus a body assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as otherBranchesGET } from '@/app/api/places/[id]/other-branches/route';
import { GET as placeStockGET } from '@/app/api/places/[id]/stock/route';
import { GET as providerMapGET } from '@/app/api/places/provider-map/route';
import { GET as unassignedGET } from '@/app/api/places/unassigned/route';
import { createPlace, db, linkProviderToPlace } from '@/lib/db';
import * as dbModule from '@/lib/db';

const { fetchWishlistMock } = vi.hoisted(() => ({ fetchWishlistMock: vi.fn() }));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, fetchAuthenticatedWishlist: fetchWishlistMock };
});

const PLACE_NAME_PREFIX = '__test_ro_places_';
const VN_ID = 'v90701';
const PROVIDER_LABEL = '__test_ro_branch_A';
const OTHER_LABEL = '__test_ro_branch_B';

function req(path: string): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, { headers: { host: '127.0.0.1' } });
}

function resetFixtures(): void {
  db.prepare(
    `DELETE FROM place_provider_link WHERE place_id IN (SELECT id FROM place_registry WHERE name LIKE '${PLACE_NAME_PREFIX}%')`,
  ).run();
  db.prepare(`DELETE FROM place_registry WHERE name LIKE '${PLACE_NAME_PREFIX}%'`).run();
  db.prepare('DELETE FROM vn_stock_offer WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
}

function seedOffer(label: string): void {
  db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(
    VN_ID,
    'Stocked Title',
    Date.now(),
  );
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO vn_stock_offer (
      vn_id, provider, provider_offer_id, source, title, url, price, currency,
      availability, location_label, location_branch, fetched_at, updated_at
    ) VALUES (?, 'surugaya', 'o1', 'direct', 'Stocked Title', 'https://example.test', 1200, 'JPY', 'in_stock', NULL, ?, ?, ?)
  `).run(VN_ID, label, now, now);
}

beforeEach(() => {
  resetFixtures();
  fetchWishlistMock.mockReset();
});

afterEach(resetFixtures);

describe('GET /api/places/[id]/other-branches', () => {
  it('400 on a non-numeric id', async () => {
    const res = await otherBranchesGET(req('/api/places/abc/other-branches'), {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid id');
  });

  it('404 when the place does not exist', async () => {
    const res = await otherBranchesGET(req('/api/places/99999/other-branches'), {
      params: Promise.resolve({ id: '99999' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });

  it('200 listing branches that belong to other places only', async () => {
    const focus = createPlace({ name: `${PLACE_NAME_PREFIX}focus` });
    const other = createPlace({ name: `${PLACE_NAME_PREFIX}other` });
    linkProviderToPlace(focus, PROVIDER_LABEL);
    linkProviderToPlace(other, OTHER_LABEL);

    const res = await otherBranchesGET(req(`/api/places/${focus}/other-branches`), {
      params: Promise.resolve({ id: String(focus) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const labels = body.branches.map((b: { provider_label: string }) => b.provider_label);
    expect(labels).toContain(OTHER_LABEL);
    expect(labels).not.toContain(PROVIDER_LABEL);
  });

  it('500 when the other-branches query fails', async () => {
    const focus = createPlace({ name: `${PLACE_NAME_PREFIX}other-branches-fail` });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listSpy = vi.spyOn(dbModule, 'listBranchesAtOtherPlaces').mockImplementation(() => {
      throw new Error('other branches failed');
    });

    const res = await otherBranchesGET(req(`/api/places/${focus}/other-branches`), {
      params: Promise.resolve({ id: String(focus) }),
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:places.[id].other-branches.GET] other branches failed');
    listSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('GET /api/places/[id]/stock', () => {
  it('400 on a non-numeric id', async () => {
    const res = await placeStockGET(req('/api/places/x/stock'), {
      params: Promise.resolve({ id: 'x' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid id');
  });

  it('404 when the place does not exist', async () => {
    const res = await placeStockGET(req('/api/places/88888/stock'), {
      params: Promise.resolve({ id: '88888' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });

  it('200 with place, vns, and aggregate stats on success', async () => {
    fetchWishlistMock.mockResolvedValue({ needsAuth: true });
    const placeId = createPlace({ name: `${PLACE_NAME_PREFIX}stock` });
    linkProviderToPlace(placeId, PROVIDER_LABEL);
    seedOffer(PROVIDER_LABEL);

    const res = await placeStockGET(req(`/api/places/${placeId}/stock`), {
      params: Promise.resolve({ id: String(placeId) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.place.id).toBe(placeId);
    expect(body.stats.total).toBe(1);
    expect(body.stats.in_stock).toBe(1);
    expect(body.vns[0].vn_id).toBe(VN_ID);
    expect(body.vns[0].in_wishlist).toBe(0);
  });

  it('200 annotating in_wishlist when the authenticated wishlist contains the VN', async () => {
    fetchWishlistMock.mockResolvedValue([{ id: VN_ID }]);
    const placeId = createPlace({ name: `${PLACE_NAME_PREFIX}wish` });
    linkProviderToPlace(placeId, PROVIDER_LABEL);
    seedOffer(PROVIDER_LABEL);

    const res = await placeStockGET(req(`/api/places/${placeId}/stock`), {
      params: Promise.resolve({ id: String(placeId) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vns[0].in_wishlist).toBe(1);
    expect(body.stats.in_wishlist).toBe(1);
  });

  it('200 preserving grouped offers, empty offer arrays, and out-of-stock stats', async () => {
    fetchWishlistMock.mockResolvedValue([]);
    const placeId = createPlace({ name: `${PLACE_NAME_PREFIX}stock-aggregate` });
    linkProviderToPlace(placeId, PROVIDER_LABEL);
    const vns: dbModule.PlaceVnRow[] = [
      {
        vn_id: 'v90711',
        title: 'Out of Stock Title',
        alttitle: null,
        image_url: null,
        local_image: null,
        image_sexual: null,
        released: null,
        developers: null,
        in_collection: 1,
        min_price: null,
        offer_count: 2,
        in_stock_count: 0,
        out_of_stock_count: 2,
        max_updated_at: 10,
      },
      {
        vn_id: 'v90712',
        title: 'No Offer Payload Title',
        alttitle: null,
        image_url: null,
        local_image: null,
        image_sexual: null,
        released: null,
        developers: null,
        in_collection: 0,
        min_price: null,
        offer_count: 0,
        in_stock_count: 0,
        out_of_stock_count: 0,
        max_updated_at: 0,
      },
    ];
    const offers: dbModule.PlaceOfferRow[] = [
      {
        vn_id: 'v90711',
        provider: 'surugaya',
        availability: 'out_of_stock',
        price: null,
        currency: 'JPY',
        url: 'https://example.test/a',
        location_branch: PROVIDER_LABEL,
        location_label: null,
        updated_at: 10,
      },
      {
        vn_id: 'v90711',
        provider: 'sofmap',
        availability: 'out_of_stock',
        price: null,
        currency: 'JPY',
        url: 'https://example.test/b',
        location_branch: PROVIDER_LABEL,
        location_label: null,
        updated_at: 11,
      },
    ];
    const listVnsSpy = vi.spyOn(dbModule, 'listPlaceVnsEnhanced').mockReturnValue(vns);
    const listOffersSpy = vi.spyOn(dbModule, 'listOffersAtPlace').mockReturnValue(offers);

    const res = await placeStockGET(req(`/api/places/${placeId}/stock`), {
      params: Promise.resolve({ id: String(placeId) }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats).toMatchObject({ total: 2, in_stock: 0, out_of_stock: 1, offer_count: 2, in_collection: 1, in_wishlist: 0 });
    expect(body.vns[0].offers).toHaveLength(2);
    expect(body.vns[1].offers).toEqual([]);
    listVnsSpy.mockRestore();
    listOffersSpy.mockRestore();
  });

  it('200 without wishlist annotations when the wishlist read fails', async () => {
    fetchWishlistMock.mockRejectedValue(new Error('wishlist failed'));
    const placeId = createPlace({ name: `${PLACE_NAME_PREFIX}wish-fail` });
    linkProviderToPlace(placeId, PROVIDER_LABEL);
    seedOffer(PROVIDER_LABEL);

    const res = await placeStockGET(req(`/api/places/${placeId}/stock`), {
      params: Promise.resolve({ id: String(placeId) }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vns[0].in_wishlist).toBe(0);
    expect(body.stats.in_wishlist).toBe(0);
  });

  it('500 when the stock query fails', async () => {
    const placeId = createPlace({ name: `${PLACE_NAME_PREFIX}stock-fail` });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listSpy = vi.spyOn(dbModule, 'listPlaceVnsEnhanced').mockImplementation(() => {
      throw new Error('place stock failed');
    });

    const res = await placeStockGET(req(`/api/places/${placeId}/stock`), {
      params: Promise.resolve({ id: String(placeId) }),
    });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:places.[id].stock.GET] place stock failed');
    listSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('GET /api/places/provider-map', () => {
  it('200 mapping each provider label to its place id', async () => {
    const placeId = createPlace({ name: `${PLACE_NAME_PREFIX}map` });
    linkProviderToPlace(placeId, PROVIDER_LABEL);

    const res = await providerMapGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map[PROVIDER_LABEL]).toBe(placeId);
  });

  it('500 when the provider map query fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mapSpy = vi.spyOn(dbModule, 'getPlaceProviderMap').mockImplementation(() => {
      throw new Error('provider map failed');
    });
    const res = await providerMapGET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:places.provider-map.GET] provider map failed');
    mapSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('GET /api/places/unassigned', () => {
  it('200 listing offer branches not yet linked to any place', async () => {
    seedOffer(PROVIDER_LABEL);

    const res = await unassignedGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.branches).toContain(PROVIDER_LABEL);
  });

  it('500 when the unassigned branch query fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listSpy = vi.spyOn(dbModule, 'listUnassignedBranches').mockImplementation(() => {
      throw new Error('unassigned failed');
    });
    const res = await unassignedGET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:places.unassigned.GET] unassigned failed');
    listSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
