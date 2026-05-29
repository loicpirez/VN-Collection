import { NextRequest, NextResponse } from 'next/server';
import { getPlace, listPlaceVnsEnhanced, listOffersAtPlace } from '@/lib/db';
import { internalError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    const place = getPlace(id);
    if (!place) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const vns = listPlaceVnsEnhanced(id);
    const offers = listOffersAtPlace(id, 'all');

    const offerMap: Record<string, typeof offers> = {};
    for (const o of offers) {
      if (!offerMap[o.vn_id]) offerMap[o.vn_id] = [];
      offerMap[o.vn_id].push(o);
    }

    const vnsWithOffers = vns.map((vn) => ({
      ...vn,
      offers: offerMap[vn.vn_id] ?? [],
    }));

    const inStockCount = vns.filter((v) => v.in_stock_count > 0).length;
    const outOfStockCount = vns.filter((v) => v.in_stock_count === 0 && v.out_of_stock_count > 0).length;
    const totalOffers = vns.reduce((s, v) => s + v.offer_count, 0);
    const inCollectionCount = vns.filter((v) => v.in_collection === 1).length;

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
      },
    });
  } catch (err) {
    return internalError('places.[id].stock.GET', err);
  }
}
