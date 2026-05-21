import { NextRequest, NextResponse } from 'next/server';
import { searchTextual } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

const Q_MAX = 300;

export async function GET(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, Q_MAX);
  return NextResponse.json({ hits: searchTextual(q, 50) });
}
