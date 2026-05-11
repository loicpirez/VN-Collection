import { NextRequest, NextResponse } from 'next/server';
import { getCharactersForVn } from '@/lib/vndb';
import { getCharacterImages } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^(v\d+|egs:\d+)$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const characters = await getCharactersForVn(id);
    const localPaths = getCharacterImages(characters.map((c) => c.id));
    const enriched = characters.map((c) => ({
      ...c,
      localImage: localPaths.get(c.id)?.local_path ?? null,
    }));
    return NextResponse.json({ characters: enriched });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
