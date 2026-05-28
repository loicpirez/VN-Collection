import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getRelease } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^r\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const release = await getRelease(id);
    if (!release) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ release });
  } catch (err) {
    return upstreamError('release/[id]', err);
  }
}
