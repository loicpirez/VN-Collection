import { NextRequest, NextResponse } from 'next/server';
import { addVnToList, getUserList, removeVnFromList, reorderListItems } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Lists accept both VNDB and synthetic VN ids — same shapes used by
// the rest of the app. Rejecting other strings keeps spurious rows
// (typos, copy-paste blunders) out of `user_list_vn`, since the
// table deliberately has no FK on vn_id.
const VN_ID_RE = /^(v\d+|egs_\d+)$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  if (!getUserList(listId)) return NextResponse.json({ error: 'list not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { vn_id?: unknown; note?: unknown; order?: unknown };
  if (typeof body.order === 'object' && Array.isArray((body.order as unknown[]) ?? null)) {
    const ids = (body.order as unknown[]).filter((s): s is string => typeof s === 'string' && VN_ID_RE.test(s));
    reorderListItems(listId, ids);
    recordActivity({
      kind: 'list.reorder',
      entity: 'list',
      entityId: String(listId),
      label: 'List items reordered',
      payload: { count: ids.length },
    });
    return NextResponse.json({ ok: true });
  }
  if (typeof body.vn_id !== 'string' || !VN_ID_RE.test(body.vn_id.trim())) {
    return NextResponse.json({ error: 'invalid vn_id' }, { status: 400 });
  }
  const item = addVnToList(listId, body.vn_id.trim(), typeof body.note === 'string' ? body.note : null);
  if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
  recordActivity({
    kind: 'list.item.add',
    entity: 'vn',
    entityId: item.vn_id,
    label: 'Added to list',
    payload: { list_id: listId },
  });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const vnId = req.nextUrl.searchParams.get('vn');
  if (!vnId || !VN_ID_RE.test(vnId)) {
    return NextResponse.json({ error: 'invalid vn query param' }, { status: 400 });
  }
  const ok = removeVnFromList(listId, vnId);
  if (!ok) return NextResponse.json({ error: 'not in list' }, { status: 404 });
  recordActivity({
    kind: 'list.item.remove',
    entity: 'vn',
    entityId: vnId,
    label: 'Removed from list',
    payload: { list_id: listId },
  });
  return NextResponse.json({ ok: true });
}
