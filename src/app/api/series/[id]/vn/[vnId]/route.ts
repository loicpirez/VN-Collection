import { NextRequest, NextResponse } from 'next/server';
import { addVnToSeries, getSeries, isInCollection, removeVnFromSeries } from '@/lib/db';
import { walkSeriesRelations } from '@/lib/series-detect';

export const dynamic = 'force-dynamic';

function parseSeriesId(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; vnId: string }> }) {
  const { id, vnId } = await ctx.params;
  const sid = parseSeriesId(id);
  if (sid == null) return NextResponse.json({ error: 'invalid series id' }, { status: 400 });
  if (!getSeries(sid)) return NextResponse.json({ error: 'series not found' }, { status: 404 });
  if (!/^v\d+$/i.test(vnId)) return NextResponse.json({ error: 'invalid vn id' }, { status: 400 });
  if (!isInCollection(vnId)) return NextResponse.json({ error: 'add VN to collection first' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { order_index?: number; expand?: boolean };
  const baseIndex = typeof body.order_index === 'number' ? body.order_index : 0;
  addVnToSeries(sid, vnId, baseIndex);

  // `expand` walks the seed's full series-relation graph and joins every
  // related VN the user already owns. Lets the user add e.g. "Ai Kiss 1 → 2
  // → 3" in one click instead of three.
  const added: string[] = [vnId];
  if (body.expand) {
    const related = walkSeriesRelations(vnId);
    let idx = baseIndex + 1;
    for (const r of related) {
      if (!isInCollection(r.id)) continue;
      addVnToSeries(sid, r.id, idx);
      added.push(r.id);
      idx += 1;
    }
  }
  return NextResponse.json({ series: getSeries(sid), added });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; vnId: string }> }) {
  const { id, vnId } = await ctx.params;
  const sid = parseSeriesId(id);
  if (sid == null) return NextResponse.json({ error: 'invalid series id' }, { status: 400 });
  removeVnFromSeries(sid, vnId);
  return NextResponse.json({ series: getSeries(sid) });
}
