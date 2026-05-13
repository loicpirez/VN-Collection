import { NextRequest, NextResponse } from 'next/server';
import { getVn } from '@/lib/vndb';
import { getCollectionItem, upsertVn } from '@/lib/db';
import { downloadFullStaffForVn } from '@/lib/staff-full';
import { downloadFullCharForVn } from '@/lib/character-full';

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
    // Fire-and-forget: pull the full profile + credit history for every
    // staff member / VA this VN credits. Cached 30 days so this is mostly
    // a no-op on subsequent VN fetches. Failures are swallowed.
    void downloadFullStaffForVn(vn.id).catch(() => {});
    void downloadFullCharForVn(vn.id).catch(() => {});
    const item = getCollectionItem(vn.id);
    return NextResponse.json({ vn: item, in_collection: !!item?.status });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
