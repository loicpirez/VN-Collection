import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { searchVn } from '@/lib/vndb';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { clampQuery } from '@/lib/api-query';
import { tooManyRequests } from '@/lib/rate-limit-response';
import { VNDB_QUICK_SEARCH_PAGE_SIZE } from '@/lib/search-result-limits';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cap user-supplied query strings before forwarding to VNDB. The
const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const limited = tooManyRequests(req, 'search', { limit: 30, windowMs: 10_000 });
  if (limited) return limited;
  const q = clampQuery(req.nextUrl.searchParams.get('q'), Q_MAX);
  if (!q) return NextResponse.json({ results: [], more: false });
  try {
    const data = await searchVn(q, { results: VNDB_QUICK_SEARCH_PAGE_SIZE });
    // Single IN(...) query instead of N round-trips for "is in
    // collection?" lookups. The bounded window stays one SELECT instead of N.
    const ownedIds = await getCollectionCoreRepository().containsMany(data.results.map((v) => v.id));
    const results = data.results.map((v) => ({ ...v, in_collection: ownedIds.has(v.id) }));
    return NextResponse.json({ results, more: data.more });
  } catch (err) {
    return upstreamError('search', err);
  }
}
