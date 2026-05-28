import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { searchCollectionByTitle } from '@/lib/steam';

export const dynamic = 'force-dynamic';

const MAX_TITLES = 50;

/**
 * Resolve a batch of titles against the local VN collection.
 * Used by ErogePricePanel to display in-app links for related games.
 *
 * GET /api/stock/resolve-titles?q[]=title1&q[]=title2
 *
 * Returns a map from each requested title to its best VNDB match (or null).
 * Matching uses the existing `searchCollectionByTitle` which queries
 * `vn.title` and `vn.alttitle` with LIKE.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const raw = req.nextUrl.searchParams.getAll('q').slice(0, MAX_TITLES);
  if (raw.length === 0) return NextResponse.json({});

  const result: Record<string, { vnId: string; title: string } | null> = {};
  for (const q of raw) {
    const trimmed = q.trim();
    if (!trimmed) { result[q] = null; continue; }
    const hits = searchCollectionByTitle(trimmed, 1);
    result[q] = hits.length > 0 ? { vnId: hits[0].id, title: hits[0].title } : null;
  }

  return NextResponse.json(result);
}
