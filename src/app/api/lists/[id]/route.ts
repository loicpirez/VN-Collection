import { NextRequest, NextResponse } from 'next/server';
import { deleteUserList, getUserList, listUserListItems, updateUserList } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { validateText } from '@/lib/input-validators';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isSafeInteger(listId) || listId <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const list = getUserList(listId);
  if (!list) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ list, items: listUserListItems(listId) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isSafeInteger(listId) || listId <= 0) {
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
  if ('name' in body) {
    const nameResult = validateText(body.name, { field: 'name', max: 200 });
    if (!nameResult.ok) return NextResponse.json({ error: nameResult.error }, { status: 400 });
    patch.name = nameResult.value;
  }
  if (typeof body.description === 'string') {
    const descriptionResult = validateText(body.description, { field: 'description', max: 2000, allowEmpty: true });
    if (!descriptionResult.ok) return NextResponse.json({ error: descriptionResult.error }, { status: 400 });
    patch.description = descriptionResult.value;
  } else if (body.description === null) {
    patch.description = null;
  } else if ('description' in body) {
    return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 });
  }
  const COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,32})$/;
  const ICON_RE = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
  if (typeof body.color === 'string') {
    const trimmed = body.color.trim();
    if (trimmed.length > 64) return NextResponse.json({ error: 'color too long (max 64)' }, { status: 400 });
    if (trimmed && !COLOR_RE.test(trimmed)) {
      return NextResponse.json({ error: 'invalid color' }, { status: 400 });
    }
    patch.color = trimmed || null;
  } else if (body.color === null) {
    patch.color = null;
  } else if ('color' in body) {
    return NextResponse.json({ error: 'color must be a string or null' }, { status: 400 });
  }
  if (typeof body.icon === 'string') {
    const trimmed = body.icon.trim();
    if (trimmed.length > 64) return NextResponse.json({ error: 'icon too long (max 64)' }, { status: 400 });
    if (trimmed && !ICON_RE.test(trimmed)) {
      return NextResponse.json({ error: 'invalid icon' }, { status: 400 });
    }
    patch.icon = trimmed || null;
  } else if (body.icon === null) {
    patch.icon = null;
  } else if ('icon' in body) {
    return NextResponse.json({ error: 'icon must be a string or null' }, { status: 400 });
  }
  if ('pinned' in body) {
    if (typeof body.pinned !== 'boolean') return NextResponse.json({ error: 'pinned must be boolean' }, { status: 400 });
    patch.pinned = body.pinned;
  }
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
    console.error('[lists/[id]] updateUserList failed:', (e as Error).message);
    return NextResponse.json({ error: 'could not update list' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  const listId = Number(id);
  if (!Number.isSafeInteger(listId) || listId <= 0) {
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
