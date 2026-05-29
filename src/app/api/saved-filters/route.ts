import { NextRequest, NextResponse } from 'next/server';
import { createSavedFilter, deleteSavedFilter, listSavedFilters, reorderSavedFilters } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { internalError } from '@/lib/api-error';

export { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ filters: listSavedFilters() });
  } catch (err) {
    return internalError('saved-filters.GET', err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const body = (await readJsonObject(req)) as { name?: unknown; params?: unknown };
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name required' }, { status: 400 });
    }
    if (body.name.length > 200) {
      return NextResponse.json({ error: 'name too long (max 200)' }, { status: 400 });
    }
    if (typeof body.params !== 'string') {
      return NextResponse.json({ error: 'params required' }, { status: 400 });
    }
    if (body.params.length > 4000) {
      return NextResponse.json({ error: 'params too long (max 4000)' }, { status: 400 });
    }
    const created = createSavedFilter(body.name.trim().slice(0, 200), body.params);
    recordActivity({
      kind: 'saved_filter.create',
      entity: 'saved_filter',
      entityId: String(created.id),
      label: created.name,
      payload: { params: created.params },
    });
    return NextResponse.json({ filter: created });
  } catch (err) {
    return internalError('saved-filters.POST', err);
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'id required' }, { status: 400 });
    }
    const ok = deleteSavedFilter(id);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    recordActivity({
      kind: 'saved_filter.delete',
      entity: 'saved_filter',
      entityId: String(id),
      label: 'Saved filter deleted',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('saved-filters.DELETE', err);
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const body = (await readJsonObject(req)) as { ids?: unknown };
    if (
      !Array.isArray(body.ids) ||
      body.ids.length > 500 ||
      body.ids.some((x) => !Number.isInteger(x) || (x as number) <= 0)
    ) {
      return NextResponse.json({ error: 'ids array of positive integers required' }, { status: 400 });
    }
    reorderSavedFilters(body.ids as number[]);
    recordActivity({
      kind: 'saved_filter.reorder',
      entity: 'saved_filter',
      entityId: 'all',
      label: 'Saved filters reordered',
      payload: { count: body.ids.length },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('saved-filters.PATCH', err);
  }
}
