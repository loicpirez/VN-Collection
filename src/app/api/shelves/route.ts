import { NextRequest, NextResponse } from 'next/server';
import {
  createShelf,
  listShelves,
  listUnplacedOwnedReleases,
  reorderShelves,
} from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const includePool = req.nextUrl.searchParams.get('pool') === '1';
  return NextResponse.json({
    shelves: listShelves(),
    unplaced: includePool ? listUnplacedOwnedReleases() : undefined,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    cols?: unknown;
    rows?: unknown;
  };
  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  try {
    const shelf = createShelf({
      name: body.name,
      cols: typeof body.cols === 'number' ? body.cols : undefined,
      rows: typeof body.rows === 'number' ? body.rows : undefined,
    });
    return NextResponse.json({ shelf });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { order?: unknown };
  if (!Array.isArray(body.order) || body.order.some((v) => typeof v !== 'number')) {
    return NextResponse.json({ error: 'order must be number[]' }, { status: 400 });
  }
  reorderShelves(body.order as number[]);
  return NextResponse.json({ shelves: listShelves() });
}
