import { NextRequest, NextResponse } from 'next/server';
import {
  deleteShelf,
  getShelf,
  listShelfDisplaySlots,
  listShelfSlots,
  renameShelf,
  resizeShelf,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const shelf = getShelf(sid);
  if (!shelf) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({
    shelf,
    slots: listShelfSlots(sid),
    displays: listShelfDisplaySlots(sid),
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    cols?: unknown;
    rows?: unknown;
  };

  try {
    if (typeof body.name === 'string' && body.name.trim().length > 0) {
      const shelf = renameShelf(sid, body.name);
      if (!shelf) return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (typeof body.cols === 'number' || typeof body.rows === 'number') {
      const current = getShelf(sid);
      if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 });
      const result = resizeShelf(
        sid,
        typeof body.cols === 'number' ? body.cols : current.cols,
        typeof body.rows === 'number' ? body.rows : current.rows,
      );
      if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 });
      return NextResponse.json({
        shelf: result.shelf,
        slots: listShelfSlots(sid),
        evicted: result.evicted,
      });
    }
    return NextResponse.json({ shelf: getShelf(sid), slots: listShelfSlots(sid) });
  } catch (e) {
    console.error('shelf patch failed:', (e as Error).message);
    return NextResponse.json({ error: 'shelf patch failed' }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sid = parseId(id);
  if (sid === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const ok = deleteShelf(sid);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
