import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { searchTags } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Audit S-021: gate against LAN amplification on the VNDB throttle.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q') ?? '';
  const cat = sp.get('category') ?? undefined;
  const results = Number(sp.get('results') ?? '50');
  try {
    const tags = await searchTags(q, { results, category: cat });
    return NextResponse.json({ tags });
  } catch (err) {
    return upstreamError('tags', err);
  }
}
