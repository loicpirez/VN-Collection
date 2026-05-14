import { NextRequest, NextResponse } from 'next/server';
import { deleteUserList, getUserList, listUserListItems, updateUserList } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const list = getUserList(listId);
  if (!list) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ list, items: listUserListItems(listId) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    description?: unknown;
    color?: unknown;
    icon?: unknown;
    pinned?: unknown;
  };
  const patch: {
    name?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    pinned?: boolean;
  } = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.description === 'string' || body.description === null) {
    patch.description = body.description as string | null;
  }
  if (typeof body.color === 'string' || body.color === null) {
    patch.color = body.color as string | null;
  }
  if (typeof body.icon === 'string' || body.icon === null) {
    patch.icon = body.icon as string | null;
  }
  if (typeof body.pinned === 'boolean') patch.pinned = body.pinned;
  try {
    const list = updateUserList(listId, patch);
    if (!list) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ list });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const ok = deleteUserList(listId);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
