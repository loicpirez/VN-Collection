import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { EgsUnreachable, searchEgsCandidates } from '@/lib/erogamescape';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { clampQuery, parseBoundedQueryInteger } from '@/lib/api-query';
import { tooManyRequests } from '@/lib/rate-limit-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cap the query so a malformed (or hostile) caller can't drop a 1 MB
// blob into the EGS SQL form. The form's POST body has its own server-
// side limits, but enforcing this here keeps `vndb_cache` keys bounded
// and avoids burning a slow EGS roundtrip on certain-to-fail input.
const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const limited = tooManyRequests(req, 'egs/search', { limit: 30, windowMs: 10_000 });
  if (limited) return limited;
  const q = clampQuery(req.nextUrl.searchParams.get('q'), Q_MAX);
  const limit = parseBoundedQueryInteger(req.nextUrl.searchParams.get('limit'), {
    fallback: 20,
    min: 1,
    max: 50,
  });
  if (!q) {
    return NextResponse.json({ candidates: [] });
  }
  try {
    const candidates = await searchEgsCandidates(q, limit);
    return NextResponse.json({ candidates });
  } catch (e) {
    if (e instanceof EgsUnreachable) {
      return NextResponse.json(
        { error: 'egs_unreachable', kind: e.kind, status: e.status, candidates: [] },
        { status: 503 },
      );
    }
    return upstreamError('egs/search', e);
  }
}
