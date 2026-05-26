import { NextRequest, NextResponse } from 'next/server';
import { searchCollectionByTitle } from '@/lib/steam';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

/**
 * Lightweight title lookup against the in-collection VNs. Used by the
 * /steam manual-link UI; can be reused anywhere we need a quick fuzzy
 * "search the library" affordance.
 */
const Q_MAX = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, Q_MAX);
  return NextResponse.json({ matches: searchCollectionByTitle(q, 12) });
}
