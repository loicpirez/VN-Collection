import { NextRequest, NextResponse } from 'next/server';
import { createRoute, isInCollection, listRoutesForVn, reorderRoutes } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { validateVnIdOr400 } from '@/lib/vn-id';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
export const dynamic = 'force-dynamic';

// intentionally public — single-user self-hosted app; per-VN route names.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  return NextResponse.json({ routes: listRoutesForVn(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await readJsonObject(req)) as { name?: string };
  const name = (body.name ?? '').trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const created = createRoute(id, name);
  try {
    recordActivity({
      kind: 'collection.route-add',
      entity: 'vn',
      entityId: id,
      label: 'Added route',
      payload: { route_id: created.id, completed: !!created.completed },
    });
  } catch (e) {
    console.error(`[routes:${id}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ route: created, routes: listRoutesForVn(id) });
}

/** Reorder all routes at once. Body: `{ ids: number[] }` in the new order. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const bad = validateVnIdOr400(id);
  if (bad) return bad;
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await readJsonObject(req)) as { ids?: number[] };
  if (
    !Array.isArray(body.ids) ||
    body.ids.length > 1000 ||
    body.ids.some((n) => !Number.isInteger(n) || n <= 0)
  ) {
    return NextResponse.json({ error: 'ids must be array of positive integers (max 1000)' }, { status: 400 });
  }
  reorderRoutes(id, body.ids);
  try {
    recordActivity({
      kind: 'collection.route-update',
      entity: 'vn',
      entityId: id,
      label: 'Reordered routes',
      payload: { count: body.ids.length },
    });
  } catch (e) {
    console.error(`[routes:${id}] activity log failed:`, (e as Error).message);
  }
  return NextResponse.json({ routes: listRoutesForVn(id) });
}
