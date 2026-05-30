import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { searchTraits } from '@/lib/vndb';
import { tooManyRequests } from '@/lib/rate-limit-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Q_MAX = 200;
const RESULTS_MIN = 1;
const RESULTS_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const limited = tooManyRequests(req, 'traits', { limit: 30, windowMs: 10_000 });
  if (limited) return limited;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').slice(0, Q_MAX);
  // Clamp the results count so a malformed `?results=99999` doesn't burn
  // the VNDB throttle budget on a huge response.
  const resultsRaw = Number(sp.get('results') ?? '50');
  const results = Number.isFinite(resultsRaw)
    ? Math.max(RESULTS_MIN, Math.min(RESULTS_MAX, Math.trunc(resultsRaw)))
    : 50;
  try {
    const traits = await searchTraits(q, { results });
    return NextResponse.json({ traits });
  } catch (err) {
    return upstreamError('traits', err);
  }
}
