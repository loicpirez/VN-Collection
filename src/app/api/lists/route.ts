import { NextRequest, NextResponse } from 'next/server';
import { createUserList, listUserLists } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { validateText } from '@/lib/input-validators';
import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ lists: listUserLists() });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as {
    name?: unknown;
    description?: unknown;
    color?: unknown;
    icon?: unknown;
  };
  const nameResult = validateText(body.name, { field: 'name', max: 200 });
  if (!nameResult.ok) return NextResponse.json({ error: nameResult.error }, { status: 400 });
  let description: string | null = null;
  if (typeof body.description === 'string') {
    const descResult = validateText(body.description, { field: 'description', max: 2000, allowEmpty: true });
    if (!descResult.ok) return NextResponse.json({ error: descResult.error }, { status: 400 });
    description = descResult.value;
  } else if (body.description !== undefined && body.description !== null) {
    return NextResponse.json({ error: 'description must be a string or null' }, { status: 400 });
  }
  const COLOR_RE = /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,32})$/;
  const ICON_RE = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
  let color: string | null = null;
  if (typeof body.color === 'string') {
    const trimmed = body.color.trim();
    if (trimmed.length > 64) return NextResponse.json({ error: 'color too long (max 64)' }, { status: 400 });
    if (trimmed && !COLOR_RE.test(trimmed)) {
      return NextResponse.json({ error: 'invalid color' }, { status: 400 });
    }
    color = trimmed || null;
  } else if (body.color !== undefined && body.color !== null) {
    return NextResponse.json({ error: 'color must be a string or null' }, { status: 400 });
  }
  let icon: string | null = null;
  if (typeof body.icon === 'string') {
    const trimmed = body.icon.trim();
    if (trimmed.length > 64) return NextResponse.json({ error: 'icon too long (max 64)' }, { status: 400 });
    if (trimmed && !ICON_RE.test(trimmed)) {
      return NextResponse.json({ error: 'invalid icon' }, { status: 400 });
    }
    icon = trimmed || null;
  } else if (body.icon !== undefined && body.icon !== null) {
    return NextResponse.json({ error: 'icon must be a string or null' }, { status: 400 });
  }
  try {
    const list = createUserList({
      name: nameResult.value,
      description,
      color,
      icon,
    });
    recordActivity({
      kind: 'list.create',
      entity: 'list',
      entityId: String(list.id),
      label: list.name,
      payload: { color: list.color, icon: list.icon },
    });
    return NextResponse.json({ list });
  } catch (e) {
    console.error('[lists] createUserList failed:', (e as Error).message);
    return NextResponse.json({ error: 'could not create list' }, { status: 500 });
  }
}
