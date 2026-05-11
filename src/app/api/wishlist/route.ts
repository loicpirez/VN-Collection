import { NextResponse } from 'next/server';
import { fetchAuthenticatedWishlist } from '@/lib/vndb';
import { getEgsForVns, isInCollection } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await fetchAuthenticatedWishlist();
    if ('needsAuth' in result) {
      return NextResponse.json({ needsAuth: true, items: [] });
    }
    const egsMap = getEgsForVns(result.map((e) => e.vn.id));
    const items = result.map((e) => {
      const egs = egsMap.get(e.vn.id);
      return {
        ...e,
        in_collection: isInCollection(e.vn.id),
        egs: egs
          ? {
              median: egs.median,
              playtime_median_minutes: egs.playtime_median_minutes,
            }
          : null,
      };
    });
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
