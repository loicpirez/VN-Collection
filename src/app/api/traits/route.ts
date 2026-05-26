import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { searchTraits } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') ?? '';
  const results = Number(sp.get('results') ?? '50');
  try {
    const traits = await searchTraits(q, { results });
    return NextResponse.json({ traits });
  } catch (err) {
    return upstreamError('traits', err);
  }
}
