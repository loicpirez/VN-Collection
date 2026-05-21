import { NextRequest, NextResponse } from 'next/server';
import { deleteUserList, getUserList, listUserListItems, updateUserList } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
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
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const body = (await readJsonObject(req)) as {
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
  if (typeof body.name === 'string') patch.name = body.name.slice(0, 200);
  if (typeof body.description === 'string') {
    patch.description = body.description.slice(0, 2000);
  } else if (body.description === null) {
    patch.description = null;
  }
  if (typeof body.color === 'string') {
    patch.color = body.color.slice(0, 64);
  } else if (body.color === null) {
    patch.color = null;
  }
  if (typeof body.icon === 'string') {
    patch.icon = body.icon.slice(0, 64);
  } else if (body.icon === null) {
    patch.icon = null;
  }
  if (typeof body.pinned === 'boolean') patch.pinned = body.pinned;
  try {
    const list = updateUserList(listId, patch);
    if (!list) return NextResponse.json({ error: 'not found' }, { status: 404 });
    recordActivity({
      kind: 'list.update',
      entity: 'list',
      entityId: String(listId),
      label: list.name,
      payload: patch,
    });
    return NextResponse.json({ list });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const ok = deleteUserList(listId);
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
  recordActivity({
    kind: 'list.delete',
    entity: 'list',
    entityId: String(listId),
    label: 'List deleted',
  });
  return NextResponse.json({ ok: true });
}
