import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getCharacter } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^c\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const character = await getCharacter(id);
    if (!character) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ character });
  } catch (err) {
    return upstreamError('character/[id]', err);
  }
}
