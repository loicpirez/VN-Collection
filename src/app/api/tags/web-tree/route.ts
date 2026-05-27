import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getVndbTagHomeTree } from '@/lib/vndb-tag-web-cache';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Audit S-022: gate. `?force=1` can rebuild the entire tag tree cache
  // — an unauthenticated trigger of that is a DoS amplification.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const force = req.nextUrl.searchParams.get('force') === '1';
  try {
    const tree = await getVndbTagHomeTree({ force });
    return NextResponse.json(tree);
  } catch (err) {
    return upstreamError('tags/web-tree', err);
  }
}
