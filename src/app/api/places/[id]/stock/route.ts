import { NextRequest, NextResponse } from 'next/server';
import { getPlace, listVnsAtPlace, listOffersAtPlace } from '@/lib/db';
import { internalError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type AvailFilter = 'in_stock' | 'all' | 'out_of_stock';
const VALID_AVAIL: AvailFilter[] = ['in_stock', 'all', 'out_of_stock'];

function parseAvail(raw: string | null): AvailFilter {
  return VALID_AVAIL.includes(raw as AvailFilter) ? (raw as AvailFilter) : 'in_stock';
}

// intentionally public — single-user self-hosted app
export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const { id: raw } = await ctx.params;
    const id = parseId(raw);
    if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    if (!getPlace(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const url = new URL(req.url);
    const avail = parseAvail(url.searchParams.get('avail'));

    const vns = listVnsAtPlace(id, avail);
    const offers = listOffersAtPlace(id, avail);

    const offerMap: Record<string, typeof offers> = {};
    for (const o of offers) {
      if (!offerMap[o.vn_id]) offerMap[o.vn_id] = [];
      offerMap[o.vn_id].push(o);
    }

    const vnsWithOffers = vns.map((vn) => ({
      ...vn,
      offers: offerMap[vn.vn_id] ?? [],
    }));

    return NextResponse.json({ vns: vnsWithOffers });
  } catch (err) {
    return internalError('places.[id].stock.GET', err);
  }
}
