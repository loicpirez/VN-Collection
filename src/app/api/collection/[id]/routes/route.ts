import { NextRequest, NextResponse } from 'next/server';
import { createRoute, isInCollection, listRoutesForVn, reorderRoutes } from '@/lib/db';
import { validateVnIdOr400 } from '@/lib/vn-id';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  return NextResponse.json({ routes: listRoutesForVn(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? '').trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const created = createRoute(id, name);
  return NextResponse.json({ route: created, routes: listRoutesForVn(id) });
}

/** Reorder all routes at once. Body: `{ ids: number[] }` in the new order. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { ids?: number[] };
  if (!Array.isArray(body.ids) || body.ids.some((n) => !Number.isInteger(n))) {
    return NextResponse.json({ error: 'ids must be integer array' }, { status: 400 });
  }
  reorderRoutes(id, body.ids);
  return NextResponse.json({ routes: listRoutesForVn(id) });
}
