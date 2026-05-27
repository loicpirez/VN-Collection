import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { searchStaff } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Audit S-020: gate against LAN amplification — each hit issues a
  // VNDB POST /staff via the 1 req/s throttle. A LAN caller could
  // starve the operator's own UI of the throttle budget.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') ?? '';
  if (!q.trim()) return NextResponse.json({ staff: [] });
  try {
    const staff = await searchStaff(q);
    return NextResponse.json({ staff });
  } catch (err) {
    return upstreamError('staff', err);
  }
}
