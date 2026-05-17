import { NextRequest, NextResponse } from 'next/server';
import {
  getShelf,
  listShelfSlots,
  placeShelfItem,
  removeShelfPlacement,
} from '@/lib/db';
import { recordActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * POST /api/shelves/[id]/slots — place an owned edition into a slot.
 *
 * Body: { row, col, vn_id, release_id }.
 *
 * Behavior is delegated to `placeShelfItem`: empty slot → insert;
 * occupied + moving item had a prior slot → swap; occupied + moving
 * item came from the pool → occupant is evicted to the pool. Returns
 * the fresh slot list so the client can re-render without a second
 * round trip, plus `swapped` if a swap happened.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const shelf = getShelf(sid);
  if (!shelf) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    row?: unknown;
    col?: unknown;
    vn_id?: unknown;
    release_id?: unknown;
  };
  if (
    typeof body.row !== 'number' ||
    typeof body.col !== 'number' ||
    !Number.isInteger(body.row) ||
    !Number.isInteger(body.col) ||
    body.row < 0 ||
    body.col < 0 ||
    typeof body.vn_id !== 'string' ||
    typeof body.release_id !== 'string' ||
    body.vn_id.length === 0 ||
    body.vn_id.length > 64 ||
    body.release_id.length === 0 ||
    body.release_id.length > 64
  ) {
    return NextResponse.json({ error: 'row/col/vn_id/release_id required' }, { status: 400 });
  }
  // release id must be either rNN or `synthetic:vNN`; the caller's vn
  // id must match the synthetic suffix when present.
  if (
    !/^r\d+$/i.test(body.release_id) &&
    body.release_id !== `synthetic:${body.vn_id}`
  ) {
    return NextResponse.json({ error: 'invalid release_id' }, { status: 400 });
  }

  try {
    const result = placeShelfItem({
      shelfId: sid,
      row: body.row,
      col: body.col,
      vnId: body.vn_id,
      releaseId: body.release_id,
    });
    recordActivity({
      kind: 'shelf.place',
      entity: 'shelf_slot',
      entityId: `${sid}:${body.row}:${body.col}`,
      label: 'Placed shelf edition',
      payload: { shelf_id: sid, row: body.row, col: body.col, vn_id: body.vn_id, release_id: body.release_id },
    });
    return NextResponse.json({
      slots: listShelfSlots(sid),
      swapped: result.swapped,
    });
  } catch (e) {
    console.error('shelf slot place failed:', (e as Error).message);
    return NextResponse.json({ error: 'shelf slot place failed' }, { status: 400 });
  }
}

/**
 * DELETE /api/shelves/[id]/slots — return an edition to the pool.
 * Body: { vn_id, release_id }. The shelf id is in the path so the
 * route shape mirrors POST even though the helper is shelf-agnostic.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    vn_id?: unknown;
    release_id?: unknown;
  };
  if (typeof body.vn_id !== 'string' || typeof body.release_id !== 'string') {
    return NextResponse.json({ error: 'vn_id/release_id required' }, { status: 400 });
  }
  removeShelfPlacement(body.vn_id, body.release_id);
  recordActivity({
    kind: 'shelf.unplace',
    entity: 'shelf_slot',
    entityId: `${body.vn_id}:${body.release_id}`,
    label: 'Removed shelf placement',
    payload: { shelf_id: sid, vn_id: body.vn_id, release_id: body.release_id },
  });
  return NextResponse.json({ slots: listShelfSlots(sid) });
}
