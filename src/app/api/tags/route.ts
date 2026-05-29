import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { searchTags } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { clampQuery } from '@/lib/api-query';

export const dynamic = 'force-dynamic';

const Q_MAX = 200;
const CAT_MAX = 32;
const RESULTS_MIN = 1;
const RESULTS_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const q = clampQuery(sp.get('q'), Q_MAX);
  // Clamp the optional category filter so a hostile caller can't smuggle
  // an arbitrarily long string into the VNDB filter tuple.
  const cat = clampQuery(sp.get('category'), CAT_MAX) || undefined;
  // Clamp the results count so a malformed `?results=99999` doesn't burn
  // the VNDB throttle budget on a huge response we'll never render.
  const resultsRaw = Number(sp.get('results') ?? '50');
  const results = Number.isFinite(resultsRaw)
    ? Math.max(RESULTS_MIN, Math.min(RESULTS_MAX, Math.trunc(resultsRaw)))
    : 50;
  try {
    const tags = await searchTags(q, { results, category: cat });
    return NextResponse.json({ tags });
  } catch (err) {
    return upstreamError('tags', err);
  }
}
