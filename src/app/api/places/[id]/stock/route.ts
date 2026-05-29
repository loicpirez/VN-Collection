import { NextRequest, NextResponse } from 'next/server';
import { getPlace, listPlaceVnsEnhanced, listOffersAtPlace } from '@/lib/db';
import { internalError } from '@/lib/api-error';
import { fetchAuthenticatedWishlist } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
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

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    const place = getPlace(id);
    if (!place) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const [vns, offers, wishlistIds] = await Promise.all([
      Promise.resolve(listPlaceVnsEnhanced(id)),
      Promise.resolve(listOffersAtPlace(id, 'all')),
      loadWishlistIds(),
    ]);

    const offerMap: Record<string, typeof offers> = {};
    for (const o of offers) {
      if (!offerMap[o.vn_id]) offerMap[o.vn_id] = [];
      offerMap[o.vn_id].push(o);
    }

    const vnsWithOffers = vns.map((vn) => ({
      ...vn,
      offers: offerMap[vn.vn_id] ?? [],
      in_wishlist: wishlistIds?.has(vn.vn_id) ? 1 : 0,
    }));

    const inStockCount = vns.filter((v) => v.in_stock_count > 0).length;
    const outOfStockCount = vns.filter((v) => v.in_stock_count === 0 && v.out_of_stock_count > 0).length;
    const totalOffers = vns.reduce((s, v) => s + v.offer_count, 0);
    const inCollectionCount = vns.filter((v) => v.in_collection === 1).length;
    const inWishlistCount = vnsWithOffers.reduce((s, v) => s + v.in_wishlist, 0);

    return NextResponse.json({
      place,
      vns: vnsWithOffers,
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
