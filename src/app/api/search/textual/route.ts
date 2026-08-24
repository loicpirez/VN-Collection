import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { getTextSearchRepository } from '@/lib/db/repositories/text-search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Q_MAX = 300;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, Q_MAX);
  return NextResponse.json({ hits: await getTextSearchRepository().search(q, 50) });
}
