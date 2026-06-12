import { NextRequest, NextResponse } from 'next/server';
import { createSavedFilter, deleteSavedFilter, listSavedFilters, reorderSavedFilters } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { internalError } from '@/lib/api-error';
import { validateText } from '@/lib/input-validators';

import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

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
    const nameResult = validateText(body.name, { field: 'name', max: 60 });
    if (!nameResult.ok) return NextResponse.json({ error: nameResult.error }, { status: 400 });
    const paramsResult = validateText(body.params, { field: 'params', max: 2000, allowEmpty: true });
    if (!paramsResult.ok) return NextResponse.json({ error: paramsResult.error }, { status: 400 });
    const created = createSavedFilter(nameResult.value, paramsResult.value);
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
    if (!Number.isSafeInteger(id) || id <= 0) {
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
      body.ids.some((x) => !Number.isSafeInteger(x) || (x as number) <= 0)
    ) {
      return NextResponse.json({ error: 'ids array of positive integers required' }, { status: 400 });
    }
    const ids = body.ids as number[];
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: 'ids must not contain duplicates' }, { status: 400 });
    }
    reorderSavedFilters(ids);
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
