import { NextRequest, NextResponse } from 'next/server';
import { createRoute, isInCollection, listRoutesForVn, reorderRoutes } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { normalizeVnId, validateVnIdOr400 } from '@/lib/vn-id';
import { validateText } from '@/lib/input-validators';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';

import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  return NextResponse.json({ routes: listRoutesForVn(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await readJsonObject(req)) as { name?: unknown };
  const nameResult = validateText(body.name, { field: 'name', max: 200 });
  if (!nameResult.ok) return NextResponse.json({ error: nameResult.error }, { status: 400 });
  const created = createRoute(id, nameResult.value);
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
  const { id: rawId } = await ctx.params;
  const bad = validateVnIdOr400(rawId);
  if (bad) return bad;
  const id = normalizeVnId(rawId);
  if (!isInCollection(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });
  const body = (await readJsonObject(req)) as { ids?: number[] };
  if (
    !Array.isArray(body.ids) ||
    body.ids.length > 1000 ||
    body.ids.some((n) => !Number.isSafeInteger(n) || n <= 0)
  ) {
    return NextResponse.json({ error: 'ids must be array of positive integers (max 1000)' }, { status: 400 });
  }
  if (new Set(body.ids).size !== body.ids.length) {
    return NextResponse.json({ error: 'ids must not contain duplicates' }, { status: 400 });
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
