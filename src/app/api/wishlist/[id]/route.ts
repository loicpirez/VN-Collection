import { NextRequest, NextResponse } from 'next/server';
import { removeFromVndbWishlist } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    const r = await removeFromVndbWishlist(id);
    if ('needsAuth' in r) {
      return NextResponse.json({ error: 'VNDB token required' }, { status: 401 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
