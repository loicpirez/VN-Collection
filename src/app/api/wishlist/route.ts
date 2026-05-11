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
    // VNDB ulist response: top-level `e.id` IS the VN id. `e.vn.*` only
    // contains the fields you queried (no `vn.id` — it's silently dropped).
    // Echo the id into the nested `vn` object so existing client code that
    // reads `it.vn.id` keeps working without a coordinated rename.
    const egsMap = getEgsForVns(result.map((e) => e.id));
    const items = result.map((e) => ({
      ...e,
      vn: { ...e.vn, id: e.id },
      in_collection: isInCollection(e.id),
      egs: egsMap.get(e.id)
        ? {
            median: egsMap.get(e.id)!.median,
            playtime_median_minutes: egsMap.get(e.id)!.playtime_median_minutes,
          }
        : null,
    }));
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
