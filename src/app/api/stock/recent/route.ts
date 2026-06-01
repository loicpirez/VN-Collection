import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { listRecentVnStockOffers } from '@/lib/db';
import { parseBoundedQueryInteger } from '@/lib/api-query';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export function GET(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const limit = parseBoundedQueryInteger(sp.get('limit'), {
    fallback: DEFAULT_LIMIT,
    min: 1,
    max: MAX_LIMIT,
  });
  const offers = listRecentVnStockOffers(limit);
  return NextResponse.json({ offers });
}
