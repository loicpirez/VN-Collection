import { NextRequest, NextResponse } from 'next/server';
import { createUserList, listUserLists } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ lists: listUserLists() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    description?: unknown;
    color?: unknown;
    icon?: unknown;
  };
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  try {
    const list = createUserList({
      name: body.name,
      description: typeof body.description === 'string' ? body.description : null,
      color: typeof body.color === 'string' ? body.color : null,
      icon: typeof body.icon === 'string' ? body.icon : null,
    });
    return NextResponse.json({ list });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
