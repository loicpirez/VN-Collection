import { NextRequest, NextResponse } from 'next/server';
import { addVnToList, getUserList, removeVnFromList, reorderListItems } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { internalError } from '@/lib/api-error';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const listId = Number(id);
    if (!Number.isSafeInteger(listId) || listId <= 0) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }
    if (!getUserList(listId)) return NextResponse.json({ error: 'list not found' }, { status: 404 });

    const body = (await readJsonObject(req)) as { vn_id?: unknown; note?: unknown; order?: unknown };
    if ('order' in body) {
      if (!Array.isArray(body.order)) {
        return NextResponse.json({ error: 'order must be an array of VN ids' }, { status: 400 });
      }
      const arr = body.order;
      if (arr.length > 10000) {
        return NextResponse.json({ error: 'order array too long (max 10000)' }, { status: 400 });
      }
      if (arr.some((s) => typeof s !== 'string' || !isValidVnId(s))) {
        return NextResponse.json({ error: 'order must contain only VN ids' }, { status: 400 });
      }
      const ids = (arr as string[]).map(normalizeVnId);
      if (new Set(ids).size !== ids.length) {
        return NextResponse.json({ error: 'order must not contain duplicates' }, { status: 400 });
      }
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
    if (typeof body.vn_id !== 'string' || !isValidVnId(body.vn_id.trim())) {
      return NextResponse.json({ error: 'invalid vn_id' }, { status: 400 });
    }
    let note: string | null = null;
    if (typeof body.note === 'string') {
      if (body.note.length > 2000) {
        return NextResponse.json({ error: 'note too long (max 2000)' }, { status: 400 });
      }
      note = body.note;
    } else if (body.note !== undefined && body.note !== null) {
      return NextResponse.json({ error: 'note must be a string or null' }, { status: 400 });
    }
    const item = addVnToList(listId, normalizeVnId(body.vn_id.trim()), note);
    if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 });
    recordActivity({
      kind: 'list.item.add',
      entity: 'vn',
      entityId: item.vn_id,
      label: 'Added to list',
      payload: { list_id: listId },
    });
    return NextResponse.json({ item });
  } catch (err) {
    return internalError('lists.items.POST', err);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const listId = Number(id);
    if (!Number.isSafeInteger(listId) || listId <= 0) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 });
    }
    const vnId = req.nextUrl.searchParams.get('vn');
    if (!isValidVnId(vnId)) {
      return NextResponse.json({ error: 'invalid vn query param' }, { status: 400 });
    }
    const normalizedVnId = normalizeVnId(vnId);
    const ok = removeVnFromList(listId, normalizedVnId);
    if (!ok) return NextResponse.json({ error: 'not in list' }, { status: 404 });
    recordActivity({
      kind: 'list.item.remove',
      entity: 'vn',
      entityId: normalizedVnId,
      label: 'Removed from list',
      payload: { list_id: listId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError('lists.items.DELETE', err);
  }
}
