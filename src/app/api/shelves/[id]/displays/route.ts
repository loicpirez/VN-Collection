import { NextRequest, NextResponse } from 'next/server';
import {
  getShelf,
  listShelfDisplaySlots,
  placeShelfDisplayItem,
  removeShelfDisplayPlacement,
} from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

import { readJsonObject } from '@/lib/api-body';
import { parseOwnedReleaseIdentity } from '@/lib/owned-release-id';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * POST /api/shelves/[id]/displays — place an owned edition into a
 * front-display ("face-out") slot.
 *
 * Body: { after_row, position, vn_id, release_id }.
 *
 * `after_row` is the index of the row above the display strip
 * (0..rows inclusive; `rows` = after the last row). `position` is
 * 0..cols-1 within the strip. The DB helper takes care of:
 *   - removing any prior placement of the edition (cell OR display),
 *   - evicting any current occupant of the target display slot back
 *     to the unplaced pool,
 *   - rejecting non-owned editions and out-of-bounds coordinates.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const shelf = getShelf(sid);
  if (!shelf) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = (await readJsonObject(req)) as {
    after_row?: unknown;
    position?: unknown;
    vn_id?: unknown;
    release_id?: unknown;
  };
  if (
    typeof body.after_row !== 'number' ||
    typeof body.position !== 'number' ||
    !Number.isSafeInteger(body.after_row) ||
    !Number.isSafeInteger(body.position) ||
    body.after_row < 0 ||
    body.position < 0 ||
    typeof body.vn_id !== 'string' ||
    typeof body.release_id !== 'string'
  ) {
    return NextResponse.json(
      { error: 'after_row/position/vn_id/release_id required' },
      { status: 400 },
    );
  }
  const identity = parseOwnedReleaseIdentity(body.vn_id, body.release_id);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: 400 });
  try {
    placeShelfDisplayItem({
      shelfId: sid,
      afterRow: body.after_row,
      position: body.position,
      vnId: identity.value.vnId,
      releaseId: identity.value.releaseId,
    });
    recordActivity({
      kind: 'shelf.display.place',
      entity: 'shelf_display_slot',
      entityId: `${sid}:${body.after_row}:${body.position}`,
      label: 'Placed front display edition',
      payload: { shelf_id: sid, after_row: body.after_row, position: body.position, vn_id: identity.value.vnId, release_id: identity.value.releaseId },
    });
    return NextResponse.json({ displays: listShelfDisplaySlots(sid) });
  } catch (e) {
    console.error('shelf display place failed:', (e as Error).message);
    return NextResponse.json({ error: 'shelf display place failed' }, { status: 400 });
  }
}

/** DELETE /api/shelves/[id]/displays — return a display slot's
 *  edition to the unplaced pool. Body: { vn_id, release_id }. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const shelf = getShelf(sid);
  if (!shelf) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = (await readJsonObject(req)) as {
    vn_id?: unknown;
    release_id?: unknown;
  };
  const identity = parseOwnedReleaseIdentity(body.vn_id, body.release_id);
  if (!identity.ok) return NextResponse.json({ error: identity.error }, { status: 400 });
  removeShelfDisplayPlacement(identity.value.vnId, identity.value.releaseId);
  recordActivity({
    kind: 'shelf.display.unplace',
    entity: 'shelf_display_slot',
    entityId: `${identity.value.vnId}:${identity.value.releaseId}`,
    label: 'Removed front display placement',
    payload: { shelf_id: sid, vn_id: identity.value.vnId, release_id: identity.value.releaseId },
  });
  return NextResponse.json({ displays: listShelfDisplaySlots(sid) });
}
