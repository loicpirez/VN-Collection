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
    const msg = (e as Error).message;
    // VNDB's PATCH /ulist returns 401 when the token lacks the `listwrite`
    // permission. Translate that into something actionable instead of the
    // raw 'VNDB PATCH … -> 401: Unauthorized' string.
    if (/401/.test(msg)) {
      return NextResponse.json(
        { error: 'VNDB token does not have listwrite permission. Regenerate it on vndb.org/u/tokens with listwrite enabled.' },
        { status: 401 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
