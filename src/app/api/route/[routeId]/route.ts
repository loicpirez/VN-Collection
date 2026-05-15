import { NextRequest, NextResponse } from 'next/server';
import { deleteRoute, getRoute, updateRoute, type RoutePatch } from '@/lib/db';

export const dynamic = 'force-dynamic';

function parseId(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await ctx.params;
  const id = parseId(routeId);
  if (id == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const r = getRoute(id);
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ route: r });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await ctx.params;
  const id = parseId(routeId);
  if (id == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  if (!getRoute(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: RoutePatch = {};
  if ('name' in body) {
    if (typeof body.name !== 'string') return NextResponse.json({ error: 'name must be string' }, { status: 400 });
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return NextResponse.json({ error: 'name required' }, { status: 400 });
    fields.name = trimmed;
  }
  if ('completed' in body) fields.completed = !!body.completed;
  if ('completed_date' in body) fields.completed_date = (body.completed_date as string | null) || null;
  if ('order_index' in body) {
    if (typeof body.order_index !== 'number') return NextResponse.json({ error: 'order_index must be number' }, { status: 400 });
    fields.order_index = body.order_index;
  }
  if ('notes' in body) fields.notes = (body.notes as string | null) || null;
  const updated = updateRoute(id, fields);
  return NextResponse.json({ route: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ routeId: string }> }) {
  const { routeId } = await ctx.params;
  const id = parseId(routeId);
  if (id == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const ok = deleteRoute(id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
