import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { searchStaff } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Mirrors the cap applied to /api/search and /api/search/advanced. VNDB
// staff search has the same 1 req/s throttle and the same vulnerability
// to oversized filter strings.
const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').slice(0, Q_MAX);
  if (!q.trim()) return NextResponse.json({ staff: [] });
  try {
    const staff = await searchStaff(q);
    return NextResponse.json({ staff });
  } catch (err) {
    return upstreamError('staff', err);
  }
}
