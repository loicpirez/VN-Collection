import { NextRequest, NextResponse } from 'next/server';
import { createSavedFilter, deleteSavedFilter, listSavedFilters, reorderSavedFilters } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ filters: listSavedFilters() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; params?: unknown };
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  if (typeof body.params !== 'string') {
    return NextResponse.json({ error: 'params required' }, { status: 400 });
  }
  const created = createSavedFilter(body.name, body.params);
  return NextResponse.json({ filter: created });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  deleteSavedFilter(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((x) => typeof x !== 'number')) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 });
  }
  reorderSavedFilters(body.ids as number[]);
  return NextResponse.json({ ok: true });
}
