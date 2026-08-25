import { NextRequest, NextResponse } from 'next/server';
import { getPlaceRepository } from '@/lib/db/repositories/place';
import { internalError } from '@/lib/api-error';
import { fetchAuthenticatedWishlist } from '@/lib/vndb';
import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
import { parseNamedIdRows } from '@/lib/client-persisted-shape';
import { createOffsetPageMeta } from '@/lib/server-pagination';
import type { PlaceVnRow } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

type Ctx = { params: Promise<{ id: string }> };

const PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 100;
const FILTERS = ['all', 'in_stock', 'out_of_stock', 'in_collection', 'in_wishlist'] as const;
const SORTS = ['name', 'price_asc', 'price_desc', 'fresh'] as const;
type Filter = (typeof FILTERS)[number];
type Sort = (typeof SORTS)[number];

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function loadWishlistIds(): Promise<Set<string> | null> {
  try {
    const r = await fetchAuthenticatedWishlist();
    if ('needsAuth' in r) return null;
    return new Set(r.map((entry) => entry.id));
  } catch {
    return null;
  }
}

function parseInteger(raw: string | null, fallback: number, maximum: number): number | null {
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
}

function parseOptionalPrice(raw: string | null): number | null | undefined {
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function producerFacets(vns: PlaceVnRow[]): Array<{ id: string; name: string; count: number }> {
  const facets = new Map<string, { id: string; name: string; count: number }>();
  for (const vn of vns) {
    for (const producer of parseNamedIdRows(vn.developers)) {
      if (!producer.id) continue;
      const previous = facets.get(producer.id);
      facets.set(producer.id, {
        id: producer.id,
        name: producer.name || producer.id,
        count: (previous?.count ?? 0) + 1,
      });
    }
  }
  return [...facets.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function filterVns(
  vns: PlaceVnRow[],
  wishlistIds: Set<string> | null,
  query: {
    filter: Filter;
    provider: string;
    priceMin: number | null;
    priceMax: number | null;
    search: string;
  },
): PlaceVnRow[] {
  const search = query.search.toLocaleLowerCase();
  return vns.filter((vn) => {
    if (query.filter === 'in_stock' && vn.in_stock_count === 0) return false;
    if (query.filter === 'out_of_stock' && (vn.in_stock_count > 0 || vn.out_of_stock_count === 0)) return false;
    if (query.filter === 'in_collection' && vn.in_collection !== 1) return false;
    if (query.filter === 'in_wishlist' && !wishlistIds?.has(vn.vn_id)) return false;
    if (query.provider && !parseNamedIdRows(vn.developers).some((producer) => producer.id === query.provider)) return false;
    if (query.priceMin !== null && (vn.min_price === null || vn.min_price < query.priceMin)) return false;
    if (query.priceMax !== null && (vn.min_price === null || vn.min_price > query.priceMax)) return false;
    if (
      search
      && !vn.title.toLocaleLowerCase().includes(search)
      && !(vn.alttitle ?? '').toLocaleLowerCase().includes(search)
      && !vn.vn_id.toLocaleLowerCase().includes(search)
    ) return false;
    return true;
  });
}

function sortVns(vns: PlaceVnRow[], sort: Sort): PlaceVnRow[] {
  return [...vns].sort((a, b) => {
    let comparison = 0;
    if (sort === 'price_asc') comparison = (a.min_price ?? Number.MAX_SAFE_INTEGER) - (b.min_price ?? Number.MAX_SAFE_INTEGER);
    else if (sort === 'price_desc') comparison = (b.min_price ?? -1) - (a.min_price ?? -1);
    else if (sort === 'fresh') comparison = b.max_updated_at - a.max_updated_at;
    else comparison = a.title.localeCompare(b.title);
    return comparison || a.title.localeCompare(b.title) || a.vn_id.localeCompare(b.vn_id);
  });
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    const repository = getPlaceRepository();
    const place = await repository.get(id);
    if (!place) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const params = req.nextUrl.searchParams;
    const limit = parseInteger(params.get('limit'), PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = parseInteger(params.get('offset'), 0, Number.MAX_SAFE_INTEGER);
    const filterRaw = params.get('filter') ?? 'all';
    const sortRaw = params.get('sort') ?? 'name';
    const filter = FILTERS.find((value) => value === filterRaw);
    const sort = SORTS.find((value) => value === sortRaw);
    const priceMin = parseOptionalPrice(params.get('price_min'));
    const priceMax = parseOptionalPrice(params.get('price_max'));
    const provider = (params.get('provider') ?? '').trim();
    const search = (params.get('q') ?? '').trim();
    if (
      limit === null
      || limit === 0
      || offset === null
      || !filter
      || !sort
      || priceMin === undefined
      || priceMax === undefined
      || (priceMin !== null && priceMax !== null && priceMin > priceMax)
      || provider.length > 80
      || search.length > 200
    ) {
      return NextResponse.json({ error: 'invalid query' }, { status: 400 });
    }

    const [vns, wishlistIds] = await Promise.all([
      repository.listVns(id),
      loadWishlistIds(),
    ]);

    const filtered = filterVns(vns, wishlistIds, { filter, provider, priceMin, priceMax, search });
    const sorted = sortVns(filtered, sort);
    const pageVns = sorted.slice(offset, offset + limit);
    const offers = await repository.listOffers(id, 'all', pageVns.map((vn) => vn.vn_id));

    const offerMap: Record<string, typeof offers> = {};
    for (const o of offers) {
      if (!offerMap[o.vn_id]) offerMap[o.vn_id] = [];
      offerMap[o.vn_id].push(o);
    }

    const vnsWithOffers = pageVns.map((vn) => ({
      ...vn,
      offers: offerMap[vn.vn_id] ?? [],
      in_wishlist: wishlistIds?.has(vn.vn_id) ? 1 : 0,
    }));

    const inStockCount = vns.filter((v) => v.in_stock_count > 0).length;
    const outOfStockCount = vns.filter((v) => v.in_stock_count === 0 && v.out_of_stock_count > 0).length;
    const totalOffers = vns.reduce((s, v) => s + v.offer_count, 0);
    const inCollectionCount = vns.filter((v) => v.in_collection === 1).length;
    const inWishlistCount = wishlistIds
      ? vns.reduce((count, vn) => count + Number(wishlistIds.has(vn.vn_id)), 0)
      : 0;

    return NextResponse.json({
      place,
      vns: vnsWithOffers,
      page: createOffsetPageMeta(filtered.length, limit, offset, pageVns.length),
      producers: producerFacets(vns),
      stats: {
        total: vns.length,
        in_stock: inStockCount,
        out_of_stock: outOfStockCount,
        offer_count: totalOffers,
        in_collection: inCollectionCount,
        branch_count: place.provider_labels.length,
        in_wishlist: inWishlistCount,
      },
    });
  } catch (err) {
    return internalError('places.[id].stock.GET', err);
  }
}
