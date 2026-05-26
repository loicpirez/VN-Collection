import { NextRequest, NextResponse } from 'next/server';
import { createSavedFilter, deleteSavedFilter, listSavedFilters, reorderSavedFilters } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
export const dynamic = 'force-dynamic';

// intentionally public — single-user self-hosted app; saved-filter URL
// fragments carry no PII. Mutating handlers below remain gated.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ filters: listSavedFilters() });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as { name?: unknown; params?: unknown };
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  if (typeof body.params !== 'string') {
    return NextResponse.json({ error: 'params required' }, { status: 400 });
  }
  const created = createSavedFilter(body.name, body.params);
  recordActivity({
    kind: 'saved_filter.create',
    entity: 'saved_filter',
    entityId: String(created.id),
    label: created.name,
    payload: { params: created.params },
  });
  return NextResponse.json({ filter: created });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
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
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'number')) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
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
}
