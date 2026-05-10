import { NextRequest, NextResponse } from 'next/server';
import { getCharacter } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^c\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const character = await getCharacter(id);
    if (!character) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ character });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
