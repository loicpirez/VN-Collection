import { NextRequest, NextResponse } from 'next/server';
import { createUserList, listUserLists } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

import { readJsonObject } from '@/lib/api-body';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ lists: listUserLists() });
}

export async function POST(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as {
    name?: unknown;
    description?: unknown;
    color?: unknown;
    icon?: unknown;
  };
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  if (body.name.length > 200) {
    return NextResponse.json({ error: 'name too long (max 200)' }, { status: 400 });
  }
  try {
    const list = createUserList({
      name: body.name.slice(0, 200),
      description: typeof body.description === 'string' ? body.description.slice(0, 2000) : null,
      color: typeof body.color === 'string' ? body.color.slice(0, 64) : null,
      icon: typeof body.icon === 'string' ? body.icon.slice(0, 64) : null,
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
