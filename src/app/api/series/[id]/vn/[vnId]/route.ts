import { NextRequest, NextResponse } from 'next/server';
import { addVnToSeries, getSeries, isInCollection, removeVnFromSeries } from '@/lib/db';

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
  const body = (await req.json().catch(() => ({}))) as { order_index?: number };
  addVnToSeries(sid, vnId, typeof body.order_index === 'number' ? body.order_index : 0);
  return NextResponse.json({ series: getSeries(sid) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; vnId: string }> }) {
  const { id, vnId } = await ctx.params;
  const sid = parseSeriesId(id);
  if (sid == null) return NextResponse.json({ error: 'invalid series id' }, { status: 400 });
  removeVnFromSeries(sid, vnId);
  return NextResponse.json({ series: getSeries(sid) });
}
