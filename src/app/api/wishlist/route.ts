import { NextRequest, NextResponse } from 'next/server';
import { fetchAuthenticatedWishlist } from '@/lib/vndb';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import { getCollectionListRepository } from '@/lib/db/repositories/collection-list';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { apiErrorBody } from '@/lib/api-error-shape';
import { paginateWishlist, parseWishlistServerQuery } from '@/lib/wishlist-pagination';
import type { WishlistClientItem } from '@/lib/vndb-ui-client-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type WishlistReadErrorCode = 'vndb_unavailable' | 'vndb_rate_limited' | 'vndb_malformed_payload';

function wishlistReadErrorCode(err: unknown): WishlistReadErrorCode {
  const message = err instanceof Error ? err.message : String(err);
  if (/\b429\b|rate/i.test(message)) return 'vndb_rate_limited';
  if (/invalid payload shape|non-json|malformed|decode|json/i.test(message)) return 'vndb_malformed_payload';
  return 'vndb_unavailable';
}

function wishlistReadError(err: unknown): NextResponse {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[upstream:wishlist] ${detail}`);
  return NextResponse.json(
    apiErrorBody('upstream service unavailable', wishlistReadErrorCode(err), 'wishlist/read'),
    { status: 502 },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  try {
    const result = await fetchAuthenticatedWishlist();
    if ('needsAuth' in result) {
      return NextResponse.json({ needsAuth: true, items: [] });
    }
    // VNDB ulist response: top-level `e.id` IS the VN id. `e.vn.*` only
    // contains the fields you queried (no `vn.id` — it's silently dropped).
    // Echo the id into the nested `vn` object so existing client code that
    // reads `it.vn.id` keeps working without a coordinated rename.
    //
    const ids = result.map((e) => e.id);
    const [ownedSet, egsMap] = await Promise.all([
      getCollectionCoreRepository().containsMany(ids),
      getCollectionListRepository().egsSummaries(ids),
    ]);
    const items: WishlistClientItem[] = result.map((e) => ({
      ...e,
      vn: { ...e.vn, id: e.id },
      in_collection: ownedSet.has(e.id),
      egs: egsMap.get(e.id)
        ? {
            median: egsMap.get(e.id)!.median,
            playtime_median_minutes: egsMap.get(e.id)!.playtime_median_minutes,
          }
        : null,
    }));
    if (!req.nextUrl.searchParams.has('page') && !req.nextUrl.searchParams.has('pageSize')) {
      return NextResponse.json({ items });
    }
    return NextResponse.json(paginateWishlist(items, parseWishlistServerQuery(req.nextUrl.searchParams)));
  } catch (err) {
    return wishlistReadError(err);
  }
}
