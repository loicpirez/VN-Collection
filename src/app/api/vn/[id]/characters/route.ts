import { NextRequest, NextResponse } from 'next/server';
import { getCharactersForVn } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const characters = await getCharactersForVn(id);
    return NextResponse.json({ characters });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
