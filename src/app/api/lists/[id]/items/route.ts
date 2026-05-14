import { NextRequest, NextResponse } from 'next/server';
import { addVnToList, getUserList, removeVnFromList, reorderListItems } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  if (!getUserList(listId)) return NextResponse.json({ error: 'list not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { vn_id?: unknown; note?: unknown; order?: unknown };
  if (typeof body.order === 'object' && Array.isArray((body.order as unknown[]) ?? null)) {
    const ids = (body.order as unknown[]).filter((s): s is string => typeof s === 'string');
    reorderListItems(listId, ids);
    return NextResponse.json({ ok: true });
  }
  if (typeof body.vn_id !== 'string' || body.vn_id.trim().length === 0) {
    return NextResponse.json({ error: 'vn_id required' }, { status: 400 });
  }
  const item = addVnToList(listId, body.vn_id.trim(), typeof body.note === 'string' ? body.note : null);
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const vnId = req.nextUrl.searchParams.get('vn');
  if (!vnId) return NextResponse.json({ error: 'vn query param required' }, { status: 400 });
  const ok = removeVnFromList(listId, vnId);
  if (!ok) return NextResponse.json({ error: 'not in list' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
