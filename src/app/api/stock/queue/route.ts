import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { getStockQueueRepository, type StockQueueEntry } from '@/lib/db/repositories/stock-queue';
import { isVndbVnId } from '@/lib/vn-id-shape';
import { fetchAuthenticatedWishlist } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Lightweight ID-only enumeration for batch stock refresh.
 *
 * `?scope=collection` returns every VN id the user has in the local
 * collection table (any status). Used by the "Refresh all" button on
 * /stock so the operator can walk their whole library without typing
 * IDs into a textarea.
 *
 * `?scope=wishlist` returns wishlist VNs that the operator has saved.
 */
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 500;
const MAX_PAGE = 10_000;

function parsePositiveInt(raw: string | null, fallback: number, max: number): number | null {
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= max ? value : null;
}

function queueResponse(scope: string, entries: StockQueueEntry[], total: number, page: number, pageSize: number): NextResponse {
  const nextPage = page * pageSize < total ? page + 1 : null;
  return NextResponse.json({
    scope,
    ids: entries.map((entry) => entry.vn_id),
    entries,
    page,
    page_size: pageSize,
    total,
    next_page: nextPage,
  });
}

async function buildEntries(ids: string[]): Promise<StockQueueEntry[]> {
  const titleMap = await getStockQueueRepository().titlesFor(ids);
  return ids.map((vn_id) => ({ vn_id, title: titleMap.get(vn_id) ?? null }));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const scope = req.nextUrl.searchParams.get('scope') ?? 'collection';
  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, MAX_PAGE);
  const pageSize = parsePositiveInt(req.nextUrl.searchParams.get('page_size'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if (page === null || pageSize === null) {
    return NextResponse.json({ error: 'invalid pagination' }, { status: 400 });
  }
  const offset = (page - 1) * pageSize;
  if (scope === 'collection' || scope === 'reading_queue' || scope === 'recent_stock' || scope === 'recent_checked') {
    const result = await getStockQueueRepository().list(scope, pageSize, offset);
    return queueResponse(scope, result.entries, result.total, page, pageSize);
  }
  if (scope === 'wishlist') {
    const result = await fetchAuthenticatedWishlist();
    if ('needsAuth' in result) {
      return NextResponse.json({ error: 'VNDB authentication required' }, { status: 401 });
    }
    const allIds = result.map((e) => e.id).filter(isVndbVnId);
    const ids = allIds.slice(offset, offset + pageSize);
    return queueResponse(scope, await buildEntries(ids), allIds.length, page, pageSize);
  }
  return NextResponse.json({ error: 'unknown scope' }, { status: 400 });
}
