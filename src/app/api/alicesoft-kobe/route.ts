import { NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { countKobeStock, countKobeDownloadPending, getAppSetting, listKobeStock } from '@/lib/db';
import { fetchAuthenticatedWishlist } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Build the set of VN ids currently on the user's VNDB wishlist (Label 5).
 * Returns null if the user is not authenticated or the call fails — in
 * either case we treat every kobe item as "not in wishlist".
 */
async function loadVndbWishlistIds(): Promise<Set<string> | null> {
  try {
    const r = await fetchAuthenticatedWishlist();
    if ('needsAuth' in r) return null;
    return new Set(r.map((entry) => entry.id));
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const [rawItems, stats, pending, wishlistIds] = await Promise.all([
    Promise.resolve(listKobeStock()),
    Promise.resolve(countKobeStock()),
    Promise.resolve(countKobeDownloadPending()),
    loadVndbWishlistIds(),
  ]);

  // Annotate each row with in_wishlist based on the LIVE VNDB Label 5,
  // not on local `collection.status`. The two concepts are independent —
  // a VN can be on the VNDB wishlist AND already in the local collection.
  const items = rawItems.map((row) => ({
    ...row,
    in_wishlist: row.vn_id && wishlistIds?.has(row.vn_id) ? 1 : 0,
  }));

  let inWishlistCount = 0;
  for (const it of items) inWishlistCount += it.in_wishlist;

  const lastFetch = getAppSetting('alicesoft_kobe_last_fetch');
  return NextResponse.json({
    items,
    stats: { ...stats, in_wishlist: inWishlistCount },
    pending,
    last_fetch: lastFetch ? Number(lastFetch) : null,
  });
}
