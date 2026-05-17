import { NextRequest, NextResponse } from 'next/server';
import { addToVndbWishlist, removeFromVndbWishlist } from '@/lib/vndb';
import { recordActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Per-VN VNDB wishlist mutations.
 *
 * - POST sets ulist label 5 on the VN (creates the ulist entry if needed).
 * - DELETE unsets ulist label 5.
 *
 * Both routes are strictly VNDB-side. They never touch the local SQLite
 * `collection` table, so a VN can be on the VNDB wishlist regardless of
 * whether it lives in the user's local collection — and vice versa.
 */

function vndbErrorResponse(e: Error): NextResponse {
  // VNDB's PATCH /ulist returns 401 when the token lacks the `listwrite`
  // permission. Translate that into something actionable instead of the
  // raw 'VNDB PATCH … -> 401: Unauthorized' string.
  const msg = e.message;
  if (/401/.test(msg)) {
    return NextResponse.json(
      { error: 'VNDB token does not have listwrite permission. Regenerate it on vndb.org/u/tokens with listwrite enabled.' },
      { status: 401 },
    );
  }
  return NextResponse.json({ error: msg }, { status: 502 });
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^v\d+$/i.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    const r = await addToVndbWishlist(id);
    if ('needsAuth' in r) {
      return NextResponse.json({ error: 'VNDB token required' }, { status: 401 });
    }
    recordActivity({ kind: 'wishlist.add', entity: 'vn', entityId: id, label: 'Added VNDB wishlist label' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return vndbErrorResponse(e as Error);
  }
}

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
    recordActivity({ kind: 'wishlist.remove', entity: 'vn', entityId: id, label: 'Removed VNDB wishlist label' });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return vndbErrorResponse(e as Error);
  }
}
