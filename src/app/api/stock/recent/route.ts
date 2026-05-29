import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { listRecentVnStockOffers } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export function GET(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const raw = sp.get('limit');
  const limit = raw ? Math.min(Math.max(1, parseInt(raw, 10) || DEFAULT_LIMIT), MAX_LIMIT) : DEFAULT_LIMIT;
  const offers = listRecentVnStockOffers(limit);
  return NextResponse.json({ offers });
}
