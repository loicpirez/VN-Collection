import { NextRequest, NextResponse } from 'next/server';
import { deleteSeries, getSeries, updateSeries } from '@/lib/db';

export const dynamic = 'force-dynamic';

function parseId(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = parseId(id);
  if (n == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const s = getSeries(n);
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ series: s });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = parseId(id);
  if (n == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string | null;
    cover_path?: string | null;
    banner_path?: string | null;
  };
  if (body.name !== undefined && !body.name.trim()) {
    return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
  }
  const s = updateSeries(n, body);
  if (!s) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ series: getSeries(n) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = parseId(id);
  if (n == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  if (!getSeries(n)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  deleteSeries(n);
  return NextResponse.json({ ok: true });
}
