import { NextRequest, NextResponse } from 'next/server';
import {
  getShelf,
  listShelfDisplaySlots,
  placeShelfDisplayItem,
  removeShelfDisplayPlacement,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
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
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const shelf = getShelf(sid);
  if (!shelf) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    after_row?: unknown;
    position?: unknown;
    vn_id?: unknown;
    release_id?: unknown;
  };
  if (
    typeof body.after_row !== 'number' ||
    typeof body.position !== 'number' ||
    !Number.isInteger(body.after_row) ||
    !Number.isInteger(body.position) ||
    body.after_row < 0 ||
    body.position < 0 ||
    typeof body.vn_id !== 'string' ||
    typeof body.release_id !== 'string' ||
    body.vn_id.length === 0 ||
    body.vn_id.length > 64 ||
    body.release_id.length === 0 ||
    body.release_id.length > 64
  ) {
    return NextResponse.json(
      { error: 'after_row/position/vn_id/release_id required' },
      { status: 400 },
    );
  }
  if (
    !/^r\d+$/i.test(body.release_id) &&
    body.release_id !== `synthetic:${body.vn_id}`
  ) {
    return NextResponse.json({ error: 'invalid release_id' }, { status: 400 });
  }
  try {
    placeShelfDisplayItem({
      shelfId: sid,
      afterRow: body.after_row,
      position: body.position,
      vnId: body.vn_id,
      releaseId: body.release_id,
    });
    return NextResponse.json({ displays: listShelfDisplaySlots(sid) });
  } catch (e) {
    console.error('shelf display place failed:', (e as Error).message);
    return NextResponse.json({ error: 'shelf display place failed' }, { status: 400 });
  }
}

/** DELETE /api/shelves/[id]/displays — return a display slot's
 *  edition to the unplaced pool. Body: { vn_id, release_id }. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const shelf = getShelf(sid);
  if (!shelf) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    vn_id?: unknown;
    release_id?: unknown;
  };
  if (typeof body.vn_id !== 'string' || typeof body.release_id !== 'string') {
    return NextResponse.json({ error: 'vn_id/release_id required' }, { status: 400 });
  }
  if (
    !/^r\d+$/i.test(body.release_id) &&
    body.release_id !== `synthetic:${body.vn_id}`
  ) {
    return NextResponse.json({ error: 'invalid release_id' }, { status: 400 });
  }
  removeShelfDisplayPlacement(body.vn_id, body.release_id);
  return NextResponse.json({ displays: listShelfDisplaySlots(sid) });
}
