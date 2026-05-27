import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getCharactersForVn } from '@/lib/vndb';
import { getCharacterImages } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  // Audit S-029: gate — VNDB POST /character on miss.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const characters = await getCharactersForVn(id);
    const localPaths = getCharacterImages(characters.map((c) => c.id));
    const enriched = characters.map((c) => ({
      ...c,
      localImage: localPaths.get(c.id)?.local_path ?? null,
    }));
    return NextResponse.json({ characters: enriched });
  } catch (err) {
    return upstreamError('vn/[id]/characters', err);
  }
}
