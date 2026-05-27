import { NextRequest, NextResponse } from 'next/server';
import { deleteRoute, getRoute, updateRoute, type RoutePatch } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
export const dynamic = 'force-dynamic';

function parseId(s: string): number | null {
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ routeId: string }> }): Promise<NextResponse> {
  const { routeId } = await ctx.params;
  const id = parseId(routeId);
  if (id == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const r = getRoute(id);
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ route: r });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ routeId: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { routeId } = await ctx.params;
  const id = parseId(routeId);
  if (id == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  if (!getRoute(id)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const fields: RoutePatch = {};
  if ('name' in body) {
    if (typeof body.name !== 'string') return NextResponse.json({ error: 'name must be string' }, { status: 400 });
    const trimmed = body.name.trim().slice(0, 200);
    if (!trimmed) return NextResponse.json({ error: 'name required' }, { status: 400 });
    fields.name = trimmed;
  }
  if ('completed' in body) fields.completed = !!body.completed;
  if ('completed_date' in body) {
    // Audit S-011: completed_date must be YYYY-MM-DD or null.
    const v = body.completed_date;
    if (v == null || v === '') {
      fields.completed_date = null;
    } else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      fields.completed_date = v;
    } else {
      return NextResponse.json({ error: 'completed_date must be YYYY-MM-DD or null' }, { status: 400 });
    }
  }
  if ('order_index' in body) {
    if (typeof body.order_index !== 'number') return NextResponse.json({ error: 'order_index must be number' }, { status: 400 });
    fields.order_index = body.order_index;
  }
  if ('notes' in body) {
    // Audit S-011: cap notes length.
    const v = body.notes;
    if (v != null && typeof v !== 'string') return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 });
    if (typeof v === 'string' && v.length > 10_000) return NextResponse.json({ error: 'notes too long (max 10000)' }, { status: 400 });
    fields.notes = (v as string | null) || null;
  }
  const updated = updateRoute(id, fields);
  try {
    recordActivity({
      kind: 'collection.route-update',
      entity: 'vn',
      entityId: updated?.vn_id ?? null,
      label: 'Updated route',
      payload: {
        route_id: id,
        completed: 'completed' in fields ? !!fields.completed : undefined,
      },
    });
  } catch (e) {
    console.error(`[route:${id}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ route: updated });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ routeId: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { routeId } = await ctx.params;
  const id = parseId(routeId);
  if (id == null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const existing = getRoute(id);
  const ok = deleteRoute(id);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    recordActivity({
      kind: 'collection.route-delete',
      entity: 'vn',
      entityId: existing?.vn_id ?? null,
      label: 'Deleted route',
      payload: { route_id: id, completed: existing ? !!existing.completed : undefined },
    });
  } catch (e) {
    console.error(`[route:${id}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ ok: true });
}
