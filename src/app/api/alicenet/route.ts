import { NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import type { AliceNetStockListQuery } from '@/lib/db';
import { getAliceNetRepository } from '@/lib/db/repositories/alicenet';
import { getAppSettingRepository } from '@/lib/db/repositories/app-setting';
import { getCachedVndbWishlistIds } from '@/lib/vndb-wishlist-cache';
import { createOffsetPageMeta } from '@/lib/server-pagination';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_PAGE_SIZE = 96;
const MAX_PAGE_SIZE = 240;
const WISHLIST_ENRICHMENT_TIMEOUT_MS = 1200;

async function loadVndbWishlistIdsWithinBudget(): Promise<Set<string> | null> {
  const timeoutRef: { id?: ReturnType<typeof setTimeout> } = {};
  const timeout = new Promise<null>((resolve) => {
    timeoutRef.id = setTimeout(() => resolve(null), WISHLIST_ENRICHMENT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([getCachedVndbWishlistIds(), timeout]);
  } finally {
    clearTimeout(timeoutRef.id);
  }
}

function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function parseOptionalBoundedInt(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

const FILTERS: readonly AliceNetStockListQuery['filter'][] = [
  'all', 'matched', 'vndb', 'egs_only', 'unmatched', 'none_found', 'collection', 'wishlist',
];
const SORTS: readonly AliceNetStockListQuery['sort'][] = [
  'title', 'release_desc', 'release_asc', 'price_asc', 'price_desc', 'match_status', 'updated_desc',
];
const GROUPS: readonly AliceNetStockListQuery['group'][] = ['none', 'match', 'producer', 'year'];

function isAllowed<T extends string>(value: string | null, allowed: readonly T[]): value is T {
  return value !== null && allowed.includes(value as T);
}

export async function GET(req: Request): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const limit = parseBoundedInt(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = parseBoundedInt(url.searchParams.get('offset'), 0, 0, 10_000_000);
  const rawFilter = url.searchParams.get('filter');
  const rawSort = url.searchParams.get('sort');
  const rawGroup = url.searchParams.get('group');
  const filter = isAllowed(rawFilter, FILTERS) ? rawFilter : 'all';
  const sort = isAllowed(rawSort, SORTS) ? rawSort : 'match_status';
  const group = isAllowed(rawGroup, GROUPS) ? rawGroup : 'none';
  const wishlistIds = await loadVndbWishlistIdsWithinBudget();
  const repository = getAliceNetRepository();
  const result = await repository.queryPage({
    limit,
    offset,
    filter,
    sort,
    group,
    search: (url.searchParams.get('q') ?? '').slice(0, 200),
    producer: (url.searchParams.get('producer') ?? '').slice(0, 200),
    yearMin: parseOptionalBoundedInt(url.searchParams.get('yearMin'), 1, 9999),
    yearMax: parseOptionalBoundedInt(url.searchParams.get('yearMax'), 1, 9999),
    priceMin: parseOptionalBoundedInt(url.searchParams.get('priceMin'), 0, 1_000_000_000),
    priceMax: parseOptionalBoundedInt(url.searchParams.get('priceMax'), 0, 1_000_000_000),
    wishlistIds: wishlistIds ? [...wishlistIds] : null,
  });

  const page = createOffsetPageMeta(result.total, limit, offset, result.items.length);

  const stats = await repository.countStock();
  const pending = await repository.countDownloadPending();
  let inWishlistCount = 0;
  if (wishlistIds) {
    for (const vnId of await repository.listMatchedVnIds()) {
      if (wishlistIds.has(vnId)) inWishlistCount += 1;
    }
  }
  const lastFetch = await getAppSettingRepository().get('alicenet_last_fetch');
  return NextResponse.json({
    items: result.items,
    stats: { ...stats, in_wishlist: inWishlistCount },
    pending,
    last_fetch: lastFetch ? Number(lastFetch) : null,
    page,
    producers: result.producers,
    wishlist_available: wishlistIds !== null,
  });
}
