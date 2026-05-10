import { NextRequest, NextResponse } from 'next/server';
import { getVn } from '@/lib/vndb';
import { getCollectionItem, upsertVn } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CACHE_MS = 24 * 3600 * 1000;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cached = getCollectionItem(id);
  if (cached && cached.fetched_at && Date.now() - cached.fetched_at < CACHE_MS) {
    return NextResponse.json({ vn: cached, in_collection: !!cached.status });
  }
  try {
    const vn = await getVn(id);
    if (!vn) return NextResponse.json({ error: 'not found' }, { status: 404 });
    upsertVn(vn);
    const item = getCollectionItem(vn.id);
    return NextResponse.json({ vn: item, in_collection: !!item?.status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
