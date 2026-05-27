import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { searchVn } from '@/lib/vndb';
import { isInCollectionMany } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

// Cap user-supplied query strings before forwarding to VNDB. The
// `searchVn` filter cannot accept a 1 MB string and the rate-limited
// VNDB queue should never have to chew on one. Mirrors the same cap
// `/api/search/advanced` already enforces (S-046).
const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
  if (!q) return NextResponse.json({ results: [], more: false });
  try {
    const data = await searchVn(q, { results: 30 });
    // Single IN(...) query instead of N round-trips for "is in
    // collection?" lookups. With results: 30 that's 1 SELECT vs 30.
    const ownedIds = isInCollectionMany(data.results.map((v) => v.id));
    const results = data.results.map((v) => ({ ...v, in_collection: ownedIds.has(v.id) }));
    return NextResponse.json({ results, more: data.more });
  } catch (err) {
    return upstreamError('search', err);
  }
}
