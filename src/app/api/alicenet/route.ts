import { NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import {
  countAliceNetStock,
  countAliceNetStockTotal,
  countAliceNetDownloadPending,
  getAppSetting,
  listAliceNetMatchedVnIds,
  listAliceNetStockPage,
} from '@/lib/db';
import { fetchAuthenticatedWishlist } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 1000;
const WISHLIST_ENRICHMENT_TIMEOUT_MS = 1200;

/**
 * Build the set of VN ids currently on the user's VNDB wishlist (Label 5).
 * Returns null if the user is not authenticated or the call fails - in
 * either case we treat every alicenet item as "not in wishlist". The
 * underlying ulist fetch is cache-backed, so calling this once per page in
 * a paged load sequence costs one upstream round-trip, not one per page.
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

async function loadVndbWishlistIdsWithinBudget(): Promise<Set<string> | null> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const wishlist = loadVndbWishlistIds().catch(() => null);
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), WISHLIST_ENRICHMENT_TIMEOUT_MS);
  });
  const result = await Promise.race([wishlist, timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  return result;
}

function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export async function GET(req: Request): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const limit = parseBoundedInt(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = parseBoundedInt(url.searchParams.get('offset'), 0, 0, 10_000_000);
  const isFirstPage = offset === 0;

  const [rawItems, total, wishlistIds] = await Promise.all([
    Promise.resolve(listAliceNetStockPage(limit, offset)),
    Promise.resolve(countAliceNetStockTotal()),
    loadVndbWishlistIdsWithinBudget(),
  ]);

  const items = rawItems.map((row) => ({
    ...row,
    in_wishlist: row.vn_id && wishlistIds?.has(row.vn_id) ? 1 : 0,
  }));

  const page = {
    offset,
    limit,
    total,
    has_more: offset + items.length < total,
  };

  if (!isFirstPage) {
    return NextResponse.json({ items, page });
  }

  const stats = countAliceNetStock();
  const pending = countAliceNetDownloadPending();
  let inWishlistCount = 0;
  if (wishlistIds) {
    for (const vnId of listAliceNetMatchedVnIds()) {
      if (wishlistIds.has(vnId)) inWishlistCount += 1;
    }
  }
  const lastFetch = getAppSetting('alicenet_last_fetch');
  return NextResponse.json({
    items,
    stats: { ...stats, in_wishlist: inWishlistCount },
    pending,
    last_fetch: lastFetch ? Number(lastFetch) : null,
    page,
  });
}
