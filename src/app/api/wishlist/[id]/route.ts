import { NextRequest, NextResponse } from 'next/server';
import { addToVndbWishlist, removeFromVndbWishlist } from '@/lib/vndb';
import { recordActivity } from '@/lib/activity';
import { upstreamError } from '@/lib/api-error';

import { isVndbVnId } from '@/lib/vn-id-shape';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
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

function vndbErrorResponse(e: Error, label: string): NextResponse {
  // VNDB's PATCH /ulist returns 401 when the token lacks the `listwrite`
  // permission. Translate that into something actionable instead of the
  // raw 'VNDB PATCH … -> 401: Unauthorized' string.
  if (/-> 401:/.test(e.message)) {
    return NextResponse.json(
      { error: 'VNDB token does not have listwrite permission. Regenerate it on vndb.org/u/tokens with listwrite enabled.', code: 'vndb_listwrite_required' },
      { status: 401 },
    );
  }
  return upstreamError(label, e);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isVndbVnId(id)) {
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
    return vndbErrorResponse(e as Error, `wishlist/${id}`);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isVndbVnId(id)) {
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
    return vndbErrorResponse(e as Error, `wishlist/${id}`);
  }
}
